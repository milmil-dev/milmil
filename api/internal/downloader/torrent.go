package downloader

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"
)

// torrentEntry tracks a managed torrent.
type torrentEntry struct {
	t         *torrent.Torrent
	gid       string
	name      string
	saveDir   string
	status    string // "active", "paused", "complete", "error", "waiting"
	err       string
	addedAt   time.Time
	seedStart time.Time // when seeding started (zero if not seeding)

	// Speed tracking: delta-based approach since anacrolix doesn't expose speed directly.
	lastBytes     int64
	lastCheckTime time.Time
	speed         int64
}

// torrentEngine wraps anacrolix/torrent.
type torrentEngine struct {
	client    *torrent.Client
	mu        sync.RWMutex
	entries   map[string]*torrentEntry // keyed by GID (infohash hex)
	dataDir   string
	seedRatio float64
	seedTime  time.Duration
	stopCh    chan struct{}
}

func newTorrentEngine(dataDir string, listenPort int, seedRatio float64, seedTime time.Duration) (*torrentEngine, error) {
	cfg := torrent.NewDefaultClientConfig()
	cfg.Seed = true
	cfg.NoUpload = false
	cfg.ListenPort = listenPort
	cfg.DataDir = dataDir
	cfg.DefaultStorage = storage.NewFileByInfoHash(dataDir)
	// Filter anacrolix torrent logs — only errors reach the main log.
	// Prevents peer/tracker debug chatter from flooding the API log.
	cfg.Slogger = slog.New(&levelFilterHandler{
		level:   slog.LevelError,
		handler: slog.Default().With("component", "torrent").Handler(),
	})

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("torrent client: %w", err)
	}
	slog.Info("torrent engine started", "port", listenPort)

	return &torrentEngine{
		client:    client,
		entries:   make(map[string]*torrentEntry),
		dataDir:   dataDir,
		seedRatio: seedRatio,
		seedTime:  seedTime,
		stopCh:    make(chan struct{}),
	}, nil
}

// add adds a torrent by magnet URI or .torrent URL. Returns GID (infohash hex).
func (e *torrentEngine) add(ctx context.Context, url, saveDir, name string) (string, error) {
	var t *torrent.Torrent

	if strings.HasPrefix(url, "magnet:") {
		spec, specErr := torrent.TorrentSpecFromMagnetUri(url)
		if specErr != nil {
			return "", fmt.Errorf("parse magnet: %w", specErr)
		}
		// Set per-torrent storage if a specific save directory is requested.
		if saveDir != "" {
			spec.Storage = storage.NewFile(saveDir)
		}
		var addErr error
		t, _, addErr = e.client.AddTorrentSpec(spec)
		if addErr != nil {
			return "", fmt.Errorf("add magnet: %w", addErr)
		}
	} else {
		// Fetch .torrent file via HTTP.
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if reqErr != nil {
			return "", fmt.Errorf("create torrent request: %w", reqErr)
		}
		resp, doErr := http.DefaultClient.Do(req)
		if doErr != nil {
			return "", fmt.Errorf("fetch torrent: %w", doErr)
		}
		defer resp.Body.Close()

		data, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return "", fmt.Errorf("read torrent: %w", readErr)
		}

		mi, loadErr := metainfo.Load(bytes.NewReader(data))
		if loadErr != nil {
			return "", fmt.Errorf("parse torrent: %w", loadErr)
		}

		spec := torrent.TorrentSpecFromMetaInfo(mi)
		if saveDir != "" {
			spec.Storage = storage.NewFile(saveDir)
		}
		var addErr error
		t, _, addErr = e.client.AddTorrentSpec(spec)
		if addErr != nil {
			return "", fmt.Errorf("add torrent: %w", addErr)
		}
	}

	gid := t.InfoHash().HexString()
	now := time.Now()

	e.mu.Lock()
	e.entries[gid] = &torrentEntry{
		t:             t,
		gid:           gid,
		name:          name,
		saveDir:       saveDir,
		status:        "active",
		addedAt:       now,
		lastCheckTime: now,
	}
	e.mu.Unlock()

	// Wait for info in background, then start download.
	go func() {
		<-t.GotInfo()
		e.mu.Lock()
		if entry, ok := e.entries[gid]; ok {
			if entry.name == "" {
				entry.name = t.Name()
			}
		}
		e.mu.Unlock()
		t.DownloadAll()
	}()

	return gid, nil
}

func (e *torrentEngine) pause(gid string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	entry, ok := e.entries[gid]
	if !ok {
		return fmt.Errorf("torrent %s not found", gid)
	}
	entry.t.CancelPieces(0, entry.t.NumPieces())
	entry.status = "paused"
	entry.speed = 0
	return nil
}

func (e *torrentEngine) resume(gid string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	entry, ok := e.entries[gid]
	if !ok {
		return fmt.Errorf("torrent %s not found", gid)
	}
	entry.t.DownloadAll()
	entry.status = "active"
	entry.lastCheckTime = time.Now()
	entry.lastBytes = entry.t.BytesCompleted()
	return nil
}

func (e *torrentEngine) remove(gid string, deleteFiles bool) error {
	e.mu.Lock()
	entry, ok := e.entries[gid]
	var paths []string
	if ok {
		if deleteFiles {
			paths = e.entryFilePaths(entry)
		}
		entry.t.Drop()
		delete(e.entries, gid)
	}
	e.mu.Unlock()
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			slog.Warn("torrent: delete files", "path", p, "err", err)
		}
	}
	return nil
}

// entryFilePaths lists what remove(deleteFiles:) may delete. With the default
// per-infohash storage the whole directory belongs to the torrent; with an
// explicit save dir (a library path) only the torrent's own files are listed —
// never the directory, which contains other media. File paths come from the
// torrent's metainfo (attacker-controlled), so anything absolute, traversing,
// or resolving outside the save dir is refused.
func (e *torrentEngine) entryFilePaths(entry *torrentEntry) []string {
	if entry.saveDir == "" {
		return []string{filepath.Join(e.dataDir, entry.gid)}
	}
	if entry.t.Info() == nil {
		return nil // no metadata yet — nothing was written
	}
	base, err := filepath.Abs(entry.saveDir)
	if err != nil {
		return nil
	}
	paths := make([]string, 0, len(entry.t.Files()))
	for _, f := range entry.t.Files() {
		rel := f.Path()
		if rel == "" || filepath.IsAbs(rel) {
			continue
		}
		abs, err := filepath.Abs(filepath.Join(base, rel))
		if err != nil || abs == base || !strings.HasPrefix(abs, base+string(os.PathSeparator)) {
			continue
		}
		paths = append(paths, abs)
	}
	return paths
}

func (e *torrentEngine) status(gid string) (*Status, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	entry, ok := e.entries[gid]
	if !ok {
		return nil, fmt.Errorf("torrent %s not found", gid)
	}

	s := &Status{
		GID:     gid,
		Name:    entry.name,
		Status:  entry.status,
		SaveDir: entry.saveDir,
		Error:   entry.err,
	}

	if entry.t.Info() != nil {
		s.TotalBytes = entry.t.Length()
		s.CompletedBytes = entry.t.BytesCompleted()

		// Calculate speed using delta-based approach.
		now := time.Now()
		dt := now.Sub(entry.lastCheckTime).Seconds()
		if dt >= 1.0 {
			delta := max(s.CompletedBytes-entry.lastBytes, 0)
			entry.speed = int64(float64(delta) / dt)
			entry.lastBytes = s.CompletedBytes
			entry.lastCheckTime = now
		}
		s.SpeedBytes = entry.speed

		// Detect completion.
		if s.CompletedBytes >= s.TotalBytes && s.TotalBytes > 0 && entry.status == "active" {
			entry.status = "complete"
			entry.speed = 0
			s.Status = "complete"
			s.SpeedBytes = 0
		}
	}

	return s, nil
}

func (e *torrentEngine) files(gid string) ([]FileInfo, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	entry, ok := e.entries[gid]
	if !ok {
		return nil, fmt.Errorf("torrent %s not found", gid)
	}
	if entry.t.Info() == nil {
		return nil, nil // metadata not yet available
	}

	var files []FileInfo
	for _, f := range entry.t.Files() {
		files = append(files, FileInfo{
			Path:     f.DisplayPath(),
			Size:     f.Length(),
			Complete: f.BytesCompleted(),
		})
	}
	return files, nil
}

// startSeedWatcher runs a background goroutine that stops seeding when limits are hit.
func (e *torrentEngine) startSeedWatcher() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-e.stopCh:
				return
			case <-ticker.C:
				e.checkSeeding()
			}
		}
	}()
}

func (e *torrentEngine) checkSeeding() {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, entry := range e.entries {
		if entry.status != "complete" {
			continue
		}
		if entry.seedStart.IsZero() {
			entry.seedStart = time.Now()
		}
		// Check time limit.
		if e.seedTime > 0 && time.Since(entry.seedStart) > e.seedTime {
			slog.Info("seed limit reached (time)", "name", entry.name)
			entry.t.Drop()
			continue
		}
		// Check ratio limit.
		if e.seedRatio > 0 && entry.t.Info() != nil {
			stats := entry.t.Stats()
			uploaded := stats.BytesWrittenData.Int64()
			total := entry.t.Length()
			if total > 0 && float64(uploaded)/float64(total) >= e.seedRatio {
				slog.Info("seed limit reached (ratio)", "name", entry.name,
					"ratio", float64(uploaded)/float64(total))
				entry.t.Drop()
			}
		}
	}
}

func (e *torrentEngine) stop() {
	close(e.stopCh)

	// Drop all torrents first to speed up client.Close().
	e.mu.Lock()
	for _, entry := range e.entries {
		entry.t.Drop()
	}
	e.entries = make(map[string]*torrentEntry)
	e.mu.Unlock()

	done := make(chan struct{})
	go func() {
		e.client.Close()
		close(done)
	}()
	select {
	case <-done:
		slog.Info("torrent engine stopped")
	case <-time.After(3 * time.Second):
		slog.Warn("torrent engine stop timed out, forcing exit")
	}
	e.client = nil
}

// levelFilterHandler wraps an slog.Handler and drops records below the given level.
type levelFilterHandler struct {
	level   slog.Level
	handler slog.Handler
}

func (h *levelFilterHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *levelFilterHandler) Handle(ctx context.Context, r slog.Record) error {
	return h.handler.Handle(ctx, r)
}

func (h *levelFilterHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &levelFilterHandler{level: h.level, handler: h.handler.WithAttrs(attrs)}
}

func (h *levelFilterHandler) WithGroup(name string) slog.Handler {
	return &levelFilterHandler{level: h.level, handler: h.handler.WithGroup(name)}
}
