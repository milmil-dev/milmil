package api

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

// thumbnailGenerationTimeout bounds one sprite-sheet render. A remote library
// has to download the whole file first, so this is generous.
const thumbnailGenerationTimeout = 10 * time.Minute

// errThumbnailSource marks a failure to reach the media file (offline
// library, storage backend down) as opposed to ffmpeg failing on it.
var errThumbnailSource = errors.New("media file not accessible")

// thumbnailJob is one in-flight sprite render, shared by every request that
// arrives while it runs. `err` is valid once `done` is closed.
type thumbnailJob struct {
	done chan struct{}
	err  error
}

// thumbnailJobs dedups concurrent renders per media file and detaches them
// from the requesting connection: a player that times out and reconnects
// must find the job still running (or its cached result), not a fresh
// ffmpeg that gets killed with the next disconnect.
type thumbnailJobs struct {
	mu   sync.Mutex
	jobs map[string]*thumbnailJob
}

func newThumbnailJobs() *thumbnailJobs {
	return &thumbnailJobs{jobs: map[string]*thumbnailJob{}}
}

// run starts `generate` for `key` unless one is already running, in which
// case the existing job is returned. The job's context is derived from
// `parent` but survives its cancellation.
func (j *thumbnailJobs) run(parent context.Context, key string, generate func(ctx context.Context) error) *thumbnailJob {
	j.mu.Lock()
	defer j.mu.Unlock()
	if job, ok := j.jobs[key]; ok {
		return job
	}
	job := &thumbnailJob{done: make(chan struct{})}
	j.jobs[key] = job
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), thumbnailGenerationTimeout)
	go func() {
		defer cancel()
		job.err = generate(ctx)
		j.mu.Lock()
		delete(j.jobs, key)
		j.mu.Unlock()
		close(job.done)
	}()
	return job
}

// serveLocalFile streams one file out of a directory. Echo's c.File resolves
// paths against the process working directory and 404s on the absolute
// DataDir every deployment uses; http.ServeFileFS still handles Range and
// conditional requests.
//
// The name is opened through os.Root rather than joined by the caller, so it
// is confined to root by the kernel — a traversal cannot escape even if a
// caller forgets to validate the route parameter it passed in.
func serveLocalFile(c *echo.Context, root, name, contentType string) error {
	if !safePathSegment(name) {
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	}
	dir, err := os.OpenRoot(root)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "not found")
	}
	defer func() { _ = dir.Close() }()
	if contentType != "" {
		c.Response().Header().Set(echo.HeaderContentType, contentType)
	}
	http.ServeFileFS(c.Response(), c.Request(), dir.FS(), name)
	return nil
}

// resolveInputPath returns a local file path for the media file.
// For remote libraries it downloads the file to a temp location and returns
// (localPath, tempFilePath, nil). The caller is responsible for removing tempFilePath when done.
// For local libraries tempFilePath is empty.
func (h *handler) resolveInputPath(ctx context.Context, lib store.Library, mediaPath string) (localPath string, tempFile string, err error) {
	if lib.SourceType == "local" || lib.SourceType == "" {
		return mediaPath, "", nil
	}

	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, decErr := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if decErr != nil {
			return "", "", fmt.Errorf("cannot decrypt storage config: %w", decErr)
		}
		configJSON = decrypted
	}

	provider, provErr := storage.NewProvider(lib.SourceType, configJSON)
	if provErr != nil {
		return "", "", fmt.Errorf("storage backend unavailable: %w", provErr)
	}
	defer provider.Close()

	tempDir := filepath.Join(os.TempDir(), "milmil", "thumbnail-input")
	if mkErr := os.MkdirAll(tempDir, 0o755); mkErr != nil {
		return "", "", mkErr
	}
	tempPath := filepath.Join(tempDir, filepath.Base(mediaPath))

	reader, openErr := provider.Open(mediaPath)
	if openErr != nil {
		return "", "", fmt.Errorf("file not accessible: %w", openErr)
	}
	defer reader.Close()

	tmpFile, createErr := os.Create(tempPath)
	if createErr != nil {
		return "", "", createErr
	}

	if _, copyErr := io.Copy(tmpFile, reader); copyErr != nil {
		tmpFile.Close()
		os.Remove(tempPath)
		return "", "", copyErr
	}
	tmpFile.Close()

	return tempPath, tempPath, nil
}

// generateThumbnails renders the sprite sheet and VTT for mf into cacheDir.
func (h *handler) generateThumbnails(ctx context.Context, mf store.MediaFile, lib store.Library, cacheDir string) error {
	inputPath, tempFile, err := h.resolveInputPath(ctx, lib, mf.Path)
	if err != nil {
		return fmt.Errorf("%w: %w", errThumbnailSource, err)
	}
	if tempFile != "" {
		defer os.Remove(tempFile)
	}

	// Get duration from DB or default
	duration := 1440 // default 24 minutes
	if mf.DurationSeconds.Valid && mf.DurationSeconds.Int64 > 0 {
		duration = int(mf.DurationSeconds.Int64)
	}

	// Generate sprite sheet (10 second intervals, 160px wide tiles)
	_, err = ffmpeg.GenerateSpriteSheet(ctx, inputPath, cacheDir, duration, 10, 160)
	return err
}

// handleThumbnailVTT serves the WebVTT file for timeline thumbnail previews.
// Generates the sprite sheet on first request and caches it in the data dir.
// The render is detached from this connection: if the client gives up
// waiting, the job finishes anyway and the retry is served from cache.
func (h *handler) handleThumbnailVTT(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")
	if !safePathSegment(fileID) {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}

	mf, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	// Cache directory for this file's thumbnails
	cacheDir := filepath.Join(h.cfg.DataDir, "thumbnails", fileID)

	vttPath := filepath.Join(cacheDir, "thumbnails.vtt")
	if _, statErr := os.Stat(vttPath); statErr == nil {
		// Already generated — serve it
		return serveLocalFile(c, cacheDir, "thumbnails.vtt", "text/vtt; charset=utf-8")
	}

	lib, err := h.queries.GetLibrary(ctx, mf.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	job := h.thumbnails.run(ctx, fileID, func(ctx context.Context) error {
		return h.generateThumbnails(ctx, mf, lib, cacheDir)
	})
	select {
	case <-job.done:
	case <-ctx.Done():
		// The client hung up; nobody will read this. The job keeps running
		// so the next request finds the cached track.
		return echo.NewHTTPError(http.StatusRequestTimeout, "client disconnected before the thumbnail track was ready")
	}
	if job.err != nil {
		if errors.Is(job.err, errThumbnailSource) {
			return echo.NewHTTPError(http.StatusServiceUnavailable, "file not accessible")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("thumbnail generation failed: %v", job.err))
	}

	return serveLocalFile(c, cacheDir, "thumbnails.vtt", "text/vtt; charset=utf-8")
}

// handleThumbnailSprite serves the sprite sheet image.
func (h *handler) handleThumbnailSprite(c *echo.Context) error {
	fileID := c.Param("fileId")
	if !safePathSegment(fileID) {
		return echo.NewHTTPError(http.StatusNotFound, "sprite not generated yet — request thumbnails.vtt first")
	}
	cacheDir := filepath.Join(h.cfg.DataDir, "thumbnails", fileID)
	spritePath := filepath.Join(cacheDir, "sprite.jpg")

	if _, err := os.Stat(spritePath); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "sprite not generated yet — request thumbnails.vtt first")
	}

	return serveLocalFile(c, cacheDir, "sprite.jpg", "image/jpeg")
}
