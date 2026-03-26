package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

// ─── Helpers ────────────────────────────────────────────────────────────────

type oauthCreds struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

func (h *handler) loadOAuthCreds(c echo.Context, settingsKey string) (*oauthCreds, error) {
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

func buildRedirectURI(c echo.Context, provider string) string {
	scheme := "http"
	if c.Request().TLS != nil || c.Request().Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s/api/v1/integrations/%s/callback", scheme, c.Request().Host, provider)
}

// ─── Bangumi ────────────────────────────────────────────────────────────────

func (h *handler) handleBangumiAuthURL(c echo.Context) error {
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

func (h *handler) handleBangumiCallback(c echo.Context) error {
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

	_, err = h.queries.UpsertSetting(c.Request().Context(), store.UpsertSettingParams{
		Key:   "bangumi_token",
		Value: string(body),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Redirect to frontend settings page
	return c.Redirect(http.StatusFound, "/settings")
}

func (h *handler) handleBangumiDisconnect(c echo.Context) error {
	err := h.queries.DeleteSetting(c.Request().Context(), "bangumi_token")
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleBangumiSync(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	// Check token exists
	tokenSetting, err := h.queries.GetSetting(ctx, "bangumi_token")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusBadRequest, "Bangumi not connected")
		}
		return echo.ErrInternalServerError
	}

	var tokenData map[string]any
	if err := json.Unmarshal([]byte(tokenSetting.Value), &tokenData); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "invalid token data")
	}
	accessToken, _ := tokenData["access_token"].(string)
	if accessToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid Bangumi token — please reconnect")
	}

	// Get completed watch progress
	progress, err := h.queries.ListCompletedWatchProgress(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	synced := 0
	errs := 0

	for _, wp := range progress {
		// Look up the episode to get anime_id, then anime to get bangumi_id
		episode, err := h.queries.GetEpisode(ctx, wp.EpisodeID)
		if err != nil {
			errs++
			continue
		}

		anime, err := h.queries.GetAnime(ctx, episode.AnimeID)
		if err != nil {
			errs++
			continue
		}

		if !anime.BangumiID.Valid || anime.BangumiID.Int64 == 0 {
			continue // no bangumi mapping
		}

		// Check if episode has bangumi_episode_id
		if !episode.BangumiEpisodeID.Valid || episode.BangumiEpisodeID.Int64 == 0 {
			continue
		}

		// POST to Bangumi API to mark episode as watched
		// PUT https://api.bgm.tv/v0/users/-/collections/-/episodes/{episode_id}
		bangumiURL := fmt.Sprintf("https://api.bgm.tv/v0/users/-/collections/-/episodes/%d", episode.BangumiEpisodeID.Int64)
		reqBody, _ := json.Marshal(map[string]int{"type": 2}) // 2 = watched
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, bangumiURL, bytes.NewReader(reqBody))
		if err != nil {
			errs++
			continue
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "milmil/1.0")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			errs++
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			synced++
		} else {
			errs++
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"synced": synced,
		"errors": errs,
		"total":  len(progress),
	})
}

// ─── AniList ────────────────────────────────────────────────────────────────

func (h *handler) handleAniListAuthURL(c echo.Context) error {
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

func (h *handler) handleAniListCallback(c echo.Context) error {
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

	_, err = h.queries.UpsertSetting(c.Request().Context(), store.UpsertSettingParams{
		Key:   "anilist_token",
		Value: string(body),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.Redirect(http.StatusFound, "/settings")
}

func (h *handler) handleAniListDisconnect(c echo.Context) error {
	err := h.queries.DeleteSetting(c.Request().Context(), "anilist_token")
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleAniListSync(c echo.Context) error {
	ctx := c.Request().Context()
	userID := getUserID(c)

	tokenSetting, err := h.queries.GetSetting(ctx, "anilist_token")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusBadRequest, "AniList not connected")
		}
		return echo.ErrInternalServerError
	}

	var tokenData map[string]any
	if err := json.Unmarshal([]byte(tokenSetting.Value), &tokenData); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "invalid token data")
	}
	accessToken, _ := tokenData["access_token"].(string)
	if accessToken == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid AniList token — please reconnect")
	}

	progress, err := h.queries.ListCompletedWatchProgress(ctx, userID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Group progress by anime to calculate episode counts
	type animeProgress struct {
		anilistID int64
		episodes  int
	}
	animeMap := make(map[string]*animeProgress)

	for _, wp := range progress {
		episode, err := h.queries.GetEpisode(ctx, wp.EpisodeID)
		if err != nil {
			continue
		}

		if _, ok := animeMap[episode.AnimeID]; !ok {
			anime, err := h.queries.GetAnime(ctx, episode.AnimeID)
			if err != nil {
				continue
			}
			if !anime.AnilistID.Valid || anime.AnilistID.Int64 == 0 {
				continue
			}
			animeMap[episode.AnimeID] = &animeProgress{
				anilistID: anime.AnilistID.Int64,
			}
		}
		if ap, ok := animeMap[episode.AnimeID]; ok {
			ap.episodes++
		}
	}

	synced := 0
	errs := 0

	for _, ap := range animeMap {
		// GraphQL mutation to update progress
		mutation := `mutation ($mediaId: Int, $progress: Int) {
			SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: CURRENT) {
				id
				progress
			}
		}`
		variables := map[string]any{
			"mediaId":  ap.anilistID,
			"progress": ap.episodes,
		}
		gqlBody, _ := json.Marshal(map[string]any{
			"query":     mutation,
			"variables": variables,
		})

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://graphql.anilist.co", bytes.NewReader(gqlBody))
		if err != nil {
			errs++
			continue
		}
		req.Header.Set("Authorization", "Bearer "+accessToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			errs++
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			synced++
		} else {
			errs++
		}
	}

	return c.JSON(http.StatusOK, map[string]any{
		"synced": synced,
		"errors": errs,
		"total":  len(animeMap),
	})
}
