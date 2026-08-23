package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
	"github.com/pquerna/otp/totp"
)

type authSetupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authLoginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	DeviceName string `json:"device_name,omitempty"`
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

func (h *handler) handleAuthStatus(c *echo.Context) error {
	count, err := h.queries.CountUsers(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authStatusResponse{Initialized: count > 0})
}

func (h *handler) handleAuthSetup(c *echo.Context) error {
	var req authSetupRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password required")
	}
	if err := auth.CheckPasswordStrength(req.Password); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
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

	deviceName := auth.ParseUserAgent(c.Request().UserAgent())
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}
	_, err = h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          deviceName,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        user.ID,
		LastIp:        c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, authLoginResponse{
		Token: plaintext,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
}

func (h *handler) handleAuthLogin(c *echo.Context) error {
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

	if user.TwoFactorEnabled == 1 {
		return c.JSON(http.StatusOK, map[string]any{
			"requires_2fa": true,
			"user_id":      user.ID,
		})
	}

	h.sendLoginNotification(c, user.Username)

	deviceName := req.DeviceName
	if deviceName == "" {
		deviceName = auth.ParseUserAgent(c.Request().UserAgent())
	}
	return h.issueAPIToken(c, user.ID, user.Username, deviceName)
}

type authLogin2FARequest struct {
	UserID     string `json:"user_id"`
	Code       string `json:"code"`
	DeviceName string `json:"device_name,omitempty"`
}

func (h *handler) handleAuthLogin2FA(c *echo.Context) error {
	var req authLogin2FARequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.UserID == "" || req.Code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "user_id and code required")
	}

	ctx := c.Request().Context()
	user, err := h.queries.GetUserByID(ctx, req.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid credentials")
	}

	if !totp.Validate(req.Code, user.TotpSecret) {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid 2FA code")
	}

	h.sendLoginNotification(c, user.Username)

	deviceName := req.DeviceName
	if deviceName == "" {
		deviceName = auth.ParseUserAgent(c.Request().UserAgent())
	}
	return h.issueAPIToken(c, user.ID, user.Username, deviceName)
}

func (h *handler) handleAuthLogout(c *echo.Context) error {
	// API tokens are rows, so logging out means deleting the one this request
	// authenticated with. Returning 204 without doing so left the token valid
	// forever, which is exactly what a user clicking "log out" expects not to
	// happen on a shared or lost device.
	if err := h.queries.DeleteAPIToken(c.Request().Context(), store.DeleteAPITokenParams{
		ID:     getTokenID(c),
		UserID: getUserID(c),
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleAuthMe(c *echo.Context) error {
	user, err := h.queries.GetUserByID(c.Request().Context(), getUserID(c))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusUnauthorized, "user not found")
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authUserDTO{ID: user.ID, Username: user.Username})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// sendLoginNotification fires an auth.login notification via the notification service.
func (h *handler) sendLoginNotification(c *echo.Context, username string) {
	if h.notifier == nil {
		return
	}
	h.notifier.Send(c.Request().Context(), "auth.login", "Login Alert",
		fmt.Sprintf("Login from %s", c.RealIP()), "info",
		map[string]any{
			"ip":         c.RealIP(),
			"user_agent": c.Request().UserAgent(),
			"username":   username,
			"time":       time.Now().Format("2006-01-02 15:04:05"),
		})
}

// issueAPIToken creates a new API token for the device and returns it in the login response.
func (h *handler) issueAPIToken(c *echo.Context, userID, username, deviceName string) error {
	if len(deviceName) > 100 {
		deviceName = deviceName[:100]
	}
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}
	_, err = h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          deviceName,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        userID,
		LastIp:        c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authLoginResponse{
		Token: plaintext,
		User:  authUserDTO{ID: userID, Username: username},
	})
}

func (h *handler) handleChangePassword(c *echo.Context) error {
	var req changePasswordRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "current and new password required")
	}
	if len(req.NewPassword) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "password must be at least 8 characters")
	}

	ctx := c.Request().Context()
	userID := getUserID(c)

	user, err := h.queries.GetUserByID(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	if err := auth.CheckPassword(user.PasswordHash, req.CurrentPassword); err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "current password is incorrect")
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		return echo.ErrInternalServerError
	}

	if err := h.queries.UpdatePasswordHash(ctx, store.UpdatePasswordHashParams{
		PasswordHash: hash,
		ID:           userID,
	}); err != nil {
		return echo.ErrInternalServerError
	}

	// Changing a password is how someone reacts to a token having leaked, so it
	// has to end the other sessions too. API tokens are deleted outright; the
	// Jellyfin JWTs, which cannot be deleted, are invalidated by the version bump.
	if err := h.queries.DeleteOtherAPITokens(ctx, store.DeleteOtherAPITokensParams{
		UserID: userID,
		ID:     getTokenID(c),
	}); err != nil {
		return echo.ErrInternalServerError
	}
	if err := h.queries.BumpTokenVersion(ctx, userID); err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}
