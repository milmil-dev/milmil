package jellyfin

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
)

// EmbyAuthMiddleware parses X-Emby-Authorization or Authorization headers
// with the MediaBrowser token scheme used by Jellyfin clients.
// Format: MediaBrowser Token="<jwt>", Client="Infuse", Device="iPhone", ...
func EmbyAuthMiddleware(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			token := extractEmbyToken(c.Request())
			if token == "" {
				return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Missing authentication token"})
			}

			userID, err := auth.VerifyToken(secret, token)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, JellyfinError{Message: "Invalid or expired token"})
			}
			c.Set("userID", userID)

			start := time.Now()
			err = next(c)
			_, status := echo.ResolveResponseStatus(c.Response(), err)
			slog.Info("jellyfin request",
				"method", c.Request().Method,
				"path", c.Request().URL.Path,
				"status", status,
				"duration_ms", time.Since(start).Milliseconds(),
				"client", extractEmbyParam(c.Request(), "Client"),
			)
			return err
		}
	}
}

// extractEmbyToken parses the JWT from X-Emby-Authorization or Authorization headers.
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
		return func(c *echo.Context) error {
			start := time.Now()
			err := next(c)
			_, status := echo.ResolveResponseStatus(c.Response(), err)
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
