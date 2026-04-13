package jellyfin

import (
	"database/sql"
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetUser(c echo.Context) error {
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

func (h *Handler) handleGroupingOptions(c echo.Context) error {
	return c.JSON(http.StatusOK, []any{})
}

func (h *Handler) handleItemsResume(c echo.Context) error {
	return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
}

func (h *Handler) handleItemsLatest(c echo.Context) error {
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

func (h *Handler) handleNextUp(c echo.Context) error {
	return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
}

func (h *Handler) handleDisplayPreferences(c echo.Context) error {
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

func (h *Handler) handleGetUserViews(c echo.Context) error {
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
