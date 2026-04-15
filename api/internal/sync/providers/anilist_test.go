package providers

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

func TestAniListPushIncludesFields(t *testing.T) {
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		body = string(b)
		_, _ = io.WriteString(w, `{"data":{"SaveMediaListEntry":{"id":1,"progress":5}}}`)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 5,
	}, milmilsync.ExternalIDs{AniList: 123})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"mediaId":123`, `"progress":5`, `"status":"CURRENT"`} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q: %s", want, body)
		}
	}
}

func TestAniListMapsEachStatus(t *testing.T) {
	cases := []struct {
		in   milmilsync.WatchStatus
		want string
	}{
		{milmilsync.StatusWatching, "CURRENT"},
		{milmilsync.StatusCompleted, "COMPLETED"},
		{milmilsync.StatusPlanning, "PLANNING"},
		{milmilsync.StatusRepeating, "REPEATING"},
		{milmilsync.StatusPaused, "PAUSED"},
		{milmilsync.StatusDropped, "DROPPED"},
	}
	for _, tc := range cases {
		if got := mapAniListStatus(tc.in); got != tc.want {
			t.Errorf("%s → %s want %s", tc.in, got, tc.want)
		}
	}
}

func TestAniListHonorsRetryAfterOn429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "42")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{AniList: 1})
	te, ok := milmilsync.IsTransient(err)
	if !ok {
		t.Fatalf("want transient, got %v", err)
	}
	if te.RetryAfter != 42*time.Second {
		t.Errorf("Retry-After not honored, got %v", te.RetryAfter)
	}
}

func TestAniListAuthErrorFatal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad", http.StatusUnauthorized)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{AniList: 1})
	if _, ok := milmilsync.IsTransient(err); ok {
		t.Errorf("401 must be fatal, not transient")
	}
}

func TestAniList500IsTransient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
		Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
	}, milmilsync.ExternalIDs{AniList: 1})
	if _, ok := milmilsync.IsTransient(err); !ok {
		t.Errorf("5xx must be transient")
	}
}

func TestAniListFetchListParses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"data":{"MediaListCollection":{"lists":[{"entries":[
            {"mediaId":1,"status":"COMPLETED","progress":12,"updatedAt":1700000000},
            {"mediaId":2,"status":"CURRENT","progress":3,"updatedAt":1700000100}
        ]}]}}}`)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	entries, err := p.FetchList(context.Background(), "tok")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2, got %d", len(entries))
	}
	if entries[0].Status != milmilsync.StatusCompleted || entries[0].Progress != 12 {
		t.Errorf("bad entry: %+v", entries[0])
	}
}

func TestAniListFetchListEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"data":{"MediaListCollection":{"lists":[]}}}`)
	}))
	defer srv.Close()

	p := NewAniList(srv.Client(), srv.URL)
	entries, err := p.FetchList(context.Background(), "tok")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("want 0, got %d", len(entries))
	}
}

func TestAniListPushMissingAnilistIDFatal(t *testing.T) {
	p := NewAniList(nil, "")
	err := p.Push(context.Background(), "tok", milmilsync.SyncOp{Kind: milmilsync.KindProgress}, milmilsync.ExternalIDs{})
	if err == nil {
		t.Error("expected error")
	}
	if _, ok := milmilsync.IsTransient(err); ok {
		t.Error("missing id should not be transient")
	}
}
