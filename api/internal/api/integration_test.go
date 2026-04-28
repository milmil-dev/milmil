//go:build integration

// End-to-end agent lifecycle test for milmil CLI v0.1.
//
// Coverage: token auth → mutating call → audit middleware writes a row →
// /audit list returns it → search → playable-episodes → watch-url chain
// → /audit/undo dry-run dispatches per action_type.
//
// NOT covered in v0.1 (deferred to v0.2 with the macro endpoints):
//   - POST /match/auto round-trip with confidence aggregation
//   - POST /subscribe full round-trip (plan-to-watch + RSS + missing-search
//     + tracker sync) and its parent-linked undo
//   - Real reverse handlers for match.apply, rss.create, sync.bangumi,
//     sync.anilist (currently stubs in macro/undo.go)
//
// Run with: cd api && go test -tags=integration ./internal/api/ -v

package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestE2E_AgentLifecycle(t *testing.T) {
	srv := newAuditTestServer(t)

	// 1. Mint a token for our "agent".
	tok := srv.mintAPIToken(t, "e2e-agent")

	// 2. Mutating call: create a second token via POST /api-tokens.
	//    audit middleware should write one entry: action=api_token.create,
	//    agent_label=e2e-agent.
	{
		req := httptest.NewRequest(http.MethodPost, "/api/v1/api-tokens",
			strings.NewReader(`{"name":"second-token"}`))
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusCreated, rec.Code, "body=%s", rec.Body.String())
	}

	// 3. GET /audit?action=api_token.create — must see exactly one row.
	var auditRowID string
	{
		req := httptest.NewRequest(http.MethodGet,
			"/api/v1/audit?action=api_token.create", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var resp struct {
			Items []struct {
				ID         string `json:"id"`
				ActionType string `json:"action_type"`
			} `json:"items"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Len(t, resp.Items, 1, "audit middleware should have written one row")
		require.Equal(t, "api_token.create", resp.Items[0].ActionType)
		auditRowID = resp.Items[0].ID
		require.NotEmpty(t, auditRowID)
	}

	// 4. Seed an anime + episode + library + matched media file so the
	//    search → playable-episodes → watch-url chain has data.
	const (
		bangumiID = int64(54321)
		animeID   = "anime-e2e"
		episodeID = "ep-e2e"
		libraryID = "lib-e2e"
		fileID    = "file-e2e"
	)
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
		Title:       "Sousou no Frieren",
		TitleEn:     sql.NullString{String: "Frieren: Beyond Journey's End", Valid: true},
		BangumiID:   sql.NullInt64{Int64: bangumiID, Valid: true},
		Status:      "ongoing",
		Genres:      "fantasy",
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
		 VALUES (?, ?, '/data/lib/Frieren/01.mkv', '01.mkv', 2000000000, ?,
		         'matched', '[]', '[]', '[]',
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		         strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
		fileID, libraryID, episodeID,
	)
	require.NoError(t, err)

	// 5. Search hits the anime by local title.
	var search struct {
		Items []struct {
			ID        string `json:"id"`
			Title     string `json:"title"`
			BangumiID *int64 `json:"bangumi_id"`
		} `json:"items"`
	}
	{
		req := httptest.NewRequest(http.MethodGet,
			"/api/v1/search/anime?q=Frieren", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &search))
		require.NotEmpty(t, search.Items)
		require.Equal(t, animeID, search.Items[0].ID)
		require.NotNil(t, search.Items[0].BangumiID)
		require.Equal(t, bangumiID, *search.Items[0].BangumiID)
	}

	// 6. Playable-episodes (Bangumi-keyed) lists our seeded episode. The
	//    response is a wrapper with anime-level metadata + an episodes
	//    array — verify both the envelope and the episode entry.
	{
		req := httptest.NewRequest(http.MethodGet,
			"/api/v1/anime/54321/playable-episodes", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

		var resp struct {
			AnimeID  string `json:"anime_id"`
			Episodes []struct {
				EpisodeID string  `json:"episode_id"`
				Sort      float64 `json:"sort"`
			} `json:"episodes"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, animeID, resp.AnimeID)
		require.Len(t, resp.Episodes, 1)
		require.Equal(t, episodeID, resp.Episodes[0].EpisodeID)
	}

	// 7. Watch-url returns shaped URLs for that episode.
	{
		req := httptest.NewRequest(http.MethodGet,
			"/api/v1/episodes/"+episodeID+"/watch-url", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var watch struct {
			AnimeID   string `json:"anime_id"`
			EpisodeID string `json:"episode_id"`
			WatchURL  string `json:"watch_url"`
			StreamURL string `json:"stream_url"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &watch))
		require.Equal(t, animeID, watch.AnimeID)
		require.Equal(t, episodeID, watch.EpisodeID)
		require.Contains(t, watch.WatchURL, "/watch/"+animeID+"/"+episodeID)
		require.Contains(t, watch.StreamURL, "/api/v1/stream/"+fileID+"/direct")
	}

	// 8. /audit/undo dry-run reports the api_token.create entry. We don't
	//    assert "reversed" because api_token.create has no reverse handler
	//    in macro/undo.go (the engine reports "failed: no reverse handler"
	//    on a real undo); dry-run reports "reversed: [dry-run] would
	//    reverse" without invoking the dispatcher.
	{
		req := httptest.NewRequest(http.MethodPost, "/api/v1/audit/undo",
			strings.NewReader(`{"id":"`+auditRowID+`","dry_run":true}`))
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		srv.e.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

		var resp struct {
			Items []struct {
				AuditID string `json:"audit_id"`
				Status  string `json:"status"`
			} `json:"items"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Len(t, resp.Items, 1)
		require.Equal(t, auditRowID, resp.Items[0].AuditID)
		require.Equal(t, "reversed", resp.Items[0].Status, "dry-run must report reversed")
	}
}
