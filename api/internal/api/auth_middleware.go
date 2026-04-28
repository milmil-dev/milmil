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
const contextKeyTokenID = "tokenID"
const contextKeyTokenName = "tokenName"

// authMiddleware validates API tokens and sets the userID in context.
func authMiddleware(queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			token := strings.TrimPrefix(header, "Bearer ")
			apiToken, err := resolveToken(c, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, apiToken.UserID)
			c.Set(contextKeyTokenID, apiToken.ID)
			c.Set(contextKeyTokenName, apiToken.Name)
			go updateTokenActivity(queries, apiToken.ID, c.RealIP(), c.Request().UserAgent())
			return next(c)
		}
	}
}

// authMiddlewareWithQueryParam is like authMiddleware but also accepts ?token= as fallback.
func authMiddlewareWithQueryParam(queries *store.Queries) echo.MiddlewareFunc {
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
			apiToken, err := resolveToken(c, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, apiToken.UserID)
			c.Set(contextKeyTokenID, apiToken.ID)
			c.Set(contextKeyTokenName, apiToken.Name)
			go updateTokenActivity(queries, apiToken.ID, c.RealIP(), c.Request().UserAgent())
			return next(c)
		}
	}
}

// resolveToken validates an API token by hash lookup.
func resolveToken(c echo.Context, queries *store.Queries, token string) (store.ApiToken, error) {
	if !auth.IsAPIToken(token) {
		return store.ApiToken{}, echo.NewHTTPError(http.StatusUnauthorized, "invalid token format")
	}
	hash := auth.HashAPIToken(token)
	return queries.GetAPITokenByHash(c.Request().Context(), hash)
}

// updateTokenActivity updates last_used_at, last_ip, and last_user_agent.
func updateTokenActivity(queries *store.Queries, tokenID, ip, userAgent string) {
	if err := queries.UpdateAPITokenActivity(context.Background(), store.UpdateAPITokenActivityParams{
		LastIp:        ip,
		LastUserAgent: userAgent,
		ID:            tokenID,
	}); err != nil {
		slog.Debug("failed to update api token activity", "err", err)
	}
}

// getUserID extracts the authenticated user ID from the Echo context.
func getUserID(c echo.Context) string {
	id, _ := c.Get(contextKeyUserID).(string)
	return id
}

// getTokenID extracts the current API token ID from the Echo context.
func getTokenID(c echo.Context) string {
	id, _ := c.Get(contextKeyTokenID).(string)
	return id
}

// getTokenName extracts the current API token's display name from the Echo
// context. Used by the audit middleware as the agent_label so revoking the
// token does not erase historical attribution.
func getTokenName(c echo.Context) string {
	name, _ := c.Get(contextKeyTokenName).(string)
	return name
}
