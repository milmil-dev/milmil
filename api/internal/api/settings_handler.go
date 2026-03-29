package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

var settingsKeys = []string{"dandanplay", "player", "appearance", "bangumi_oauth", "bangumi_token", "anilist_oauth", "anilist_token", "collection"}

func (h *handler) handleGetSettings(c echo.Context) error {
	ctx := c.Request().Context()
	result := make(map[string]json.RawMessage, len(settingsKeys))

	for _, key := range settingsKeys {
		setting, err := h.queries.GetSetting(ctx, key)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				result[key] = json.RawMessage("{}")
				continue
			}
			return echo.ErrInternalServerError
		}
		result[key] = json.RawMessage(setting.Value)
	}

	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleUpdateSettings(c echo.Context) error {
	section := c.Param("section")

	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	// Validate it's valid JSON
	if !json.Valid(body) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON")
	}

	_, err = h.queries.UpsertSetting(c.Request().Context(), store.UpsertSettingParams{
		Key:   section,
		Value: string(body),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}
