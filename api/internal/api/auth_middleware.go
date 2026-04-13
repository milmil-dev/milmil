package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

const contextKeyUserID = "userID"

// authMiddleware validates Bearer tokens (JWT or API token) and sets the userID in context.
func authMiddleware(secret string, queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			token := strings.TrimPrefix(header, "Bearer ")
			userID, err := resolveToken(c, secret, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}

// authMiddlewareWithQueryParam is like authMiddleware but also accepts ?token= as fallback.
func authMiddlewareWithQueryParam(secret string, queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			token := ""
			if strings.HasPrefix(header, "Bearer ") {
				token = strings.TrimPrefix(header, "Bearer ")
			}
			if token == "" {
				token = c.QueryParam("token")
			}
			if token == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			userID, err := resolveToken(c, secret, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}

// resolveToken checks if the token is an API token (mlml_ prefix) or JWT, and returns the userID.
func resolveToken(c echo.Context, jwtSecret string, queries *store.Queries, token string) (string, error) {
	if auth.IsAPIToken(token) {
		hash := auth.HashAPIToken(token)
		apiToken, err := queries.GetAPITokenByHash(c.Request().Context(), hash)
		if err != nil {
			return "", err
		}
		// Fire-and-forget last_used_at update (use background context since request ctx will be cancelled)
		go func() {
			if err := queries.UpdateAPITokenLastUsed(context.Background(), apiToken.ID); err != nil {
				slog.Debug("failed to update api token last_used_at", "err", err)
			}
		}()
		return apiToken.UserID, nil
	}
	return auth.VerifyToken(jwtSecret, token)
}

// getUserID extracts the authenticated user ID from the Echo context.
func getUserID(c echo.Context) string {
	id, _ := c.Get(contextKeyUserID).(string)
	return id
}
