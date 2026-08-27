package api_test

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// seedSeries inserts a library, an anime, one episode and a local media file
// (with one sidecar subtitle) and returns the file id.
func seedSeries(t *testing.T, database *sql.DB, bangumiID int64) (fileID string, videoPath string) {
	t.Helper()
	dir := t.TempDir()
	videoPath = filepath.Join(dir, "ep01.mkv")
	if err := os.WriteFile(videoPath, []byte("0123456789abcdef"), 0o644); err != nil {
		t.Fatal(err)
	}
	subPath := filepath.Join(dir, "ep01.zh.ass")
	_ = os.WriteFile(subPath, []byte("[Script Info]"), 0o644)
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := database.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes) VALUES ('lib', 'Lib', ?, 1, 60)`, dir)
	mustExec(`INSERT INTO anime (id, library_id, title, title_zh, status, genres, watch_status, score, bangumi_id) VALUES ('anime', 'lib', 'Bleach', '死神', 'unknown', '[]', 'none', 0, ?)`, bangumiID)
	mustExec(`INSERT INTO episodes (id, anime_id, episode_number, title, title_zh) VALUES ('ep1', 'anime', 1, 'Ep One', '第一集')`)
	mustExec(`INSERT INTO media_files (id, library_id, episode_id, path, filename, size_bytes, width, height, video_codec) VALUES ('mf1', 'lib', 'ep1', ?, 'ep01.mkv', 16, 1920, 1080, 'hevc')`, videoPath)
	mustExec(`INSERT INTO subtitle_files (id, media_file_id, path, language, format, source) VALUES ('sub1', 'mf1', ?, 'zh', 'ass', 'external')`, subPath)
	return "mf1", videoPath
}

func TestOfflineManifest(t *testing.T) {
	e, database := newTestAppWithDB(t)
	token := getToken(t, e)
	seedSeries(t, database, 530725)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/anime/530725/offline-manifest", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var m struct {
		BangumiID int64  `json:"bangumi_id"`
		Title     string `json:"title"`
		Episodes  []struct {
			EpisodeID string  `json:"episode_id"`
			Number    float64 `json:"number"`
			Title     string  `json:"title"`
			File      struct {
				ID         string `json:"id"`
				URL        string `json:"url"`
				ETag       string `json:"etag"`
				Container  string `json:"container"`
				VideoCodec string `json:"video_codec"`
				SizeBytes  int64  `json:"size_bytes"`
				Width      int64  `json:"width"`
				Height     int64  `json:"height"`
			} `json:"file"`
			Subtitles []struct {
				Index    int
				Language string
				URL      string `json:"url"`
			} `json:"subtitles"`
			DanmakuURL *string `json:"danmaku_url"`
		} `json:"episodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m.BangumiID != 530725 || m.Title != "死神" || len(m.Episodes) != 1 {
		t.Fatalf("manifest = %+v", m)
	}
	ep := m.Episodes[0]
	if ep.EpisodeID != "ep1" || ep.Number != 1 || ep.Title != "第一集" {
		t.Errorf("episode = %+v", ep)
	}
	if ep.File.URL != "/api/v1/stream/mf1/direct" || ep.File.SizeBytes != 16 || ep.File.Container != "mkv" || ep.File.Width != 1920 || ep.File.VideoCodec != "hevc" || ep.File.ETag == "" {
		t.Errorf("file = %+v", ep.File)
	}
	if len(ep.Subtitles) != 1 || ep.Subtitles[0].URL != "/api/v1/subtitles/sub1/content" || ep.Subtitles[0].Language != "zh" {
		t.Errorf("subtitles = %+v", ep.Subtitles)
	}
	if ep.DanmakuURL == nil || *ep.DanmakuURL != "/api/v1/danmaku/mf1" {
		t.Errorf("danmaku_url = %v", ep.DanmakuURL)
	}

	missing := httptest.NewRequest(http.MethodGet, "/api/v1/anime/1/offline-manifest", nil)
	missing.Header.Set("Authorization", "Bearer "+token)
	missingRec := httptest.NewRecorder()
	e.ServeHTTP(missingRec, missing)
	if missingRec.Code != http.StatusNotFound {
		t.Errorf("unknown series: want 404, got %d", missingRec.Code)
	}
}

// A resuming offline download asks for a byte range and expects the
// validator that the manifest handed out.
func TestStreamDirect_RangeAndETag(t *testing.T) {
	e, database := newTestAppWithDB(t)
	token := getToken(t, e)
	fileID, _ := seedSeries(t, database, 1)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/stream/"+fileID+"/direct", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Range", "bytes=4-7")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "4567" {
		t.Errorf("body = %q, want 4567", got)
	}
	if rec.Header().Get("Content-Range") != "bytes 4-7/16" || rec.Header().Get("Accept-Ranges") != "bytes" {
		t.Errorf("range headers = %v", rec.Header())
	}
	if rec.Header().Get("ETag") == "" {
		t.Error("ETag missing")
	}
}
