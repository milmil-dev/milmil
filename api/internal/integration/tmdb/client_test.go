package tmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
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
