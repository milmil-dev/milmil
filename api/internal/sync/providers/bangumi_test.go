package providers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

func TestBangumiProgressPutsEpisodesThenPatchesCollection(t *testing.T) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 2,
	}, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001, 1002}})
	if err != nil {
		t.Fatal(err)
	}
	if len(seen) != 3 { // 2 episode PUTs + 1 collection PATCH
		t.Fatalf("expected 3 requests, got %v", seen)
	}
	if !strings.HasPrefix(seen[0], "PUT ") || !strings.HasPrefix(seen[2], "PATCH ") {
		t.Errorf("wrong order/methods: %v", seen)
	}
}

func TestBangumiMapsEachStatus(t *testing.T) {
	cases := []struct {
		s    milmilsync.WatchStatus
		want int
	}{
		{milmilsync.StatusWatching, 3},
		{milmilsync.StatusCompleted, 2},
		{milmilsync.StatusPlanning, 1},
		{milmilsync.StatusRepeating, 3},
		{milmilsync.StatusPaused, 4},
		{milmilsync.StatusDropped, 5},
	}
	for _, tc := range cases {
		if got := mapBangumiStatus(tc.s); got != tc.want {
			t.Errorf("%s → %d want %d", tc.s, got, tc.want)
		}
	}
}

func TestBangumiRepeatingIsLossy(t *testing.T) {
	// Documents that mapBangumi(REPEATING) == 3, and unmapBangumi(3) == WATCHING.
	// The round-trip is intentionally lossy because Bangumi has no REPEATING.
	if mapBangumiStatus(milmilsync.StatusRepeating) != 3 {
		t.Error("REPEATING should map to 3 (do)")
	}
	if unmapBangumiStatus(3) != milmilsync.StatusWatching {
		t.Error("3 should unmap to WATCHING (not REPEATING)")
	}
}

func TestBangumi500Transient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	p := NewBangumi(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
	if _, ok := milmilsync.IsTransient(err); !ok {
		t.Errorf("5xx must be transient, got %v", err)
	}
}

func TestBangumi401Fatal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer srv.Close()
	p := NewBangumi(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
	if _, ok := milmilsync.IsTransient(err); ok {
		t.Error("401 must be fatal")
	}
}

func TestBangumi404OnEpisodeContinues(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		if n == 1 {
			// First request (episode PUT) → 404; should be treated as harmless.
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	p := NewBangumi(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
	if err != nil {
		t.Errorf("404 on episode should not fail the push, got %v", err)
	}
	if calls.Load() != 2 {
		t.Errorf("expected 2 requests (episode + collection), got %d", calls.Load())
	}
}

func TestBangumiFetchListParses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"data":[
            {"subject_id":1,"type":2,"ep_status":12,"updated_at":"2026-01-01T00:00:00Z"},
            {"subject_id":2,"type":3,"ep_status":3, "updated_at":"2026-02-01T00:00:00Z"}
        ],"total":2}`)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	entries, err := p.FetchList(context.Background(), "tok")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2, got %d", len(entries))
	}
	if entries[0].Status != milmilsync.StatusCompleted || entries[0].Progress != 12 {
		t.Errorf("bad entry 0: %+v", entries[0])
	}
	if entries[1].Status != milmilsync.StatusWatching {
		t.Errorf("bad entry 1: %+v", entries[1])
	}
}

func TestBangumiPushMissingBangumiIDFatal(t *testing.T) {
	p := NewBangumi(nil, "")
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{Kind: milmilsync.KindProgress},
		milmilsync.ExternalIDs{})
	if err == nil {
		t.Fatal("expected error")
	}
	if _, ok := milmilsync.IsTransient(err); ok {
		t.Error("missing id should not be transient")
	}
}

func TestBangumiRefreshTokenSuccess(t *testing.T) {
	var form string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		form = string(b)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"access_token":"new-a","refresh_token":"new-r","expires_in":604800}`)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	tok, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{ClientID: "cid", ClientSecret: "sec"}, "old-r")
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != "new-a" || tok.RefreshToken != "new-r" {
		t.Errorf("bad token: %+v", tok)
	}
	if tok.ExpiresIn != 604800*time.Second {
		t.Errorf("bad expires_in: %v", tok.ExpiresIn)
	}
	for _, want := range []string{"grant_type=refresh_token", "client_id=cid", "client_secret=sec", "refresh_token=old-r"} {
		if !strings.Contains(form, want) {
			t.Errorf("form missing %q: %s", want, form)
		}
	}
}

func TestBangumiRefreshInvalidGrantFatal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	_, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "bad")
	if !errors.Is(err, milmilsync.ErrNeedsReauth) {
		t.Errorf("expected ErrNeedsReauth, got %v", err)
	}
}

func TestBangumiRefresh5xxTransient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	_, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "r")
	if _, ok := milmilsync.IsTransient(err); !ok {
		t.Errorf("5xx must be transient")
	}
}

func TestBangumi401WrapsErrNeedsReauth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer srv.Close()

	p := NewBangumi(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
	if !errors.Is(err, milmilsync.ErrNeedsReauth) {
		t.Errorf("Push on 401 must wrap ErrNeedsReauth, got %v", err)
	}
}
