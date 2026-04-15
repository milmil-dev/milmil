package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
	"github.com/milmil/api/internal/sync/providers"
)

func (h *handler) traktProvider() (*providers.Trakt, error) {
	if h.syncSvc == nil {
		return nil, errors.New("sync service not available")
	}
	prov := h.syncSvc.ProviderByName(milmilsync.ProviderTrakt)
	if prov == nil {
		return nil, errors.New("trakt provider not registered")
	}
	t, ok := prov.(*providers.Trakt)
	if !ok {
		return nil, errors.New("trakt provider type mismatch")
	}
	return t, nil
}

func (h *handler) handleTraktDeviceCode(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	prov, err := h.traktProvider()
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	dc, err := prov.RequestDeviceCode(ctx)
	if err != nil {
		slog.Warn("trakt device code", "err", err)
		return echo.ErrBadGateway
	}

	payload, _ := json.Marshal(map[string]any{
		"device_code": dc.DeviceCode,
		"expires_at":  time.Now().Add(time.Duration(dc.ExpiresIn) * time.Second).UTC().Format(time.RFC3339),
	})
	if _, err := h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key: "trakt_device_code_" + userID, Value: string(payload),
	}); err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, map[string]any{
		"user_code":        dc.UserCode,
		"verification_url": dc.VerificationURL,
		"expires_in":       dc.ExpiresIn,
		"poll_interval":    dc.Interval,
	})
}

func (h *handler) handleTraktPoll(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	setting, err := h.queries.GetSetting(ctx, "trakt_device_code_"+userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusGone, "no device code; restart flow")
		}
		return echo.ErrInternalServerError
	}

	var stored struct {
		DeviceCode string `json:"device_code"`
		ExpiresAt  string `json:"expires_at"`
	}
	if err := json.Unmarshal([]byte(setting.Value), &stored); err != nil {
		return echo.ErrInternalServerError
	}
	if exp, err := time.Parse(time.RFC3339, stored.ExpiresAt); err == nil && time.Now().After(exp) {
		_ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
		return echo.NewHTTPError(http.StatusGone, "device code expired")
	}

	prov, err := h.traktProvider()
	if err != nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, err.Error())
	}

	result, err := prov.PollDeviceToken(ctx, stored.DeviceCode)
	if err != nil {
		slog.Warn("trakt poll", "err", err)
		return echo.ErrBadGateway
	}

	switch result.Status {
	case providers.DevicePollPending, providers.DevicePollSlowDown:
		return c.JSON(http.StatusAccepted, map[string]string{"status": "pending"})

	case providers.DevicePollExpired:
		_ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
		return echo.NewHTTPError(http.StatusGone, "device code expired")

	case providers.DevicePollDenied:
		_ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
		return echo.NewHTTPError(http.StatusForbidden, "device code denied")

	case providers.DevicePollApproved:
		tokenPayload, _ := json.Marshal(map[string]any{
			"access_token":  result.AccessToken,
			"refresh_token": result.RefreshToken,
			"expires_in":    int64(result.ExpiresIn.Seconds()),
			"expires_at":    time.Now().Add(result.ExpiresIn).UTC().Format(time.RFC3339),
		})
		if _, err := h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
			Key: "trakt_token", Value: string(tokenPayload),
		}); err != nil {
			return echo.ErrInternalServerError
		}
		_ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
		if err := h.syncSvc.EnqueueImport(ctx, userID, milmilsync.ProviderTrakt); err != nil {
			slog.Warn("trakt import enqueue", "err", err)
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "approved"})
	}
	return echo.ErrInternalServerError
}

func (h *handler) handleTraktDisconnect(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)
	if err := h.queries.DeleteSetting(ctx, "trakt_token"); err != nil {
		return echo.ErrInternalServerError
	}
	if h.syncSvc != nil {
		_ = h.syncSvc.Disconnect(ctx, userID, milmilsync.ProviderTrakt)
	}
	return c.NoContent(http.StatusNoContent)
}
