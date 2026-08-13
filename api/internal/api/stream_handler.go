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
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/storage"
)

var mimeTypes = map[string]string{
	".mp4":  "video/mp4",
	".mkv":  "video/x-matroska",
	".webm": "video/webm",
	".avi":  "video/x-msvideo",
	".mov":  "video/quicktime",
	".m4v":  "video/x-m4v",
	".ts":   "video/mp2t",
	".flv":  "video/x-flv",
}

func (h *handler) handleStreamDirect(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	// Get the library to determine storage type
	lib, err := h.queries.GetLibrary(ctx, mediaFile.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	ext := strings.ToLower(filepath.Ext(mediaFile.Path))
	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Response().Header().Set("Content-Type", contentType)

	// Local files: use os.Open directly (supports ReadSeeker for Range requests)
	if lib.SourceType == "local" || lib.SourceType == "" {
		f, err := os.Open(mediaFile.Path)
		if err != nil {
			return echo.NewHTTPError(http.StatusNotFound, "file not on disk")
		}
		defer f.Close()

		stat, err := f.Stat()
		if err != nil {
			return echo.ErrInternalServerError
		}

		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), f)
		return nil
	}

	// Remote files (SMB, SFTP, etc.): use Storage Provider via rclone VFS
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "cannot decrypt storage config")
		}
		configJSON = decrypted
	}

	provider, err := storage.NewProvider(lib.SourceType, configJSON)
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "storage backend unavailable")
	}
	defer provider.Close()

	reader, err := provider.Open(mediaFile.Path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "file not accessible on remote storage")
	}
	defer reader.Close()

	// If the reader supports ReadSeeker (rclone VFS does), use ServeContent for Range support
	if rs, ok := reader.(io.ReadSeeker); ok {
		// Get file size for Content-Length
		stat, err := provider.Stat(mediaFile.Path)
		if err != nil {
			return echo.ErrInternalServerError
		}
		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), rs)
		return nil
	}

	// Fallback: stream without Range support
	c.Response().Header().Set("Content-Disposition", "inline")
	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response(), reader)
	return err
}

// handleStreamRemux re-wraps a video file into MP4 container without re-encoding.
// Used for MKV/AVI files with browser-compatible codecs (H264, VP9).
// Much faster than full transcode — only copies streams.
func (h *handler) handleStreamRemux(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	lib, err := h.queries.GetLibrary(ctx, mediaFile.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	// Determine input path — local or copy from remote
	inputPath := mediaFile.Path
	var tempInput string

	if lib.SourceType != "local" && lib.SourceType != "" {
		var configJSON string
		if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
			decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, "cannot decrypt config")
			}
			configJSON = decrypted
		}

		provider, err := storage.NewProvider(lib.SourceType, configJSON)
		if err != nil {
			return echo.NewHTTPError(http.StatusServiceUnavailable, "storage unavailable")
		}

		tempDir := filepath.Join(os.TempDir(), "milmil", "remux-input")
		os.MkdirAll(tempDir, 0o755)
		tempInput = filepath.Join(tempDir, filepath.Base(mediaFile.Path))

		reader, err := provider.Open(mediaFile.Path)
		if err != nil {
			provider.Close()
			return echo.NewHTTPError(http.StatusNotFound, "file not accessible")
		}

		tmpFile, err := os.Create(tempInput)
		if err != nil {
			reader.Close()
			provider.Close()
			return echo.ErrInternalServerError
		}

		_, copyErr := io.Copy(tmpFile, reader)
		tmpFile.Close()
		reader.Close()
		provider.Close()

		if copyErr != nil {
			os.Remove(tempInput)
			return echo.ErrInternalServerError
		}

		inputPath = tempInput
	}

	// Remux to temp MP4
	outputDir := filepath.Join(os.TempDir(), "milmil", "remux-output")
	os.MkdirAll(outputDir, 0o755)
	outputPath := filepath.Join(outputDir, fmt.Sprintf("%s.mp4", fileID))

	// Check if already remuxed (cache)
	if _, err := os.Stat(outputPath); err != nil {
		// Not cached — run remux
		if err := ffmpeg.Remux(context.Background(), inputPath, outputPath); err != nil {
			if tempInput != "" {
				os.Remove(tempInput)
			}
			return echo.NewHTTPError(http.StatusInternalServerError, "remux failed")
		}
	}

	// Clean up temp input
	if tempInput != "" {
		os.Remove(tempInput)
	}

	// Serve the remuxed file
	f, err := os.Open(outputPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "remuxed file not found")
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}

	c.Response().Header().Set("Content-Type", "video/mp4")
	http.ServeContent(c.Response(), c.Request(), mediaFile.Filename+".mp4", stat.ModTime(), f)
	return nil
}
