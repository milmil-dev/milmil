package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type saveProgressRequest struct {
	MediaFileID     string `json:"media_file_id"`
	EpisodeID       string `json:"episode_id"`
	PositionSeconds int64  `json:"position_seconds"`
	DurationSeconds int64  `json:"duration_seconds"`
	Completed       bool   `json:"completed"`
}

type progressResponse struct {
	ID              string  `json:"id"`
	UserID          string  `json:"user_id"`
	EpisodeID       string  `json:"episode_id"`
	MediaFileID     *string `json:"media_file_id"`
	PositionSeconds int64   `json:"position_seconds"`
	DurationSeconds *int64  `json:"duration_seconds"`
	Completed       int64   `json:"completed"`
	LastWatchedAt   string  `json:"last_watched_at"`
}

func toProgressResponse(p store.WatchProgress) progressResponse {
	return progressResponse{
		ID:              p.ID,
		UserID:          p.UserID,
		EpisodeID:       p.EpisodeID,
		MediaFileID:     nullStr(p.MediaFileID),
		PositionSeconds: p.PositionSeconds,
		DurationSeconds: nullInt(p.DurationSeconds),
		Completed:       p.Completed,
		LastWatchedAt:   p.LastWatchedAt,
	}
}

func (h *handler) handleSaveProgress(c echo.Context) error {
	var req saveProgressRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.EpisodeID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "episode_id is required")
	}

	userID := getUserID(c)

	var completedInt int64
	if req.Completed {
		completedInt = 1
	}

	progress, err := h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:        uuid.New().String(),
		UserID:    userID,
		EpisodeID: req.EpisodeID,
		MediaFileID: sql.NullString{
			String: req.MediaFileID,
			Valid:  req.MediaFileID != "",
		},
		PositionSeconds: req.PositionSeconds,
		DurationSeconds: sql.NullInt64{
			Int64: req.DurationSeconds,
			Valid: req.DurationSeconds > 0,
		},
		Completed: completedInt,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, toProgressResponse(progress))
}

func (h *handler) handleListRecentProgress(c echo.Context) error {
	userID := getUserID(c)

	items, err := h.queries.ListWatchProgressByUser(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	result := make([]progressResponse, len(items))
	for i, item := range items {
		result[i] = toProgressResponse(item)
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleGetProgressByFile(c echo.Context) error {
	userID := getUserID(c)
	fileID := c.Param("fileId")

	progress, err := h.queries.GetWatchProgressByMediaFile(c.Request().Context(), store.GetWatchProgressByMediaFileParams{
		UserID: userID,
		MediaFileID: sql.NullString{
			String: fileID,
			Valid:  fileID != "",
		},
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "no progress found")
		}
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, toProgressResponse(progress))
}
