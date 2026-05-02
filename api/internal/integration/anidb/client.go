package anidb

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	DefaultManamiURL     = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json"
	DefaultAnimeListsURL = "https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list.xml"
	DefaultTitlesURL     = "https://anidb.net/api/anime-titles.xml.gz"
	userAgent            = "milmil-anidb-phase1/1.0"
	maxReadBytes         = 200 * 1024 * 1024
)

type Client interface {
	DownloadManami(ctx context.Context) ([]byte, error)
	DownloadAnimeLists(ctx context.Context) ([]byte, error)
	DownloadTitles(ctx context.Context) ([]byte, error)
}

type httpClient struct {
	http          *http.Client
	manamiURL     string
	animeListsURL string
	titlesURL     string
}

// NewClient returns a Client. Pass empty strings for any URL to use the
// upstream defaults. h may be nil to use http.DefaultClient.
func NewClient(h *http.Client, manamiURL, animeListsURL, titlesURL string) Client {
	if h == nil {
		h = http.DefaultClient
	}
	if manamiURL == "" {
		manamiURL = DefaultManamiURL
	}
	if animeListsURL == "" {
		animeListsURL = DefaultAnimeListsURL
	}
	if titlesURL == "" {
		titlesURL = DefaultTitlesURL
	}
	return &httpClient{http: h, manamiURL: manamiURL, animeListsURL: animeListsURL, titlesURL: titlesURL}
}

func (c *httpClient) DownloadManami(ctx context.Context) ([]byte, error) {
	return c.fetch(ctx, c.manamiURL)
}

func (c *httpClient) DownloadAnimeLists(ctx context.Context) ([]byte, error) {
	return c.fetch(ctx, c.animeListsURL)
}

func (c *httpClient) DownloadTitles(ctx context.Context) ([]byte, error) {
	return c.fetch(ctx, c.titlesURL)
}

func (c *httpClient) fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anidb: GET %s returned %d", url, resp.StatusCode)
	}

	var reader io.Reader = io.LimitReader(resp.Body, maxReadBytes)
	if isGzip(resp, url) {
		gr, err := gzip.NewReader(reader)
		if err != nil {
			return nil, fmt.Errorf("anidb: gzip decode %s: %w", url, err)
		}
		defer gr.Close()
		reader = gr
	}
	return io.ReadAll(reader)
}

func isGzip(resp *http.Response, url string) bool {
	if strings.EqualFold(resp.Header.Get("Content-Encoding"), "gzip") {
		return true
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "gzip") {
		return true
	}
	return strings.HasSuffix(strings.ToLower(url), ".gz")
}
