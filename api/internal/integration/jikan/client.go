// Package jikan provides a client for the Jikan API (api.jikan.moe), an
// unofficial keyless mirror of MyAnimeList. It is used as an air-time
// fallback: MAL records a broadcast slot ("Mondays at 23:00 JST") for shows
// AniList has no airing schedule for.
package jikan

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const baseURL = "https://api.jikan.moe/v4"

// maxPages bounds the season sweep. A season runs ~60-90 TV entries at 25 per
// page; continuing shows add a couple more pages.
const maxPages = 6

// Title is one of an entry's names. Type is "Default" (romaji), "Japanese",
// "English" or "Synonym".
type Title struct {
	Type  string `json:"type"`
	Title string `json:"title"`
}

// Broadcast is MAL's weekly slot. Time is "HH:mm" in Timezone (Asia/Tokyo);
// both may be empty when MAL does not know the slot.
type Broadcast struct {
	Day      string `json:"day"`
	Time     string `json:"time"`
	Timezone string `json:"timezone"`
}

// Anime is a current-season entry with its broadcast slot.
type Anime struct {
	Titles    []Title   `json:"titles"`
	Broadcast Broadcast `json:"broadcast"`
}

// Client fetches season data from Jikan.
type Client interface {
	// CurrentSeason returns the airing season's entries, including shows
	// carried over from earlier seasons.
	CurrentSeason(ctx context.Context) ([]Anime, error)
}

type httpClient struct {
	http *http.Client
}

// New creates a Jikan client.
func New() Client {
	return &httpClient{http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *httpClient) CurrentSeason(ctx context.Context) ([]Anime, error) {
	var all []Anime
	for page := 1; page <= maxPages; page++ {
		batch, hasNext, err := c.seasonPage(ctx, page, true)
		if err != nil {
			// Jikan serves popular URLs from cache even while MyAnimeList
			// itself is unreachable, and the plain page is requested far more
			// often than the continuing variant — retry without it before
			// giving up. Losing carryover shows beats losing the whole rung.
			batch, hasNext, err = c.seasonPage(ctx, page, false)
		}
		if err != nil {
			if len(all) > 0 {
				break // return partial results
			}
			return nil, err
		}
		all = append(all, batch...)
		if !hasNext {
			break
		}
	}
	return all, nil
}

func (c *httpClient) seasonPage(ctx context.Context, page int, continuing bool) ([]Anime, bool, error) {
	url := fmt.Sprintf("%s/seasons/now?page=%d", baseURL, page)
	if continuing {
		url = fmt.Sprintf("%s/seasons/now?continuing=true&page=%d", baseURL, page)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, false, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("jikan: status %d", resp.StatusCode)
	}

	var result struct {
		Pagination struct {
			HasNextPage bool `json:"has_next_page"`
		} `json:"pagination"`
		Data []Anime `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, false, err
	}
	return result.Data, result.Pagination.HasNextPage, nil
}
