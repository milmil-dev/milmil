package downloader

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/milmil/api/internal/store"
)

// Compile-time check that Engine implements Manager.
var _ Manager = (*Engine)(nil)

// Engine implements Manager by routing to torrent or HTTP engines.
type Engine struct {
	torrent *torrentEngine
	http    *httpDownloader
	queries *store.Queries
}

// Config for the download engine.
type Config struct {
	DataDir           string        // base directory for torrent data
	TorrentListenPort int           // default 42069
	SeedRatio         float64       // default 1.0
	SeedTime          time.Duration // default 60 min
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() Config {
	dataDir := filepath.Join(os.TempDir(), "milmil-downloads")
	return Config{
		DataDir:           dataDir,
		TorrentListenPort: 42069,
		SeedRatio:         1.0,
		SeedTime:          60 * time.Minute,
	}
}

// NewEngine creates a new download engine.
func NewEngine(cfg Config, queries *store.Queries) (*Engine, error) {
	te, err := newTorrentEngine(cfg.DataDir, cfg.TorrentListenPort, cfg.SeedRatio, cfg.SeedTime)
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
	return e.torrent != nil && e.torrent.client != nil
}

// Start initializes the engine and resumes incomplete downloads from DB.
func (e *Engine) Start(ctx context.Context) error {
	slog.Info("download engine starting")

	// Start seed watcher.
	e.torrent.startSeedWatcher()

	// Resume incomplete downloads from DB.
	if e.queries == nil {
		slog.Info("download engine started (no db queries)")
		return nil
	}

	downloads, err := e.queries.ListActiveDownloads(ctx)
	if err != nil {
		slog.Warn("download engine: failed to list active downloads", "err", err)
		return nil // non-fatal
	}

	resumed := 0
	for _, dl := range downloads {
		gid, addErr := e.Add(ctx, dl.Url, AddOptions{
			SaveDir: dl.SaveDir,
			Name:    dl.Name,
		})
		if addErr != nil {
			slog.Warn("download engine: failed to resume", "name", dl.Name, "err", addErr)
			continue
		}
		// If it was paused, pause it again.
		if dl.Status == "paused" {
			_ = e.Pause(ctx, gid)
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
