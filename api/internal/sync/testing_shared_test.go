// Package sync — shared in-memory test harness for watch-sync tests.
//
// This file is compiled only with `go test`. It provides the minimal helpers
// watch-sync tests need to construct a scratch sqlite DB with full migrations
// applied, seed anime / episodes / watch_progress rows, and (via
// newTestQueriesWithDB) obtain the raw *sql.DB for code paths that need to
// BeginTx (e.g. the sync queue).
//
// HARNESS CHOICE: all sync tests should use `package sync` (internal) rather
// than `package sync_test` (external). That keeps these helpers callable from
// every test file without needing a second exported seam. If an integration
// test genuinely needs black-box testing against the public API only, it can
// still do so from `package sync` — it just gets optional access to
// unexported identifiers it may choose not to use.
package sync

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

// newTestQueries mirrors the pattern in resolver_test.go / matcher_test.go.
// Use this when you only need the sqlc Queries handle.
func newTestQueries(t *testing.T) (*store.Queries, func()) {
	t.Helper()
	q, _, cleanup := newTestQueriesWithDB(t)
	return q, cleanup
}

// newTestQueriesWithDB also exposes the raw *sql.DB so tests can BeginTx
// (watch-sync queue paths need this).
func newTestQueriesWithDB(t *testing.T) (*store.Queries, *sql.DB, func()) {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		database.Close()
		t.Fatal(err)
	}
	q := store.New(database)
	cleanup := func() { database.Close() }
	return q, database, cleanup
}

// mustInsertAnime creates an anime row with the supplied totalEpisodes and
// external IDs. A zero anilistID or bangumiID leaves the respective column
// NULL. The anidb_id / mal_id / tmdb_id columns are left NULL; use
// UpdateAnimeExternalIDs directly if a test needs them.
func mustInsertAnime(t *testing.T, q *store.Queries, id string, totalEps int, anilistID, bangumiID int64) {
	t.Helper()
	ctx := context.Background()

	_, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID:            id,
		Title:         fmt.Sprintf("Test Anime %s", id),
		Status:        "unknown",
		Genres:        "[]",
		TotalEpisodes: nullInt64(int64(totalEps), totalEps > 0),
		BangumiID:     nullInt64(bangumiID, bangumiID != 0),
		WatchStatus:   "planning",
		Score:         0,
	})
	if err != nil {
		t.Fatalf("mustInsertAnime CreateAnime(%s): %v", id, err)
	}

	// anilist_id is not part of CreateAnimeParams — patch it in via the
	// dedicated update query.
	if anilistID != 0 {
		if err := q.UpdateAnimeExternalIDs(ctx, store.UpdateAnimeExternalIDsParams{
			ID:        id,
			AnilistID: sql.NullInt64{Int64: anilistID, Valid: true},
		}); err != nil {
			t.Fatalf("mustInsertAnime UpdateAnimeExternalIDs(%s): %v", id, err)
		}
	}
}

// mustInsertEpisodes creates `count` episode rows for animeID with episode
// numbers 1..count. If bangumiEpisodeIDStart > 0, consecutive bangumi episode
// ids are assigned starting from that value; if 0, bangumi_episode_id is
// NULL on every row.
func mustInsertEpisodes(t *testing.T, q *store.Queries, animeID string, count int, bangumiEpisodeIDStart int64) {
	t.Helper()
	ctx := context.Background()

	for i := 1; i <= count; i++ {
		var bgmID sql.NullInt64
		if bangumiEpisodeIDStart > 0 {
			bgmID = sql.NullInt64{Int64: bangumiEpisodeIDStart + int64(i-1), Valid: true}
		}
		_, err := q.CreateEpisode(ctx, store.CreateEpisodeParams{
			ID:               fmt.Sprintf("%s-ep-%d", animeID, i),
			AnimeID:          animeID,
			EpisodeNumber:    float64(i),
			BangumiEpisodeID: bgmID,
		})
		if err != nil {
			t.Fatalf("mustInsertEpisodes CreateEpisode(%s #%d): %v", animeID, i, err)
		}
	}
}

// mustMarkWatched marks the first nCompleted episodes of animeID as completed
// for userID by upserting watch_progress rows with completed=1.
func mustMarkWatched(t *testing.T, q *store.Queries, userID, animeID string, nCompleted int) {
	t.Helper()
	ctx := context.Background()

	for i := 1; i <= nCompleted; i++ {
		epID := fmt.Sprintf("%s-ep-%d", animeID, i)
		_, err := q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
			ID:              fmt.Sprintf("wp-%s-%s-%d", userID, animeID, i),
			UserID:          userID,
			EpisodeID:       epID,
			PositionSeconds: 0,
			Completed:       1,
		})
		if err != nil {
			t.Fatalf("mustMarkWatched UpsertWatchProgress(%s,%s): %v", userID, epID, err)
		}
	}
}

// mustInsertAnimeWithTMDB creates an anime row with a tmdb_id set (via
// UpdateAnimeExternalIDs since CreateAnimeParams doesn't carry TmdbID). Used
// by the Trakt resolve-on-first-push tests which need a TMDB id but don't
// care about anilist/bangumi.
func mustInsertAnimeWithTMDB(t *testing.T, q *store.Queries, id string, tmdbID int64, totalEps int) {
	t.Helper()
	ctx := context.Background()

	_, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID:            id,
		Title:         fmt.Sprintf("Test Anime %s", id),
		Status:        "unknown",
		Genres:        "[]",
		TotalEpisodes: nullInt64(int64(totalEps), totalEps > 0),
		WatchStatus:   "planning",
		Score:         0,
	})
	if err != nil {
		t.Fatalf("mustInsertAnimeWithTMDB CreateAnime(%s): %v", id, err)
	}
	if tmdbID != 0 {
		if err := q.UpdateAnimeExternalIDs(ctx, store.UpdateAnimeExternalIDsParams{
			ID:     id,
			TmdbID: sql.NullInt64{Int64: tmdbID, Valid: true},
		}); err != nil {
			t.Fatalf("mustInsertAnimeWithTMDB UpdateAnimeExternalIDs(%s): %v", id, err)
		}
	}
}

func nullInt64(v int64, valid bool) sql.NullInt64 {
	return sql.NullInt64{Int64: v, Valid: valid}
}

// setWatchedAt pins last_watched_at for a contiguous range of episodes so
// status tests do not depend on how fast their inserts run.
func setWatchedAt(t *testing.T, database *sql.DB, animeID string, fromEp, toEp int, ts string) {
	t.Helper()
	for i := fromEp; i <= toEp; i++ {
		if _, err := database.Exec(
			`UPDATE watch_progress SET last_watched_at = ? WHERE episode_id = ?`,
			ts, fmt.Sprintf("%s-ep-%d", animeID, i),
		); err != nil {
			t.Fatalf("setWatchedAt(%s ep %d): %v", animeID, i, err)
		}
	}
}

func requireStatus(t *testing.T, q *store.Queries, stage string, want WatchStatus) {
	t.Helper()
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatalf("%s: %v", stage, err)
	}
	if got != want {
		t.Errorf("%s: got %v want %v", stage, got, want)
	}
}

func requireTimesCompleted(t *testing.T, q *store.Queries, want int64) {
	t.Helper()
	state, err := q.GetAnimeWatchState(context.Background(),
		store.GetAnimeWatchStateParams{UserID: "u", AnimeID: "a1"})
	if err != nil {
		if want == 0 {
			return // no row at all is zero completions
		}
		t.Fatalf("GetAnimeWatchState: %v", err)
	}
	if state.TimesCompleted != want {
		t.Errorf("times_completed = %d, want %d", state.TimesCompleted, want)
	}
}
