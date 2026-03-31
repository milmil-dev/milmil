package api

import (
	"database/sql"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/integration/aria2"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type handler struct {
	cfg           *config.Config
	db            *sql.DB
	queries       *store.Queries
	cache         cache.Cache
	metadata      *metadata.Service
	matcher       *matcher.Matcher
	dandanplay    dandanplay.Client
	resolver      *resolver.Resolver
	aria2         aria2.Client
	wsHub         *ws.Hub
	tmdb          tmdb.Client
	encryptionKey []byte
}

// NewRouter creates the Echo instance with all middleware and routes.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver, aria2Client aria2.Client, wsHub *ws.Hub, tmdbClient tmdb.Client) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	h := &handler{
		cfg:           cfg,
		db:            db,
		queries:       store.New(db),
		cache:         cacheClient,
		metadata:      metadataSvc,
		matcher:       matcherSvc,
		dandanplay:    ddpClient,
		resolver:      resolverSvc,
		aria2:         aria2Client,
		wsHub:         wsHub,
		tmdb:          tmdbClient,
		encryptionKey: cfg.EncryptionKey,
	}

	// WebSocket (no auth — WS auth is complex, keep it simple)
	e.GET("/ws", h.handleWebSocket)

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
	authGroup.POST("/login/2fa", h.handleAuthLogin2FA)

	// Auth — protected
	authProtected := v1.Group("/auth", jwtMiddleware(cfg.JWTSecret))
	authProtected.POST("/logout", h.handleAuthLogout)
	authProtected.GET("/me", h.handleAuthMe)
	authProtected.PUT("/password", h.handleChangePassword)
	authProtected.POST("/2fa/setup", h.handleTwoFactorSetup)
	authProtected.POST("/2fa/verify", h.handleTwoFactorVerify)
	authProtected.DELETE("/2fa", h.handleTwoFactorDisable)
	authProtected.GET("/2fa/status", h.handleTwoFactorStatus)

	// Libraries — protected
	libGroup := v1.Group("/libraries", jwtMiddleware(cfg.JWTSecret))
	libGroup.GET("", h.handleListLibraries)
	libGroup.POST("", h.handleCreateLibrary)
	libGroup.GET("/discover-network", h.handleDiscoverNetwork)
	libGroup.GET("/:id", h.handleGetLibrary)
	libGroup.PUT("/:id", h.handleUpdateLibrary)
	libGroup.DELETE("/:id", h.handleDeleteLibrary)
	libGroup.POST("/:id/scan", h.handleScanLibrary)
	libGroup.POST("/:id/match", h.handleMatchLibrary)
	libGroup.GET("/:id/scan-summaries", h.handleListScanSummaries)
	libGroup.GET("/:id/media-files", h.handleListMediaFiles)
	libGroup.GET("/:id/connection-status", h.handleGetLibraryConnectionStatus)
	libGroup.POST("/test-connection", h.handleTestConnection)
	libGroup.POST("/browse", h.handleBrowse)

	// Rclone remotes — public (used during library setup to pick OAuth remotes)
	v1.GET("/rclone/remotes", h.handleListRcloneRemotes)

	// Media files — protected
	mediaGroup := v1.Group("/media-files", jwtMiddleware(cfg.JWTSecret))
	mediaGroup.PUT("/:id/match", h.handleMatchMediaFile)
	mediaGroup.DELETE("/:id/match", h.handleUnmatchMediaFile)
	mediaGroup.GET("/:id/info", h.handleMediaInfo)

	// Discover — public
	discoverGroup := v1.Group("/discover")
	discoverGroup.GET("/calendar", h.handleCalendar)
	discoverGroup.GET("/trending", h.handleTrending)
	discoverGroup.GET("/search", h.handleSearch)
	discoverGroup.GET("/browse", h.handleBrowseByGenre)
	discoverGroup.GET("/browse/tag", h.handleBrowseByTag)
	discoverGroup.GET("/tags/popular", h.handleHotTags)
	discoverGroup.GET("/resolve", h.handleResolveAniList)
	discoverGroup.GET("/anime/:id", h.handleAnimeDetail)
	discoverGroup.GET("/anime/:id/episodes", h.handleAnimeEpisodes)
	discoverGroup.GET("/anime/:id/comments", h.handleAnimeComments)

	// Danmaku — protected
	danmakuGroup := v1.Group("/danmaku", jwtMiddleware(cfg.JWTSecret))
	danmakuGroup.GET("/:mediaFileId", h.handleGetDanmaku)
	danmakuGroup.POST("/:mediaFileId", h.handlePostDanmaku)

	// Stream — protected (with query param token fallback for <video src>)
	streamGroup := v1.Group("/stream", jwtMiddlewareWithQueryParam(cfg.JWTSecret))
	streamGroup.GET("/:fileId/direct", h.handleStreamDirect)
	streamGroup.GET("/:fileId/remux", h.handleStreamRemux)
	streamGroup.POST("/:fileId/transcode", h.handleStartTranscode)

	// HLS segments — no auth (token in URL is the auth)
	e.GET("/api/v1/stream/hls/:token/master.m3u8", h.handleHLSMaster)
	e.GET("/api/v1/stream/hls/:token/:segment", h.handleHLSSegment)

	// Settings — protected
	settingsGroup := v1.Group("/settings", jwtMiddleware(cfg.JWTSecret))
	settingsGroup.GET("", h.handleGetSettings)
	settingsGroup.GET("/export", h.handleExportSettings)
	settingsGroup.POST("/import", h.handleImportSettings)
	settingsGroup.POST("/reset", h.handleResetSettings)
	settingsGroup.PUT("/:section", h.handleUpdateSettings)

	// Collection — protected
	collectionGroup := v1.Group("/collection", jwtMiddleware(cfg.JWTSecret))
	collectionGroup.GET("", h.handleListCollection)
	collectionGroup.GET("/recent", h.handleListRecentCollection)
	collectionGroup.GET("/status-counts", h.handleCollectionStatusCounts)
	collectionGroup.PATCH("/:bangumiId/status", h.handleUpdateWatchStatus)

	// Anime — protected
	animeGroup := v1.Group("/anime", jwtMiddleware(cfg.JWTSecret))
	animeGroup.GET("/:bangumiId/playable-episodes", h.handlePlayableEpisodes)
	animeGroup.PATCH("/:bangumiId/score", h.handleUpdateScore)

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

	// Torrent Search — protected
	searchGroup := v1.Group("/torrent-search", jwtMiddleware(cfg.JWTSecret))
	searchGroup.GET("", h.handleTorrentSearch)
	searchGroup.POST("/add", h.handleTorrentSearchAdd)

	// Subtitles — protected (with query param token fallback for <track src>)
	subGroup := v1.Group("/subtitles", jwtMiddlewareWithQueryParam(cfg.JWTSecret))
	subGroup.GET("/media/:fileId", h.handleListSubtitles)
	subGroup.GET("/:id/content", h.handleSubtitleContent)

	// Download Rules — protected
	ruleGroup := v1.Group("/download-rules", jwtMiddleware(cfg.JWTSecret))
	ruleGroup.GET("", h.handleListDownloadRules)
	ruleGroup.POST("", h.handleCreateDownloadRule)
	ruleGroup.PUT("/:id", h.handleUpdateDownloadRule)
	ruleGroup.DELETE("/:id", h.handleDeleteDownloadRule)

	// Integrations — protected
	intGroup := v1.Group("/integrations", jwtMiddleware(cfg.JWTSecret))
	// Bangumi
	intGroup.GET("/bangumi/auth-url", h.handleBangumiAuthURL)
	intGroup.GET("/bangumi/callback", h.handleBangumiCallback)
	intGroup.DELETE("/bangumi", h.handleBangumiDisconnect)
	intGroup.POST("/bangumi/sync", h.handleBangumiSync)
	// AniList
	intGroup.GET("/anilist/auth-url", h.handleAniListAuthURL)
	intGroup.GET("/anilist/callback", h.handleAniListCallback)
	intGroup.DELETE("/anilist", h.handleAniListDisconnect)
	intGroup.POST("/anilist/sync", h.handleAniListSync)

	// System — protected
	systemGroup := v1.Group("/system", jwtMiddleware(cfg.JWTSecret))
	systemGroup.GET("/info", h.handleSystemInfo)
	systemGroup.GET("/storage", h.handleStorageStats)
	systemGroup.DELETE("/transcode-cache", h.handleClearTranscodeCache)

	return e
}
