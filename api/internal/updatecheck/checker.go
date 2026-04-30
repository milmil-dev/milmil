// Package updatecheck polls GitHub releases for the configured repo and
// caches the result in memory with a TTL. Check is the synchronous,
// cache-first read API; the background polling loop (Run) lands in a
// follow-up commit.
package updatecheck

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// Result is the parsed-and-trimmed view of GitHub's "latest release" payload
// that the rest of milmil cares about.
type Result struct {
	Latest      string // e.g. "0.1.8" — leading "v" stripped
	ReleaseURL  string
	PublishedAt time.Time
}

// Notifier is invoked from the background ticker when a NEWER version is
// observed (different from the previously-cached value). Wiring (e.g. WS
// broadcast) lives in the caller.
type Notifier func(r Result)

// Config controls a Checker. BaseURL is the GitHub API root and is
// configurable so tests can point at httptest.Server.
type Config struct {
	Repo       string        // "milmil-dev/milmil"
	HTTPClient *http.Client  // 5s timeout in production
	BaseURL    string        // defaults to "https://api.github.com" if empty
	Interval   time.Duration // ticker period for Run; ignored by Check
	TTL        time.Duration // cache validity; Check skips fetch if cache is fresher
	Notify     Notifier      // optional; only called from Run on version change
}

type Checker struct {
	cfg       Config
	mu        sync.Mutex
	cached    *Result
	fetchedAt time.Time
	sf        singleflight.Group
}

func NewChecker(cfg Config) *Checker {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.github.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Second}
	}
	return &Checker{cfg: cfg}
}

// Check returns the most recent Result. If the cache is fresher than TTL
// returns it directly. Otherwise fetches GitHub; on fetch failure with a
// previously-cached value, returns the cached value with stale=true.
// On fetch failure with no cache, returns (nil, false, err).
func (c *Checker) Check(ctx context.Context) (*Result, bool, error) {
	c.mu.Lock()
	cached, fetchedAt := c.cached, c.fetchedAt
	c.mu.Unlock()

	if cached != nil && time.Since(fetchedAt) < c.cfg.TTL {
		return cached, false, nil
	}

	v, err, _ := c.sf.Do("fetch", func() (any, error) { return c.fetch(ctx) })
	if err != nil {
		if cached != nil {
			return cached, true, nil
		}
		return nil, false, err
	}
	r := v.(*Result)

	c.mu.Lock()
	c.cached = r
	c.fetchedAt = time.Now()
	c.mu.Unlock()
	return r, false, nil
}

type githubRelease struct {
	TagName     string    `json:"tag_name"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Prerelease  bool      `json:"prerelease"`
	Draft       bool      `json:"draft"`
}

func (c *Checker) fetch(ctx context.Context) (*Result, error) {
	url := fmt.Sprintf("%s/repos/%s/releases/latest", c.cfg.BaseURL, c.cfg.Repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("github: status %d", resp.StatusCode)
	}
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if rel.Prerelease || rel.Draft {
		return nil, errors.New("github: latest release is prerelease/draft, skipping")
	}
	return &Result{
		Latest:      strings.TrimPrefix(rel.TagName, "v"),
		ReleaseURL:  rel.HTMLURL,
		PublishedAt: rel.PublishedAt,
	}, nil
}

// Run starts the background ticker. It calls Check every Interval and,
// when the latest version differs from the previously-cached value,
// invokes Notify. The very first observation does not notify (it just
// seeds the cache). Run blocks until ctx is cancelled. Recover-and-log
// is the caller's responsibility — Run does not panic on its own paths.
func (c *Checker) Run(ctx context.Context) {
	if c.cfg.Interval <= 0 {
		return
	}
	ticker := time.NewTicker(c.cfg.Interval)
	defer ticker.Stop()

	var prev string
	check := func() {
		r, _, err := c.Check(ctx)
		if err != nil || r == nil {
			return
		}
		if prev == "" {
			prev = r.Latest // initial seed; no notify
			return
		}
		if r.Latest != prev && c.cfg.Notify != nil {
			c.cfg.Notify(*r)
		}
		prev = r.Latest
	}

	check() // immediate first call so the cache is hot for /update-check
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			check()
		}
	}
}
