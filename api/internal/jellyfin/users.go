package jellyfin

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handleGetUser(c *echo.Context) error {
	userIDEncoded := c.Param("userId")
	_, userID, err := DecodeItemID(userIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "User not found"})
	}

	user, err := h.queries.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "User not found"})
	}

	return c.JSON(http.StatusOK, UserDTO{
		Name:                  user.Username,
		ServerID:              h.serverID,
		ID:                    userIDEncoded,
		HasPassword:           true,
		HasConfiguredPassword: true,
	})
}

func (h *Handler) handleGroupingOptions(c *echo.Context) error {
	return c.JSON(http.StatusOK, []any{})
}

func (h *Handler) handleItemsResume(c *echo.Context) error {
	userID, _ := c.Get("userID").(string)
	ctx := c.Request().Context()

	rows, err := h.queries.ListRecentProgressWithAnime(ctx, userID)
	if err != nil {
		return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
	}

	items := make([]ItemDTO, 0)
	for _, row := range rows {
		// Only include in-progress (not completed, has position)
		if row.Completed != 0 || row.PositionSeconds <= 0 {
			continue
		}

		ep, err := h.queries.GetEpisode(ctx, row.EpisodeID)
		if err != nil {
			continue
		}

		dto := h.episodeToItemDTO(ep)

		// Enrich with anime info
		if anime, err := h.queries.GetAnime(ctx, row.AnimeID); err == nil {
			seriesName := anime.Title
			if anime.TitleZh.Valid && anime.TitleZh.String != "" {
				seriesName = anime.TitleZh.String
			}
			dto.SeriesName = seriesName
		}
		dto.SeriesID = EncodeItemID("anime", row.AnimeID)

		// Media sources
		dto.MediaSources = h.getMediaSourcesForEpisode(c, row.EpisodeID)
		if len(dto.MediaSources) > 0 && dto.MediaSources[0].RunTimeTicks != nil {
			dto.RunTimeTicks = dto.MediaSources[0].RunTimeTicks
		}

		// Watch progress
		positionTicks := row.PositionSeconds * 10_000_000
		dto.UserData = &UserItemData{
			PlaybackPositionTicks: positionTicks,
			Played:                false,
			Key:                   EncodeItemID("episode", row.EpisodeID),
		}

		items = append(items, dto)
	}

	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) handleItemsLatest(c *echo.Context) error {
	ctx := c.Request().Context()
	parentID := c.QueryParam("parentId")

	if parentID != "" {
		typ, id, err := DecodeItemID(parentID)
		if err == nil && typ == "library" {
			animeList, err := h.queries.ListAnimeByLibrary(ctx, sql.NullString{String: id, Valid: true})
			if err == nil {
				limit := 20
				if len(animeList) > limit {
					animeList = animeList[:limit]
				}
				items := make([]ItemDTO, 0, len(animeList))
				for _, a := range animeList {
					items = append(items, h.animeToItemDTO(a))
				}
				return c.JSON(http.StatusOK, items)
			}
		}
	}
	return c.JSON(http.StatusOK, []ItemDTO{})
}

func (h *Handler) handleNextUp(c *echo.Context) error {
	userID, _ := c.Get("userID").(string)
	ctx := c.Request().Context()

	rows, err := h.queries.ListRecentProgressWithAnime(ctx, userID)
	if err != nil {
		return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
	}

	// SQL already returns one row per anime (ROW_NUMBER partitioned by anime), so just iterate.
	// Deduplicate by AnimeID just in case.
	seen := make(map[string]bool)
	items := make([]ItemDTO, 0)

	for _, row := range rows {
		if seen[row.AnimeID] {
			continue
		}
		seen[row.AnimeID] = true

		nextEp, err := h.queries.GetEpisodeByAnimeAndNumber(ctx, store.GetEpisodeByAnimeAndNumberParams{
			AnimeID:       row.AnimeID,
			EpisodeNumber: row.EpisodeNumber + 1,
		})
		if err != nil {
			// No next episode (finished series or last watched)
			continue
		}

		// Skip if user has already completed the next episode
		dto := h.episodeToItemDTO(nextEp)

		// Enrich with anime info
		if anime, err := h.queries.GetAnime(ctx, row.AnimeID); err == nil {
			seriesName := anime.Title
			if anime.TitleZh.Valid && anime.TitleZh.String != "" {
				seriesName = anime.TitleZh.String
			}
			dto.SeriesName = seriesName
		}
		dto.SeriesID = EncodeItemID("anime", row.AnimeID)

		// Media sources
		dto.MediaSources = h.getMediaSourcesForEpisode(c, nextEp.ID)
		if len(dto.MediaSources) > 0 && dto.MediaSources[0].RunTimeTicks != nil {
			dto.RunTimeTicks = dto.MediaSources[0].RunTimeTicks
		}

		dto.UserData = &UserItemData{
			PlaybackPositionTicks: 0,
			Played:                false,
			Key:                   EncodeItemID("episode", nextEp.ID),
		}

		items = append(items, dto)
		if len(items) >= 10 {
			break
		}
	}

	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) handleDisplayPreferences(c *echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"Id":               c.Param("displayPreferencesId"),
		"SortBy":           "SortName",
		"SortOrder":        "Ascending",
		"RememberIndexing": false,
		"RememberSorting":  false,
		"CustomPrefs":      map[string]any{},
		"Client":           c.QueryParam("client"),
	})
}

func (h *Handler) handleGetUserViews(c *echo.Context) error {
	ctx := c.Request().Context()
	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	items := make([]ItemDTO, 0, len(libs))
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		items = append(items, ItemDTO{
			Name:           lib.Name,
			ServerID:       h.serverID,
			ID:             EncodeItemID("library", lib.ID),
			Type:           "CollectionFolder",
			CollectionType: "tvshows",
			IsFolder:       true,
		})
	}

	return c.JSON(http.StatusOK, ViewsResponse{
		Items:            items,
		TotalRecordCount: len(items),
	})
}
