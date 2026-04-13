package jellyfin

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handleGetItems(c echo.Context) error {
	ctx := c.Request().Context()
	parentID := c.QueryParam("ParentId")

	if parentID != "" {
		typ, id, err := DecodeItemID(parentID)
		if err != nil {
			return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
		}
		if typ == "library" {
			return h.listAnimeByLibrary(c, id)
		}
	}

	searchTerm := c.QueryParam("SearchTerm")
	if searchTerm != "" {
		return h.searchItems(c, searchTerm)
	}

	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	var items []ItemDTO
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		animeList, err := h.queries.ListAnimeByLibrary(ctx, sql.NullString{String: lib.ID, Valid: true})
		if err != nil {
			continue
		}
		for _, a := range animeList {
			items = append(items, h.animeToItemDTO(a))
		}
	}

	startIndex, _ := strconv.Atoi(c.QueryParam("StartIndex"))
	limit, _ := strconv.Atoi(c.QueryParam("Limit"))
	total := len(items)
	if startIndex > 0 && startIndex < len(items) {
		items = items[startIndex:]
	}
	if limit > 0 && limit < len(items) {
		items = items[:limit]
	}

	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: total})
}

func (h *Handler) listAnimeByLibrary(c echo.Context, libraryID string) error {
	animeList, err := h.queries.ListAnimeByLibrary(c.Request().Context(), sql.NullString{String: libraryID, Valid: true})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list anime"})
	}
	items := make([]ItemDTO, 0, len(animeList))
	for _, a := range animeList {
		items = append(items, h.animeToItemDTO(a))
	}
	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) searchItems(c echo.Context, term string) error {
	ctx := c.Request().Context()
	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
	}
	termLower := strings.ToLower(term)
	var items []ItemDTO
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		animeList, _ := h.queries.ListAnimeByLibrary(ctx, sql.NullString{String: lib.ID, Valid: true})
		for _, a := range animeList {
			if strings.Contains(strings.ToLower(a.Title), termLower) ||
				(a.TitleEn.Valid && strings.Contains(strings.ToLower(a.TitleEn.String), termLower)) ||
				(a.TitleZh.Valid && strings.Contains(strings.ToLower(a.TitleZh.String), termLower)) {
				items = append(items, h.animeToItemDTO(a))
			}
		}
	}
	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) handleGetItem(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	switch typ {
	case "anime":
		anime, err := h.queries.GetAnime(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		return c.JSON(http.StatusOK, h.animeToItemDTO(anime))
	case "episode":
		ep, err := h.queries.GetEpisode(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		return c.JSON(http.StatusOK, h.episodeToItemDTO(ep))
	case "library":
		lib, err := h.queries.GetLibrary(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		return c.JSON(http.StatusOK, ItemDTO{
			Name: lib.Name, ServerID: h.serverID, ID: itemIDEncoded,
			Type: "CollectionFolder", CollectionType: "tvshows", IsFolder: true,
		})
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}
}

func (h *Handler) animeToItemDTO(a store.Anime) ItemDTO {
	dto := ItemDTO{
		Name:     a.Title,
		ServerID: h.serverID,
		ID:       EncodeItemID("anime", a.ID),
		Type:     "Series",
		IsFolder: true,
	}
	if a.Synopsis.Valid {
		dto.Overview = a.Synopsis.String
	}
	if a.CoverImageUrl.Valid && a.CoverImageUrl.String != "" {
		dto.ImageTags = map[string]string{"Primary": "default"}
	}
	if a.Year.Valid {
		year := int(a.Year.Int64)
		dto.ProductionYear = &year
	}
	if a.Score > 0 {
		score := a.Score
		dto.CommunityRating = &score
	}
	if a.Genres != "" {
		var genres []string
		json.Unmarshal([]byte(a.Genres), &genres)
		dto.Genres = genres
	}
	if a.TotalEpisodes.Valid {
		count := int(a.TotalEpisodes.Int64)
		dto.ChildCount = &count
	}
	if a.LibraryID.Valid {
		dto.ParentID = EncodeItemID("library", a.LibraryID.String)
	}
	return dto
}

func (h *Handler) episodeToItemDTO(ep store.Episode) ItemDTO {
	epNum := int(ep.EpisodeNumber)
	season := 1
	dto := ItemDTO{
		Name:              "",
		ServerID:          h.serverID,
		ID:                EncodeItemID("episode", ep.ID),
		Type:              "Episode",
		IndexNumber:       &epNum,
		ParentID:          EncodeItemID("anime", ep.AnimeID),
		MediaType:         "Video",
		ParentIndexNumber: &season,
	}
	if ep.TitleZh.Valid && ep.TitleZh.String != "" {
		dto.Name = ep.TitleZh.String
	} else if ep.Title.Valid {
		dto.Name = ep.Title.String
	}
	if ep.ThumbnailUrl.Valid && ep.ThumbnailUrl.String != "" {
		dto.ImageTags = map[string]string{"Primary": "default"}
	}
	if ep.AirDate.Valid {
		dto.PremiereDate = ep.AirDate.String
	}
	return dto
}
