package downloader

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("torrent client: %w", err)
	}

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

func (e *torrentEngine) remove(gid string, _ bool) error {
	e.mu.Lock()
	entry, ok := e.entries[gid]
	if ok {
		entry.t.Drop()
		delete(e.entries, gid)
	}
	e.mu.Unlock()
	// File deletion is handled by the caller (download handler).
	return nil
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
			delta := s.CompletedBytes - entry.lastBytes
			if delta < 0 {
				delta = 0
			}
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
			uploaded := stats.ConnStats.BytesWrittenData.Int64()
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
	e.client.Close()
}
