package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v5"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
)

// ─── Helpers ────────────────────────────────────────────────────────────────

type oauthCreds struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

func (h *handler) loadOAuthCreds(c *echo.Context, settingsKey string) (*oauthCreds, error) {
	setting, err := h.queries.GetSetting(c.Request().Context(), settingsKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("not configured")
		}
		return nil, err
	}
	var creds oauthCreds
	if err := json.Unmarshal([]byte(setting.Value), &creds); err != nil {
		return nil, fmt.Errorf("invalid credentials JSON")
	}
	if creds.ClientID == "" {
		return nil, fmt.Errorf("client_id is empty")
	}
	return &creds, nil
}

func buildRedirectURI(c *echo.Context, provider string) string {
	scheme := "http"
	if c.Request().TLS != nil || c.Request().Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/api/v1/integrations/%s/callback", scheme, c.Request().Host, provider)
}

// ─── Bangumi ────────────────────────────────────────────────────────────────

func (h *handler) handleBangumiAuthURL(c *echo.Context) error {
	creds, err := h.loadOAuthCreds(c, "bangumi_oauth")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Bangumi OAuth not configured: "+err.Error())
	}

	redirectURI := buildRedirectURI(c, "bangumi")
	authURL := fmt.Sprintf(
		"https://bgm.tv/oauth/authorize?client_id=%s&response_type=code&redirect_uri=%s",
		url.QueryEscape(creds.ClientID),
		url.QueryEscape(redirectURI),
	)

	return c.JSON(http.StatusOK, map[string]string{"url": authURL})
}

func (h *handler) handleBangumiCallback(c *echo.Context) error {
	ctx := c.Request().Context()
	code := c.QueryParam("code")
	if code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing code parameter")
	}

	creds, err := h.loadOAuthCreds(c, "bangumi_oauth")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Bangumi OAuth not configured: "+err.Error())
	}

	redirectURI := buildRedirectURI(c, "bangumi")

	// Exchange code for token
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", creds.ClientID)
	form.Set("client_secret", creds.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)

	resp, err := http.PostForm("https://bgm.tv/oauth/access_token", form)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to exchange code: "+err.Error())
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return echo.NewHTTPError(http.StatusBadGateway, "Bangumi token exchange failed: "+string(body))
	}

	// Store the full token response
	if !json.Valid(body) {
		return echo.NewHTTPError(http.StatusBadGateway, "invalid token response from Bangumi")
	}

	_, err = h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   "bangumi_token",
		Value: string(body),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Kick off an initial import now that the user is connected.
	if h.syncSvc != nil {
		userID := getUserID(c)
		if err := h.syncSvc.EnqueueImport(ctx, userID, milmilsync.ProviderBangumi); err != nil {
			slog.Warn("sync: enqueue import", "provider", "bangumi", "err", err)
		}
	}

	// Redirect to frontend settings page
	return c.Redirect(http.StatusFound, "/settings")
}

func (h *handler) handleBangumiDisconnect(c *echo.Context) error {
	ctx := c.Request().Context()
	err := h.queries.DeleteSetting(ctx, "bangumi_token")
	if err != nil {
		return echo.ErrInternalServerError
	}
	if h.syncSvc != nil {
		userID := getUserID(c)
		_ = h.syncSvc.Disconnect(ctx, userID, milmilsync.ProviderBangumi)
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleBangumiSync(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)
	if h.syncSvc == nil {
		return echo.ErrInternalServerError
	}
	n, err := h.syncSvc.FlushUser(ctx, userID, milmilsync.ProviderBangumi)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{"enqueued": n})
}

// ─── AniList ────────────────────────────────────────────────────────────────

func (h *handler) handleAniListAuthURL(c *echo.Context) error {
	creds, err := h.loadOAuthCreds(c, "anilist_oauth")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "AniList OAuth not configured: "+err.Error())
	}

	redirectURI := buildRedirectURI(c, "anilist")
	authURL := fmt.Sprintf(
		"https://anilist.co/api/v2/oauth/authorize?client_id=%s&response_type=code&redirect_uri=%s",
		url.QueryEscape(creds.ClientID),
		url.QueryEscape(redirectURI),
	)

	return c.JSON(http.StatusOK, map[string]string{"url": authURL})
}

func (h *handler) handleAniListCallback(c *echo.Context) error {
	ctx := c.Request().Context()
	code := c.QueryParam("code")
	if code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing code parameter")
	}

	creds, err := h.loadOAuthCreds(c, "anilist_oauth")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "AniList OAuth not configured: "+err.Error())
	}

	redirectURI := buildRedirectURI(c, "anilist")

	// Exchange code for token (JSON body)
	reqBody, _ := json.Marshal(map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     creds.ClientID,
		"client_secret": creds.ClientSecret,
		"redirect_uri":  redirectURI,
		"code":          code,
	})

	resp, err := http.Post("https://anilist.co/api/v2/oauth/token", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to exchange code: "+err.Error())
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return echo.NewHTTPError(http.StatusBadGateway, "AniList token exchange failed: "+string(body))
	}

	if !json.Valid(body) {
		return echo.NewHTTPError(http.StatusBadGateway, "invalid token response from AniList")
	}

	_, err = h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   "anilist_token",
		Value: string(body),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	if h.syncSvc != nil {
		userID := getUserID(c)
		if err := h.syncSvc.EnqueueImport(ctx, userID, milmilsync.ProviderAniList); err != nil {
			slog.Warn("sync: enqueue import", "provider", "anilist", "err", err)
		}
	}

	return c.Redirect(http.StatusFound, "/settings")
}

func (h *handler) handleAniListDisconnect(c *echo.Context) error {
	ctx := c.Request().Context()
	err := h.queries.DeleteSetting(ctx, "anilist_token")
	if err != nil {
		return echo.ErrInternalServerError
	}
	if h.syncSvc != nil {
		userID := getUserID(c)
		_ = h.syncSvc.Disconnect(ctx, userID, milmilsync.ProviderAniList)
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleAniListSync(c *echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)
	if h.syncSvc == nil {
		return echo.ErrInternalServerError
	}
	n, err := h.syncSvc.FlushUser(ctx, userID, milmilsync.ProviderAniList)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{"enqueued": n})
}
