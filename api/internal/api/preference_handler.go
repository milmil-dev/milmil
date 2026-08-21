package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
)

type upsertPreferenceRequest struct {
	Data json.RawMessage `json:"data"`
}

type preferenceResponse struct {
	Data json.RawMessage `json:"data"`
}

type exportPreferencesResponse struct {
	Version     int                  `json:"version"`
	Preferences []exportedPreference `json:"preferences"`
	ExportedAt  string               `json:"exported_at"`
}

type exportedPreference struct {
	Scope     string          `json:"scope"`
	ScopeID   string          `json:"scope_id"`
	Data      json.RawMessage `json:"data"`
	UpdatedAt string          `json:"updated_at"`
}

type importPreferencesRequest struct {
	Version     int                  `json:"version"`
	Preferences []exportedPreference `json:"preferences"`
}

func (h *handler) handleGetGlobalPreferences(c *echo.Context) error {
	userID := getUserID(c)

	pref, err := h.queries.GetUserPreference(c.Request().Context(), store.GetUserPreferenceParams{
		UserID:  userID,
		Scope:   "global",
		ScopeID: "",
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage("{}")})
		}
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage(pref.Data)})
}

func (h *handler) handleUpsertGlobalPreferences(c *echo.Context) error {
	userID := getUserID(c)

	var req upsertPreferenceRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if !json.Valid(req.Data) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON in data field")
	}

	pref, err := h.queries.UpsertUserPreference(c.Request().Context(), store.UpsertUserPreferenceParams{
		ID:      uuid.New().String(),
		UserID:  userID,
		Scope:   "global",
		ScopeID: "",
		Data:    string(req.Data),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage(pref.Data)})
}

func (h *handler) handleGetSeriesPreferences(c *echo.Context) error {
	userID := getUserID(c)
	seriesID := c.Param("seriesId")

	pref, err := h.queries.GetUserPreference(c.Request().Context(), store.GetUserPreferenceParams{
		UserID:  userID,
		Scope:   "series",
		ScopeID: seriesID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage("{}")})
		}
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage(pref.Data)})
}

func (h *handler) handleUpsertSeriesPreferences(c *echo.Context) error {
	userID := getUserID(c)
	seriesID := c.Param("seriesId")

	var req upsertPreferenceRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if !json.Valid(req.Data) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON in data field")
	}

	pref, err := h.queries.UpsertUserPreference(c.Request().Context(), store.UpsertUserPreferenceParams{
		ID:      uuid.New().String(),
		UserID:  userID,
		Scope:   "series",
		ScopeID: seriesID,
		Data:    string(req.Data),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, preferenceResponse{Data: json.RawMessage(pref.Data)})
}

func (h *handler) handleExportPreferences(c *echo.Context) error {
	userID := getUserID(c)

	prefs, err := h.queries.GetAllUserPreferences(c.Request().Context(), userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	exported := make([]exportedPreference, len(prefs))
	for i, p := range prefs {
		exported[i] = exportedPreference{
			Scope:     p.Scope,
			ScopeID:   p.ScopeID,
			Data:      json.RawMessage(p.Data),
			UpdatedAt: p.UpdatedAt,
		}
	}

	return c.JSON(http.StatusOK, exportPreferencesResponse{
		Version:     1,
		Preferences: exported,
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *handler) handleImportPreferences(c *echo.Context) error {
	userID := getUserID(c)

	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	var req importPreferencesRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON")
	}

	if req.Version != 1 {
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported version")
	}

	ctx := c.Request().Context()
	for _, p := range req.Preferences {
		if !json.Valid(p.Data) {
			continue
		}
		_, err := h.queries.UpsertUserPreference(ctx, store.UpsertUserPreferenceParams{
			ID:      uuid.New().String(),
			UserID:  userID,
			Scope:   p.Scope,
			ScopeID: p.ScopeID,
			Data:    string(p.Data),
		})
		if err != nil {
			return echo.ErrInternalServerError
		}
	}

	return c.NoContent(http.StatusNoContent)
}
