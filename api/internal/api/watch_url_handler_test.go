package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func seedAnimeEpisodeFile(t *testing.T, srv *auditTestServer, animeID, episodeID, fileID, libraryID, path string, size int64) {
	t.Helper()
	_, err := srv.db.Exec(
		`INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes, source_type, created_at, updated_at)
		 VALUES (?, 'lib', '/tmp/lib', 1, 0, 'local',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
		libraryID,
	)
	require.NoError(t, err)

	_, err = srv.queries.CreateAnime(context.Background(), store.CreateAnimeParams{
		ID:          animeID,
		Title:       "Test Anime",
		Status:      "ongoing",
		Genres:      "drama",
		WatchStatus: "watching",
	})
	require.NoError(t, err)

	_, err = srv.queries.CreateEpisode(context.Background(), store.CreateEpisodeParams{
		ID:            episodeID,
		AnimeID:       animeID,
		EpisodeNumber: 1,
	})
	require.NoError(t, err)

	_, err = srv.db.Exec(
		`INSERT INTO media_files (id, library_id, path, filename, size_bytes, episode_id,
		                          match_status, video_tracks, audio_tracks, subtitle_tracks,
		                          created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 'matched', '[]', '[]', '[]',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
		fileID, libraryID, path, "ep01.mkv", size, episodeID,
	)
	require.NoError(t, err)
}

func TestWatchURL_ReturnsCanonicalURL(t *testing.T) {
	srv := newAuditTestServer(t)
	seedAnimeEpisodeFile(t, srv, "anime-1", "ep-1", "file-1", "lib-1",
		"/data/lib/Test Anime/ep01.mkv", 2_000_000_000)

	tok := srv.mintAPIToken(t, "watch-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/episodes/ep-1/watch-url", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		AnimeID     string `json:"anime_id"`
		EpisodeID   string `json:"episode_id"`
		WatchURL    string `json:"watch_url"`
		StreamURL   string `json:"stream_url"`
		MatchedFile string `json:"matched_file"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "anime-1", resp.AnimeID)
	require.Equal(t, "ep-1", resp.EpisodeID)
	require.Contains(t, resp.WatchURL, "/watch/anime-1/ep-1")
	require.Contains(t, resp.StreamURL, "/api/v1/stream/file-1/direct")
	require.Equal(t, "/data/lib/Test Anime/ep01.mkv", resp.MatchedFile)
}

func TestWatchURL_PicksLargestFileWhenNoPreferred(t *testing.T) {
	srv := newAuditTestServer(t)
	seedAnimeEpisodeFile(t, srv, "anime-2", "ep-2", "file-small", "lib-2",
		"/data/lib/A/720p.mkv", 1_000_000_000)
	// Add a larger second file for the same episode.
	_, err := srv.db.Exec(
		`INSERT INTO media_files (id, library_id, path, filename, size_bytes, episode_id,
		                          match_status, video_tracks, audio_tracks, subtitle_tracks,
		                          created_at, updated_at)
		 VALUES ('file-big', 'lib-2', '/data/lib/A/1080p.mkv', '1080p.mkv', 4000000000, 'ep-2',
		         'matched', '[]', '[]', '[]',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
	)
	require.NoError(t, err)

	tok := srv.mintAPIToken(t, "watch-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/episodes/ep-2/watch-url", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		StreamURL   string `json:"stream_url"`
		MatchedFile string `json:"matched_file"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Contains(t, resp.StreamURL, "file-big")
	require.Equal(t, "/data/lib/A/1080p.mkv", resp.MatchedFile)
}

func TestWatchURL_RespectsPreferredMediaFile(t *testing.T) {
	srv := newAuditTestServer(t)
	seedAnimeEpisodeFile(t, srv, "anime-3", "ep-3", "file-small", "lib-3",
		"/data/lib/B/720p.mkv", 1_000_000_000)
	_, err := srv.db.Exec(
		`INSERT INTO media_files (id, library_id, path, filename, size_bytes, episode_id,
		                          match_status, video_tracks, audio_tracks, subtitle_tracks,
		                          created_at, updated_at)
		 VALUES ('file-big', 'lib-3', '/data/lib/B/1080p.mkv', '1080p.mkv', 4000000000, 'ep-3',
		         'matched', '[]', '[]', '[]',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
	)
	require.NoError(t, err)
	// User prefers the smaller file even though a larger exists.
	_, err = srv.db.Exec(
		`UPDATE episodes SET preferred_media_file_id = 'file-small' WHERE id = 'ep-3'`,
	)
	require.NoError(t, err)

	tok := srv.mintAPIToken(t, "watch-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/episodes/ep-3/watch-url", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		StreamURL string `json:"stream_url"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Contains(t, resp.StreamURL, "file-small")
}

func TestWatchURL_NotFoundForUnknownEpisode(t *testing.T) {
	srv := newAuditTestServer(t)
	tok := srv.mintAPIToken(t, "watch-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/episodes/missing/watch-url", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

// suppress unused-import lint when sql.NullString isn't used elsewhere in
// this file under all test paths
var _ = sql.NullString{}
