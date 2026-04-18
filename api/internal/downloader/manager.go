package downloader

import (
	"context"
	"strings"
)

// Manager is the unified download engine interface.
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
