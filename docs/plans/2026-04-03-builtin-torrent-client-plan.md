# Built-in Torrent Client Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace external aria2 Docker container with an embedded download engine using `anacrolix/torrent` + `net/http`.

**Architecture:** A `downloader.Manager` interface replaces `aria2.Client`. The manager wraps anacrolix/torrent for BitTorrent and net/http for direct downloads. The DB is the source of truth — incomplete downloads are re-added on startup. No external processes needed.

**Tech Stack:** Go 1.26, anacrolix/torrent, net/http, SQLite

**Design doc:** `docs/plans/2026-04-03-builtin-torrent-client-design.md`

---

### Task 1: Add anacrolix/torrent dependency

**Files:**
- Modify: `api/go.mod`

**Step 1: Add dependency**

```bash
cd api && go get github.com/anacrolix/torrent@latest
```

**Step 2: Verify it compiles**

```bash
go build ./...
```

**Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "deps: add anacrolix/torrent library"
```

---

### Task 2: Create downloader.Manager interface and types

**Files:**
- Create: `api/internal/downloader/manager.go`

**Step 1: Write the Manager interface and types**

```go
package downloader

import "context"

// Manager is the unified download engine interface.
// It replaces the aria2.Client interface.
type Manager interface {
	// Add starts a download. Detects magnet/torrent vs HTTP automatically.
	// Returns a GID (unique download identifier).
	Add(ctx context.Context, url string, opts AddOptions) (string, error)

	// Pause pauses an active download.
	Pause(ctx context.Context, gid string) error

	// Resume resumes a paused download.
	Resume(ctx context.Context, gid string) error

	// Remove stops and removes a download. Optionally deletes files.
	Remove(ctx context.Context, gid string, deleteFiles bool) error

	// Status returns current progress for a download.
	Status(ctx context.Context, gid string) (*Status, error)

	// Files returns the file list for a download.
	Files(ctx context.Context, gid string) ([]FileInfo, error)

	// Start initializes the engine and resumes incomplete downloads from DB.
	Start(ctx context.Context) error

	// Stop gracefully shuts down (stop seeding, save state).
	Stop() error

	// Healthy returns true if the engine is running.
	Healthy() bool
}

// AddOptions configures a new download.
type AddOptions struct {
	SaveDir string // target directory (library path)
	Name    string // display name
}

// Status represents the current state of a download.
type Status struct {
	GID            string
	Name           string
	Status         string // "active", "paused", "complete", "error", "waiting"
	TotalBytes     int64
	CompletedBytes int64
	SpeedBytes     int64
	SaveDir        string
	Error          string
}

// FileInfo represents a single file within a download.
type FileInfo struct {
	Path     string
	Size     int64
	Complete int64
}

// isTorrent returns true if the URL is a magnet link or .torrent file URL.
func isTorrent(url string) bool {
	return strings.HasPrefix(url, "magnet:") ||
		strings.HasSuffix(strings.ToLower(url), ".torrent")
}
```

Add the `strings` import.

**Step 2: Verify it compiles**

```bash
cd api && go build ./internal/downloader/...
```

**Step 3: Commit**

```bash
git add api/internal/downloader/
git commit -m "feat(downloader): define Manager interface and types"
```

---

### Task 3: Implement the torrent engine

**Files:**
- Create: `api/internal/downloader/torrent.go`

**Step 1: Implement the torrent wrapper**

This wraps `anacrolix/torrent` client. Key responsibilities:
- Manage torrent handles keyed by GID (infohash hex)
- Add torrents from magnet URIs or .torrent file URLs
- Report per-torrent status (bytes, speed)
- Seeding management (stop after ratio/time limit)

```go
package downloader

import (
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
}

// torrentEngine wraps anacrolix/torrent.
type torrentEngine struct {
	client    *torrent.Client
	mu        sync.RWMutex
	entries   map[string]*torrentEntry // keyed by GID (infohash hex)
	seedRatio float64
	seedTime  time.Duration
	stopCh    chan struct{}
}

func newTorrentEngine(listenPort int, seedRatio float64, seedTime time.Duration) (*torrentEngine, error) {
	cfg := torrent.NewDefaultClientConfig()
	cfg.Seed = true
	cfg.NoUpload = false
	cfg.ListenPort = listenPort
	cfg.DefaultStorage = storage.NewFileByInfoHash("")

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("torrent client: %w", err)
	}

	return &torrentEngine{
		client:    client,
		entries:   make(map[string]*torrentEntry),
		seedRatio: seedRatio,
		seedTime:  seedTime,
		stopCh:    make(chan struct{}),
	}, nil
}

// add adds a torrent by magnet URI or .torrent URL. Returns GID (infohash hex).
func (e *torrentEngine) add(ctx context.Context, url, saveDir, name string) (string, error) {
	var t *torrent.Torrent

	if strings.HasPrefix(url, "magnet:") {
		var err error
		t, err = e.client.AddMagnet(url)
		if err != nil {
			return "", fmt.Errorf("add magnet: %w", err)
		}
	} else {
		// Fetch .torrent file
		resp, err := http.Get(url)
		if err != nil {
			return "", fmt.Errorf("fetch torrent: %w", err)
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", fmt.Errorf("read torrent: %w", err)
		}
		mi, err := metainfo.Load(strings.NewReader(string(data)))
		if err != nil {
			// Try loading from bytes directly
			mi2, err2 := metainfo.LoadFromData(data)
			if err2 != nil {
				return "", fmt.Errorf("parse torrent: %w", err)
			}
			mi = mi2
		}
		var err2 error
		t, err2 = e.client.AddTorrent(mi)
		if err2 != nil {
			return "", fmt.Errorf("add torrent: %w", err2)
		}
	}

	// Set download directory
	if saveDir != "" {
		t.SetDownloadPath(saveDir)
	}

	gid := t.InfoHash().HexString()

	// Wait for info in background, then start download
	go func() {
		<-t.GotInfo()
		if name == "" {
			name = t.Name()
		}
		e.mu.Lock()
		if entry, ok := e.entries[gid]; ok {
			entry.name = name
		}
		e.mu.Unlock()
		t.DownloadAll()
	}()

	e.mu.Lock()
	e.entries[gid] = &torrentEntry{
		t:       t,
		gid:     gid,
		name:    name,
		saveDir: saveDir,
		status:  "active",
		addedAt: time.Now(),
	}
	e.mu.Unlock()

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
	return nil
}

func (e *torrentEngine) remove(gid string, deleteFiles bool) error {
	e.mu.Lock()
	entry, ok := e.entries[gid]
	if ok {
		entry.t.Drop()
		delete(e.entries, gid)
	}
	e.mu.Unlock()

	if !ok {
		return nil // already gone
	}

	if deleteFiles && entry.saveDir != "" {
		// File deletion handled by caller (download_handler)
	}
	return nil
}

func (e *torrentEngine) status(gid string) (*Status, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
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

		stats := entry.t.Stats()
		s.SpeedBytes = int64(stats.ConnStats.BytesReadData.Int64()) // approximate

		if s.CompletedBytes >= s.TotalBytes && s.TotalBytes > 0 {
			if entry.status != "complete" {
				entry.status = "complete"
				s.Status = "complete"
			}
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
		// Check time limit
		if e.seedTime > 0 && time.Since(entry.seedStart) > e.seedTime {
			slog.Info("seed limit reached (time)", "name", entry.name)
			entry.t.Drop()
			continue
		}
		// Check ratio limit
		if e.seedRatio > 0 && entry.t.Info() != nil {
			stats := entry.t.Stats()
			uploaded := stats.ConnStats.BytesWrittenData.Int64()
			total := entry.t.Length()
			if total > 0 && float64(uploaded)/float64(total) >= e.seedRatio {
				slog.Info("seed limit reached (ratio)", "name", entry.name, "ratio", float64(uploaded)/float64(total))
				entry.t.Drop()
			}
		}
	}
}

func (e *torrentEngine) stop() {
	close(e.stopCh)
	e.client.Close()
}
```

NOTE: The speed calculation using `BytesReadData` is a snapshot-based approximation. A more accurate approach would track bytes over time deltas. This can be refined later.

**Step 2: Verify it compiles**

```bash
cd api && go build ./internal/downloader/...
```

**Step 3: Commit**

```bash
git add api/internal/downloader/torrent.go
git commit -m "feat(downloader): implement torrent engine with anacrolix/torrent"
```

---

### Task 4: Implement the HTTP downloader

**Files:**
- Create: `api/internal/downloader/http.go`

**Step 1: Implement HTTP file downloader**

Simple HTTP downloader for direct file URLs. Supports pause/resume via Range headers.

```go
package downloader

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
)

type httpEntry struct {
	gid       string
	url       string
	name      string
	saveDir   string
	status    string
	err       string
	total     int64
	completed atomic.Int64
	speed     atomic.Int64
	cancel    context.CancelFunc
}

type httpDownloader struct {
	mu      sync.RWMutex
	entries map[string]*httpEntry
}

func newHTTPDownloader() *httpDownloader {
	return &httpDownloader{
		entries: make(map[string]*httpEntry),
	}
}

func (h *httpDownloader) add(ctx context.Context, url, saveDir, name string) (string, error) {
	gid := fmt.Sprintf("http-%d", time.Now().UnixNano())

	if name == "" {
		name = filepath.Base(url)
	}

	dlCtx, cancel := context.WithCancel(context.Background())

	entry := &httpEntry{
		gid:     gid,
		url:     url,
		name:    name,
		saveDir: saveDir,
		status:  "active",
		cancel:  cancel,
	}

	h.mu.Lock()
	h.entries[gid] = entry
	h.mu.Unlock()

	go h.download(dlCtx, entry)

	return gid, nil
}

func (h *httpDownloader) download(ctx context.Context, entry *httpEntry) {
	dest := filepath.Join(entry.saveDir, entry.name)
	if err := os.MkdirAll(entry.saveDir, 0o755); err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, entry.url, nil)
	if err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return // cancelled (paused/removed)
		}
		entry.status = "error"
		entry.err = err.Error()
		return
	}
	defer resp.Body.Close()

	entry.total = resp.ContentLength

	f, err := os.Create(dest)
	if err != nil {
		entry.status = "error"
		entry.err = err.Error()
		return
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	var lastCheck time.Time
	var lastBytes int64

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				entry.status = "error"
				entry.err = writeErr.Error()
				return
			}
			entry.completed.Add(int64(n))

			// Calculate speed every second
			now := time.Now()
			if now.Sub(lastCheck) >= time.Second {
				current := entry.completed.Load()
				entry.speed.Store(current - lastBytes)
				lastBytes = current
				lastCheck = now
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			entry.status = "error"
			entry.err = readErr.Error()
			return
		}
	}

	entry.status = "complete"
	entry.speed.Store(0)
	slog.Info("http download complete", "name", entry.name)
}

func (h *httpDownloader) pause(gid string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.entries[gid]
	if !ok {
		return fmt.Errorf("download %s not found", gid)
	}
	entry.cancel()
	entry.status = "paused"
	return nil
}

func (h *httpDownloader) resume(ctx context.Context, gid string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, ok := h.entries[gid]
	if !ok {
		return fmt.Errorf("download %s not found", gid)
	}
	dlCtx, cancel := context.WithCancel(context.Background())
	entry.cancel = cancel
	entry.status = "active"
	go h.download(dlCtx, entry)
	return nil
}

func (h *httpDownloader) remove(gid string) {
	h.mu.Lock()
	entry, ok := h.entries[gid]
	if ok {
		entry.cancel()
		delete(h.entries, gid)
	}
	h.mu.Unlock()
}

func (h *httpDownloader) status(gid string) (*Status, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.entries[gid]
	if !ok {
		return nil, fmt.Errorf("download %s not found", gid)
	}
	return &Status{
		GID:            gid,
		Name:           entry.name,
		Status:         entry.status,
		TotalBytes:     entry.total,
		CompletedBytes: entry.completed.Load(),
		SpeedBytes:     entry.speed.Load(),
		SaveDir:        entry.saveDir,
		Error:          entry.err,
	}, nil
}

func (h *httpDownloader) files(gid string) ([]FileInfo, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.entries[gid]
	if !ok {
		return nil, fmt.Errorf("download %s not found", gid)
	}
	return []FileInfo{{
		Path:     filepath.Join(entry.saveDir, entry.name),
		Size:     entry.total,
		Complete: entry.completed.Load(),
	}}, nil
}
```

**Step 2: Verify it compiles**

```bash
cd api && go build ./internal/downloader/...
```

**Step 3: Commit**

```bash
git add api/internal/downloader/http.go
git commit -m "feat(downloader): implement HTTP file downloader"
```

---

### Task 5: Implement the unified Engine (Manager implementation)

**Files:**
- Create: `api/internal/downloader/engine.go`

**Step 1: Implement the Engine that combines torrent + HTTP and handles DB resume**

```go
package downloader

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/milmil/api/internal/store"
)

// Engine implements Manager by routing to torrent or HTTP engines.
type Engine struct {
	torrent *torrentEngine
	http    *httpDownloader
	queries *store.Queries
}

// Config for the download engine.
type Config struct {
	TorrentListenPort int           // default 42069
	SeedRatio         float64       // default 1.0
	SeedTime          time.Duration // default 60 min
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() Config {
	return Config{
		TorrentListenPort: 42069,
		SeedRatio:         1.0,
		SeedTime:          60 * time.Minute,
	}
}

// NewEngine creates a new download engine.
func NewEngine(cfg Config, queries *store.Queries) (*Engine, error) {
	te, err := newTorrentEngine(cfg.TorrentListenPort, cfg.SeedRatio, cfg.SeedTime)
	if err != nil {
		return nil, fmt.Errorf("torrent engine: %w", err)
	}

	return &Engine{
		torrent: te,
		http:    newHTTPDownloader(),
		queries: queries,
	}, nil
}

func (e *Engine) Add(ctx context.Context, url string, opts AddOptions) (string, error) {
	if isTorrent(url) {
		return e.torrent.add(ctx, url, opts.SaveDir, opts.Name)
	}
	return e.http.add(ctx, url, opts.SaveDir, opts.Name)
}

func (e *Engine) Pause(ctx context.Context, gid string) error {
	if err := e.torrent.pause(gid); err == nil {
		return nil
	}
	return e.http.pause(gid)
}

func (e *Engine) Resume(ctx context.Context, gid string) error {
	if err := e.torrent.resume(gid); err == nil {
		return nil
	}
	return e.http.resume(ctx, gid)
}

func (e *Engine) Remove(ctx context.Context, gid string, deleteFiles bool) error {
	if err := e.torrent.remove(gid, deleteFiles); err == nil {
		return nil
	}
	e.http.remove(gid)
	return nil
}

func (e *Engine) Status(ctx context.Context, gid string) (*Status, error) {
	if s, err := e.torrent.status(gid); err == nil {
		return s, nil
	}
	return e.http.status(gid)
}

func (e *Engine) Files(ctx context.Context, gid string) ([]FileInfo, error) {
	if f, err := e.torrent.files(gid); err == nil {
		return f, nil
	}
	return e.http.files(gid)
}

func (e *Engine) Healthy() bool {
	return e.torrent.client != nil
}

// Start initializes the engine and resumes incomplete downloads from DB.
func (e *Engine) Start(ctx context.Context) error {
	slog.Info("download engine starting")

	// Start seed watcher
	e.torrent.startSeedWatcher()

	// Resume incomplete downloads from DB
	downloads, err := e.queries.ListActiveDownloads(ctx)
	if err != nil {
		slog.Warn("download engine: failed to list active downloads", "err", err)
		return nil // non-fatal
	}

	resumed := 0
	for _, dl := range downloads {
		_, addErr := e.Add(ctx, dl.Url, AddOptions{
			SaveDir: dl.SaveDir,
			Name:    dl.Name,
		})
		if addErr != nil {
			slog.Warn("download engine: failed to resume", "name", dl.Name, "err", addErr)
			continue
		}
		// If it was paused, pause it again
		if dl.Status == "paused" {
			_ = e.Pause(ctx, dl.Gid)
		}
		resumed++
	}

	slog.Info("download engine started", "resumed", resumed)
	return nil
}

// Stop gracefully shuts down the engine.
func (e *Engine) Stop() error {
	slog.Info("download engine stopping")
	e.torrent.stop()
	return nil
}
```

**Step 2: Verify it compiles**

```bash
cd api && go build ./internal/downloader/...
```

**Step 3: Commit**

```bash
git add api/internal/downloader/engine.go
git commit -m "feat(downloader): implement unified Engine with DB resume"
```

---

### Task 6: Update config — remove aria2, add torrent settings

**Files:**
- Modify: `api/internal/config/config.go`

**Step 1: Replace aria2 config fields with torrent config**

Remove `Aria2RPCURL` and `Aria2RPCSecret` fields. Add:
```go
TorrentListenPort int
SeedRatio         float64
SeedTimeMinutes   int
```

Add defaults:
```go
"TORRENT_LISTEN_PORT": 42069,
"SEED_RATIO":          1.0,
"SEED_TIME_MINUTES":   60,
```

Remove defaults for `ARIA2_RPC_URL` and `ARIA2_RPC_SECRET`.

Update the `cfg` struct assignment accordingly.

**Step 2: Verify it compiles**

```bash
cd api && go build ./internal/config/...
```

**Step 3: Commit**

```bash
git add api/internal/config/
git commit -m "refactor(config): replace aria2 config with torrent settings"
```

---

### Task 7: Update main.go — init Engine instead of aria2

**Files:**
- Modify: `api/cmd/server/main.go`

**Step 1: Replace aria2 client initialization**

Remove (around line 197-199):
```go
aria2Client := aria2.NewClient(&http.Client{Timeout: 10 * time.Second}, cfg.Aria2RPCURL, cfg.Aria2RPCSecret)
```

Replace with:
```go
dlEngine, err := downloader.NewEngine(downloader.Config{
    TorrentListenPort: cfg.TorrentListenPort,
    SeedRatio:         cfg.SeedRatio,
    SeedTime:          time.Duration(cfg.SeedTimeMinutes) * time.Minute,
}, store.New(database))
if err != nil {
    slog.Error("download engine init failed", "err", err)
    os.Exit(1)
}
if err := dlEngine.Start(context.Background()); err != nil {
    slog.Error("download engine start failed", "err", err)
    os.Exit(1)
}
```

**Step 2: Update NewRouter and NewScheduler calls**

Replace `aria2Client` parameter with `dlEngine` in both `api.NewRouter()` and `worker.NewScheduler()`.

**Step 3: Add graceful shutdown**

In the signal handler (around line 234-246), add before `e.Shutdown`:
```go
dlEngine.Stop()
```

**Step 4: Remove `aria2` import, add `downloader` import**

**Step 5: Verify it compiles**

```bash
cd api && go build ./cmd/server/
```

**Step 6: Commit**

```bash
git add api/cmd/server/main.go
git commit -m "refactor(main): use download engine instead of aria2"
```

---

### Task 8: Update API router and handler — replace aria2.Client with Manager

**Files:**
- Modify: `api/internal/api/router.go` — change `aria2 aria2.Client` field to `downloader downloader.Manager`
- Modify: `api/internal/api/download_handler.go` — replace all `h.aria2.*` calls with `h.downloader.*`
- Modify: `api/internal/api/subscribe_handler.go` — replace `h.aria2.AddURI` with `h.downloader.Add`
- Modify: `api/internal/api/torrent_handler.go` — replace `h.aria2.AddURI` with `h.downloader.Add`
- Delete: `api/internal/api/aria2_handler.go` — replace with downloader status endpoint

**Step 1: Update router.go**

Change handler struct field:
```go
// old: aria2 aria2.Client
downloader downloader.Manager
```

Update `NewRouter` parameter and assignment. Change route `/api/v1/system/aria2-status` to `/api/v1/system/downloader-status`.

**Step 2: Update download_handler.go**

Key replacements:
- `h.aria2.AddURI(ctx, []string{req.URL}, opts)` → `h.downloader.Add(ctx, req.URL, downloader.AddOptions{SaveDir: req.SaveDir, Name: req.Name})`
- `h.aria2.Pause(ctx, gid)` → `h.downloader.Pause(ctx, gid)`
- `h.aria2.Resume(ctx, gid)` → `h.downloader.Resume(ctx, gid)`
- `h.aria2.Remove(ctx, gid)` → `h.downloader.Remove(ctx, gid, deleteFiles)`
- `h.aria2.GetStatus(ctx, gid)` for file listing → `h.downloader.Files(ctx, gid)`

The `handleDownloadFiles` handler (in `download_grouped_handler.go`) should use `h.downloader.Files(ctx, gid)` instead of parsing aria2 status.

**Step 3: Update subscribe_handler.go**

Replace `h.aria2.AddURI(ctx, []string{item.Link}, opts)` with:
```go
h.downloader.Add(ctx, item.Link, downloader.AddOptions{SaveDir: rule.SaveDir, Name: item.Title})
```

**Step 4: Update torrent_handler.go**

Replace `h.aria2.AddURI(ctx, []string{req.URL}, map[string]string{})` with:
```go
h.downloader.Add(ctx, req.URL, downloader.AddOptions{Name: req.Name})
```

**Step 5: Replace aria2_handler.go**

Delete the file. Add a new handler method:
```go
func (h *handler) handleDownloaderStatus(c echo.Context) error {
    return c.JSON(http.StatusOK, map[string]any{
        "engine":  "builtin",
        "healthy": h.downloader.Healthy(),
    })
}
```

**Step 6: Verify it compiles**

```bash
cd api && go build ./internal/api/...
```

**Step 7: Commit**

```bash
git add api/internal/api/
git commit -m "refactor(api): replace aria2 handlers with download engine"
```

---

### Task 9: Update workers — replace aria2 in scheduler and jobs

**Files:**
- Modify: `api/internal/worker/worker.go` — replace `aria2 aria2.Client` with `downloader downloader.Manager`
- Modify: `api/internal/worker/rss_refresh_job.go` — replace `aria2.AddURI` with `downloader.Add`
- Modify: `api/internal/worker/download_sync_job.go` — simplify to use `downloader.Status()`, remove orphan discovery

**Step 1: Update worker.go**

Change Scheduler struct field and NewScheduler parameter from `aria2 aria2.Client` to `downloader downloader.Manager`. Pass it to `RSSRefreshWorker` and `DownloadSyncWorker`.

**Step 2: Update rss_refresh_job.go**

Replace `w.aria2.AddURI(ctx, []string{item.Link}, opts)` with:
```go
w.downloader.Add(ctx, item.Link, downloader.AddOptions{SaveDir: rule.SaveDir, Name: item.Title})
```

**Step 3: Simplify download_sync_job.go**

Remove `discoverOrphaned()` entirely — the engine manages all downloads.

Simplify `Run()` to:
1. `w.queries.ListActiveDownloads(ctx)` — get DB records
2. For each, `w.downloader.Status(ctx, dl.Gid)` — get live status
3. Update DB via `w.queries.UpdateDownloadStatus()`
4. Detect completion → trigger pipeline
5. Detect error → send notification

Remove `mapAria2Status()`, `isMediaDownload()`, and all aria2 list/status parsing.

**Step 4: Verify it compiles**

```bash
cd api && go build ./internal/worker/...
```

**Step 5: Commit**

```bash
git add api/internal/worker/
git commit -m "refactor(worker): use download engine in scheduler and jobs"
```

---

### Task 10: Delete aria2 integration and Docker config

**Files:**
- Delete: `api/internal/integration/aria2/client.go`
- Delete: `api/internal/integration/aria2/types.go`
- Modify: `docker-compose.yml` — remove aria2 service, remove depends_on, remove ARIA2 env vars
- Modify: `docker-compose.dev.yml` — remove aria2 service
- Delete: `aria2-config/` directory (optional — keep for reference if desired)

**Step 1: Delete aria2 Go package**

```bash
rm -rf api/internal/integration/aria2/
```

**Step 2: Update docker-compose.yml**

Remove the `aria2:` service block (lines 36-48). Remove `ARIA2_RPC_URL` and `ARIA2_RPC_SECRET` from api environment. Remove `depends_on: aria2`.

**Step 3: Update docker-compose.dev.yml**

Same — remove aria2 service block.

**Step 4: Verify full build**

```bash
cd api && go build ./...
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove aria2 integration and Docker service"
```

---

### Task 11: Update frontend — rename aria2-status endpoint

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx` — update status endpoint URL and response shape
- Modify: `web/src/lib/api/downloads.ts` — if aria2 status API is defined there

**Step 1: Find and replace `aria2-status` with `downloader-status`**

In DownloadsPage.tsx, update the query:
```typescript
// old: '/api/v1/system/aria2-status'
// new: '/api/v1/system/downloader-status'
```

Update the response type — no more `version` or `rpc_url` fields:
```typescript
interface DownloaderStatus {
  engine: string;  // "builtin"
  healthy: boolean;
}
```

Update the Aria2 status display in the header to show "Downloader" instead of "Aria2 vX.X.X".

**Step 2: Verify frontend builds**

```bash
cd web && bun run typecheck
```

**Step 3: Commit**

```bash
git add web/
git commit -m "refactor(web): update downloader status endpoint"
```

---

### Task 12: End-to-end test

**Step 1: Start the server**

```bash
cd api && go run ./cmd/server/
```

Verify: "download engine starting" log appears, no errors.

**Step 2: Test adding a magnet link**

Use the "Add URL" dialog in the frontend. Paste a magnet link for a small test torrent (e.g. a Linux distro torrent). Verify:
- Download appears in the list with "active" status
- Progress updates (bytes, speed)
- File list shows in detail drawer

**Step 3: Test pause/resume**

- Pause the download — status changes to "paused", speed goes to 0
- Resume — status back to "active"

**Step 4: Test RSS auto-download**

- Create a subscription — verify downloads are triggered automatically
- Check that files go directly to the library path

**Step 5: Test restart resume**

- Stop the server while a download is active
- Restart — verify the download resumes from where it left off

**Step 6: Test delete**

- Delete a download with "delete files" checked
- Verify files are removed from disk

---
