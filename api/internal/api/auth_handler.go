package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

type authSetupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authUserDTO struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

type authLoginResponse struct {
	Token string      `json:"token"`
	User  authUserDTO `json:"user"`
}

type authStatusResponse struct {
	Initialized bool `json:"initialized"`
}

func (h *handler) handleAuthStatus(c echo.Context) error {
	count, err := h.queries.CountUsers(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authStatusResponse{Initialized: count > 0})
}

func (h *handler) handleAuthSetup(c echo.Context) error {
	var req authSetupRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password required")
	}
	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	count, err := h.queries.CountUsers(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	if count > 0 {
		return echo.NewHTTPError(http.StatusForbidden, "already initialized")
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		return echo.ErrInternalServerError
	}
	user, err := h.queries.CreateUser(c.Request().Context(), store.CreateUserParams{
		ID:           uuid.NewString(),
		Username:     req.Username,
		PasswordHash: hash,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	token, err := auth.SignToken(h.cfg.JWTSecret, user.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, authLoginResponse{
		Token: token,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
}

func (h *handler) handleAuthLogin(c echo.Context) error {
	var req authLoginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password required")
	}

	user, err := h.queries.GetUserByUsername(c.Request().Context(), req.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
		}
		return echo.ErrInternalServerError
	}

	if err := auth.CheckPassword(user.PasswordHash, req.Password); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	token, err := auth.SignToken(h.cfg.JWTSecret, user.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authLoginResponse{
		Token: token,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
}

func (h *handler) handleAuthLogout(c echo.Context) error {
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleAuthMe(c echo.Context) error {
	user, err := h.queries.GetUserByID(c.Request().Context(), getUserID(c))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authUserDTO{ID: user.ID, Username: user.Username})
}
