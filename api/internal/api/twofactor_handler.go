package api

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
	"github.com/pquerna/otp/totp"
)

type twoFactorSetupResponse struct {
	Secret string `json:"secret"`
	QRCode string `json:"qr_code"` // base64-encoded PNG
	URL    string `json:"url"`     // otpauth:// URI
}

type twoFactorVerifyRequest struct {
	Code string `json:"code"`
}

type twoFactorStatusResponse struct {
	Enabled bool `json:"enabled"`
}

// POST /api/v1/auth/2fa/setup — generate a new TOTP secret and QR code
func (h *handler) handleTwoFactorSetup(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	user, err := h.queries.GetUserByID(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "milmil",
		AccountName: user.Username,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Store the secret (not yet enabled — user must verify first)
	if err := h.queries.SetTOTPSecret(ctx, store.SetTOTPSecretParams{
		TotpSecret: key.Secret(),
		ID:         userID,
	}); err != nil {
		return echo.ErrInternalServerError
	}

	// Generate QR code image
	img, err := key.Image(200, 200)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Encode to PNG then base64
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return echo.ErrInternalServerError
	}
	qrBase64 := base64.StdEncoding.EncodeToString(buf.Bytes())

	return c.JSON(http.StatusOK, twoFactorSetupResponse{
		Secret: key.Secret(),
		QRCode: qrBase64,
		URL:    key.URL(),
	})
}

// POST /api/v1/auth/2fa/verify — verify TOTP code and enable 2FA
func (h *handler) handleTwoFactorVerify(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	var req twoFactorVerifyRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "code is required")
	}

	user, err := h.queries.GetUserByID(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	if user.TotpSecret == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "2FA setup not started")
	}

	if !totp.Validate(req.Code, user.TotpSecret) {
		return echo.NewHTTPError(http.StatusUnauthorized, "invalid code")
	}

	// Enable 2FA
	if err := h.queries.EnableTwoFactor(ctx, store.EnableTwoFactorParams{
		TotpSecret: user.TotpSecret,
		ID:         userID,
	}); err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

// DELETE /api/v1/auth/2fa — disable 2FA
func (h *handler) handleTwoFactorDisable(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	if err := h.queries.DisableTwoFactor(ctx, userID); err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

// GET /api/v1/auth/2fa/status — check if 2FA is enabled
func (h *handler) handleTwoFactorStatus(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	user, err := h.queries.GetUserByID(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, twoFactorStatusResponse{
		Enabled: user.TwoFactorEnabled == 1,
	})
}
