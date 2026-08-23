package sync

import (
	"context"
	"testing"

	"github.com/milmil/api/internal/store"
)

func TestDeriveStatus_NoneWhenNoProgress(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusNone {
		t.Errorf("got %v want none", got)
	}
}

func TestDeriveStatus_PlanningWhenPartialRowButZeroCompleted(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	if _, err := q.UpsertWatchProgress(context.Background(), store.UpsertWatchProgressParams{
		ID:              "wp1",
		UserID:          "u",
		EpisodeID:       "a1-ep-1",
		Completed:       0,
		PositionSeconds: 10,
	}); err != nil {
		t.Fatal(err)
	}
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusPlanning {
		t.Errorf("got %v want planning", got)
	}
}

func TestDeriveStatus_WatchingPartial(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 5)
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusWatching {
		t.Errorf("got %v want watching", got)
	}
}

func TestDeriveStatus_CompletedWhenAllWatched(t *testing.T) {
	q, database, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 12)
	// Pin the timestamps. Left to strftime('now') the whole series lands in one
	// second only if the inserts are fast enough, which under -race they are
	// not — this test used to fail intermittently for that reason alone.
	setWatchedAt(t, database, "a1", 1, 12, "2026-01-01T00:00:00Z")

	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusCompleted {
		t.Errorf("got %v want completed", got)
	}
}

// A series watched an episode at a time over days is completed, not repeating.
// The query used to compare the last watch against the *first* episode's
// completion, so every ordinary watch-through reported "repeating" the first
// time it finished.
func TestDeriveStatus_CompletedWhenWatchedOverTime(t *testing.T) {
	q, database, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 3, 0, 0)
	mustInsertEpisodes(t, q, "a1", 3, 0)
	mustMarkWatched(t, q, "u", "a1", 3)
	setWatchedAt(t, database, "a1", 1, 1, "2026-01-01T00:00:00Z")
	setWatchedAt(t, database, "a1", 2, 2, "2026-01-08T00:00:00Z")
	setWatchedAt(t, database, "a1", 3, 3, "2026-01-15T00:00:00Z")

	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusCompleted {
		t.Errorf("got %v want completed", got)
	}
}

func TestDeriveStatus_OverrideWins(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	if err := q.UpdateAnimeSyncFlags(context.Background(), store.UpdateAnimeSyncFlagsParams{
		ID:                  "a1",
		SyncDisabled:        0,
		WatchStatusOverride: "dropped",
	}); err != nil {
		t.Fatal(err)
	}
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusDropped {
		t.Errorf("override ignored, got %v", got)
	}
}

func TestDeriveStatus_UnknownTotalStaysWatching(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	// totalEps=0 leaves TotalEpisodes NULL per the harness convention.
	mustInsertAnime(t, q, "a1", 0, 0, 0)
	mustInsertEpisodes(t, q, "a1", 99, 0)
	mustMarkWatched(t, q, "u", "a1", 99)
	got, err := DeriveStatus(context.Background(), q, "u", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if got != StatusWatching {
		t.Errorf("unknown total must not auto-complete, got %v", got)
	}
}

// The full lifecycle: first watch, finish, restart, finish again. "repeating"
// has to come from the recorded completion, because a part-watched episode
// looks the same on a first pass as on a rewatch.
func TestDeriveStatus_RewatchLifecycle(t *testing.T) {
	ctx := context.Background()
	q, database, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 3, 0, 0)
	mustInsertEpisodes(t, q, "a1", 3, 0)

	// Partway through a first watch — nothing finished before, so: watching.
	mustMarkWatched(t, q, "u", "a1", 2)
	setWatchedAt(t, database, "a1", 1, 2, "2026-01-01T00:00:00Z")
	requireStatus(t, q, "watching", StatusWatching)

	// Recording a completion is a no-op while the series is unfinished.
	if err := RecordSeriesCompletion(ctx, q, "u", "a1"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, q, "still watching", StatusWatching)

	// Finish it.
	mustMarkWatched(t, q, "u", "a1", 3)
	setWatchedAt(t, database, "a1", 1, 3, "2026-01-15T00:00:00Z")
	if err := RecordSeriesCompletion(ctx, q, "u", "a1"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, q, "finished", StatusCompleted)
	requireTimesCompleted(t, q, 1)

	// Saving progress again on a finished series must not keep counting it.
	for range 3 {
		if err := RecordSeriesCompletion(ctx, q, "u", "a1"); err != nil {
			t.Fatal(err)
		}
	}
	requireTimesCompleted(t, q, 1)

	// Start episode 1 over: incomplete again, but now it is a rewatch.
	if _, err := database.Exec(
		`UPDATE watch_progress SET completed = 0, last_watched_at = ? WHERE episode_id = ?`,
		"2026-02-01T00:00:00Z", "a1-ep-1",
	); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, q, "rewatching", StatusRepeating)

	// Finish the rewatch — completed again, and counted a second time.
	mustMarkWatched(t, q, "u", "a1", 3)
	setWatchedAt(t, database, "a1", 1, 3, "2026-02-20T00:00:00Z")
	if err := RecordSeriesCompletion(ctx, q, "u", "a1"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, q, "finished again", StatusCompleted)
	requireTimesCompleted(t, q, 2)
}

// A series of unknown length can never be "complete", so nothing is recorded.
func TestRecordSeriesCompletion_UnknownTotalIsIgnored(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 0, 0, 0)
	mustInsertEpisodes(t, q, "a1", 3, 0)
	mustMarkWatched(t, q, "u", "a1", 3)

	if err := RecordSeriesCompletion(context.Background(), q, "u", "a1"); err != nil {
		t.Fatal(err)
	}
	requireTimesCompleted(t, q, 0)
}
