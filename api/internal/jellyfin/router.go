package jellyfin

import (
	"net/http"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
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
	devices       *deviceTracker
	// enabled gates every /jellyfin route (503 when off); discovery owns the
	// UDP responder so Settings › 服務 can start and stop both at runtime.
	enabled          atomic.Bool
	discoveryMu      sync.Mutex
	discoveryAddress string
	discoveryStop    func()
	// avatarDir holds the JPEGs the main API renders (<DataDir>/avatars).
	avatarDir string
}

// SetAvatarDir points /Users/{id}/Images/Primary at the avatar store.
func (h *Handler) SetAvatarDir(dir string) { h.avatarDir = dir }

// NewHandler creates a new Jellyfin API handler.
func NewHandler(queries *store.Queries, jwtSecret string, imageCacheDir string, encryptionKey []byte) (*Handler, error) {
	cache, err := imagecache.New(imageCacheDir)
	if err != nil {
		return nil, err
	}
	h := &Handler{
		queries:       queries,
		jwtSecret:     jwtSecret,
		serverID:      strings.ReplaceAll(uuid.NewString(), "-", ""),
		imageCache:    cache,
		encryptionKey: encryptionKey,
		devices:       newDeviceTracker(queries),
	}
	h.enabled.Store(true)
	return h, nil
}

// Enabled reports whether the Jellyfin routes answer.
func (h *Handler) Enabled() bool { return h.enabled.Load() }

// SetEnabled turns the whole /jellyfin surface on or off at runtime.
func (h *Handler) SetEnabled(on bool) { h.enabled.Store(on) }

// ConfigureDiscovery sets the address the UDP responder advertises.
func (h *Handler) ConfigureDiscovery(address string) {
	h.discoveryMu.Lock()
	h.discoveryAddress = address
	h.discoveryMu.Unlock()
}

// DiscoveryEnabled reports whether the LAN responder is listening.
func (h *Handler) DiscoveryEnabled() bool {
	h.discoveryMu.Lock()
	defer h.discoveryMu.Unlock()
	return h.discoveryStop != nil
}

// StartDiscovery starts the UDP 7359 responder (idempotent).
func (h *Handler) StartDiscovery() error {
	h.discoveryMu.Lock()
	defer h.discoveryMu.Unlock()
	if h.discoveryStop != nil {
		return nil
	}
	stop, err := StartDiscoveryServer(h.serverID, "milmil", h.discoveryAddress)
	if err != nil {
		return err
	}
	h.discoveryStop = stop
	return nil
}

// StopDiscovery stops the responder (idempotent).
func (h *Handler) StopDiscovery() {
	h.discoveryMu.Lock()
	defer h.discoveryMu.Unlock()
	if h.discoveryStop != nil {
		h.discoveryStop()
		h.discoveryStop = nil
	}
}

// DiscoveryPort is the UDP port Jellyfin clients broadcast to.
const DiscoveryPort = discoveryPort

// disabledGate answers 503 for every route while the layer is switched off.
func (h *Handler) disabledGate() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			if !h.enabled.Load() {
				return c.JSON(http.StatusServiceUnavailable, JellyfinError{Message: "milmil Jellyfin API is disabled"})
			}
			return next(c)
		}
	}
}

// ServerID returns the server's unique ID (for discovery).
func (h *Handler) ServerID() string { return h.serverID }

// RegisterRoutes mounts all Jellyfin-compatible routes on the Echo instance.
func (h *Handler) RegisterRoutes(e *echo.Echo) {
	jf := e.Group("/jellyfin")
	jf.Use(h.disabledGate())
	jf.Use(jellyfinLogMiddleware())

	// Public endpoints (no auth)
	jf.GET("/System/Info/Public", h.handleSystemInfoPublic)
	jf.GET("/System/Ping", h.handlePing)
	jf.POST("/System/Ping", h.handlePing)
	jf.POST("/Users/AuthenticateByName", h.handleAuthenticateByName)

	// Protected endpoints
	auth := jf.Group("", authMiddleware(h.jwtSecret, h.queries, h.devices))
	auth.GET("/System/Info", h.handleSystemInfo)

	// Users
	auth.GET("/Users/:userId", h.handleGetUser)
	auth.GET("/Users/:userId/Images/Primary", h.handleUserImage)
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
	emptyArray := func(c *echo.Context) error { return c.JSON(200, []any{}) }
	auth.GET("/Items/:itemId/LocalTrailers", emptyArray)
	auth.GET("/Items/:itemId/SpecialFeatures", emptyArray)
	auth.GET("/MediaSegments/:itemId", h.handleMediaSegments)
	auth.GET("/UserItems/Resume", h.handleItemsResume)

	// Catch-all for unimplemented endpoints — return 501 so callers can
	// distinguish "route does not exist at all" (404 from Echo) from
	// "this Jellyfin endpoint is known but not implemented here".
	jf.Any("/*", func(c *echo.Context) error {
		return c.JSON(http.StatusNotImplemented, JellyfinError{Message: "Not implemented"})
	})
}
