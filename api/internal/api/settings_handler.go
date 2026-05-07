package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/store"
)

var settingsKeys = []string{"dandanplay", "player", "appearance", "bangumi_oauth", "bangumi_token", "anilist_oauth", "anilist_token", "tmdb_api_key", "collection"}

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

	if section == "tmdb_api_key" {
		h.setTMDBClientFromSetting(string(body))
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) setTMDBClientFromSetting(value string) {
	auth := tmdb.AuthFromSetting(value)
	var client tmdb.Client
	if auth.AccessToken != "" || auth.APIKey != "" {
		client = tmdb.NewClientWithAuth(&http.Client{Timeout: 10 * time.Second}, auth)
	}
	h.tmdbMu.Lock()
	h.tmdb = client
	h.tmdbMu.Unlock()
	if h.matcher != nil {
		h.matcher.SetTMDBClient(client)
	}
}

func (h *handler) tmdbClient() tmdb.Client {
	h.tmdbMu.RLock()
	defer h.tmdbMu.RUnlock()
	return h.tmdb
}

func (h *handler) handleExportSettings(c echo.Context) error {
	ctx := c.Request().Context()
	result := make(map[string]json.RawMessage, len(settingsKeys))

	for _, key := range settingsKeys {
		setting, err := h.queries.GetSetting(ctx, key)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return echo.ErrInternalServerError
		}
		result[key] = json.RawMessage(setting.Value)
	}

	c.Response().Header().Set("Content-Disposition", `attachment; filename="milmil-settings.json"`)
	return c.JSON(http.StatusOK, result)
}

func (h *handler) handleImportSettings(c echo.Context) error {
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	var imported map[string]json.RawMessage
	if err := json.Unmarshal(body, &imported); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON")
	}

	ctx := c.Request().Context()
	for key, value := range imported {
		if !json.Valid([]byte(value)) {
			continue
		}
		_, err := h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
			Key:   key,
			Value: string(value),
		})
		if err != nil {
			return echo.ErrInternalServerError
		}
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleResetSettings(c echo.Context) error {
	ctx := c.Request().Context()
	for _, key := range settingsKeys {
		if _, upsertErr := h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
			Key:   key,
			Value: "{}",
		}); upsertErr != nil {
			slog.Warn("settings: reset key", "key", key, "err", upsertErr)
		}
	}
	h.setTMDBClientFromSetting("{}")
	return c.NoContent(http.StatusNoContent)
}
