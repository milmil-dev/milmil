// Package bilibili provides a client for Bilibili's public bangumi timeline
// API, which lists each day's episode drops with their publish times. It is
// the only reliable air-time source for donghua (国创) that Bilibili streams
// exclusively, and needs no API key.
package bilibili

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const baseURL = "https://api.bilibili.com/pgc/web/timeline"

// Timeline type filters. The endpoint serves one category per request.
const (
	TypeAnime    = 1 // 番剧 — licensed Japanese anime
	TypeGuochuan = 4 // 国创 — Chinese animation
)

// Episode is one scheduled drop from the timeline. Titles are simplified
// Chinese, matching Bangumi's name_cn. PubTS is the drop's unix timestamp.
type Episode struct {
	Title  string `json:"title"`
	PubTS  int64  `json:"pub_ts"`
	SeenAt string `json:"pub_time"` // "HH:mm" in China Standard Time; prefer PubTS
}

// Client fetches the Bilibili bangumi timeline.
type Client interface {
	// Timeline returns the week's scheduled episodes for both the anime and
	// guochuang categories, flattened.
	Timeline(ctx context.Context) ([]Episode, error)
}

type httpClient struct {
	http *http.Client
}

// New creates a Bilibili timeline client.
func New() Client {
	return &httpClient{http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *httpClient) Timeline(ctx context.Context) ([]Episode, error) {
	var all []Episode
	var lastErr error
	for _, t := range []int{TypeAnime, TypeGuochuan} {
		eps, err := c.timeline(ctx, t)
		if err != nil {
			lastErr = err
			continue
		}
		all = append(all, eps...)
	}
	if len(all) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return all, nil
}

func (c *httpClient) timeline(ctx context.Context, types int) ([]Episode, error) {
	url := fmt.Sprintf("%s?types=%d&before=6&after=6", baseURL, types)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// The API rejects requests without a browser-ish User-Agent.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bilibili: status %d", resp.StatusCode)
	}

	var result struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Result  []struct {
			Episodes []Episode `json:"episodes"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("bilibili: code %d: %s", result.Code, result.Message)
	}

	var eps []Episode
	for _, day := range result.Result {
		eps = append(eps, day.Episodes...)
	}
	return eps, nil
}
