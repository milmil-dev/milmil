package sync

import (
	"context"
	"testing"

	"github.com/milmil/api/internal/store"
)

func TestImportSkipsAnimeWithExistingProgress(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	mustInsertEpisodes(t, q, "a1", 12, 0)
	mustMarkWatched(t, q, "u", "a1", 3)

	fp := &fakeProvider{
		name: ProviderAniList,
		fetched: []RemoteEntry{
			{ProviderAnimeID: 42, Status: StatusCompleted, Progress: 12},
		},
	}
	s := NewService(q, db, []Provider{fp}, newStaticTS(), nil)

	if err := s.runImport(context.Background(), "u", fp, "tok"); err != nil {
		t.Fatal(err)
	}
	counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(),
		store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a1"})
	if got := asInt64(counts.CompletedCount); got != 3 {
		t.Errorf("existing progress overwritten, count=%d want 3", got)
	}
}

func TestImportPopulatesFromRemote(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a2", 12, 99, 0)
	mustInsertEpisodes(t, q, "a2", 12, 0)

	fp := &fakeProvider{
		name: ProviderAniList,
		fetched: []RemoteEntry{
			{ProviderAnimeID: 99, Status: StatusCompleted, Progress: 12},
		},
	}
	s := NewService(q, db, []Provider{fp}, newStaticTS(), nil)

	if err := s.runImport(context.Background(), "u", fp, "tok"); err != nil {
		t.Fatal(err)
	}
	counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(),
		store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a2"})
	if got := asInt64(counts.CompletedCount); got != 12 {
		t.Errorf("expected 12 imported, got %d", got)
	}
}

func TestImportDroppedSetsOverride(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a3", 12, 77, 0)
	mustInsertEpisodes(t, q, "a3", 12, 0)

	fp := &fakeProvider{
		name: ProviderAniList,
		fetched: []RemoteEntry{
			{ProviderAnimeID: 77, Status: StatusDropped, Progress: 5},
		},
	}
	s := NewService(q, db, []Provider{fp}, newStaticTS(), nil)
	if err := s.runImport(context.Background(), "u", fp, "tok"); err != nil {
		t.Fatal(err)
	}

	a, err := q.GetAnime(context.Background(), "a3")
	if err != nil {
		t.Fatal(err)
	}
	if a.WatchStatusOverride != "dropped" {
		t.Errorf("override not set: %q", a.WatchStatusOverride)
	}
}

// TestImportSkipsUnknownAnime verifies that a remote entry with no local
// anime match is a silent no-op rather than an error.
func TestImportSkipsUnknownAnime(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()

	fp := &fakeProvider{
		name: ProviderAniList,
		fetched: []RemoteEntry{
			{ProviderAnimeID: 9999, Status: StatusCompleted, Progress: 12},
		},
	}
	s := NewService(q, db, []Provider{fp}, newStaticTS(), nil)
	if err := s.runImport(context.Background(), "u", fp, "tok"); err != nil {
		t.Fatalf("import of unknown anime should be silent no-op: %v", err)
	}
}

// TestImportBangumiLookup covers the Bangumi branch of lookupAnimeByProviderID.
func TestImportBangumiLookup(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a4", 3, 0, 555)
	mustInsertEpisodes(t, q, "a4", 3, 0)

	fp := &fakeProvider{
		name: ProviderBangumi,
		fetched: []RemoteEntry{
			{ProviderAnimeID: 555, Status: StatusCompleted, Progress: 3},
		},
	}
	s := NewService(q, db, []Provider{fp}, newStaticTS(), nil)
	if err := s.runImport(context.Background(), "u", fp, "tok"); err != nil {
		t.Fatal(err)
	}
	counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(),
		store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a4"})
	if got := asInt64(counts.CompletedCount); got != 3 {
		t.Errorf("expected 3 imported via bangumi, got %d", got)
	}
}
