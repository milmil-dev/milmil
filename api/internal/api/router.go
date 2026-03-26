package api

import (
	"database/sql"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/store"
)

type handler struct {
	cfg     *config.Config
	db      *sql.DB
	queries *store.Queries
	cache   cache.Cache
}

// NewRouter creates the Echo instance with all middleware and routes.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	h := &handler{
		cfg:     cfg,
		db:      db,
		queries: store.New(db),
		cache:   cacheClient,
	}

	// System routes
	e.GET("/health", handleHealth)
	e.GET("/docs", handleDocs)
	e.GET("/openapi.json", handleOpenAPISpec)

	v1 := e.Group("/api/v1")

	// Auth — public
	authGroup := v1.Group("/auth")
	authGroup.GET("/status", h.handleAuthStatus)
	authGroup.POST("/setup", h.handleAuthSetup)
	authGroup.POST("/login", h.handleAuthLogin)

	// Auth — protected
	authProtected := v1.Group("/auth", jwtMiddleware(cfg.JWTSecret))
	authProtected.POST("/logout", h.handleAuthLogout)
	authProtected.GET("/me", h.handleAuthMe)

	// Libraries — protected
	libGroup := v1.Group("/libraries", jwtMiddleware(cfg.JWTSecret))
	libGroup.GET("", h.handleListLibraries)
	libGroup.POST("", h.handleCreateLibrary)
	libGroup.GET("/:id", h.handleGetLibrary)
	libGroup.PUT("/:id", h.handleUpdateLibrary)
	libGroup.DELETE("/:id", h.handleDeleteLibrary)
	libGroup.POST("/:id/scan", h.handleScanLibrary)
	libGroup.GET("/:id/scan-summaries", h.handleListScanSummaries)

	return e
}
