package api

import (
	"database/sql"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
)

// NewRouter creates the Echo instance with all middleware and routes.
// db and cacheClient may be nil in tests that don't need them.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	e.GET("/health", handleHealth)

	// v1 API group — handlers registered in Plans 2–8
	// v1 := e.Group("/api/v1")

	return e
}
