package jellyfin

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
)

type authenticateRequest struct {
	Username string `json:"Username"`
	Pw       string `json:"Pw"`
}

func (h *Handler) handleAuthenticateByName(c *echo.Context) error {
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

	token, err := auth.SignToken(h.jwtSecret, user.ID, user.TokenVersion)
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
