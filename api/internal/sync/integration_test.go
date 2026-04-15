package sync_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	milmilsync "github.com/milmil/api/internal/sync"
	"github.com/milmil/api/internal/sync/providers"
	"github.com/milmil/api/migrations"
)

// External-package integration tests need their own DB seeding helpers (the
// testing_shared_test.go helpers live in `package sync` and aren't importable
// from here).

func itDB(t *testing.T) (*store.Queries, *sql.DB, func()) {
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
	return q, database, func() { database.Close() }
}

func itInsertAnime(t *testing.T, q *store.Queries, id string, totalEps int, anilistID, bangumiID int64) {
	t.Helper()
	ctx := context.Background()
	_, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID:            id,
		Title:         "Test " + id,
		Status:        "unknown",
		Genres:        "[]",
		TotalEpisodes: sql.NullInt64{Int64: int64(totalEps), Valid: totalEps > 0},
		BangumiID:     sql.NullInt64{Int64: bangumiID, Valid: bangumiID != 0},
		WatchStatus:   "planning",
		Score:         0,
	})
	if err != nil {
		t.Fatalf("CreateAnime(%s): %v", id, err)
	}
	if anilistID != 0 {
		if err := q.UpdateAnimeExternalIDs(ctx, store.UpdateAnimeExternalIDsParams{
			ID:        id,
			AnilistID: sql.NullInt64{Int64: anilistID, Valid: true},
		}); err != nil {
			t.Fatalf("UpdateAnimeExternalIDs(%s): %v", id, err)
		}
	}
}

func itInsertEpisodes(t *testing.T, q *store.Queries, animeID string, count int) {
	t.Helper()
	ctx := context.Background()
	for i := 1; i <= count; i++ {
		_, err := q.CreateEpisode(ctx, store.CreateEpisodeParams{
			ID:            fmt.Sprintf("%s-ep-%d", animeID, i),
			AnimeID:       animeID,
			EpisodeNumber: float64(i),
		})
		if err != nil {
			t.Fatalf("CreateEpisode(%s #%d): %v", animeID, i, err)
		}
	}
}

func itMarkWatched(t *testing.T, q *store.Queries, userID, animeID string, nCompleted int) {
	t.Helper()
	ctx := context.Background()
	for i := 1; i <= nCompleted; i++ {
		_, err := q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
			ID:        fmt.Sprintf("wp-%s-%s-%d", userID, animeID, i),
			UserID:    userID,
			EpisodeID: fmt.Sprintf("%s-ep-%d", animeID, i),
			Completed: 1,
		})
		if err != nil {
			t.Fatalf("UpsertWatchProgress(%s,%s): %v", userID, animeID, err)
		}
	}
}

func TestEndToEndProgressPushReachesProvider(t *testing.T) {
	var received []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		received = append(received, string(b))
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"data":{"SaveMediaListEntry":{"id":1,"progress":5}}}`)
	}))
	defer srv.Close()

	q, database, cleanup := itDB(t)
	defer cleanup()
	itInsertAnime(t, q, "a1", 12, 42, 0)
	itInsertEpisodes(t, q, "a1", 12)

	al := providers.NewAniList(srv.Client(), srv.URL)
	tokenLoader := func(_ context.Context, _ string, _ milmilsync.ProviderName) (string, error) {
		return "fake-token", nil
	}
	svc := milmilsync.NewService(q, database, []milmilsync.Provider{al}, tokenLoader)

	itMarkWatched(t, q, "u", "a1", 5)
	start := time.Now()
	svc.OnProgressUpdate(context.Background(), "u", "a1")
	elapsed := time.Since(start)
	if elapsed > 100*time.Millisecond {
		t.Errorf("enqueue too slow: %v", elapsed)
	}

	svc.Drain(context.Background(), 10)

	if len(received) != 1 {
		t.Fatalf("expected 1 HTTP call, got %d", len(received))
	}
	var gql map[string]any
	_ = json.Unmarshal([]byte(received[0]), &gql)
	vars := gql["variables"].(map[string]any)
	if int(vars["progress"].(float64)) != 5 {
		t.Errorf("progress mismatch: %v", vars)
	}
	if vars["status"].(string) != "CURRENT" {
		t.Errorf("status mismatch: %v", vars)
	}
	rows, _ := q.ListReadySyncOps(context.Background(), 10)
	if len(rows) != 0 {
		t.Errorf("expected 0 pending rows, got %d", len(rows))
	}
}

func TestEndToEndRateLimitGroupingHonoredReal(t *testing.T) {
	var callCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	q, database, cleanup := itDB(t)
	defer cleanup()
	for i := 0; i < 5; i++ {
		id := "a" + string(rune('1'+i))
		itInsertAnime(t, q, id, 12, int64(100+i), 0)
		itInsertEpisodes(t, q, id, 12)
		itMarkWatched(t, q, "u", id, 1)
	}

	al := providers.NewAniList(srv.Client(), srv.URL)
	svc := milmilsync.NewService(q, database, []milmilsync.Provider{al}, func(_ context.Context, _ string, _ milmilsync.ProviderName) (string, error) { return "tok", nil })
	for i := 0; i < 5; i++ {
		id := "a" + string(rune('1'+i))
		svc.OnProgressUpdate(context.Background(), "u", id)
	}
	svc.Drain(context.Background(), 10)
	if callCount != 1 {
		t.Errorf("expected exactly 1 upstream call (A3 grouping), got %d", callCount)
	}
}
