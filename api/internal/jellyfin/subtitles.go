package jellyfin

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetSubtitle(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	indexStr := c.Param("index")

	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var fileID string
	switch typ {
	case "file":
		fileID = id
	case "episode":
		files, err := h.queries.ListMediaFilesByEpisodeID(ctx, id)
		if err != nil || len(files) == 0 {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "No media file"})
		}
		fileID = files[0].ID
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Invalid item type"})
	}

	index, err := strconv.Atoi(indexStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid subtitle index"})
	}

	subs, err := h.queries.ListSubtitlesByMediaFile(ctx, fileID)
	if err != nil || index >= len(subs) {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Subtitle not found"})
	}

	sub := subs[index]
	return c.File(sub.Path)
}
