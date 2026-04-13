package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetImage(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var imageURL string

	switch typ {
	case "anime":
		anime, err := h.queries.GetAnime(ctx, id)
		if err != nil || !anime.CoverImageUrl.Valid {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
		}
		imageURL = anime.CoverImageUrl.String
	case "episode":
		ep, err := h.queries.GetEpisode(ctx, id)
		if err != nil || !ep.ThumbnailUrl.Valid {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
		}
		imageURL = ep.ThumbnailUrl.String
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}

	if imageURL == "" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}

	// Check cache
	if cachedPath, ok := h.imageCache.Get(imageURL); ok {
		return c.File(cachedPath)
	}

	// Fetch and cache
	cachedPath, err := h.imageCache.Fetch(imageURL)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Failed to fetch image"})
	}

	return c.File(cachedPath)
}
