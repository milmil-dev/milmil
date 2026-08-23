package updatecheck_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/milmil/api/internal/updatecheck"
)

type fakeGitHubRelease struct {
	TagName     string    `json:"tag_name"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Prerelease  bool      `json:"prerelease"`
	Draft       bool      `json:"draft"`
}

func newFakeGitHub(t *testing.T, response fakeGitHubRelease, status int) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(response)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestChecker_Check_FreshFetch(t *testing.T) {
	t.Parallel()
	srv := newFakeGitHub(t, fakeGitHubRelease{
		TagName:     "v0.1.8",
		HTMLURL:     "https://example/releases/v0.1.8",
		PublishedAt: time.Date(2026, 4, 30, 10, 0, 0, 0, time.UTC),
	}, http.StatusOK)

	c := updatecheck.NewChecker(updatecheck.Config{
		Repo:       "milmil-dev/milmil",
		HTTPClient: srv.Client(),
		BaseURL:    srv.URL,
		TTL:        time.Hour,
	})

	got, stale, err := c.Check(context.Background())
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if stale {
		t.Errorf("stale: got true, want false")
	}
	if got.Latest != "0.1.8" {
		t.Errorf("Latest: got %q want %q", got.Latest, "0.1.8")
	}
	if got.ReleaseURL != "https://example/releases/v0.1.8" {
		t.Errorf("ReleaseURL: %q", got.ReleaseURL)
	}
}

func TestChecker_Check_CacheHitWithinTTL(t *testing.T) {
	t.Parallel()
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(fakeGitHubRelease{TagName: "v0.1.8", PublishedAt: time.Now().UTC()})
	}))
	t.Cleanup(srv.Close)

	c := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Hour,
	})

	for i := 0; i < 3; i++ {
		if _, _, err := c.Check(context.Background()); err != nil {
			t.Fatalf("Check #%d: %v", i, err)
		}
	}
	if calls != 1 {
		t.Errorf("calls: got %d want 1", calls)
	}
}

func TestChecker_Check_StaleOnFetchFailure(t *testing.T) {
	t.Parallel()
	var ok atomic.Bool
	ok.Store(true)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if !ok.Load() {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(fakeGitHubRelease{TagName: "v0.1.8", PublishedAt: time.Now().UTC()})
	}))
	t.Cleanup(srv.Close)

	c := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Nanosecond,
	})

	// First call: success, cache populated
	if _, _, err := c.Check(context.Background()); err != nil {
		t.Fatalf("first Check: %v", err)
	}

	// Second call: TTL expired (nanosecond), upstream fails — should return stale
	ok.Store(false)
	got, stale, err := c.Check(context.Background())
	if err != nil {
		t.Fatalf("second Check: %v", err)
	}
	if !stale {
		t.Error("stale: got false, want true")
	}
	if got.Latest != "0.1.8" {
		t.Errorf("Latest: got %q want 0.1.8", got.Latest)
	}
}

func TestChecker_Check_NeverCachedAndOffline(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	c := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Hour,
	})

	got, stale, err := c.Check(context.Background())
	if err == nil {
		t.Fatal("Check: got nil err, want error on never-cached + offline")
	}
	if got != nil {
		t.Errorf("got: %+v want nil", got)
	}
	if stale {
		t.Error("stale: got true want false")
	}
}

func TestChecker_Check_SkipsPrereleaseAndDraft(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name string
		rel  fakeGitHubRelease
	}{
		{"prerelease", fakeGitHubRelease{TagName: "v0.1.8", Prerelease: true, PublishedAt: time.Now().UTC()}},
		{"draft", fakeGitHubRelease{TagName: "v0.1.8", Draft: true, PublishedAt: time.Now().UTC()}},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			srv := newFakeGitHub(t, tc.rel, http.StatusOK)
			c := updatecheck.NewChecker(updatecheck.Config{
				Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL, TTL: time.Hour,
			})
			_, _, err := c.Check(context.Background())
			if err == nil {
				t.Fatal("expected error for prerelease/draft, got nil")
			}
		})
	}
}

func TestChecker_Run_NotifiesOnVersionChange(t *testing.T) {
	t.Parallel()
	versions := []string{"v0.1.7", "v0.1.7", "v0.1.8"}
	var idx atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		i := int(idx.Load())
		v := versions[i]
		if i < len(versions)-1 {
			idx.Add(1)
		}
		_ = json.NewEncoder(w).Encode(fakeGitHubRelease{
			TagName: v, HTMLURL: "https://x/" + v, PublishedAt: time.Now().UTC(),
		})
	}))
	t.Cleanup(srv.Close)

	notified := make(chan updatecheck.Result, 4)
	c := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL,
		Interval: 20 * time.Millisecond, TTL: 0, // TTL=0 so each tick re-fetches
		Notify: func(r updatecheck.Result) { notified <- r },
	})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	go c.Run(ctx)

	// Wait for the v0.1.8 notify (the only real change).
	deadline := time.After(150 * time.Millisecond)
	for {
		select {
		case r := <-notified:
			if r.Latest == "0.1.8" {
				return // success
			}
			t.Fatalf("first notify: got %q want 0.1.8 (no notify expected on initial seed or unchanged tick)", r.Latest)
		case <-deadline:
			t.Fatal("never received notify for 0.1.8")
		}
	}
}

func TestChecker_Run_NoNotifyOnInitialSeed(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(fakeGitHubRelease{TagName: "v0.1.7", PublishedAt: time.Now().UTC()})
	}))
	t.Cleanup(srv.Close)

	var notified atomic.Bool
	c := updatecheck.NewChecker(updatecheck.Config{
		Repo: "x/y", HTTPClient: srv.Client(), BaseURL: srv.URL,
		Interval: 20 * time.Millisecond, TTL: 0,
		Notify: func(_ updatecheck.Result) { notified.Store(true) },
	})

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	c.Run(ctx) // blocks until ctx done
	if notified.Load() {
		t.Error("notified on initial seed; want no notify until version changes")
	}
}
