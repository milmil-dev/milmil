// Package anizip provides a client for the ani.zip API,
// which returns TVDB-sourced episode metadata (images, titles, etc.).
// This is the same source Seanime uses for episode thumbnails.
package anizip

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const baseURL = "https://api.ani.zip/v1"

// EpisodeTitle contains localized episode titles.
type EpisodeTitle struct {
	JA  string `json:"ja"`
	EN  string `json:"en"`
	JAT string `json:"x-jat"` // Romanization
}

// EpisodeImage contains thumbnail data for a single episode.
type EpisodeImage struct {
	Image   string       `json:"image"`
	Title   EpisodeTitle `json:"title"`
	Summary string       `json:"summary"`
	Runtime int          `json:"runtime"` // Duration in minutes
	AirDate string       `json:"airDate"`
}

// Response is the top-level ani.zip API response.
type Response struct {
	Episodes map[string]EpisodeImage `json:"episodes"`
}

// Client fetches episode metadata from ani.zip.
type Client struct {
	http *http.Client
}

// New creates a new ani.zip client.
func New() *Client {
	return &Client{
		http: &http.Client{Timeout: 10 * time.Second},
	}
}

// GetEpisodes fetches episode images/metadata by AniList ID.
func (c *Client) GetEpisodes(ctx context.Context, anilistID int) (*Response, error) {
	url := fmt.Sprintf("%s/episodes?anilist_id=%d", baseURL, anilistID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anizip: status %d", resp.StatusCode)
	}

	var result Response
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
