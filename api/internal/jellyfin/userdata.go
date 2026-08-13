package jellyfin

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handleGetUserData(c *echo.Context) error {
	userID := c.Get("userID").(string)
	itemIDEncoded := c.Param("itemId")

	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var episodeID string

	switch typ {
	case "episode":
		episodeID = id
	case "file":
		mf, err := h.queries.GetMediaFileByID(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	default:
		return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
	}

	if episodeID == "" {
		return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
	}

	progress, err := h.queries.GetWatchProgress(ctx, store.GetWatchProgressParams{
		UserID:    userID,
		EpisodeID: episodeID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
		}
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Internal error"})
	}

	return c.JSON(http.StatusOK, UserItemData{
		PlaybackPositionTicks: progress.PositionSeconds * 10_000_000,
		PlayCount:             int(progress.Completed),
		Played:                progress.Completed == 1,
		Key:                   itemIDEncoded,
	})
}
