package api

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v5"
)

// setupStatusResponse is what GET /api/v1/setup/status returns. It's a
// public, unauthenticated endpoint consumed by the front-end's first-run
// setup wizard loaders to decide which step to render before login.
type setupStatusResponse struct {
	HasAdmin     bool `json:"has_admin"`
	LibraryCount int  `json:"library_count"`
}

// handleSetupStatus reports whether an admin user exists and how many
// libraries are configured. Both signals come from a count(*) on existing
// tables; no schema changes are needed.
func (h *handler) handleSetupStatus(c *echo.Context) error {
	ctx := c.Request().Context()
	hasAdmin, libCount, err := h.querySetupStatus(ctx)
	if err != nil {
		// Public endpoint: don't leak DB error strings to unauthenticated
		// callers. Mirrors handleAuthStatus.
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, setupStatusResponse{
		HasAdmin:     hasAdmin,
		LibraryCount: libCount,
	})
}

func (h *handler) querySetupStatus(ctx context.Context) (bool, int, error) {
	userCount, err := h.queries.CountUsers(ctx)
	if err != nil {
		return false, 0, err
	}
	libCount, err := h.queries.CountLibraries(ctx)
	if err != nil {
		return false, 0, err
	}
	return userCount > 0, int(libCount), nil
}
