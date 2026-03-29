package tmdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

var (
	ErrNotFound    = errors.New("tmdb: not found")
	ErrRateLimited = errors.New("tmdb: rate limited")
	ErrUnavailable = errors.New("tmdb: service unavailable")
)

const defaultBaseURL = "https://api.themoviedb.org"

type Client interface {
	SearchTV(ctx context.Context, query string, language string) ([]TVShow, error)
	GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error)
	GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error)
}

type httpClient struct {
	http    *http.Client
	apiKey  string
	baseURL string
}

func NewClient(c *http.Client, apiKey string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: defaultBaseURL}
}

func NewClientWithURL(c *http.Client, apiKey string, baseURL string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: baseURL}
}

func (c *httpClient) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	if params == nil {
		params = url.Values{}
	}
	params.Set("api_key", c.apiKey)

	reqURL := c.baseURL + path + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return data, nil
	case http.StatusNotFound:
		return nil, ErrNotFound
	case http.StatusTooManyRequests:
		return nil, ErrRateLimited
	default:
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}
}

func (c *httpClient) SearchTV(ctx context.Context, query string, language string) ([]TVShow, error) {
	params := url.Values{
		"query":    {query},
		"language": {language},
	}
	data, err := c.get(ctx, "/3/search/tv", params)
	if err != nil {
		return nil, err
	}
	var resp searchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Results, nil
}

func (c *httpClient) GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error) {
	data, err := c.get(ctx, "/3/tv/"+strconv.Itoa(tvID)+"/external_ids", nil)
	if err != nil {
		return nil, err
	}
	var ids ExternalIDs
	if err := json.Unmarshal(data, &ids); err != nil {
		return nil, err
	}
	return &ids, nil
}

func (c *httpClient) GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error) {
	params := url.Values{"language": {language}}
	path := "/3/tv/" + strconv.Itoa(tvID) + "/season/" + strconv.Itoa(seasonNumber)
	data, err := c.get(ctx, path, params)
	if err != nil {
		return nil, err
	}
	var season Season
	if err := json.Unmarshal(data, &season); err != nil {
		return nil, err
	}
	return &season, nil
}
