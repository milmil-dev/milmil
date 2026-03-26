package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/ffmpeg"
	"github.com/milmil/api/internal/store"
	ws2 "github.com/milmil/api/internal/ws"
)

type transcodeRequest struct {
	Codec      string `json:"codec"`
	Resolution string `json:"resolution"`
}

func (h *handler) handleStartTranscode(c echo.Context) error {
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
		_ = h.queries.UpdateTranscodeSessionStatus(bgCtx, store.UpdateTranscodeSessionStatusParams{
			Status:       "running",
			Progress:     0,
			SessionToken: token,
		})

		err := ffmpeg.Transcode(bgCtx, ffmpeg.TranscodeOptions{
			InputPath:  file.Path,
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
		_ = h.queries.UpdateTranscodeSessionStatus(bgCtx, store.UpdateTranscodeSessionStatusParams{
			Status:       status,
			Progress:     progress,
			SessionToken: token,
		})

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

func (h *handler) handleHLSMaster(c echo.Context) error {
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
	return c.File(m3u8Path)
}

func (h *handler) handleHLSSegment(c echo.Context) error {
	token := c.Param("token")
	segment := c.Param("segment")

	session, err := h.queries.GetTranscodeSession(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "session not found")
	}

	segmentPath := filepath.Join(session.OutputDir, segment)
	if _, statErr := os.Stat(segmentPath); os.IsNotExist(statErr) {
		return echo.NewHTTPError(http.StatusNotFound, "segment not found")
	}

	return c.File(segmentPath)
}
