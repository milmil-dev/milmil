package tmdb

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSearchTV(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/search/tv" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			t.Fatal("missing api_key")
		}
		if r.URL.Query().Get("language") != "zh-CN" {
			t.Fatal("expected language=zh-CN")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"results":[{"id":100,"name":"葬送的芙莉莲","original_name":"葬送のフリーレン","overview":"中文简介"}],"total_pages":1}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	results, err := c.SearchTV(context.Background(), "Frieren", "zh-CN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 || results[0].ID != 100 {
		t.Errorf("want 1 result with id=100, got %+v", results)
	}
	if results[0].Name != "葬送的芙莉莲" {
		t.Errorf("want Chinese name, got %q", results[0].Name)
	}
}

func TestSearchTVWithAccessTokenUsesBearerHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/search/tv" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "" {
			t.Fatalf("did not expect api_key query, got %q", r.URL.Query().Get("api_key"))
		}
		if r.Header.Get("Authorization") != "Bearer read-access-token" {
			t.Fatalf("want bearer auth header, got %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"results":[{"id":100,"name":"葬送的芙莉莲","original_name":"葬送のフリーレン","overview":"中文简介"}],"total_pages":1}`))
	}))
	defer srv.Close()

	c := NewClientWithURLAndAccessToken(srv.Client(), "read-access-token", srv.URL)
	results, err := c.SearchTV(context.Background(), "Frieren", "zh-CN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 || results[0].ID != 100 {
		t.Errorf("want 1 result with id=100, got %+v", results)
	}
}

func TestGetTVDetailsLocalizedName(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/tv/100" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("language") != "zh-TW" {
			t.Fatalf("expected language=zh-TW, got %q", r.URL.Query().Get("language"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":100,"name":"葬送的芙莉蓮","original_name":"葬送のフリーレン","overview":"繁體簡介"}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	show, err := c.GetTVDetails(context.Background(), 100, "zh-TW")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if show.Name != "葬送的芙莉蓮" {
		t.Errorf("want Traditional Chinese name, got %q", show.Name)
	}
}

func TestGetTVSeason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/tv/100/season/1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"season_number":1,"episodes":[{"episode_number":1,"name":"旅の仲間","overview":"中文剧情简介","air_date":"2023-09-29","still_path":"/ep1.jpg"}]}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	season, err := c.GetTVSeason(context.Background(), 100, 1, "zh-CN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(season.Episodes) != 1 {
		t.Fatalf("want 1 episode, got %d", len(season.Episodes))
	}
	if season.Episodes[0].Overview != "中文剧情简介" {
		t.Errorf("want Chinese overview, got %q", season.Episodes[0].Overview)
	}
}

func TestPingSucceedsWith200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/authentication" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			t.Fatal("missing api_key in query")
		}
		w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	if err := c.Ping(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPingWithAccessTokenSendsBearer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/authentication" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "" {
			t.Fatalf("did not expect api_key query, got %q", r.URL.Query().Get("api_key"))
		}
		if r.Header.Get("Authorization") != "Bearer read-access-token" {
			t.Fatalf("want bearer auth header, got %q", r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	c := NewClientWithURLAndAccessToken(srv.Client(), "read-access-token", srv.URL)
	if err := c.Ping(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSanitizeURLError_RedactsQueryString(t *testing.T) {
	in := &url.Error{
		Op:  "Get",
		URL: "https://api.themoviedb.org/3/search/tv?api_key=super-secret-key&query=Frieren",
		Err: errors.New("dial tcp: connection refused"),
	}
	out := sanitizeURLError(in)
	msg := out.Error()
	if strings.Contains(msg, "super-secret-key") {
		t.Fatalf("api_key leaked through sanitizeURLError: %s", msg)
	}
	if !strings.Contains(msg, "[redacted]") {
		t.Fatalf("expected [redacted] marker, got: %s", msg)
	}
	if !strings.Contains(msg, "/3/search/tv") {
		t.Fatalf("expected path to remain for diagnosis, got: %s", msg)
	}
}

func TestSanitizeURLError_NonURLErrorPassthrough(t *testing.T) {
	in := errors.New("some other error")
	out := sanitizeURLError(in)
	if out.Error() != "some other error" {
		t.Fatalf("expected passthrough, got: %s", out.Error())
	}
}

func TestPingTransportErrorRedactsAPIKey(t *testing.T) {
	// Use an unreachable port to force a transport-layer error.
	c := NewClientWithURL(&http.Client{}, "super-secret-key", "http://127.0.0.1:1")
	err := c.Ping(context.Background())
	if err == nil {
		t.Fatal("expected error from unreachable host")
	}
	if strings.Contains(err.Error(), "super-secret-key") {
		t.Fatalf("api_key leaked into transport error: %s", err.Error())
	}
}

func TestPingReturnsUnauthorizedOn401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"status_code":7}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "bad-key", srv.URL)
	err := c.Ping(context.Background())
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("want ErrUnauthorized, got %v", err)
	}
}

func TestGetTVExternalIDs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/tv/100/external_ids" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"imdb_id":"tt12345","tvdb_id":999}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	ids, err := c.GetTVExternalIDs(context.Background(), 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ids.TVDBID != 999 {
		t.Errorf("want tvdb_id=999, got %d", ids.TVDBID)
	}
}
