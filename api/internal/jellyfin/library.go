package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v5"
)

type virtualFolder struct {
	Name           string   `json:"Name"`
	Locations      []string `json:"Locations"`
	CollectionType string   `json:"CollectionType"`
	ItemID         string   `json:"ItemId"`
}

func (h *Handler) handleVirtualFolders(c *echo.Context) error {
	libs, err := h.queries.ListLibraries(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	folders := make([]virtualFolder, 0, len(libs))
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		folders = append(folders, virtualFolder{
			Name:           lib.Name,
			Locations:      []string{lib.Path},
			CollectionType: "tvshows",
			ItemID:         EncodeItemID("library", lib.ID),
		})
	}
	return c.JSON(http.StatusOK, folders)
}
