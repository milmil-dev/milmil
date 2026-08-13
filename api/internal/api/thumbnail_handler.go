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

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
)

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

// handleThumbnailVTT serves the WebVTT file for timeline thumbnail previews.
// Generates sprite sheet on first request, caches in data dir.
func (h *handler) handleThumbnailVTT(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

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
		return c.File(vttPath)
	}

	// Need to generate — resolve input path
	lib, err := h.queries.GetLibrary(ctx, mf.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	inputPath, tempFile, err := h.resolveInputPath(ctx, lib, mf.Path)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "file not accessible")
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
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("thumbnail generation failed: %v", err))
	}

	return c.File(vttPath)
}

// handleThumbnailSprite serves the sprite sheet image.
func (h *handler) handleThumbnailSprite(c *echo.Context) error {
	fileID := c.Param("fileId")
	cacheDir := filepath.Join(h.cfg.DataDir, "thumbnails", fileID)
	spritePath := filepath.Join(cacheDir, "sprite.jpg")

	if _, err := os.Stat(spritePath); err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "sprite not generated yet — request thumbnails.vtt first")
	}

	return c.File(spritePath)
}
