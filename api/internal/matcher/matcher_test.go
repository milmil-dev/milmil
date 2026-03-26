package matcher_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	_ "modernc.org/sqlite"
)

func newTestDB(t *testing.T) (*store.Queries, func()) {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	q := store.New(database)
	return q, func() { database.Close() }
}

func seedLibraryAndFile(t *testing.T, q *store.Queries, fileHash string) (store.Library, store.MediaFile) {
	t.Helper()
	ctx := context.Background()

	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("fake"), 0644)

	lib, err := q.CreateLibrary(ctx, store.CreateLibraryParams{
		ID:                  "lib-1",
		Name:                "Test",
		Path:                dir,
		Enabled:             1,
		ScanIntervalMinutes: 60,
	})
	if err != nil {
		t.Fatal(err)
	}

	mf, err := q.UpsertMediaFile(ctx, store.UpsertMediaFileParams{
		ID:        "mf-1",
		LibraryID: lib.ID,
		Path:      filepath.Join(dir, "ep01.mkv"),
		Filename:  "ep01.mkv",
		SizeBytes: 1000000,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Set file hash so it appears in unmatched list
	if fileHash != "" {
		err = q.UpdateMediaFileHash(ctx, store.UpdateMediaFileHashParams{
			FileHash: sql.NullString{String: fileHash, Valid: true},
			ID:       mf.ID,
		})
		if err != nil {
			t.Fatal(err)
		}
	}

	// Re-read the file to get the updated version
	mf, err = q.GetMediaFileByID(ctx, mf.ID)
	if err != nil {
		t.Fatal(err)
	}

	return lib, mf
}

// mockDandanplay implements dandanplay.Client for testing.
type mockDandanplay struct {
	matchResult *dandanplay.MatchResult
	matchErr    error
}

func (m *mockDandanplay) MatchFile(_ context.Context, _, _ string, _ int64, _ int) (*dandanplay.MatchResult, error) {
	return m.matchResult, m.matchErr
}

func (m *mockDandanplay) GetComments(_ context.Context, _ int64) ([]dandanplay.Comment, error) {
	return nil, nil
}

func (m *mockDandanplay) PostComment(_ context.Context, _ int64, _ dandanplay.PostCommentReq) error {
	return nil
}

func (m *mockDandanplay) GetBangumiInfo(_ context.Context, _ int64) (*dandanplay.BangumiInfo, error) {
	return nil, nil
}

func TestMatchLibrary_MatchesFile(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndFile(t, q, "abc123hash")

	mock := &mockDandanplay{
		matchResult: &dandanplay.MatchResult{
			IsMatched: true,
			Matches: []dandanplay.Match{
				{EpisodeID: 12345, AnimeID: 100, AnimeTitle: "Test Anime", EpisodeTitle: "Ep 1"},
			},
		},
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.New(q, mock, c)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}

	if summary.Matched != 1 {
		t.Errorf("want matched=1, got %d", summary.Matched)
	}
	if summary.Unmatched != 0 {
		t.Errorf("want unmatched=0, got %d", summary.Unmatched)
	}

	// Verify DB was updated
	mf, err := q.GetMediaFileByID(context.Background(), "mf-1")
	if err != nil {
		t.Fatal(err)
	}
	if !mf.DandanplayEpisodeID.Valid || mf.DandanplayEpisodeID.Int64 != 12345 {
		t.Errorf("want dandanplay_episode_id=12345, got %v", mf.DandanplayEpisodeID)
	}
	if !mf.DandanplayAnimeID.Valid || mf.DandanplayAnimeID.Int64 != 100 {
		t.Errorf("want dandanplay_anime_id=100, got %v", mf.DandanplayAnimeID)
	}
	if mf.MatchStatus != "auto" {
		t.Errorf("want match_status=auto, got %s", mf.MatchStatus)
	}
}

func TestMatchLibrary_NoMatch(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndFile(t, q, "abc123hash")

	mock := &mockDandanplay{
		matchResult: &dandanplay.MatchResult{
			IsMatched: false,
			Matches:   nil,
		},
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.New(q, mock, c)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}

	if summary.Matched != 0 {
		t.Errorf("want matched=0, got %d", summary.Matched)
	}
	if summary.Unmatched != 1 {
		t.Errorf("want unmatched=1, got %d", summary.Unmatched)
	}
}

func TestMatchLibrary_ContinuesOnError(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndFile(t, q, "abc123hash")

	mock := &mockDandanplay{
		matchErr: errors.New("API unavailable"),
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.New(q, mock, c)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary should not return error, got: %v", err)
	}

	if summary.Errors != 1 {
		t.Errorf("want errors=1, got %d", summary.Errors)
	}
	if summary.Matched != 0 {
		t.Errorf("want matched=0, got %d", summary.Matched)
	}
}
