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
	"strings"
)

// sanitizeURLError strips the query string from a *url.Error's URL field so
// transport-layer failures (DNS, TLS, connection refused) don't leak the
// api_key= query parameter into logs. Other error types are returned as-is.
func sanitizeURLError(err error) error {
	var ue *url.Error
	if !errors.As(err, &ue) {
		return err
	}
	if i := strings.IndexByte(ue.URL, '?'); i >= 0 {
		ue.URL = ue.URL[:i] + "?[redacted]"
	}
	return ue
}

var (
	ErrNotFound     = errors.New("tmdb: not found")
	ErrRateLimited  = errors.New("tmdb: rate limited")
	ErrUnavailable  = errors.New("tmdb: service unavailable")
	ErrUnauthorized = errors.New("tmdb: invalid credentials")
)

const defaultBaseURL = "https://api.themoviedb.org"

type Client interface {
	SearchTV(ctx context.Context, query string, language string) ([]TVShow, error)
	GetTVDetails(ctx context.Context, tvID int, language string) (*TVShow, error)
	GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error)
	GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error)
	Ping(ctx context.Context) error
}

type httpClient struct {
	http        *http.Client
	apiKey      string
	accessToken string
	baseURL     string
}

func NewClient(c *http.Client, apiKey string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: defaultBaseURL}
}

func NewClientWithURL(c *http.Client, apiKey string, baseURL string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: baseURL}
}

func NewClientWithAccessToken(c *http.Client, accessToken string) Client {
	return &httpClient{http: c, accessToken: accessToken, baseURL: defaultBaseURL}
}

func NewClientWithURLAndAccessToken(c *http.Client, accessToken string, baseURL string) Client {
	return &httpClient{http: c, accessToken: accessToken, baseURL: baseURL}
}

func NewClientWithAuth(c *http.Client, auth Auth) Client {
	if auth.AccessToken != "" {
		return NewClientWithAccessToken(c, auth.AccessToken)
	}
	return NewClient(c, auth.APIKey)
}

func (c *httpClient) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	if params == nil {
		params = url.Values{}
	}
	if c.accessToken == "" {
		params.Set("api_key", c.apiKey)
	}

	reqURL := c.baseURL + path + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	if c.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.accessToken)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, sanitizeURLError(err))
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return data, nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, ErrUnauthorized
	case http.StatusNotFound:
		return nil, ErrNotFound
	case http.StatusTooManyRequests:
		return nil, ErrRateLimited
	default:
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}
}

func (c *httpClient) Ping(ctx context.Context) error {
	_, err := c.get(ctx, "/3/authentication", nil)
	return err
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

func (c *httpClient) GetTVDetails(ctx context.Context, tvID int, language string) (*TVShow, error) {
	params := url.Values{}
	if language != "" {
		params.Set("language", language)
	}
	data, err := c.get(ctx, "/3/tv/"+strconv.Itoa(tvID), params)
	if err != nil {
		return nil, err
	}
	var show TVShow
	if err := json.Unmarshal(data, &show); err != nil {
		return nil, err
	}
	return &show, nil
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
