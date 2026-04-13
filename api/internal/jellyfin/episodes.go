package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetEpisodes(c echo.Context) error {
	seriesIDEncoded := c.Param("seriesId")
	typ, animeID, err := DecodeItemID(seriesIDEncoded)
	if err != nil || typ != "anime" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Series not found"})
	}

	episodes, err := h.queries.ListEpisodesByAnimeID(c.Request().Context(), animeID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list episodes"})
	}

	items := make([]ItemDTO, 0, len(episodes))
	for _, ep := range episodes {
		dto := h.episodeToItemDTO(ep)
		items = append(items, dto)
	}

	return c.JSON(http.StatusOK, ItemsResponse{
		Items:            items,
		TotalRecordCount: len(items),
	})
}
