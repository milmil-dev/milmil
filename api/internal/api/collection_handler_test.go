package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListCollection_IncludesBookmarkedAnimeWithoutLocalFiles(t *testing.T) {
	e, database := newTestAppWithDB(t)

	if _, err := database.Exec(`
		INSERT INTO anime (id, title, title_zh, status, genres, watch_status, bangumi_id, score)
		VALUES ('anime-bookmark', 'Frieren', '葬送的芙莉蓮', 'airing', '[]', 'planning', 400602, 0)
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`
		INSERT INTO anime (id, title, status, genres, watch_status, bangumi_id, score)
		VALUES ('anime-none', 'Not Bookmarked', 'unknown', '[]', 'none', 1, 0)
	`); err != nil {
		t.Fatal(err)
	}

	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/collection", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var items []struct {
		ID             string `json:"id"`
		WatchStatus    string `json:"watch_status"`
		LocalFileCount int64  `json:"local_file_count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 bookmarked title, got %d: %+v", len(items), items)
	}
	if items[0].ID != "anime-bookmark" {
		t.Errorf("id = %q, want anime-bookmark", items[0].ID)
	}
	if items[0].WatchStatus != "planning" {
		t.Errorf("watch_status = %q, want planning", items[0].WatchStatus)
	}
	if items[0].LocalFileCount != 0 {
		t.Errorf("local_file_count = %d, want 0", items[0].LocalFileCount)
	}

	countsReq := makeAuthRequest(t, e, http.MethodGet, "/api/v1/collection/status-counts", "")
	countsRec := httptest.NewRecorder()
	e.ServeHTTP(countsRec, countsReq)
	if countsRec.Code != http.StatusOK {
		t.Fatalf("status-counts: want 200, got %d: %s", countsRec.Code, countsRec.Body.String())
	}
	var counts []struct {
		WatchStatus string `json:"watch_status"`
		Count       int64  `json:"count"`
	}
	if err := json.NewDecoder(countsRec.Body).Decode(&counts); err != nil {
		t.Fatal(err)
	}
	if len(counts) != 1 || counts[0].WatchStatus != "planning" || counts[0].Count != 1 {
		t.Fatalf("status-counts = %+v, want [{planning 1}]", counts)
	}
}

func TestListCollection_IncludesMatchedLibraryAnime(t *testing.T) {
	e, database := newTestAppWithDB(t)
	dir := t.TempDir()

	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := database.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES ('lib', 'Lib', ?, 1, 60)`, dir)
	mustExec(`INSERT INTO anime (id, library_id, title, status, genres, watch_status, bangumi_id, score)
		VALUES ('anime-lib', 'lib', 'Bleach', 'unknown', '[]', 'watching', 530725, 0)`)
	mustExec(`INSERT INTO episodes (id, anime_id, episode_number, title) VALUES ('ep1', 'anime-lib', 1, 'Ep One')`)
	mustExec(`INSERT INTO media_files (id, library_id, episode_id, path, filename, size_bytes, match_status)
		VALUES ('mf1', 'lib', 'ep1', ?, 'ep01.mkv', 16, 'auto')`, dir+"/ep01.mkv")

	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/collection", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var items []struct {
		ID             string `json:"id"`
		LocalFileCount int64  `json:"local_file_count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != "anime-lib" || items[0].LocalFileCount != 1 {
		t.Fatalf("items = %+v, want [{anime-lib local_file_count=1}]", items)
	}
}
