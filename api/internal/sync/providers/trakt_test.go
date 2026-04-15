package providers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

func TestTrakt_PushSendsHistoryPayload(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	err := p.Push(context.Background(), "tok",
		milmilsync.SyncOp{Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 3},
		milmilsync.ExternalIDs{Trakt: 123})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"trakt":123`, `"number":1`, `"number":2`, `"number":3`} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q: %s", want, body)
		}
	}
}

func TestTrakt_PushNoTMDBFatal(t *testing.T) {
	p := NewTrakt(nil, "", "cid", "sec")
	err := p.Push(context.Background(), "tok",
		milmilsync.SyncOp{Kind: milmilsync.KindProgress, Progress: 1},
		milmilsync.ExternalIDs{})
	if err == nil {
		t.Fatal("expected error")
	}
	if _, ok := milmilsync.IsTransient(err); ok {
		t.Error("missing ids must not be transient")
	}
	if errors.Is(err, milmilsync.ErrNeedsReauth) {
		t.Error("missing ids must not be ErrNeedsReauth")
	}
}

func TestTrakt_PushNoTraktIDSignalsResolve(t *testing.T) {
	p := NewTrakt(nil, "", "cid", "sec")
	err := p.Push(context.Background(), "tok",
		milmilsync.SyncOp{Kind: milmilsync.KindProgress, Progress: 1},
		milmilsync.ExternalIDs{TMDB: 555})
	if !errors.Is(err, milmilsync.ErrNeedsResolve) {
		t.Fatalf("expected ErrNeedsResolve, got %v", err)
	}
}

func TestTrakt_Push401IsErrNeedsReauth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusUnauthorized)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	err := p.Push(context.Background(), "tok",
		milmilsync.SyncOp{Kind: milmilsync.KindProgress, Progress: 1},
		milmilsync.ExternalIDs{Trakt: 1})
	if !errors.Is(err, milmilsync.ErrNeedsReauth) {
		t.Errorf("Push 401 must wrap ErrNeedsReauth, got %v", err)
	}
}

func TestTrakt_Push429HonorsRetryAfter(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "42")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	err := p.Push(context.Background(), "tok",
		milmilsync.SyncOp{Kind: milmilsync.KindProgress, Progress: 1},
		milmilsync.ExternalIDs{Trakt: 1})
	te, ok := milmilsync.IsTransient(err)
	if !ok {
		t.Fatalf("want transient, got %v", err)
	}
	if te.RetryAfter != 42*time.Second {
		t.Errorf("Retry-After not honored: %v", te.RetryAfter)
	}
}

func TestTrakt_FetchListParsesWatched(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/sync/watched/shows") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		_, _ = io.WriteString(w, `[
            {"plays":12,"last_watched_at":"2024-01-01T00:00:00Z","show":{"ids":{"trakt":1,"tmdb":777}}}
        ]`)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	entries, err := p.FetchList(context.Background(), "tok")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("want 1 entry, got %d", len(entries))
	}
	if entries[0].ProviderAnimeID != 777 || entries[0].Progress != 12 {
		t.Errorf("bad entry: %+v", entries[0])
	}
}

func TestTrakt_SearchByTMDB(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/search/tmdb/555") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("type") != "show" {
			t.Errorf("missing type=show")
		}
		_, _ = io.WriteString(w, `[{"show":{"ids":{"trakt":99999}}}]`)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	id, err := p.SearchByTMDB(context.Background(), 555)
	if err != nil {
		t.Fatal(err)
	}
	if id != 99999 {
		t.Errorf("want 99999, got %d", id)
	}
}

func TestTrakt_RefreshTokenSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"access_token":"new-a","refresh_token":"new-r","expires_in":7776000}`)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	tok, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{ClientID: "cid", ClientSecret: "sec"}, "old-r")
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != "new-a" || tok.RefreshToken != "new-r" {
		t.Errorf("bad token: %+v", tok)
	}
	if tok.ExpiresIn != 7776000*time.Second {
		t.Errorf("bad expires: %v", tok.ExpiresIn)
	}
}

func TestTrakt_RefreshInvalidGrantFatal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	_, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "bad")
	if !errors.Is(err, milmilsync.ErrNeedsReauth) {
		t.Errorf("expected ErrNeedsReauth, got %v", err)
	}
}

func TestTrakt_RequestDeviceCode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"device_code":"dc","user_code":"ABCD","verification_url":"https://trakt.tv/activate","expires_in":600,"interval":5}`)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	out, err := p.RequestDeviceCode(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if out.DeviceCode != "dc" || out.UserCode != "ABCD" || out.Interval != 5 {
		t.Errorf("bad device code response: %+v", out)
	}
}

func TestTrakt_PollDevicePending(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	out, err := p.PollDeviceToken(context.Background(), "dc")
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != DevicePollPending {
		t.Errorf("want pending, got %v", out.Status)
	}
}

func TestTrakt_PollDeviceApproved(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"access_token":"a","refresh_token":"r","expires_in":7776000}`)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	out, err := p.PollDeviceToken(context.Background(), "dc")
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != DevicePollApproved {
		t.Fatalf("want approved, got %v", out.Status)
	}
	if out.AccessToken != "a" || out.RefreshToken != "r" {
		t.Errorf("bad token: %+v", out)
	}
}

func TestTrakt_PollDeviceExpired(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusGone)
	}))
	defer srv.Close()

	p := NewTrakt(srv.Client(), srv.URL, "cid", "sec")
	out, err := p.PollDeviceToken(context.Background(), "dc")
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != DevicePollExpired {
		t.Errorf("want expired, got %v", out.Status)
	}
}
