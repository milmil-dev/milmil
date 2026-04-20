package api

import (
	"database/sql"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/danmaku"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/jellyfin"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
	"github.com/milmil/api/internal/torrent"
	"github.com/milmil/api/internal/ws"
)

type handler struct {
	cfg             *config.Config
	db              *sql.DB
	queries         *store.Queries
	cache           cache.Cache
	metadata        *metadata.Service
	matcher         *matcher.Matcher
	dandanplay      dandanplay.Client
	resolver        *resolver.Resolver
	downloader      downloader.Manager
	wsHub           *ws.Hub
	tmdb            tmdb.Client
	torrentRegistry  *torrent.Registry
	notifier         *notification.Service
	syncSvc          *milmilsync.Service
	danmakuRegistry  *danmaku.Registry
	encryptionKey    []byte
}

// NewRouter creates the Echo instance with all middleware and routes.
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver, dlManager downloader.Manager, wsHub *ws.Hub, tmdbClient tmdb.Client, torrentReg *torrent.Registry, notifier *notification.Service, syncSvc *milmilsync.Service, danmakuReg *danmaku.Registry) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	attachMiddleware(e)

	h := &handler{
		cfg:             cfg,
		db:              db,
		queries:         store.New(db),
		cache:           cacheClient,
		metadata:        metadataSvc,
		matcher:         matcherSvc,
		dandanplay:      ddpClient,
		resolver:        resolverSvc,
		downloader:      dlManager,
		wsHub:           wsHub,
		tmdb:            tmdbClient,
		torrentRegistry: torrentReg,
		notifier:        notifier,
		syncSvc:         syncSvc,
		danmakuRegistry: danmakuReg,
		encryptionKey:   cfg.EncryptionKey,
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
	authProtected := v1.Group("/auth", authMiddleware(h.queries))
	authProtected.POST("/logout", h.handleAuthLogout)
	authProtected.GET("/me", h.handleAuthMe)
	authProtected.PUT("/password", h.handleChangePassword)
	authProtected.POST("/2fa/setup", h.handleTwoFactorSetup)
	authProtected.POST("/2fa/verify", h.handleTwoFactorVerify)
	authProtected.DELETE("/2fa", h.handleTwoFactorDisable)
	authProtected.GET("/2fa/status", h.handleTwoFactorStatus)

	// API Tokens — protected
	tokenGroup := v1.Group("/api-tokens", authMiddleware(h.queries))
	tokenGroup.GET("", h.handleListAPITokens)
	tokenGroup.POST("", h.handleCreateAPIToken)
	tokenGroup.GET("/current", h.handleGetCurrentToken)
	tokenGroup.DELETE("/others", h.handleDeleteOtherTokens)
	tokenGroup.DELETE("/:id", h.handleDeleteAPIToken)

	// Libraries — protected
	libGroup := v1.Group("/libraries", authMiddleware(h.queries))
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
	libGroup.GET("/:id/anime", h.handleListLibraryAnime)
	libGroup.DELETE("/:id/anime/:animeId", h.handleDeleteAnime)
	libGroup.GET("/:id/file-tree", h.handleFileTree)
	libGroup.GET("/:id/connection-status", h.handleGetLibraryConnectionStatus)
	libGroup.GET("/:id/capacity", h.handleGetLibraryCapacity)
	libGroup.POST("/test-connection", h.handleTestConnection)
	libGroup.POST("/browse", h.handleBrowse)
	libGroup.GET("/:id/missing-summary", h.handleLibraryMissingSummary)
	libGroup.GET("/:id/duplicates", h.handleLibraryDuplicates)
	libGroup.POST("/:id/duplicates/cleanup", h.handleLibraryDuplicateCleanup)
	libGroup.PATCH("/:id/rename-config", h.handleRenameConfig)
	libGroup.GET("/:id/rename/preview", h.handleRenamePreview)
	libGroup.POST("/:id/rename/apply", h.handleRenameApply)
	libGroup.POST("/:id/rename/undo", h.handleRenameUndo)
	libGroup.GET("/:id/rename/history", h.handleRenameHistory)

	// Rclone remotes — public (used during library setup to pick OAuth remotes)
	v1.GET("/rclone/remotes", h.handleListRcloneRemotes)

	// Media files — protected
	mediaGroup := v1.Group("/media-files", authMiddleware(h.queries))
	mediaGroup.POST("/bulk-match", h.handleBulkMatchMediaFiles)
	mediaGroup.POST("/bulk-unmatch", h.handleBulkUnmatchMediaFiles)
	mediaGroup.PUT("/:id/match", h.handleMatchMediaFile)
	mediaGroup.DELETE("/:id/match", h.handleUnmatchMediaFile)
	mediaGroup.GET("/:id/info", h.handleMediaInfo)
	mediaGroup.DELETE("/:id", h.handleDeleteMediaFile)

	// Episodes — protected
	episodesGroup := v1.Group("/episodes", authMiddleware(h.queries))
	episodesGroup.PATCH("/:id/preferred", h.handleSetEpisodePreferred)

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
	discoverGroup.GET("/anime/:id/torrents", h.handleAnimeTorrents, authMiddleware(h.queries))
	discoverGroup.GET("/anime/:id/franchise", h.handleAnimeFranchise)

	// External danmaku sources — protected
	danmakuExtGroup := v1.Group("/danmaku/external", authMiddleware(h.queries))
	danmakuExtGroup.GET("/sources", h.handleListDanmakuSources)
	danmakuExtGroup.GET("/search", h.handleSearchExternalDanmaku)
	danmakuExtGroup.GET("/parts", h.handleGetVideoParts)
	danmakuExtGroup.POST("/import", h.handleImportExternalDanmaku)
	danmakuExtGroup.GET("/imported/:mediaFileId", h.handleGetImportedDanmaku)
	danmakuExtGroup.DELETE("/imported/:mediaFileId", h.handleRemoveImportedDanmaku)

	// Danmaku — protected
	danmakuGroup := v1.Group("/danmaku", authMiddleware(h.queries))
	danmakuGroup.GET("/:mediaFileId", h.handleGetDanmaku)
	danmakuGroup.POST("/:mediaFileId", h.handlePostDanmaku)

	// Stream — protected (with query param token fallback for <video src>)
	streamGroup := v1.Group("/stream", authMiddlewareWithQueryParam(h.queries))
	streamGroup.GET("/:fileId/direct", h.handleStreamDirect)
	streamGroup.GET("/:fileId/remux", h.handleStreamRemux)
	streamGroup.POST("/:fileId/transcode", h.handleStartTranscode)
	streamGroup.GET("/:fileId/thumbnails", h.handleThumbnailVTT)

	// Sprite sheet served without auth — the image itself is non-sensitive,
	// and the VTT referencing it already requires authentication.
	e.GET("/api/v1/stream/:fileId/sprite.jpg", h.handleThumbnailSprite)

	// HLS segments — no auth (token in URL is the auth)
	e.GET("/api/v1/stream/hls/:token/master.m3u8", h.handleHLSMaster)
	e.GET("/api/v1/stream/hls/:token/:segment", h.handleHLSSegment)

	// Settings — protected
	settingsGroup := v1.Group("/settings", authMiddleware(h.queries))
	settingsGroup.GET("", h.handleGetSettings)
	settingsGroup.GET("/export", h.handleExportSettings)
	settingsGroup.POST("/import", h.handleImportSettings)
	settingsGroup.POST("/reset", h.handleResetSettings)
	settingsGroup.PUT("/:section", h.handleUpdateSettings)

	// Collection — protected
	collectionGroup := v1.Group("/collection", authMiddleware(h.queries))
	collectionGroup.GET("", h.handleListCollection)
	collectionGroup.GET("/recent", h.handleListRecentCollection)
	collectionGroup.GET("/status-counts", h.handleCollectionStatusCounts)
	collectionGroup.PATCH("/:bangumiId/status", h.handleUpdateWatchStatus)

	// Anime — protected
	animeGroup := v1.Group("/anime", authMiddleware(h.queries))
	animeGroup.GET("/:bangumiId/playable-episodes", h.handlePlayableEpisodes)
	animeGroup.GET("/:bangumiId/missing", h.handleAnimeMissing)
	animeGroup.PATCH("/:bangumiId/score", h.handleUpdateScore)
	animeGroup.PATCH("/:bangumiId/sync-flags", h.handleUpdateAnimeSyncFlags)
	animeGroup.GET("/:bangumiId/duplicates", h.handleAnimeDuplicates)
	animeGroup.POST("/:bangumiId/missing/search", h.handleMissingSearch)
	animeGroup.POST("/:bangumiId/missing/download", h.handleMissingDownload)
	animeGroup.POST("/:bangumiId/missing/auto-rule", h.handleMissingAutoRule)

	// Sync (tracker watch-state) — protected
	syncGroup := v1.Group("/sync", authMiddleware(h.queries))
	syncGroup.GET("/status", h.handleSyncProvidersStatus)
	syncGroup.POST("/:provider/pull", h.handleSyncPullNow)
	syncGroup.POST("/:provider/pull-enabled", h.handleSyncSetPullEnabled)

	// Downloads — protected
	dlGroup := v1.Group("/downloads", authMiddleware(h.queries))
	dlGroup.GET("", h.handleListDownloads)
	dlGroup.GET("/grouped", h.handleDownloadsGrouped)
	dlGroup.GET("/:gid/files", h.handleDownloadFiles)
	dlGroup.POST("", h.handleAddDownload)
	dlGroup.POST("/:gid/pause", h.handlePauseDownload)
	dlGroup.POST("/:gid/resume", h.handleResumeDownload)
	dlGroup.DELETE("/:gid", h.handleDeleteDownload)
	dlGroup.DELETE("", h.handleBatchDeleteDownloads)

	// RSS Feeds — protected
	rssGroup := v1.Group("/rss-feeds", authMiddleware(h.queries))
	rssGroup.GET("", h.handleListRSSFeeds)
	rssGroup.POST("", h.handleCreateRSSFeed)
	rssGroup.POST("/preview-url", h.handlePreviewRSSFeedURL)
	rssGroup.PUT("/:id", h.handleUpdateRSSFeed)
	rssGroup.DELETE("/:id", h.handleDeleteRSSFeed)
	rssGroup.GET("/:id/preview", h.handlePreviewRSSFeed)
	rssGroup.POST("/:id/refresh", h.handleRefreshRSSFeed)

	// User Preferences — protected
	prefsGroup := v1.Group("/user/preferences", authMiddleware(h.queries))
	prefsGroup.GET("", h.handleGetGlobalPreferences)
	prefsGroup.PUT("", h.handleUpsertGlobalPreferences)
	prefsGroup.GET("/series/:seriesId", h.handleGetSeriesPreferences)
	prefsGroup.PUT("/series/:seriesId", h.handleUpsertSeriesPreferences)
	prefsGroup.POST("/export", h.handleExportPreferences)
	prefsGroup.POST("/import", h.handleImportPreferences)
	prefsGroup.PUT("/backup-config", h.handleUpsertBackupConfig)
	prefsGroup.GET("/backup-config", h.handleListBackupConfigs)
	prefsGroup.DELETE("/backup-config/:type", h.handleDeleteBackupConfig)
	prefsGroup.POST("/backup-config/test", h.handleTestBackupConnection)
	prefsGroup.POST("/sync", h.handleTriggerSync)
	prefsGroup.GET("/sync/status", h.handleSyncStatus)

	// Segment Marks — protected
	v1.POST("/media/:fileId/segments", h.handleCreateSegmentMark, authMiddleware(h.queries))
	v1.GET("/media/:fileId/segments", h.handleListSegmentMarks, authMiddleware(h.queries))
	v1.DELETE("/media/:fileId/segments/:segmentId", h.handleDeleteSegmentMark, authMiddleware(h.queries))

	// Watch Progress — protected
	progressGroup := v1.Group("/progress", authMiddleware(h.queries))
	progressGroup.POST("", h.handleSaveProgress)
	progressGroup.GET("/recent", h.handleListRecentProgress)
	progressGroup.GET("/file/:fileId", h.handleGetProgressByFile)

	// Torrent Search — protected
	searchGroup := v1.Group("/torrent-search", authMiddleware(h.queries))
	searchGroup.GET("", h.handleTorrentSearch)
	searchGroup.GET("/providers", h.handleTorrentProviders)
	searchGroup.POST("/add", h.handleTorrentSearchAdd)

	// Auto-download subscription — protected
	v1.POST("/subscribe", h.handleSubscribe, authMiddleware(h.queries))

	// Subtitles — protected (with query param token fallback for <track src>)
	subGroup := v1.Group("/subtitles", authMiddlewareWithQueryParam(h.queries))
	subGroup.GET("/media/:fileId", h.handleListSubtitles)
	subGroup.GET("/:id/content", h.handleSubtitleContent)

	// Download Rules — protected
	ruleGroup := v1.Group("/download-rules", authMiddleware(h.queries))
	ruleGroup.GET("", h.handleListDownloadRules)
	ruleGroup.POST("", h.handleCreateDownloadRule)
	ruleGroup.PUT("/:id", h.handleUpdateDownloadRule)
	ruleGroup.DELETE("/:id", h.handleDeleteDownloadRule)

	// Integrations — protected
	intGroup := v1.Group("/integrations", authMiddleware(h.queries))
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
	// Trakt (device-code OAuth)
	intGroup.POST("/trakt/device-code", h.handleTraktDeviceCode)
	intGroup.POST("/trakt/poll", h.handleTraktPoll)
	intGroup.DELETE("/trakt", h.handleTraktDisconnect)

	// Notifications — protected
	notifGroup := v1.Group("/notifications", authMiddleware(h.queries))
	notifGroup.GET("", h.handleListNotifications)
	notifGroup.GET("/unread-count", h.handleUnreadCount)
	notifGroup.PATCH("/:id/read", h.handleMarkNotificationRead)
	notifGroup.POST("/mark-all-read", h.handleMarkAllRead)
	notifGroup.DELETE("", h.handleClearNotifications)

	// Notification Settings — protected
	notifSettingsGroup := v1.Group("/settings/notifications", authMiddleware(h.queries))
	notifSettingsGroup.GET("", h.handleGetNotificationSettings)
	notifSettingsGroup.PUT("", h.handleUpdateNotificationSettings)
	notifSettingsGroup.POST("/test", h.handleTestNotification)
	notifSettingsGroup.GET("/status", h.handleNotificationProviderStatus)

	// System — protected
	systemGroup := v1.Group("/system", authMiddleware(h.queries))
	systemGroup.GET("/info", h.handleSystemInfo)
	systemGroup.GET("/storage", h.handleStorageStats)
	systemGroup.DELETE("/transcode-cache", h.handleClearTranscodeCache)
	systemGroup.GET("/downloader-status", h.handleDownloaderStatus)

	// Jellyfin-compatible API for external players (Infuse, VLC, Kodi)
	jellyfinCacheDir := filepath.Join(os.TempDir(), "milmil", "jellyfin-images")
	jellyfinHandler, err := jellyfin.NewHandler(store.New(db), cfg.JWTSecret, jellyfinCacheDir, cfg.EncryptionKey)
	if err != nil {
		slog.Warn("jellyfin: failed to initialize", "err", err)
	} else {
		jellyfinHandler.RegisterRoutes(e)
		slog.Info("Jellyfin API enabled")
	}

	return e
}
