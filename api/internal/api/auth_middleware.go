package api

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
)

const contextKeyUserID = "userID"

// jwtMiddleware validates Bearer tokens and sets the userID in the context.
func jwtMiddleware(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			userID, err := auth.VerifyToken(secret, strings.TrimPrefix(header, "Bearer "))
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}

// getUserID extracts the authenticated user ID from the Echo context.
func getUserID(c echo.Context) string {
	id, _ := c.Get(contextKeyUserID).(string)
	return id
}
