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
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 0, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 12)
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
