package api

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
	ws2 "github.com/milmil/api/internal/ws"
)

type transcodeRequest struct {
	Codec      string `json:"codec"`
	Resolution string `json:"resolution"`
}

func (h *handler) handleStartTranscode(c *echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	file, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	var req transcodeRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Codec == "" {
		req.Codec = "h264"
	}
	if req.Resolution == "" {
		req.Resolution = "1080p"
	}

	lib, err := h.queries.GetLibrary(ctx, file.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	token := uuid.NewString()
	outputDir := filepath.Join(os.TempDir(), "milmil", "transcode", token)

	session, err := h.queries.CreateTranscodeSession(ctx, store.CreateTranscodeSessionParams{
		ID:           uuid.NewString(),
		MediaFileID:  fileID,
		SessionToken: token,
		OutputDir:    outputDir,
		Codec:        sql.NullString{String: req.Codec, Valid: true},
		Resolution:   sql.NullString{String: req.Resolution, Valid: true},
		ExpiresAt:    time.Now().Add(4 * time.Hour).Format(time.RFC3339),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Start FFmpeg in background
	go func() {
		bgCtx := context.Background()
		if err := h.queries.UpdateTranscodeSessionStatus(bgCtx, store.UpdateTranscodeSessionStatusParams{
			Status:       "running",
			Progress:     0,
			SessionToken: token,
		}); err != nil {
			slog.Warn("transcode: set session status running", "token", token, "err", err)
		}

		// For remote storage backends, copy the file to a local temp path before transcoding.
		inputPath := file.Path
		var tempFile string
		if lib.SourceType != "local" && lib.SourceType != "" {
			var configJSON string
			if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
				if decrypted, decErr := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String); decErr == nil {
					configJSON = decrypted
				}
			}
			provider, provErr := storage.NewProvider(lib.SourceType, configJSON)
			if provErr == nil {
				defer provider.Close()
				rc, openErr := provider.Open(file.Path)
				if openErr == nil {
					tmpDir := filepath.Join(os.TempDir(), "milmil", "transcode-input", token)
					if mkdirErr := os.MkdirAll(tmpDir, 0o700); mkdirErr != nil {
						slog.Warn("transcode: create temp dir", "dir", tmpDir, "err", mkdirErr)
					}
					tmpPath := filepath.Join(tmpDir, file.Filename)
					if f, createErr := os.Create(tmpPath); createErr == nil {
						if _, copyErr := io.Copy(f, rc); copyErr == nil {
							inputPath = tmpPath
							tempFile = tmpPath
						}
						f.Close()
					}
					rc.Close()
				}
			}
		}
		defer func() {
			if tempFile != "" {
				if removeErr := os.Remove(tempFile); removeErr != nil {
					slog.Warn("transcode: remove temp file", "path", tempFile, "err", removeErr)
				}
			}
		}()

		err := ffmpeg.Transcode(bgCtx, ffmpeg.TranscodeOptions{
			InputPath:  inputPath,
			OutputDir:  outputDir,
			Codec:      req.Codec,
			Resolution: req.Resolution,
		})

		status := "ready"
		progress := int64(100)
		if err != nil {
			status = "error"
			progress = 0
		}
		if err := h.queries.UpdateTranscodeSessionStatus(bgCtx, store.UpdateTranscodeSessionStatusParams{
			Status:       status,
			Progress:     progress,
			SessionToken: token,
		}); err != nil {
			slog.Warn("transcode: set session final status", "token", token, "status", status, "err", err)
		}

		if h.wsHub != nil {
			h.wsHub.Broadcast(ws2.Event{
				Type: "transcode:" + status,
				Data: map[string]any{"token": token, "file_id": fileID},
			})
		}
	}()

	return c.JSON(http.StatusAccepted, map[string]any{
		"token":  session.SessionToken,
		"status": "pending",
	})
}

func (h *handler) handleHLSMaster(c *echo.Context) error {
	token := c.Param("token")
	session, err := h.queries.GetTranscodeSession(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "session not found")
	}

	if session.Status != "ready" {
		return c.JSON(http.StatusAccepted, map[string]any{
			"status":   session.Status,
			"progress": session.Progress,
		})
	}

	m3u8Path := filepath.Join(session.OutputDir, "master.m3u8")
	return serveLocalFile(c, m3u8Path, "application/vnd.apple.mpegurl")
}

func (h *handler) handleHLSSegment(c *echo.Context) error {
	token := c.Param("token")
	segment := c.Param("segment")
	if !safePathSegment(segment) {
		return echo.NewHTTPError(http.StatusNotFound, "segment not found")
	}

	session, err := h.queries.GetTranscodeSession(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "session not found")
	}

	segmentPath := filepath.Join(session.OutputDir, segment)
	if _, statErr := os.Stat(segmentPath); os.IsNotExist(statErr) {
		return echo.NewHTTPError(http.StatusNotFound, "segment not found")
	}

	return serveLocalFile(c, segmentPath, "")
}
