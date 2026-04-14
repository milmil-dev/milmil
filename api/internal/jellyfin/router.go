package jellyfin

import (
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/jellyfin/imagecache"
	"github.com/milmil/api/internal/store"
)

// Handler holds dependencies for all Jellyfin-compatible endpoints.
type Handler struct {
	queries       *store.Queries
	jwtSecret     string
	serverID      string
	imageCache    *imagecache.Cache
	encryptionKey []byte
}

// NewHandler creates a new Jellyfin API handler.
func NewHandler(queries *store.Queries, jwtSecret string, imageCacheDir string, encryptionKey []byte) (*Handler, error) {
	cache, err := imagecache.New(imageCacheDir)
	if err != nil {
		return nil, err
	}
	return &Handler{
		queries:       queries,
		jwtSecret:     jwtSecret,
		serverID:      strings.ReplaceAll(uuid.NewString(), "-", ""),
		imageCache:    cache,
		encryptionKey: encryptionKey,
	}, nil
}

// ServerID returns the server's unique ID (for discovery).
func (h *Handler) ServerID() string { return h.serverID }

// RegisterRoutes mounts all Jellyfin-compatible routes on the Echo instance.
func (h *Handler) RegisterRoutes(e *echo.Echo) {
	jf := e.Group("/jellyfin")
	jf.Use(jellyfinLogMiddleware())

	// Public endpoints (no auth)
	jf.GET("/System/Info/Public", h.handleSystemInfoPublic)
	jf.GET("/System/Ping", h.handlePing)
	jf.POST("/System/Ping", h.handlePing)
	jf.POST("/Users/AuthenticateByName", h.handleAuthenticateByName)

	// Protected endpoints
	auth := jf.Group("", EmbyAuthMiddleware(h.jwtSecret))
	auth.GET("/System/Info", h.handleSystemInfo)

	// Users
	auth.GET("/Users/:userId", h.handleGetUser)
	auth.GET("/Users/:userId/Views", h.handleGetUserViews)
	auth.GET("/Users/:userId/GroupingOptions", h.handleGroupingOptions)
	auth.GET("/Users/:userId/Items/Resume", h.handleItemsResume)
	auth.GET("/Users/:userId/Items/Latest", h.handleItemsLatest)
	auth.GET("/Users/:userId/Items/:itemId", h.handleGetItem)
	auth.GET("/Users/:userId/Items", h.handleGetItems)

	// Shows
	auth.GET("/Shows/NextUp", h.handleNextUp)
	auth.GET("/Shows/:seriesId/Seasons", h.handleGetSeasons)

	// Display preferences
	auth.GET("/DisplayPreferences/:displayPreferencesId", h.handleDisplayPreferences)

	// Library
	auth.GET("/Library/VirtualFolders", h.handleVirtualFolders)

	// Items
	auth.GET("/Items", h.handleGetItems)
	auth.GET("/Items/:itemId", h.handleGetItem)
	auth.GET("/Items/:itemId/Images/:imageType", h.handleGetImage)
	auth.GET("/Items/:itemId/Images/:imageType/:imageIndex", h.handleGetImage)
	auth.GET("/Items/:itemId/PlaybackInfo", h.handlePlaybackInfo)
	auth.POST("/Items/:itemId/PlaybackInfo", h.handlePlaybackInfo)

	// Shows
	auth.GET("/Shows/:seriesId/Episodes", h.handleGetEpisodes)

	// Stream
	auth.GET("/Videos/:itemId/stream", h.handleStream)
	auth.GET("/Videos/:itemId/stream.:container", h.handleStream)
	auth.HEAD("/Videos/:itemId/stream", h.handleStream)
	auth.GET("/Videos/:itemId/:sourceId/Subtitles/:index/Stream", h.handleGetSubtitle)

	// Playback session
	auth.POST("/Sessions/Playing", h.handlePlaybackStart)
	auth.POST("/Sessions/Playing/Progress", h.handlePlaybackProgress)
	auth.POST("/Sessions/Playing/Stopped", h.handlePlaybackStop)

	// User data (bidirectional progress sync)
	auth.GET("/Users/:userId/Items/:itemId/UserData", h.handleGetUserData)

	// Stubs that Infuse expects (return empty results, not errors)
	emptyArray := func(c echo.Context) error { return c.JSON(200, []any{}) }
	auth.GET("/Items/:itemId/LocalTrailers", emptyArray)
	auth.GET("/Items/:itemId/SpecialFeatures", emptyArray)
	auth.GET("/MediaSegments/:itemId", h.handleMediaSegments)
	auth.GET("/UserItems/Resume", h.handleItemsResume)

	// Catch-all for unimplemented endpoints — return 404 (not 501)
	// Infuse treats 501 as fatal but ignores 404 gracefully
	jf.Any("/*", func(c echo.Context) error {
		return c.JSON(404, JellyfinError{Message: "Not found"})
	})
}
