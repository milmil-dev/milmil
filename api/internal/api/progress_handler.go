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

	return c.JSON(http.StatusOK, progress)
}

func (h *handler) handleListRecentProgress(c echo.Context) error {
	userID := getUserID(c)

	items, err := h.queries.ListWatchProgressByUser(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, items)
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

	return c.JSON(http.StatusOK, progress)
}
