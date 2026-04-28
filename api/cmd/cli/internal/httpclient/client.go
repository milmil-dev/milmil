// Package httpclient is the milmil CLI's thin HTTP client wrapper. It signs
// every request with a Bearer API token and decodes JSON responses. 4xx/5xx
// responses are surfaced as structured errors so callers can distinguish
// authentication failures from server errors.
package httpclient

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const userAgent = "milmil-cli/0.1.0"

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

// HTTPError is returned for 4xx/5xx responses. Callers should errors.As
// against it when they want to react to specific status codes.
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("server returned %d: %s", e.Status, e.Body)
}

// IsUnauthorized reports whether err is an HTTP 401 from the server.
func IsUnauthorized(err error) bool {
	var httpErr *HTTPError
	return errors.As(err, &httpErr) && httpErr.Status == http.StatusUnauthorized
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Do performs the request and returns the raw response. Caller is
// responsible for closing the body.
func (c *Client) Do(method, path string, body any, query url.Values) (*http.Response, error) {
	u := c.BaseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u, reader)
	if err != nil {
		return nil, err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	req.Header.Set("User-Agent", userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.HTTP.Do(req)
}

// DoJSON performs the request, decodes a JSON body into out (when non-nil),
// and returns *HTTPError for non-2xx responses.
func (c *Client) DoJSON(method, path string, body any, query url.Values, out any) error {
	resp, err := c.Do(method, path, body, query)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return &HTTPError{Status: resp.StatusCode, Body: string(raw)}
	}
	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
