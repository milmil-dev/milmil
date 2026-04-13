package jellyfin

import (
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
