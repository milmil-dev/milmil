package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetSeasons(c echo.Context) error {
	seriesIDEncoded := c.Param("seriesId")
	typ, animeID, err := DecodeItemID(seriesIDEncoded)
	if err != nil || typ != "anime" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Series not found"})
	}

	// Count episodes for ChildCount
	episodes, _ := h.queries.ListEpisodesByAnimeID(c.Request().Context(), animeID)
	epCount := len(episodes)

	season1 := 1
	seasonID := EncodeItemID("season", animeID)
	return c.JSON(http.StatusOK, ItemsResponse{
		Items: []ItemDTO{{
			Name:        "Season 1",
			ServerID:    h.serverID,
			ID:          seasonID,
			Type:        "Season",
			IndexNumber: &season1,
			ParentID:    seriesIDEncoded,
			SeriesID:    seriesIDEncoded,
			SeriesName:  "",
			IsFolder:    true,
			ChildCount:  &epCount,
			LocationType: "FileSystem",
		}},
		TotalRecordCount: 1,
	})
}

func (h *Handler) handleGetEpisodes(c echo.Context) error {
	seriesIDEncoded := c.Param("seriesId")
	typ, animeID, err := DecodeItemID(seriesIDEncoded)
	if err != nil || typ != "anime" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Series not found"})
	}

	ctx := c.Request().Context()

	// Get anime title for SeriesName
	var seriesName string
	if anime, err := h.queries.GetAnime(ctx, animeID); err == nil {
		seriesName = anime.Title
	}

	episodes, err := h.queries.ListEpisodesByAnimeID(ctx, animeID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list episodes"})
	}

	seasonID := EncodeItemID("season", animeID)
	items := make([]ItemDTO, 0, len(episodes))
	for _, ep := range episodes {
		dto := h.episodeToItemDTO(ep)
		dto.SeriesName = seriesName
		dto.SeasonID = seasonID
		dto.MediaSources = h.getMediaSourcesForEpisode(c, ep.ID)
		// Set RunTimeTicks from first MediaSource
		if len(dto.MediaSources) > 0 && dto.MediaSources[0].RunTimeTicks != nil {
			dto.RunTimeTicks = dto.MediaSources[0].RunTimeTicks
		}
		// Add empty UserData so Infuse doesn't error
		epID := EncodeItemID("episode", ep.ID)
		dto.UserData = &UserItemData{Key: epID}
		items = append(items, dto)
	}

	return c.JSON(http.StatusOK, ItemsResponse{
		Items:            items,
		TotalRecordCount: len(items),
	})
}
