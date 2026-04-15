package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

const defaultTraktURL = "https://api.trakt.tv"

// Trakt implements milmilsync.Provider against the Trakt API plus provides
// device-code OAuth flow helpers used by the handler layer.
type Trakt struct {
	http         *http.Client
	baseURL      string
	clientID     string
	clientSecret string
}

func NewTrakt(h *http.Client, baseURL, clientID, clientSecret string) *Trakt {
	if h == nil {
		h = http.DefaultClient
	}
	if baseURL == "" {
		baseURL = defaultTraktURL
	}
	return &Trakt{http: h, baseURL: baseURL, clientID: clientID, clientSecret: clientSecret}
}

func (p *Trakt) Name() milmilsync.ProviderName { return milmilsync.ProviderTrakt }

// --- Provider interface ---

func (p *Trakt) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
	if ids.Trakt == 0 {
		if ids.TMDB != 0 {
			return fmt.Errorf("%w: no trakt_show_id", milmilsync.ErrNeedsResolve)
		}
		return fmt.Errorf("trakt: no trakt_show_id and no tmdb_id")
	}

	episodes := make([]map[string]any, 0, op.Progress)
	for i := 1; i <= op.Progress; i++ {
		episodes = append(episodes, map[string]any{"number": i})
	}
	payload := map[string]any{
		"shows": []map[string]any{
			{
				"ids": map[string]any{"trakt": ids.Trakt},
				"seasons": []map[string]any{
					{"number": 1, "episodes": episodes},
				},
			},
		},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/sync/history", bytes.NewReader(body))
	if err != nil {
		return err
	}
	p.setHeaders(req, tok)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.http.Do(req)
	if err != nil {
		return &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return classifyTraktResponse(resp, raw, "push")
}

func (p *Trakt) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+"/sync/watched/shows", nil)
	if err != nil {
		return nil, err
	}
	p.setHeaders(req, tok)

	resp, err := p.http.Do(req)
	if err != nil {
		return nil, &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if err := classifyTraktResponse(resp, raw, "fetch"); err != nil {
		return nil, err
	}

	var out []struct {
		Plays         int       `json:"plays"`
		LastWatchedAt time.Time `json:"last_watched_at"`
		Show          struct {
			IDs struct {
				Trakt int64 `json:"trakt"`
				TMDB  int64 `json:"tmdb"`
			} `json:"ids"`
		} `json:"show"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("trakt fetch decode: %w", err)
	}

	entries := make([]milmilsync.RemoteEntry, 0, len(out))
	for _, e := range out {
		id := e.Show.IDs.TMDB
		if id == 0 {
			id = e.Show.IDs.Trakt
		}
		entries = append(entries, milmilsync.RemoteEntry{
			ProviderAnimeID: id,
			Status:          milmilsync.StatusWatching,
			Progress:        e.Plays,
			UpdatedAt:       e.LastWatchedAt,
		})
	}
	return entries, nil
}

func (p *Trakt) RefreshToken(ctx context.Context, creds milmilsync.OAuthCreds, refreshToken string) (milmilsync.RefreshedToken, error) {
	body, _ := json.Marshal(map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
		"client_id":     creds.ClientID,
		"client_secret": creds.ClientSecret,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/oauth/token", bytes.NewReader(body))
	if err != nil {
		return milmilsync.RefreshedToken{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.http.Do(req)
	if err != nil {
		return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	switch {
	case resp.StatusCode == 200:
		var out struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			ExpiresIn    int64  `json:"expires_in"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return milmilsync.RefreshedToken{}, fmt.Errorf("trakt refresh decode: %w", err)
		}
		return milmilsync.RefreshedToken{
			AccessToken:  out.AccessToken,
			RefreshToken: out.RefreshToken,
			ExpiresIn:    time.Duration(out.ExpiresIn) * time.Second,
		}, nil
	case resp.StatusCode == 400, resp.StatusCode == 401, resp.StatusCode == 403:
		return milmilsync.RefreshedToken{}, fmt.Errorf("%w: trakt refresh %d: %s", milmilsync.ErrNeedsReauth, resp.StatusCode, raw)
	case resp.StatusCode >= 500:
		return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: fmt.Errorf("trakt refresh %d: %s", resp.StatusCode, raw)}
	default:
		return milmilsync.RefreshedToken{}, fmt.Errorf("trakt refresh %d: %s", resp.StatusCode, raw)
	}
}

// --- TMDB → Trakt show id resolution ---

func (p *Trakt) SearchByTMDB(ctx context.Context, tmdbID int64) (int64, error) {
	url := fmt.Sprintf("%s/search/tmdb/%d?type=show", p.baseURL, tmdbID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	p.setHeaders(req, "")

	resp, err := p.http.Do(req)
	if err != nil {
		return 0, &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if err := classifyTraktResponse(resp, raw, "search"); err != nil {
		return 0, err
	}
	var out []struct {
		Show struct {
			IDs struct {
				Trakt int64 `json:"trakt"`
			} `json:"ids"`
		} `json:"show"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return 0, fmt.Errorf("trakt search decode: %w", err)
	}
	if len(out) == 0 || out[0].Show.IDs.Trakt == 0 {
		return 0, fmt.Errorf("trakt: no show for tmdb %d", tmdbID)
	}
	return out[0].Show.IDs.Trakt, nil
}

// --- Device code flow ---

// DeviceCodeResponse is the response body of POST /oauth/device/code.
type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURL string `json:"verification_url"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// DevicePollStatus is a discrete enum for the caller poll loop.
type DevicePollStatus int

const (
	DevicePollPending DevicePollStatus = iota
	DevicePollApproved
	DevicePollDenied
	DevicePollExpired
	DevicePollSlowDown
)

// DevicePollResult bundles status + token fields (populated when Approved).
type DevicePollResult struct {
	Status       DevicePollStatus
	AccessToken  string
	RefreshToken string
	ExpiresIn    time.Duration
}

func (p *Trakt) RequestDeviceCode(ctx context.Context) (DeviceCodeResponse, error) {
	body, _ := json.Marshal(map[string]string{"client_id": p.clientID})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/oauth/device/code", bytes.NewReader(body))
	if err != nil {
		return DeviceCodeResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.http.Do(req)
	if err != nil {
		return DeviceCodeResponse{}, &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		if resp.StatusCode >= 500 {
			return DeviceCodeResponse{}, &milmilsync.TransientError{Err: fmt.Errorf("trakt device code %d: %s", resp.StatusCode, raw)}
		}
		return DeviceCodeResponse{}, fmt.Errorf("trakt device code %d: %s", resp.StatusCode, raw)
	}
	var out DeviceCodeResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return DeviceCodeResponse{}, fmt.Errorf("trakt device code decode: %w", err)
	}
	return out, nil
}

func (p *Trakt) PollDeviceToken(ctx context.Context, deviceCode string) (DevicePollResult, error) {
	body, _ := json.Marshal(map[string]string{
		"code":          deviceCode,
		"client_id":     p.clientID,
		"client_secret": p.clientSecret,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/oauth/device/token", bytes.NewReader(body))
	if err != nil {
		return DevicePollResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.http.Do(req)
	if err != nil {
		return DevicePollResult{}, &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		var out struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			ExpiresIn    int64  `json:"expires_in"`
		}
		if err := json.Unmarshal(raw, &out); err != nil {
			return DevicePollResult{}, fmt.Errorf("trakt device token decode: %w", err)
		}
		return DevicePollResult{
			Status:       DevicePollApproved,
			AccessToken:  out.AccessToken,
			RefreshToken: out.RefreshToken,
			ExpiresIn:    time.Duration(out.ExpiresIn) * time.Second,
		}, nil
	case 400:
		return DevicePollResult{Status: DevicePollPending}, nil
	case 404:
		return DevicePollResult{Status: DevicePollExpired}, fmt.Errorf("trakt device token: invalid code")
	case 409:
		return DevicePollResult{Status: DevicePollApproved}, nil
	case 410:
		return DevicePollResult{Status: DevicePollExpired}, nil
	case 418:
		return DevicePollResult{Status: DevicePollDenied}, nil
	case 429:
		return DevicePollResult{Status: DevicePollSlowDown}, nil
	default:
		if resp.StatusCode >= 500 {
			return DevicePollResult{}, &milmilsync.TransientError{Err: fmt.Errorf("trakt device token %d: %s", resp.StatusCode, raw)}
		}
		return DevicePollResult{}, fmt.Errorf("trakt device token %d: %s", resp.StatusCode, raw)
	}
}

// --- helpers ---

func (p *Trakt) setHeaders(req *http.Request, tok string) {
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("trakt-api-key", p.clientID)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
}

func classifyTraktResponse(resp *http.Response, raw []byte, ctx string) error {
	switch resp.StatusCode {
	case 200, 201, 204:
		return nil
	case 429:
		secs, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
		if secs <= 0 {
			secs = 60
		}
		return &milmilsync.TransientError{
			Err:        fmt.Errorf("trakt %s rate-limited", ctx),
			RetryAfter: time.Duration(secs) * time.Second,
		}
	case 401, 403:
		return fmt.Errorf("%w: trakt %s %d: %s", milmilsync.ErrNeedsReauth, ctx, resp.StatusCode, raw)
	case 500, 502, 503, 504:
		return &milmilsync.TransientError{Err: fmt.Errorf("trakt %s %d: %s", ctx, resp.StatusCode, raw)}
	default:
		return fmt.Errorf("trakt %s: %d: %s", ctx, resp.StatusCode, raw)
	}
}
