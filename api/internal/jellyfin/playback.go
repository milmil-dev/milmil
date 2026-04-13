package jellyfin

import (
	"database/sql"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handlePlaybackStart(c echo.Context) error {
	var req PlaybackStartRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) handlePlaybackProgress(c echo.Context) error {
	var req PlaybackProgressRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}

	userID := c.Get("userID").(string)
	typ, id, err := DecodeItemID(req.ItemID)
	if err != nil {
		return c.NoContent(http.StatusNoContent)
	}

	var episodeID string
	var mediaFileID string

	switch typ {
	case "episode":
		episodeID = id
		files, _ := h.queries.ListMediaFilesByEpisodeID(c.Request().Context(), id)
		if len(files) > 0 {
			mediaFileID = files[0].ID
		}
	case "file":
		mediaFileID = id
		mf, _ := h.queries.GetMediaFileByID(c.Request().Context(), id)
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	}

	if episodeID == "" {
		return c.NoContent(http.StatusNoContent)
	}

	positionSeconds := int64(req.PositionTicks / 10_000_000)

	h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:              uuid.NewString(),
		UserID:          userID,
		EpisodeID:       episodeID,
		MediaFileID:     sql.NullString{String: mediaFileID, Valid: mediaFileID != ""},
		PositionSeconds: positionSeconds,
		DurationSeconds: sql.NullInt64{},
		Completed:       0,
	})

	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) handlePlaybackStop(c echo.Context) error {
	var req PlaybackStopRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}

	userID := c.Get("userID").(string)
	typ, id, err := DecodeItemID(req.ItemID)
	if err != nil {
		return c.NoContent(http.StatusNoContent)
	}

	var episodeID string
	var mediaFileID string

	switch typ {
	case "episode":
		episodeID = id
		files, _ := h.queries.ListMediaFilesByEpisodeID(c.Request().Context(), id)
		if len(files) > 0 {
			mediaFileID = files[0].ID
		}
	case "file":
		mediaFileID = id
		mf, _ := h.queries.GetMediaFileByID(c.Request().Context(), id)
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	}

	if episodeID == "" {
		return c.NoContent(http.StatusNoContent)
	}

	positionSeconds := int64(req.PositionTicks / 10_000_000)

	h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:              uuid.NewString(),
		UserID:          userID,
		EpisodeID:       episodeID,
		MediaFileID:     sql.NullString{String: mediaFileID, Valid: mediaFileID != ""},
		PositionSeconds: positionSeconds,
		DurationSeconds: sql.NullInt64{},
		Completed:       0,
	})

	return c.NoContent(http.StatusNoContent)
}
