package api

import (
	"database/sql"
	"errors"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
)

type createLibraryRequest struct {
	Name                string `json:"name"`
	Path                string `json:"path"`
	ScanIntervalMinutes int64  `json:"scan_interval_minutes"`
}

type updateLibraryRequest struct {
	Name                string `json:"name"`
	Path                string `json:"path"`
	Enabled             bool   `json:"enabled"`
	ScanIntervalMinutes int64  `json:"scan_interval_minutes"`
}

func (h *handler) handleListLibraries(c echo.Context) error {
	libs, err := h.queries.ListLibraries(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, libs)
}

func (h *handler) handleGetLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
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
	if _, err := os.Stat(req.Path); os.IsNotExist(err) {
		return echo.NewHTTPError(http.StatusBadRequest, "path does not exist")
	}
	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.CreateLibrary(c.Request().Context(), store.CreateLibraryParams{
		ID:                  uuid.NewString(),
		Name:                req.Name,
		Path:                req.Path,
		Enabled:             1,
		ScanIntervalMinutes: interval,
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
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	interval := req.ScanIntervalMinutes
	if interval == 0 {
		interval = 60
	}
	lib, err := h.queries.UpdateLibrary(c.Request().Context(), store.UpdateLibraryParams{
		ID:                  c.Param("id"),
		Name:                req.Name,
		Path:                req.Path,
		Enabled:             enabled,
		ScanIntervalMinutes: interval,
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
	sc := scanner.New(h.queries)
	if err := sc.ScanLibrary(c.Request().Context(), lib); err != nil {
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
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleListScanSummaries(c echo.Context) error {
	summaries, err := h.queries.ListScanSummaries(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, summaries)
}
