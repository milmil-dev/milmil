# Jellyfin API 兼容層 (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Infuse, VLC, Kodi, and mpv connect to milmil via Jellyfin-compatible API endpoints, browse the anime library, stream video with Direct Play, sync watch progress bidirectionally, and auto-discover milmil on LAN.

**Architecture:** A new `api/internal/jellyfin/` package implements all `/jellyfin/*` routes as a thin translation layer over existing `store.Queries`. It shares the same `handler` dependencies (db, queries, config) but uses its own auth middleware that parses `X-Emby-Authorization` headers. ID mapping uses stateless base64url encoding (`type:id`). Image proxying caches remote URLs to disk with 7-day TTL.

**Tech Stack:** Go 1.26, Echo v4, existing `auth` package (JWT + bcrypt), `store.Queries` (sqlc), `net` (UDP discovery)

**Spec:** `docs/superpowers/specs/2026-04-13-jellyfin-compat-streaming-design.md` — Phase 1 section

---

## File Structure

```
api/internal/jellyfin/
├── router.go       # RegisterRoutes() — mounts all /jellyfin/* routes on Echo
├── middleware.go    # embyAuthMiddleware — parses X-Emby-Authorization header
├── mapping.go      # EncodeItemID / DecodeItemID — base64url ID encoding
├── types.go        # All Jellyfin JSON response structs
├── system.go       # System/Info/Public, System/Info, System/Ping
├── auth.go         # Users/AuthenticateByName
├── users.go        # Users/{userId}, Users/{userId}/Views
├── library.go      # Library/VirtualFolders
├── items.go        # Items (browse/search), Items/{id} (detail)
├── episodes.go     # Shows/{id}/Episodes
├── images.go       # Items/{id}/Images/* — proxy + disk cache
├── stream.go       # Videos/{id}/stream, Videos/{id}/master.m3u8
├── subtitles.go    # Videos/{id}/{sourceId}/Subtitles/{index}
├── playback.go     # Sessions/Playing, Playing/Progress, Playing/Stopped
├── userdata.go     # Users/{userId}/Items/{itemId}/UserData
├── playbackinfo.go # Items/{id}/PlaybackInfo — codec negotiation
└── discovery.go    # UDP server on port 7359

api/internal/jellyfin/imagecache/
└── cache.go        # Disk-based image cache with TTL

tests:
api/internal/jellyfin/mapping_test.go
api/internal/jellyfin/middleware_test.go
api/internal/jellyfin/jellyfin_test.go     # Integration tests (full HTTP flow)
```

---

### Task 1: ID Mapping (`mapping.go`)

**Files:**
- Create: `api/internal/jellyfin/mapping.go`
- Create: `api/internal/jellyfin/mapping_test.go`

- [ ] **Step 1: Write failing tests**

```go
// api/internal/jellyfin/mapping_test.go
package jellyfin

import "testing"

func TestEncodeDecodeItemID(t *testing.T) {
	tests := []struct {
		typ string
		id  string
	}{
		{"anime", "abc123"},
		{"episode", "def-456"},
		{"file", "ghi789"},
		{"library", "lib-001"},
	}
	for _, tt := range tests {
		encoded := EncodeItemID(tt.typ, tt.id)
		if encoded == "" {
			t.Fatalf("EncodeItemID(%q, %q) returned empty", tt.typ, tt.id)
		}
		gotType, gotID, err := DecodeItemID(encoded)
		if err != nil {
			t.Fatalf("DecodeItemID(%q): %v", encoded, err)
		}
		if gotType != tt.typ || gotID != tt.id {
			t.Errorf("roundtrip failed: got (%q, %q), want (%q, %q)", gotType, gotID, tt.typ, tt.id)
		}
	}
}

func TestDecodeItemID_Invalid(t *testing.T) {
	_, _, err := DecodeItemID("not-valid-base64!!!")
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
	_, _, err = DecodeItemID("bm9jb2xvbg==") // "nocolon" — no colon separator
	if err == nil {
		t.Fatal("expected error for missing colon separator")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && go test ./internal/jellyfin/ -run TestEncodeDecodeItemID -v`
Expected: FAIL — package does not exist yet

- [ ] **Step 3: Implement mapping**

```go
// api/internal/jellyfin/mapping.go
package jellyfin

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// EncodeItemID encodes a milmil type+id pair into a Jellyfin-compatible item ID.
// Format: base64url("type:id")
func EncodeItemID(typ, id string) string {
	return base64.URLEncoding.EncodeToString([]byte(typ + ":" + id))
}

// DecodeItemID decodes a Jellyfin item ID back into type and milmil id.
func DecodeItemID(encoded string) (typ, id string, err error) {
	b, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", fmt.Errorf("decode item id: %w", err)
	}
	parts := strings.SplitN(string(b), ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid item id format: missing colon separator")
	}
	return parts[0], parts[1], nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && go test ./internal/jellyfin/ -run TestEncodeDecodeItemID -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/jellyfin/mapping.go api/internal/jellyfin/mapping_test.go
git commit -m "feat(jellyfin): add stateless ID mapping (base64url type:id encoding)"
```

---

### Task 2: Jellyfin Response Types (`types.go`)

**Files:**
- Create: `api/internal/jellyfin/types.go`

- [ ] **Step 1: Create all Jellyfin JSON response structs**

These must match exactly what Infuse/VLC expect. Field names use PascalCase JSON tags to match Jellyfin's API.

```go
// api/internal/jellyfin/types.go
package jellyfin

// ServerInfo is returned by /System/Info/Public and /System/Info.
type ServerInfo struct {
	LocalAddress    string `json:"LocalAddress"`
	ServerName      string `json:"ServerName"`
	Version         string `json:"Version"`
	ID              string `json:"Id"`
	OperatingSystem string `json:"OperatingSystem,omitempty"`
	HasPendingRestart bool `json:"HasPendingRestart"`
	SupportsLibraryMonitor bool `json:"SupportsLibraryMonitor"`
	ProductName     string `json:"ProductName"`
	StartupWizardCompleted bool `json:"StartupWizardCompleted"`
}

// AuthResponse is returned by /Users/AuthenticateByName.
type AuthResponse struct {
	User        UserDTO `json:"User"`
	AccessToken string  `json:"AccessToken"`
	ServerID    string  `json:"ServerId"`
}

// UserDTO represents a Jellyfin user.
type UserDTO struct {
	Name                  string `json:"Name"`
	ServerID              string `json:"ServerId"`
	ID                    string `json:"Id"`
	HasPassword           bool   `json:"HasPassword"`
	HasConfiguredPassword bool   `json:"HasConfiguredPassword"`
}

// ItemDTO represents any Jellyfin library item (series, episode, folder).
type ItemDTO struct {
	Name             string          `json:"Name"`
	ServerID         string          `json:"ServerId"`
	ID               string          `json:"Id"`
	Type             string          `json:"Type"` // "Series", "Episode", "CollectionFolder"
	Overview         string          `json:"Overview,omitempty"`
	ParentID         string          `json:"ParentId,omitempty"`
	IndexNumber      *int            `json:"IndexNumber,omitempty"`
	ImageTags        map[string]string `json:"ImageTags,omitempty"`
	UserData         *UserItemData   `json:"UserData,omitempty"`
	MediaSources     []MediaSource   `json:"MediaSources,omitempty"`
	PremiereDate     string          `json:"PremiereDate,omitempty"`
	CommunityRating  *float64        `json:"CommunityRating,omitempty"`
	ProductionYear   *int            `json:"ProductionYear,omitempty"`
	Genres           []string        `json:"Genres,omitempty"`
	RunTimeTicks     *int64          `json:"RunTimeTicks,omitempty"`
	CollectionType   string          `json:"CollectionType,omitempty"` // "tvshows"
	ChildCount       *int            `json:"ChildCount,omitempty"`
	MediaType        string          `json:"MediaType,omitempty"` // "Video"
	LocationType     string          `json:"LocationType,omitempty"`
	IsFolder         bool            `json:"IsFolder,omitempty"`
	ParentIndexNumber *int           `json:"ParentIndexNumber,omitempty"`
}

// ItemsResponse wraps a list of items with total count.
type ItemsResponse struct {
	Items            []ItemDTO `json:"Items"`
	TotalRecordCount int       `json:"TotalRecordCount"`
}

// MediaSource describes a playable media file.
type MediaSource struct {
	ID                       string        `json:"Id"`
	Path                     string        `json:"Path"`
	Container                string        `json:"Container"`
	Size                     int64         `json:"Size"`
	Name                     string        `json:"Name"`
	RunTimeTicks             *int64        `json:"RunTimeTicks,omitempty"`
	SupportsDirectPlay       bool          `json:"SupportsDirectPlay"`
	SupportsDirectStream     bool          `json:"SupportsDirectStream"`
	SupportsTranscoding      bool          `json:"SupportsTranscoding"`
	VideoType                string        `json:"VideoType"` // "VideoFile"
	MediaStreams              []MediaStream `json:"MediaStreams"`
	DirectStreamURL          string        `json:"DirectStreamUrl,omitempty"`
	TranscodingURL           string        `json:"TranscodingUrl,omitempty"`
}

// MediaStream describes a single video, audio, or subtitle track.
type MediaStream struct {
	Codec        string `json:"Codec"`
	Type         string `json:"Type"` // "Video", "Audio", "Subtitle"
	Index        int    `json:"Index"`
	Language     string `json:"Language,omitempty"`
	DisplayTitle string `json:"DisplayTitle,omitempty"`
	Width        int    `json:"Width,omitempty"`
	Height       int    `json:"Height,omitempty"`
	BitRate      int    `json:"BitRate,omitempty"`
	IsDefault    bool   `json:"IsDefault,omitempty"`
	IsExternal   bool   `json:"IsExternal,omitempty"`
}

// UserItemData holds watch progress and played status.
type UserItemData struct {
	PlaybackPositionTicks int64  `json:"PlaybackPositionTicks"`
	PlayCount             int    `json:"PlayCount"`
	IsFavorite            bool   `json:"IsFavorite"`
	Played                bool   `json:"Played"`
	Key                   string `json:"Key"`
}

// PlaybackInfoResponse is returned by /Items/{id}/PlaybackInfo.
type PlaybackInfoResponse struct {
	MediaSources []MediaSource `json:"MediaSources"`
	PlaySessionID string      `json:"PlaySessionId"`
}

// PlaybackStartRequest is sent to /Sessions/Playing.
type PlaybackStartRequest struct {
	ItemID         string `json:"ItemId"`
	MediaSourceID  string `json:"MediaSourceId"`
	PlaySessionID  string `json:"PlaySessionId"`
	CanSeek        bool   `json:"CanSeek"`
	PlayMethod     string `json:"PlayMethod"` // "DirectPlay", "DirectStream", "Transcode"
}

// PlaybackProgressRequest is sent to /Sessions/Playing/Progress.
type PlaybackProgressRequest struct {
	ItemID         string `json:"ItemId"`
	MediaSourceID  string `json:"MediaSourceId"`
	PlaySessionID  string `json:"PlaySessionId"`
	PositionTicks  int64  `json:"PositionTicks"`
	IsPaused       bool   `json:"IsPaused"`
	PlayMethod     string `json:"PlayMethod"`
}

// PlaybackStopRequest is sent to /Sessions/Playing/Stopped.
type PlaybackStopRequest struct {
	ItemID         string `json:"ItemId"`
	MediaSourceID  string `json:"MediaSourceId"`
	PlaySessionID  string `json:"PlaySessionId"`
	PositionTicks  int64  `json:"PositionTicks"`
}

// JellyfinError is the standard Jellyfin error response format.
type JellyfinError struct {
	Message string `json:"Message"`
}

// ViewsResponse wraps user views (home screen folders).
type ViewsResponse struct {
	Items            []ItemDTO `json:"Items"`
	TotalRecordCount int       `json:"TotalRecordCount"`
}

// DiscoveryResponse is the JSON payload for UDP server discovery on port 7359.
type DiscoveryResponse struct {
	Address string `json:"Address"`
	ID      string `json:"Id"`
	Name    string `json:"Name"`
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd api && go build ./internal/jellyfin/`
Expected: success (no errors)

- [ ] **Step 3: Commit**

```bash
git add api/internal/jellyfin/types.go
git commit -m "feat(jellyfin): add all Jellyfin JSON response types"
```

---

### Task 3: Auth Middleware (`middleware.go`)

**Files:**
- Create: `api/internal/jellyfin/middleware.go`
- Create: `api/internal/jellyfin/middleware_test.go`

- [ ] **Step 1: Write failing tests**

```go
// api/internal/jellyfin/middleware_test.go
package jellyfin

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
)

func TestEmbyAuthMiddleware_ValidToken(t *testing.T) {
	secret := "testsecret32chars!!!"
	token, _ := auth.SignToken(secret, "user-123")

	e := echo.New()
	e.GET("/test", func(c echo.Context) error {
		uid := c.Get("userID").(string)
		return c.String(http.StatusOK, uid)
	}, EmbyAuthMiddleware(secret))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "user-123" {
		t.Errorf("want user-123, got %s", rec.Body.String())
	}
}

func TestEmbyAuthMiddleware_AuthorizationHeader(t *testing.T) {
	secret := "testsecret32chars!!!"
	token, _ := auth.SignToken(secret, "user-456")

	e := echo.New()
	e.GET("/test", func(c echo.Context) error {
		uid := c.Get("userID").(string)
		return c.String(http.StatusOK, uid)
	}, EmbyAuthMiddleware(secret))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEmbyAuthMiddleware_NoToken(t *testing.T) {
	e := echo.New()
	e.GET("/test", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, EmbyAuthMiddleware("secret"))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && go test ./internal/jellyfin/ -run TestEmbyAuthMiddleware -v`
Expected: FAIL

- [ ] **Step 3: Implement middleware**

```go
// api/internal/jellyfin/middleware.go
package jellyfin

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
)

// EmbyAuthMiddleware parses X-Emby-Authorization or Authorization headers
// with the MediaBrowser token scheme used by Jellyfin clients.
// Format: MediaBrowser Token="<jwt>", Client="Infuse", Device="iPhone", ...
func EmbyAuthMiddleware(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token := extractEmbyToken(c.Request())
			if token == "" {
				return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Missing authentication token"})
			}

			userID, err := auth.VerifyToken(secret, token)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Invalid or expired token"})
			}
			c.Set("userID", userID)

			// Structured logging
			start := time.Now()
			err = next(c)
			slog.Info("jellyfin request",
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"status", c.Response().Status,
				"duration_ms", time.Since(start).Milliseconds(),
				"client", extractEmbyParam(c.Request(), "Client"),
			)
			return err
		}
	}
}

// extractEmbyToken parses the JWT from X-Emby-Authorization or Authorization headers.
// Supports: MediaBrowser Token="<jwt>" and MediaBrowser Token="<jwt>", Client="...", ...
func extractEmbyToken(r *http.Request) string {
	header := r.Header.Get("X-Emby-Authorization")
	if header == "" {
		header = r.Header.Get("Authorization")
	}
	if !strings.HasPrefix(header, "MediaBrowser ") {
		return ""
	}
	params := header[len("MediaBrowser "):]
	for _, part := range strings.Split(params, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) == 2 && strings.EqualFold(kv[0], "Token") {
			return strings.Trim(kv[1], `"`)
		}
	}
	return ""
}

// extractEmbyParam extracts a named parameter from the MediaBrowser auth header.
func extractEmbyParam(r *http.Request, key string) string {
	header := r.Header.Get("X-Emby-Authorization")
	if header == "" {
		header = r.Header.Get("Authorization")
	}
	if !strings.HasPrefix(header, "MediaBrowser ") {
		return ""
	}
	for _, part := range strings.Split(header[len("MediaBrowser "):], ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) == 2 && strings.EqualFold(kv[0], key) {
			return strings.Trim(kv[1], `"`)
		}
	}
	return ""
}

// jellyfinLogMiddleware logs all /jellyfin/* requests including unauthenticated ones.
func jellyfinLogMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			status := c.Response().Status
			level := slog.LevelInfo
			if status >= 400 {
				level = slog.LevelWarn
			}
			slog.Log(c.Request().Context(), level, "jellyfin request",
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"status", status,
				"duration_ms", time.Since(start).Milliseconds(),
			)
			return err
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && go test ./internal/jellyfin/ -run TestEmbyAuthMiddleware -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/jellyfin/middleware.go api/internal/jellyfin/middleware_test.go
git commit -m "feat(jellyfin): add X-Emby-Authorization middleware with structured logging"
```

---

### Task 4: System + Auth Handlers (`system.go`, `auth.go`)

**Files:**
- Create: `api/internal/jellyfin/system.go`
- Create: `api/internal/jellyfin/auth.go`

- [ ] **Step 1: Implement system handlers**

```go
// api/internal/jellyfin/system.go
package jellyfin

import (
	"net/http"
	"runtime"

	"github.com/labstack/echo/v4"
)

const serverVersion = "10.8.0" // Jellyfin version we emulate

func (h *Handler) handleSystemInfoPublic(c echo.Context) error {
	return c.JSON(http.StatusOK, ServerInfo{
		LocalAddress:           h.baseURL(c),
		ServerName:             "milmil",
		Version:                serverVersion,
		ID:                     h.serverID,
		ProductName:            "milmil",
		OperatingSystem:        runtime.GOOS,
		StartupWizardCompleted: true,
	})
}

func (h *Handler) handleSystemInfo(c echo.Context) error {
	return c.JSON(http.StatusOK, ServerInfo{
		LocalAddress:              h.baseURL(c),
		ServerName:                "milmil",
		Version:                   serverVersion,
		ID:                        h.serverID,
		ProductName:               "milmil",
		OperatingSystem:           runtime.GOOS,
		StartupWizardCompleted:    true,
		SupportsLibraryMonitor:    true,
	})
}

func (h *Handler) handlePing(c echo.Context) error {
	return c.String(http.StatusOK, "\"milmil\"")
}

func (h *Handler) baseURL(c echo.Context) string {
	scheme := "http"
	if c.Request().TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + c.Request().Host
}
```

- [ ] **Step 2: Implement auth handler**

```go
// api/internal/jellyfin/auth.go
package jellyfin

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
)

type authenticateRequest struct {
	Username string `json:"Username"`
	Pw       string `json:"Pw"`
}

func (h *Handler) handleAuthenticateByName(c echo.Context) error {
	var req authenticateRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request body"})
	}
	if req.Username == "" || req.Pw == "" {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Username and password required"})
	}

	user, err := h.queries.GetUserByUsername(c.Request().Context(), req.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Invalid username or password"})
		}
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Internal server error"})
	}

	if err := auth.CheckPassword(user.PasswordHash, req.Pw); err != nil {
		return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Invalid username or password"})
	}

	token, err := auth.SignToken(h.jwtSecret, user.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to generate token"})
	}

	userID := EncodeItemID("user", user.ID)
	return c.JSON(http.StatusOK, AuthResponse{
		User: UserDTO{
			Name:                  user.Username,
			ServerID:              h.serverID,
			ID:                    userID,
			HasPassword:           true,
			HasConfiguredPassword: true,
		},
		AccessToken: token,
		ServerID:    h.serverID,
	})
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd api && go build ./internal/jellyfin/`
Expected: FAIL — `Handler` type not defined yet (expected, will be created in Task 7: Router)

- [ ] **Step 4: Commit**

```bash
git add api/internal/jellyfin/system.go api/internal/jellyfin/auth.go
git commit -m "feat(jellyfin): add system info and authentication handlers"
```

---

### Task 5: Users + Library + Items Handlers (`users.go`, `library.go`, `items.go`, `episodes.go`)

**Files:**
- Create: `api/internal/jellyfin/users.go`
- Create: `api/internal/jellyfin/library.go`
- Create: `api/internal/jellyfin/items.go`
- Create: `api/internal/jellyfin/episodes.go`

- [ ] **Step 1: Implement users handler**

```go
// api/internal/jellyfin/users.go
package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetUser(c echo.Context) error {
	userIDEncoded := c.Param("userId")
	_, userID, err := DecodeItemID(userIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "User not found"})
	}

	user, err := h.queries.GetUserByID(c.Request().Context(), userID)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "User not found"})
	}

	return c.JSON(http.StatusOK, UserDTO{
		Name:                  user.Username,
		ServerID:              h.serverID,
		ID:                    userIDEncoded,
		HasPassword:           true,
		HasConfiguredPassword: true,
	})
}

func (h *Handler) handleGetUserViews(c echo.Context) error {
	ctx := c.Request().Context()
	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	items := make([]ItemDTO, 0, len(libs))
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		items = append(items, ItemDTO{
			Name:           lib.Name,
			ServerID:       h.serverID,
			ID:             EncodeItemID("library", lib.ID),
			Type:           "CollectionFolder",
			CollectionType: "tvshows",
			IsFolder:       true,
		})
	}

	return c.JSON(http.StatusOK, ViewsResponse{
		Items:            items,
		TotalRecordCount: len(items),
	})
}
```

- [ ] **Step 2: Implement library handler**

```go
// api/internal/jellyfin/library.go
package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

type virtualFolder struct {
	Name               string   `json:"Name"`
	Locations          []string `json:"Locations"`
	CollectionType     string   `json:"CollectionType"`
	ItemID             string   `json:"ItemId"`
}

func (h *Handler) handleVirtualFolders(c echo.Context) error {
	libs, err := h.queries.ListLibraries(c.Request().Context())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	folders := make([]virtualFolder, 0, len(libs))
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		folders = append(folders, virtualFolder{
			Name:           lib.Name,
			Locations:      []string{lib.Path},
			CollectionType: "tvshows",
			ItemID:         EncodeItemID("library", lib.ID),
		})
	}
	return c.JSON(http.StatusOK, folders)
}
```

- [ ] **Step 3: Implement items handler**

```go
// api/internal/jellyfin/items.go
package jellyfin

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetItems(c echo.Context) error {
	ctx := c.Request().Context()
	parentID := c.QueryParam("ParentId")

	// If parentID is a library, list anime in that library
	if parentID != "" {
		typ, id, err := DecodeItemID(parentID)
		if err != nil {
			return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
		}
		if typ == "library" {
			return h.listAnimeByLibrary(c, id)
		}
	}

	// Search by name
	searchTerm := c.QueryParam("SearchTerm")
	if searchTerm != "" {
		return h.searchItems(c, searchTerm)
	}

	// Default: list all anime across all libraries
	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list libraries"})
	}

	var items []ItemDTO
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		animeList, err := h.queries.ListAnimeByLibrary(ctx, sql.NullString{String: lib.ID, Valid: true})
		if err != nil {
			continue
		}
		for _, a := range animeList {
			items = append(items, h.animeToItemDTO(a))
		}
	}

	// Apply StartIndex and Limit
	startIndex, _ := strconv.Atoi(c.QueryParam("StartIndex"))
	limit, _ := strconv.Atoi(c.QueryParam("Limit"))
	total := len(items)
	if startIndex > 0 && startIndex < len(items) {
		items = items[startIndex:]
	}
	if limit > 0 && limit < len(items) {
		items = items[:limit]
	}

	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: total})
}

func (h *Handler) listAnimeByLibrary(c echo.Context, libraryID string) error {
	animeList, err := h.queries.ListAnimeByLibrary(c.Request().Context(), sql.NullString{String: libraryID, Valid: true})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list anime"})
	}
	items := make([]ItemDTO, 0, len(animeList))
	for _, a := range animeList {
		items = append(items, h.animeToItemDTO(a))
	}
	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) searchItems(c echo.Context, term string) error {
	// Simple search: list all anime and filter by title
	ctx := c.Request().Context()
	libs, err := h.queries.ListLibraries(ctx)
	if err != nil {
		return c.JSON(http.StatusOK, ItemsResponse{Items: []ItemDTO{}, TotalRecordCount: 0})
	}
	termLower := strings.ToLower(term)
	var items []ItemDTO
	for _, lib := range libs {
		if lib.Enabled == 0 {
			continue
		}
		animeList, _ := h.queries.ListAnimeByLibrary(ctx, sql.NullString{String: lib.ID, Valid: true})
		for _, a := range animeList {
			if strings.Contains(strings.ToLower(a.Title), termLower) ||
				(a.TitleEn.Valid && strings.Contains(strings.ToLower(a.TitleEn.String), termLower)) ||
				(a.TitleZh.Valid && strings.Contains(strings.ToLower(a.TitleZh.String), termLower)) {
				items = append(items, h.animeToItemDTO(a))
			}
		}
	}
	return c.JSON(http.StatusOK, ItemsResponse{Items: items, TotalRecordCount: len(items)})
}

func (h *Handler) handleGetItem(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	switch typ {
	case "anime":
		anime, err := h.queries.GetAnime(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		dto := h.animeToItemDTO(anime)
		return c.JSON(http.StatusOK, dto)
	case "episode":
		ep, err := h.queries.GetEpisode(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		dto := h.episodeToItemDTO(ep)
		return c.JSON(http.StatusOK, dto)
	case "library":
		lib, err := h.queries.GetLibrary(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
		}
		return c.JSON(http.StatusOK, ItemDTO{
			Name:           lib.Name,
			ServerID:       h.serverID,
			ID:             itemIDEncoded,
			Type:           "CollectionFolder",
			CollectionType: "tvshows",
			IsFolder:       true,
		})
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}
}

// animeToItemDTO converts a milmil Anime to a Jellyfin Series item.
func (h *Handler) animeToItemDTO(a interface{ /* store.Anime fields */ }) ItemDTO {
	// Type assertion — the actual store.Anime is passed
	type animeAccessor interface {
		getID() string
		getTitle() string
	}
	// We work with store.Anime directly via the concrete type in the real code.
	// This is defined below as a concrete helper.
	return ItemDTO{} // placeholder — real implementation follows
}
```

**Note:** The `animeToItemDTO` and `episodeToItemDTO` helpers need the concrete `store.Anime` and `store.Episode` types. Implement them as:

```go
// Add to items.go — replace the placeholder animeToItemDTO above

import "github.com/milmil/api/internal/store"

func (h *Handler) animeToItemDTO(a store.Anime) ItemDTO {
	dto := ItemDTO{
		Name:     a.Title,
		ServerID: h.serverID,
		ID:       EncodeItemID("anime", a.ID),
		Type:     "Series",
		IsFolder: true,
	}
	if a.Synopsis.Valid {
		dto.Overview = a.Synopsis.String
	}
	if a.CoverImageUrl.Valid && a.CoverImageUrl.String != "" {
		dto.ImageTags = map[string]string{"Primary": "default"}
	}
	if a.Year.Valid {
		year := int(a.Year.Int64)
		dto.ProductionYear = &year
	}
	if a.Score > 0 {
		score := a.Score
		dto.CommunityRating = &score
	}
	if a.Genres != "" {
		var genres []string
		json.Unmarshal([]byte(a.Genres), &genres)
		dto.Genres = genres
	}
	if a.TotalEpisodes.Valid {
		count := int(a.TotalEpisodes.Int64)
		dto.ChildCount = &count
	}
	if a.LibraryID.Valid {
		dto.ParentID = EncodeItemID("library", a.LibraryID.String)
	}
	return dto
}

func (h *Handler) episodeToItemDTO(ep store.Episode) ItemDTO {
	epNum := int(ep.EpisodeNumber)
	dto := ItemDTO{
		Name:        ep.Title.String,
		ServerID:    h.serverID,
		ID:          EncodeItemID("episode", ep.ID),
		Type:        "Episode",
		IndexNumber: &epNum,
		ParentID:    EncodeItemID("anime", ep.AnimeID),
		MediaType:   "Video",
	}
	if ep.Title.Valid {
		dto.Name = ep.Title.String
	}
	if ep.TitleZh.Valid && ep.TitleZh.String != "" {
		dto.Name = ep.TitleZh.String
	}
	if ep.ThumbnailUrl.Valid && ep.ThumbnailUrl.String != "" {
		dto.ImageTags = map[string]string{"Primary": "default"}
	}
	if ep.AirDate.Valid {
		dto.PremiereDate = ep.AirDate.String
	}
	season := 1
	dto.ParentIndexNumber = &season
	return dto
}
```

- [ ] **Step 4: Implement episodes handler**

```go
// api/internal/jellyfin/episodes.go
package jellyfin

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handleGetEpisodes(c echo.Context) error {
	seriesIDEncoded := c.Param("seriesId")
	typ, animeID, err := DecodeItemID(seriesIDEncoded)
	if err != nil || typ != "anime" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Series not found"})
	}

	episodes, err := h.queries.ListEpisodesByAnimeID(c.Request().Context(), animeID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Failed to list episodes"})
	}

	items := make([]ItemDTO, 0, len(episodes))
	for _, ep := range episodes {
		dto := h.episodeToItemDTO(ep)
		// Attach media sources if the episode has linked media files
		dto.MediaSources = h.getMediaSourcesForEpisode(c, ep.ID)
		items = append(items, dto)
	}

	return c.JSON(http.StatusOK, ItemsResponse{
		Items:            items,
		TotalRecordCount: len(items),
	})
}

func (h *Handler) getMediaSourcesForEpisode(c echo.Context, episodeID string) []MediaSource {
	files, err := h.queries.ListPlayableEpisodeFiles(c.Request().Context(), episodeID)
	if err != nil {
		return nil
	}
	sources := make([]MediaSource, 0, len(files))
	for _, f := range files {
		sources = append(sources, h.mediaFileToSource(store.MediaFile{
			ID:              f.ID,
			Path:            f.Path,
			Filename:        f.Filename,
			SizeBytes:       f.SizeBytes,
			DurationSeconds: f.DurationSeconds,
			ContainerFormat: f.ContainerFormat,
			VideoCodec:      f.VideoCodec,
			AudioCodec:      f.AudioCodec,
			Width:           f.Width,
			Height:          f.Height,
		}))
	}
	return sources
}

func (h *Handler) mediaFileToSource(f store.MediaFile) MediaSource {
	container := "mkv"
	if f.ContainerFormat.Valid {
		container = f.ContainerFormat.String
	}

	var streams []MediaStream
	if f.VideoCodec.Valid {
		ms := MediaStream{Codec: f.VideoCodec.String, Type: "Video", Index: 0}
		if f.Width.Valid {
			ms.Width = int(f.Width.Int64)
		}
		if f.Height.Valid {
			ms.Height = int(f.Height.Int64)
		}
		streams = append(streams, ms)
	}
	if f.AudioCodec.Valid {
		streams = append(streams, MediaStream{Codec: f.AudioCodec.String, Type: "Audio", Index: 1, IsDefault: true})
	}

	var runtimeTicks *int64
	if f.DurationSeconds.Valid {
		ticks := f.DurationSeconds.Int64 * 10_000_000
		runtimeTicks = &ticks
	}

	fileItemID := EncodeItemID("file", f.ID)
	return MediaSource{
		ID:                   fileItemID,
		Path:                 f.Path,
		Container:            container,
		Size:                 f.SizeBytes,
		Name:                 f.Filename,
		RunTimeTicks:         runtimeTicks,
		SupportsDirectPlay:   true,
		SupportsDirectStream: true,
		SupportsTranscoding:  true,
		VideoType:            "VideoFile",
		MediaStreams:          streams,
	}
}
```

- [ ] **Step 5: Verify it compiles (will fail until Router task creates Handler type)**

- [ ] **Step 6: Commit**

```bash
git add api/internal/jellyfin/users.go api/internal/jellyfin/library.go api/internal/jellyfin/items.go api/internal/jellyfin/episodes.go
git commit -m "feat(jellyfin): add users, library, items, and episodes handlers"
```

---

### Task 6: Image Proxy + Cache (`images.go`, `imagecache/cache.go`)

**Files:**
- Create: `api/internal/jellyfin/imagecache/cache.go`
- Create: `api/internal/jellyfin/images.go`

- [ ] **Step 1: Implement disk-based image cache**

```go
// api/internal/jellyfin/imagecache/cache.go
package imagecache

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const defaultTTL = 7 * 24 * time.Hour

// Cache stores proxied images on disk with TTL-based expiry.
type Cache struct {
	dir string
}

// New creates a cache in the given directory.
func New(dir string) (*Cache, error) {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &Cache{dir: dir}, nil
}

// Get returns the cached file path if it exists and is not expired.
func (c *Cache) Get(url string) (string, bool) {
	path := c.pathFor(url)
	info, err := os.Stat(path)
	if err != nil {
		return "", false
	}
	if time.Since(info.ModTime()) > defaultTTL {
		os.Remove(path)
		return "", false
	}
	return path, true
}

// Fetch downloads the URL and stores it in the cache. Returns the cached file path.
func (c *Cache) Fetch(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch image: status %d", resp.StatusCode)
	}

	path := c.pathFor(url)
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		os.Remove(path)
		return "", err
	}
	return path, nil
}

func (c *Cache) pathFor(url string) string {
	h := sha256.Sum256([]byte(url))
	return filepath.Join(c.dir, fmt.Sprintf("%x", h))
}
```

- [ ] **Step 2: Implement images handler**

```go
// api/internal/jellyfin/images.go
package jellyfin

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetImage(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var imageURL string

	switch typ {
	case "anime":
		anime, err := h.queries.GetAnime(ctx, id)
		if err != nil || !anime.CoverImageUrl.Valid {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
		}
		imageURL = anime.CoverImageUrl.String
	case "episode":
		ep, err := h.queries.GetEpisode(ctx, id)
		if err != nil || !ep.ThumbnailUrl.Valid {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
		}
		imageURL = ep.ThumbnailUrl.String
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}

	if imageURL == "" {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Image not found"})
	}

	// Check cache
	if cachedPath, ok := h.imageCache.Get(imageURL); ok {
		return c.File(cachedPath)
	}

	// Fetch and cache
	cachedPath, err := h.imageCache.Fetch(imageURL)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Failed to fetch image"})
	}

	_ = strconv.Atoi(c.QueryParam("maxWidth"))  // TODO: resize support in future
	_ = strconv.Atoi(c.QueryParam("maxHeight"))

	return c.File(cachedPath)
}
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/jellyfin/imagecache/cache.go api/internal/jellyfin/images.go
git commit -m "feat(jellyfin): add image proxy with 7-day disk cache"
```

---

### Task 7: Stream + Subtitles + PlaybackInfo (`stream.go`, `subtitles.go`, `playbackinfo.go`)

**Files:**
- Create: `api/internal/jellyfin/stream.go`
- Create: `api/internal/jellyfin/subtitles.go`
- Create: `api/internal/jellyfin/playbackinfo.go`

- [ ] **Step 1: Implement stream handler**

```go
// api/internal/jellyfin/stream.go
package jellyfin

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/storage"
)

var videoMimeTypes = map[string]string{
	"mp4": "video/mp4", "mkv": "video/x-matroska", "webm": "video/webm",
	"avi": "video/x-msvideo", "mov": "video/quicktime", "m4v": "video/x-m4v",
	"ts": "video/mp2t",
}

func (h *Handler) handleStream(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var fileID string

	switch typ {
	case "file":
		fileID = id
	case "episode":
		// Find the first media file for this episode
		files, err := h.queries.ListPlayableEpisodeFiles(ctx, id)
		if err != nil || len(files) == 0 {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "No media file for episode"})
		}
		fileID = files[0].ID
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Cannot stream this item type"})
	}

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Internal error"})
	}

	lib, err := h.queries.GetLibrary(ctx, mediaFile.LibraryID)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Library not found"})
	}

	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(mediaFile.Path)), ".")
	contentType := videoMimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Response().Header().Set("Content-Type", contentType)

	// Local files
	if lib.SourceType == "local" || lib.SourceType == "" {
		f, err := os.Open(mediaFile.Path)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not on disk"})
		}
		defer f.Close()
		stat, _ := f.Stat()
		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), f)
		return nil
	}

	// Remote files
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Cannot decrypt storage config"})
		}
		configJSON = decrypted
	}
	provider, err := storage.NewProvider(lib.SourceType, configJSON)
	if err != nil {
		return c.JSON(http.StatusServiceUnavailable, JellyfinError{Message: "Storage backend unavailable"})
	}
	defer provider.Close()

	reader, err := provider.Open(mediaFile.Path)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not accessible"})
	}
	defer reader.Close()

	if rs, ok := reader.(io.ReadSeeker); ok {
		stat, _ := provider.Stat(mediaFile.Path)
		http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), rs)
		return nil
	}

	c.Response().Header().Set("Content-Disposition", "inline")
	c.Response().WriteHeader(http.StatusOK)
	_, err = io.Copy(c.Response(), reader)
	return err
}
```

- [ ] **Step 2: Implement subtitles handler**

```go
// api/internal/jellyfin/subtitles.go
package jellyfin

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

func (h *Handler) handleGetSubtitle(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	indexStr := c.Param("index")

	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	// Resolve file ID
	var fileID string
	switch typ {
	case "file":
		fileID = id
	case "episode":
		files, err := h.queries.ListPlayableEpisodeFiles(c.Request().Context(), id)
		if err != nil || len(files) == 0 {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "No media file"})
		}
		fileID = files[0].ID
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Invalid item type"})
	}

	index, err := strconv.Atoi(indexStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid subtitle index"})
	}

	subs, err := h.queries.ListSubtitlesByMediaFile(c.Request().Context(), fileID)
	if err != nil || index >= len(subs) {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Subtitle not found"})
	}

	sub := subs[index]
	return c.File(sub.Path)
}
```

- [ ] **Step 3: Implement PlaybackInfo handler**

```go
// api/internal/jellyfin/playbackinfo.go
package jellyfin

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

func (h *Handler) handlePlaybackInfo(c echo.Context) error {
	itemIDEncoded := c.Param("itemId")
	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var sources []MediaSource

	switch typ {
	case "episode":
		sources = h.getMediaSourcesForEpisode(c, id)
	case "file":
		mf, err := h.queries.GetMediaFileByID(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		sources = []MediaSource{h.mediaFileToSource(mf)}
	case "anime":
		// Get first episode's files
		eps, err := h.queries.ListEpisodesByAnimeID(ctx, id)
		if err != nil || len(eps) == 0 {
			return c.JSON(http.StatusOK, PlaybackInfoResponse{MediaSources: []MediaSource{}})
		}
		sources = h.getMediaSourcesForEpisode(c, eps[0].ID)
	default:
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	// Add stream URLs to sources
	for i := range sources {
		sources[i].DirectStreamURL = "/jellyfin/Videos/" + itemIDEncoded + "/stream"
		sources[i].TranscodingURL = "/jellyfin/Videos/" + itemIDEncoded + "/master.m3u8"
	}

	return c.JSON(http.StatusOK, PlaybackInfoResponse{
		MediaSources:  sources,
		PlaySessionID: uuid.NewString(),
	})
}
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/jellyfin/stream.go api/internal/jellyfin/subtitles.go api/internal/jellyfin/playbackinfo.go
git commit -m "feat(jellyfin): add stream, subtitle, and playback info handlers"
```

---

### Task 8: Playback Progress + UserData (`playback.go`, `userdata.go`)

**Files:**
- Create: `api/internal/jellyfin/playback.go`
- Create: `api/internal/jellyfin/userdata.go`

- [ ] **Step 1: Implement playback session reporting**

```go
// api/internal/jellyfin/playback.go
package jellyfin

import (
	"database/sql"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handlePlaybackStart(c echo.Context) error {
	var req PlaybackStartRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}
	// Playback start is informational in Phase 1 — no action needed beyond acknowledgment.
	// Phase 5 (session management) will create a playback_session here.
	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) handlePlaybackProgress(c echo.Context) error {
	var req PlaybackProgressRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}

	userID := c.Get("userID").(string)

	typ, id, err := DecodeItemID(req.ItemID)
	if err != nil {
		return c.NoContent(http.StatusNoContent) // Don't fail on bad IDs
	}

	var episodeID string
	var mediaFileID string

	switch typ {
	case "episode":
		episodeID = id
		files, _ := h.queries.ListPlayableEpisodeFiles(c.Request().Context(), id)
		if len(files) > 0 {
			mediaFileID = files[0].ID
		}
	case "file":
		mediaFileID = id
		mf, _ := h.queries.GetMediaFileByID(c.Request().Context(), id)
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	}

	if episodeID == "" {
		return c.NoContent(http.StatusNoContent)
	}

	positionSeconds := int64(req.PositionTicks / 10_000_000)
	completed := int64(0)

	h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:              uuid.NewString(),
		UserID:          userID,
		EpisodeID:       episodeID,
		MediaFileID:     sql.NullString{String: mediaFileID, Valid: mediaFileID != ""},
		PositionSeconds: positionSeconds,
		Completed:       completed,
	})

	return c.NoContent(http.StatusNoContent)
}

func (h *Handler) handlePlaybackStop(c echo.Context) error {
	var req PlaybackStopRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, JellyfinError{Message: "Invalid request"})
	}

	userID := c.Get("userID").(string)
	typ, id, err := DecodeItemID(req.ItemID)
	if err != nil {
		return c.NoContent(http.StatusNoContent)
	}

	var episodeID string
	var mediaFileID string

	switch typ {
	case "episode":
		episodeID = id
		files, _ := h.queries.ListPlayableEpisodeFiles(c.Request().Context(), id)
		if len(files) > 0 {
			mediaFileID = files[0].ID
		}
	case "file":
		mediaFileID = id
		mf, _ := h.queries.GetMediaFileByID(c.Request().Context(), id)
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	}

	if episodeID == "" {
		return c.NoContent(http.StatusNoContent)
	}

	positionSeconds := int64(req.PositionTicks / 10_000_000)
	// Check if position is near end (>90%) to mark as completed
	completed := int64(0)

	h.queries.UpsertWatchProgress(c.Request().Context(), store.UpsertWatchProgressParams{
		ID:              uuid.NewString(),
		UserID:          userID,
		EpisodeID:       episodeID,
		MediaFileID:     sql.NullString{String: mediaFileID, Valid: mediaFileID != ""},
		PositionSeconds: positionSeconds,
		Completed:       completed,
	})

	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 2: Implement UserData handler (bidirectional sync)**

```go
// api/internal/jellyfin/userdata.go
package jellyfin

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *Handler) handleGetUserData(c echo.Context) error {
	userID := c.Get("userID").(string)
	itemIDEncoded := c.Param("itemId")

	typ, id, err := DecodeItemID(itemIDEncoded)
	if err != nil {
		return c.JSON(http.StatusNotFound, JellyfinError{Message: "Item not found"})
	}

	ctx := c.Request().Context()
	var episodeID string

	switch typ {
	case "episode":
		episodeID = id
	case "file":
		mf, err := h.queries.GetMediaFileByID(ctx, id)
		if err != nil {
			return c.JSON(http.StatusNotFound, JellyfinError{Message: "File not found"})
		}
		if mf.EpisodeID.Valid {
			episodeID = mf.EpisodeID.String
		}
	default:
		// For anime/library, return empty user data
		return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
	}

	if episodeID == "" {
		return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
	}

	progress, err := h.queries.GetWatchProgress(ctx, store.GetWatchProgressParams{
		UserID:    userID,
		EpisodeID: episodeID,
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusOK, UserItemData{Key: itemIDEncoded})
		}
		return c.JSON(http.StatusInternalServerError, JellyfinError{Message: "Internal error"})
	}

	return c.JSON(http.StatusOK, UserItemData{
		PlaybackPositionTicks: progress.PositionSeconds * 10_000_000,
		PlayCount:             int(progress.Completed),
		Played:                progress.Completed == 1,
		Key:                   itemIDEncoded,
	})
}
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/jellyfin/playback.go api/internal/jellyfin/userdata.go
git commit -m "feat(jellyfin): add bidirectional watch progress sync and playback reporting"
```

---

### Task 9: LAN Discovery (`discovery.go`)

**Files:**
- Create: `api/internal/jellyfin/discovery.go`

- [ ] **Step 1: Implement UDP discovery server**

```go
// api/internal/jellyfin/discovery.go
package jellyfin

import (
	"encoding/json"
	"log/slog"
	"net"
)

const discoveryPort = 7359
const discoveryQuery = "Who is JellyfinServer?"

// StartDiscoveryServer listens on UDP port 7359 for Jellyfin client discovery broadcasts.
// Runs in its own goroutine. Returns a function to stop the server.
func StartDiscoveryServer(serverID, serverName, address string) (stop func(), err error) {
	addr := net.UDPAddr{Port: discoveryPort}
	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		return nil, err
	}

	response, _ := json.Marshal(DiscoveryResponse{
		Address: address,
		ID:      serverID,
		Name:    serverName,
	})

	done := make(chan struct{})
	go func() {
		buf := make([]byte, 1024)
		for {
			select {
			case <-done:
				return
			default:
			}
			n, remote, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}
			msg := string(buf[:n])
			if msg == discoveryQuery {
				slog.Info("jellyfin discovery: client found us", "remote", remote.String())
				conn.WriteToUDP(response, remote)
			}
		}
	}()

	return func() {
		close(done)
		conn.Close()
	}, nil
}
```

- [ ] **Step 2: Commit**

```bash
git add api/internal/jellyfin/discovery.go
git commit -m "feat(jellyfin): add UDP LAN discovery server (port 7359)"
```

---

### Task 10: Router + Handler (`router.go`)

**Files:**
- Create: `api/internal/jellyfin/router.go`
- Modify: `api/internal/api/router.go` — add Jellyfin route registration

- [ ] **Step 1: Create Handler struct and RegisterRoutes**

```go
// api/internal/jellyfin/router.go
package jellyfin

import (
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
		serverID:      uuid.NewString(),
		imageCache:    cache,
		encryptionKey: encryptionKey,
	}, nil
}

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

	// Catch-all for unimplemented endpoints — return 501 with Jellyfin error format
	jf.Any("/*", func(c echo.Context) error {
		return c.JSON(501, JellyfinError{Message: "Not implemented"})
	})
}
```

- [ ] **Step 2: Register Jellyfin routes in main router**

Add to `api/internal/api/router.go` — at the end of `NewRouter()`, before `return e`:

```go
// Jellyfin-compatible API for external players (Infuse, VLC, Kodi)
jellyfinCacheDir := filepath.Join(os.TempDir(), "milmil", "jellyfin-images")
jellyfinHandler, err := jellyfin.NewHandler(store.New(db), cfg.JWTSecret, jellyfinCacheDir, cfg.EncryptionKey)
if err != nil {
	slog.Warn("jellyfin: failed to initialize", "err", err)
} else {
	jellyfinHandler.RegisterRoutes(e)
	slog.Info("Jellyfin API enabled")
}
```

Add these imports to `router.go`:
```go
"log/slog"
"os"
"path/filepath"
"github.com/milmil/api/internal/jellyfin"
```

- [ ] **Step 3: Start discovery server in main.go**

Find the main server startup in the codebase and add:

```go
// Start Jellyfin LAN discovery
stopDiscovery, err := jellyfin.StartDiscoveryServer(
    jellyfinHandler.ServerID(), "milmil", "http://"+listenAddr,
)
if err != nil {
    slog.Warn("jellyfin discovery: failed to start", "err", err)
} else {
    defer stopDiscovery()
    slog.Info("Jellyfin API enabled, discoverable on LAN", "port", 7359)
}
```

Add a `ServerID()` method to Handler:

```go
// Add to router.go
func (h *Handler) ServerID() string { return h.serverID }
```

- [ ] **Step 4: Verify everything compiles**

Run: `cd api && go build ./...`
Expected: success

- [ ] **Step 5: Commit**

```bash
git add api/internal/jellyfin/router.go api/internal/api/router.go
git commit -m "feat(jellyfin): register all routes and wire up LAN discovery"
```

---

### Task 11: Integration Tests (`jellyfin_test.go`)

**Files:**
- Create: `api/internal/jellyfin/jellyfin_test.go`

- [ ] **Step 1: Write connection flow integration test**

```go
// api/internal/jellyfin/jellyfin_test.go
package jellyfin_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/migrations"
)

func setupTestApp(t *testing.T) (*echo.Echo, *sql.DB) {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(nil, nil, c)
	return api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil, nil), database
}

func setupUser(t *testing.T, e *echo.Echo) string {
	t.Helper()
	body := `{"username":"testuser","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	return resp["token"].(string)
}

// authenticateViaJellyfin tests the full Jellyfin auth flow
func authenticateViaJellyfin(t *testing.T, e *echo.Echo) string {
	t.Helper()
	body := `{"Username":"testuser","Pw":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("jellyfin auth: want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	token, ok := resp["AccessToken"].(string)
	if !ok || token == "" {
		t.Fatal("jellyfin auth: missing AccessToken")
	}
	return token
}

func TestJellyfin_SystemInfoPublic(t *testing.T) {
	e, _ := setupTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/System/Info/Public", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var info map[string]any
	json.NewDecoder(rec.Body).Decode(&info)
	if info["ProductName"] != "milmil" {
		t.Errorf("want ProductName=milmil, got %v", info["ProductName"])
	}
}

func TestJellyfin_AuthenticateByName(t *testing.T) {
	e, _ := setupTestApp(t)
	// Create user first via milmil API
	setupUser(t, e)
	// Then authenticate via Jellyfin API
	token := authenticateViaJellyfin(t, e)
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestJellyfin_AuthenticateByName_WrongPassword(t *testing.T) {
	e, _ := setupTestApp(t)
	setupUser(t, e)

	body := `{"Username":"testuser","Pw":"wrongpassword"}`
	req := httptest.NewRequest(http.MethodPost, "/jellyfin/Users/AuthenticateByName", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
	var errResp map[string]any
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["Message"] != "Invalid username or password" {
		t.Errorf("want Jellyfin error message, got %v", errResp["Message"])
	}
}

func TestJellyfin_BrowseLibrary(t *testing.T) {
	e, database := setupTestApp(t)
	setupUser(t, e)
	token := authenticateViaJellyfin(t, e)

	// Insert a library and anime
	libID := "test-lib"
	database.Exec(`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES (?, ?, ?, 1, 60)`,
		libID, "Anime", "/media/anime")
	database.Exec(`INSERT INTO anime (id, library_id, title, status, genres, score) VALUES (?, ?, ?, ?, ?, ?)`,
		"anime-1", libID, "進擊的巨人", "completed", `["Action","Fantasy"]`, 8.5)

	// Browse via Jellyfin API
	req := httptest.NewRequest(http.MethodGet, "/jellyfin/Items", nil)
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	items := resp["Items"].([]any)
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	item := items[0].(map[string]any)
	if item["Name"] != "進擊的巨人" {
		t.Errorf("want 進擊的巨人, got %v", item["Name"])
	}
	if item["Type"] != "Series" {
		t.Errorf("want Type=Series, got %v", item["Type"])
	}
}

func TestJellyfin_StreamDirect(t *testing.T) {
	e, database := setupTestApp(t)
	setupUser(t, e)
	token := authenticateViaJellyfin(t, e)

	// Create a temp video file
	dir := t.TempDir()
	videoPath := filepath.Join(dir, "test.mp4")
	os.WriteFile(videoPath, []byte("fake video content"), 0644)

	// Insert library, anime, episode, media file
	libID := "test-lib"
	fileID := "test-file"
	database.Exec(`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES (?, ?, ?, 1, 60)`,
		libID, "Anime", dir)
	database.Exec(`INSERT INTO media_files (id, library_id, path, filename, size_bytes) VALUES (?, ?, ?, ?, ?)`,
		fileID, libID, videoPath, "test.mp4", 18)

	// Stream via Jellyfin API using file item ID
	fileItemID := "ZmlsZTp0ZXN0LWZpbGU=" // base64url("file:test-file")
	req := httptest.NewRequest(http.MethodGet, "/jellyfin/Videos/"+fileItemID+"/stream", nil)
	req.Header.Set("X-Emby-Authorization", `MediaBrowser Token="`+token+`"`)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestJellyfin_UnimplementedEndpoint(t *testing.T) {
	e, _ := setupTestApp(t)

	req := httptest.NewRequest(http.MethodGet, "/jellyfin/SomeUnknown/Endpoint", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != 501 {
		t.Fatalf("want 501, got %d", rec.Code)
	}
	var errResp map[string]any
	json.NewDecoder(rec.Body).Decode(&errResp)
	if errResp["Message"] != "Not implemented" {
		t.Errorf("want 'Not implemented', got %v", errResp["Message"])
	}
}
```

- [ ] **Step 2: Run all integration tests**

Run: `cd api && go test ./internal/jellyfin/... -v`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add api/internal/jellyfin/jellyfin_test.go
git commit -m "test(jellyfin): add integration tests for auth, browse, stream, and error handling"
```

---

### Task 12: README + Startup Log

**Files:**
- Modify: `README.md` — add External Player Support section
- Modify: startup code — add Jellyfin log line

- [ ] **Step 1: Update README**

Add to the Playback section in README.md, after "Watch progress":

```markdown
- **External player support** — connect Infuse, VLC, Kodi, and mpv via Jellyfin-compatible API with LAN auto-discovery
```

- [ ] **Step 2: Add startup log line**

In the main server startup (where `slog.Info("milmil started")` or similar exists), ensure the Jellyfin init logs:

```go
slog.Info("Jellyfin API enabled, discoverable on LAN", "port", 7359)
```

This was already added in Task 10 Step 3.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add external player support to README features"
```

---

## Verification Checklist

After all tasks are complete, verify the full Infuse connection flow:

- [ ] `GET /jellyfin/System/Info/Public` returns server info with `ProductName: "milmil"`
- [ ] `POST /jellyfin/Users/AuthenticateByName` with valid creds returns `AccessToken`
- [ ] `POST /jellyfin/Users/AuthenticateByName` with bad creds returns 401 with `{"Message": "Invalid username or password"}`
- [ ] `GET /jellyfin/Users/{id}/Views` returns library folders
- [ ] `GET /jellyfin/Items?ParentId=<library>` returns anime as Series items
- [ ] `GET /jellyfin/Items/{animeId}` returns Series detail with genres, score, image tags
- [ ] `GET /jellyfin/Shows/{animeId}/Episodes` returns episodes with IndexNumber
- [ ] `GET /jellyfin/Items/{id}/Images/Primary` proxies cover image from CDN
- [ ] `GET /jellyfin/Items/{id}/PlaybackInfo` returns MediaSources with codec info
- [ ] `GET /jellyfin/Videos/{id}/stream` serves video file with Range support
- [ ] `POST /jellyfin/Sessions/Playing/Progress` writes to watch_progress table
- [ ] `GET /jellyfin/Users/{id}/Items/{id}/UserData` returns PlaybackPositionTicks from watch_progress
- [ ] Unknown endpoints return 501 with `{"Message": "Not implemented"}`
- [ ] UDP discovery on port 7359 responds to "Who is JellyfinServer?"
- [ ] All tests pass: `cd api && go test ./internal/jellyfin/... -v`
