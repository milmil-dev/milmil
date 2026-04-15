package sync

import (
	"context"
	"testing"

	"github.com/milmil/api/internal/store"
)

// TestPull_MaxWinsRemoteHigher: local has 3 completed episodes, remote says 7.
// Max-wins means we upsert 7 rows so local catches up; sync:pulled broadcasts.
func TestPull_MaxWinsRemoteHigher(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 3)

	fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
		{ProviderAnimeID: 42, Status: StatusWatching, Progress: 7},
	}}
	ts := &staticTS{access: "tok"}
	hub := &spyHub{}
	s := NewService(q, db, []Provider{fp}, ts, hub)

	res, err := s.PullFromProvider(context.Background(), "u", ProviderAniList)
	if err != nil {
		t.Fatal(err)
	}
	if res.UpdatedLocal != 1 {
		t.Errorf("updated=%d want 1", res.UpdatedLocal)
	}
	counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(),
		store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a1"})
	if asInt64(counts.CompletedCount) != 7 {
		t.Errorf("completed=%d want 7", asInt64(counts.CompletedCount))
	}
	if len(hub.events) == 0 || hub.events[0].Type != "sync:pulled" {
		t.Errorf("expected sync:pulled, got %+v", hub.events)
	}
}

// TestPull_MaxWinsLocalAheadNoOp: local has 10 completed, remote says 5.
// Local wins (no downgrade) — no UpdatedLocal, no upserts.
func TestPull_MaxWinsLocalAheadNoOp(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 10)

	fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
		{ProviderAnimeID: 42, Progress: 5},
	}}
	s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

	res, _ := s.PullFromProvider(context.Background(), "u", ProviderAniList)
	if res.UpdatedLocal != 0 {
		t.Errorf("should no-op when local ahead, updated=%d", res.UpdatedLocal)
	}
}

// TestPull_SkipsUnknownAnime: remote entry for an anilist_id milmil doesn't
// know about — silently counted as skipped, no error.
func TestPull_SkipsUnknownAnime(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
		{ProviderAnimeID: 99999, Progress: 3},
	}}
	s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

	res, _ := s.PullFromProvider(context.Background(), "u", ProviderAniList)
	if res.Skipped != 1 {
		t.Errorf("skipped=%d want 1", res.Skipped)
	}
	if res.UpdatedLocal != 0 {
		t.Errorf("updated=%d want 0", res.UpdatedLocal)
	}
}

// TestPull_UpdatesLastPulledAt: even with an empty remote list the run stamps
// last_pulled_at so the UI can show "checked N minutes ago".
func TestPull_UpdatesLastPulledAt(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	fp := &fakeProvider{name: ProviderAniList}
	s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

	_, err := s.PullFromProvider(context.Background(), "u", ProviderAniList)
	if err != nil {
		t.Fatal(err)
	}
	state, err := q.GetSyncProviderState(context.Background(), store.GetSyncProviderStateParams{
		UserID: "u", Provider: "anilist",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !state.LastPulledAt.Valid || state.LastPulledAt.String == "" {
		t.Error("last_pulled_at not set")
	}
}
