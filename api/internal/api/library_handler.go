package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/storage"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type createLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type updateLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	Enabled             bool                   `json:"enabled"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}

type testConnectionRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

func (h *handler) handleListLibraries(c echo.Context) error {
	libs, err := h.queries.ListLibrariesWithStats(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, libs)
}

func (h *handler) handleGetLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibraryWithStats(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, lib)
}

func (h *handler) handleCreateLibrary(c echo.Context) error {
	var req createLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	var encryptedConfig sql.NullString

	if sourceType == "local" {
		// For local sources, validate the path exists on disk.
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
	} else {
		// For remote sources, encrypt the source config.
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}

	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.CreateLibrary(c.Request().Context(), store.CreateLibraryParams{
		ID:                    uuid.NewString(),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               1,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, lib)
}

func (h *handler) handleUpdateLibrary(c echo.Context) error {
	var req updateLibraryRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.Path == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and path required")
	}

	sourceType := req.SourceType
	if sourceType == "" {
		sourceType = "local"
	}

	var encryptedConfig sql.NullString

	if sourceType == "local" {
		if _, err := os.Stat(req.Path); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
		}
	} else {
		configJSON, err := json.Marshal(req.SourceConfig)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid source_config")
		}
		encrypted, err := crypto.Encrypt(h.encryptionKey, string(configJSON))
		if err != nil {
			return echo.ErrInternalServerError
		}
		encryptedConfig = sql.NullString{String: encrypted, Valid: true}
	}

	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.UpdateLibrary(c.Request().Context(), store.UpdateLibraryParams{
		ID:                    c.Param("id"),
		Name:                  req.Name,
		Path:                  req.Path,
		Enabled:               enabled,
		ScanIntervalMinutes:   interval,
		SourceType:            sourceType,
		SourceConfigEncrypted: encryptedConfig,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, lib)
}

func (h *handler) handleDeleteLibrary(c echo.Context) error {
	if err := h.queries.DeleteLibrary(c.Request().Context(), c.Param("id")); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleScanLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	// Decrypt source config for network storage providers; local libraries use empty config.
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return echo.ErrInternalServerError
		}
		configJSON = decrypted
	}
	sc := scanner.New(h.queries)
	if err := sc.ScanLibrary(c.Request().Context(), lib, configJSON); err != nil {
		return echo.ErrInternalServerError
	}
	// Auto-match after scan (non-fatal if matcher is nil or fails)
	if h.matcher != nil {
		_, _ = h.matcher.MatchLibrary(c.Request().Context(), lib.ID)
	}
	// Resolve anime metadata after matching (non-fatal if resolver is nil or fails)
	if h.resolver != nil {
		_, _ = h.resolver.ResolveLibrary(c.Request().Context(), lib.ID)
	}
	if h.wsHub != nil {
		h.wsHub.Broadcast(ws.Event{Type: "scan:completed", Data: map[string]any{"library_id": lib.ID, "library_name": lib.Name}})
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleListScanSummaries(c echo.Context) error {
	summaries, err := h.queries.ListScanSummaries(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, summaries)
}

func (h *handler) handleTestConnection(c echo.Context) error {
	var req testConnectionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	configJSON, _ := json.Marshal(req.SourceConfig)
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
	}
	defer provider.Close()

	if req.Path != "" {
		if _, statErr := provider.Stat(req.Path); statErr != nil {
			return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": statErr.Error()})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}
