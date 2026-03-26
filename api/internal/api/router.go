package api

import (
	"database/sql"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/integration/aria2"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/store"
)

type handler struct {
	cfg        *config.Config
	db         *sql.DB
	queries    *store.Queries
	cache      cache.Cache
	metadata   *metadata.Service
	matcher    *matcher.Matcher
	dandanplay dandanplay.Client
	resolver   *resolver.Resolver
	aria2      aria2.Client
}

// NewRouter creates the Echo instance with all middleware and routes.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver, aria2Client aria2.Client) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	h := &handler{
		cfg:        cfg,
		db:         db,
		queries:    store.New(db),
		cache:      cacheClient,
		metadata:   metadataSvc,
		matcher:    matcherSvc,
		dandanplay: ddpClient,
		resolver:   resolverSvc,
		aria2:      aria2Client,
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

	// Discover — public
	discoverGroup := v1.Group("/discover")
	discoverGroup.GET("/calendar", h.handleCalendar)
	discoverGroup.GET("/trending", h.handleTrending)
	discoverGroup.GET("/search", h.handleSearch)
	discoverGroup.GET("/anime/:id", h.handleAnimeDetail)
	discoverGroup.GET("/anime/:id/episodes", h.handleAnimeEpisodes)

	// Danmaku — protected
	danmakuGroup := v1.Group("/danmaku", jwtMiddleware(cfg.JWTSecret))
	danmakuGroup.GET("/:mediaFileId", h.handleGetDanmaku)
	danmakuGroup.POST("/:mediaFileId", h.handlePostDanmaku)

	// Stream — protected (with query param token fallback for <video src>)
	streamGroup := v1.Group("/stream", jwtMiddlewareWithQueryParam(cfg.JWTSecret))
	streamGroup.GET("/:fileId/direct", h.handleStreamDirect)

	// Settings — protected
	settingsGroup := v1.Group("/settings", jwtMiddleware(cfg.JWTSecret))
	settingsGroup.GET("", h.handleGetSettings)
	settingsGroup.PUT("/:section", h.handleUpdateSettings)

	// Downloads — protected
	dlGroup := v1.Group("/downloads", jwtMiddleware(cfg.JWTSecret))
	dlGroup.GET("", h.handleListDownloads)
	dlGroup.POST("", h.handleAddDownload)
	dlGroup.POST("/:gid/pause", h.handlePauseDownload)
	dlGroup.POST("/:gid/resume", h.handleResumeDownload)
	dlGroup.DELETE("/:gid", h.handleDeleteDownload)

	// RSS Feeds — protected
	rssGroup := v1.Group("/rss-feeds", jwtMiddleware(cfg.JWTSecret))
	rssGroup.GET("", h.handleListRSSFeeds)
	rssGroup.POST("", h.handleCreateRSSFeed)
	rssGroup.PUT("/:id", h.handleUpdateRSSFeed)
	rssGroup.DELETE("/:id", h.handleDeleteRSSFeed)
	rssGroup.POST("/:id/refresh", h.handleRefreshRSSFeed)

	// Watch Progress — protected
	progressGroup := v1.Group("/progress", jwtMiddleware(cfg.JWTSecret))
	progressGroup.POST("", h.handleSaveProgress)
	progressGroup.GET("/recent", h.handleListRecentProgress)
	progressGroup.GET("/file/:fileId", h.handleGetProgressByFile)

	// Download Rules — protected
	ruleGroup := v1.Group("/download-rules", jwtMiddleware(cfg.JWTSecret))
	ruleGroup.GET("", h.handleListDownloadRules)
	ruleGroup.POST("", h.handleCreateDownloadRule)
	ruleGroup.PUT("/:id", h.handleUpdateDownloadRule)
	ruleGroup.DELETE("/:id", h.handleDeleteDownloadRule)

	return e
}
