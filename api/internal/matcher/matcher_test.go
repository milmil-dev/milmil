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
	"github.com/milmil/api/internal/integration/bangumi"
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

// mockBangumi implements bangumi.Client for testing.
type mockBangumi struct {
	searchResult  []bangumi.Subject
	searchErr     error
	episodes      []bangumi.Episode
	episodesErr   error
}

func (m *mockBangumi) SearchSubjects(_ context.Context, _ string, _ ...bangumi.SearchOption) ([]bangumi.Subject, error) {
	return m.searchResult, m.searchErr
}

func (m *mockBangumi) SearchByTag(_ context.Context, _ []string, _ string, _, _ int) ([]bangumi.Subject, int, error) {
	return nil, 0, nil
}

func (m *mockBangumi) GetCalendar(_ context.Context) ([]bangumi.CalendarDay, error) {
	return nil, nil
}

func (m *mockBangumi) GetSubject(_ context.Context, _ int) (*bangumi.Subject, error) {
	return nil, nil
}

func (m *mockBangumi) GetSubjectEpisodes(_ context.Context, _ int) ([]bangumi.Episode, error) {
	return m.episodes, m.episodesErr
}

func (m *mockBangumi) GetSubjectComments(_ context.Context, _ int, _ int) ([]bangumi.SubjectComment, error) {
	return nil, nil
}

// seedLibraryAndFileWithName creates a library and a media file with a custom filename (no hash).
func seedLibraryAndFileWithName(t *testing.T, q *store.Queries, filename string) (store.Library, store.MediaFile) {
	t.Helper()
	ctx := context.Background()

	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, filename), []byte("fake"), 0644)

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
		Path:      filepath.Join(dir, filename),
		Filename:  filename,
		SizeBytes: 1000000,
	})
	if err != nil {
		t.Fatal(err)
	}

	return lib, mf
}

func TestMatchLibrary_BangumiFallback(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	// File with a parseable name but no hash — dandanplay cannot match it.
	lib, _ := seedLibraryAndFileWithName(t, q, "[SubGroup] My Anime - 03.mkv")

	// Dandanplay returns no match (no hash to work with).
	ddpMock := &mockDandanplay{
		matchResult: &dandanplay.MatchResult{IsMatched: false},
	}

	// Bangumi returns a subject and episodes.
	bgmMock := &mockBangumi{
		searchResult: []bangumi.Subject{
			{ID: 200, Name: "My Anime", NameCN: "My Anime CN"},
		},
		episodes: []bangumi.Episode{
			{ID: 5001, Sort: 1, Name: "Ep 1"},
			{ID: 5002, Sort: 2, Name: "Ep 2"},
			{ID: 5003, Sort: 3, Name: "Ep 3"},
		},
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.NewMulti(q, ddpMock, bgmMock, nil, c, nil)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}

	if summary.Matched != 1 {
		t.Errorf("want matched=1, got %d", summary.Matched)
	}
	if summary.ByBangumi != 1 {
		t.Errorf("want by_bangumi=1, got %d", summary.ByBangumi)
	}
	if summary.ByDandanplay != 0 {
		t.Errorf("want by_dandanplay=0, got %d", summary.ByDandanplay)
	}
	if summary.Unmatched != 0 {
		t.Errorf("want unmatched=0, got %d", summary.Unmatched)
	}

	// Verify DB was updated with Bangumi IDs.
	mf, err := q.GetMediaFileByID(context.Background(), "mf-1")
	if err != nil {
		t.Fatal(err)
	}
	if !mf.BangumiSubjectID.Valid || mf.BangumiSubjectID.Int64 != 200 {
		t.Errorf("want bangumi_subject_id=200, got %v", mf.BangumiSubjectID)
	}
	if !mf.BangumiEpisodeID.Valid || mf.BangumiEpisodeID.Int64 != 5003 {
		t.Errorf("want bangumi_episode_id=5003, got %v", mf.BangumiEpisodeID)
	}
}

// TestExistingPassesUnchangedWhenAnidbNil asserts NewMulti(..., nil) behaves
// identically to the pre-AniDB Matcher: Pass 2 (Bangumi) still matches 1 file,
// no panics, no Pass 4 fallback invoked.
func TestExistingPassesUnchangedWhenAnidbNil(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndFileWithName(t, q, "[SubGroup] My Anime - 03.mkv")

	ddpMock := &mockDandanplay{
		matchResult: &dandanplay.MatchResult{IsMatched: false},
	}
	bgmMock := &mockBangumi{
		searchResult: []bangumi.Subject{{ID: 200, Name: "My Anime"}},
		episodes: []bangumi.Episode{
			{ID: 5001, Sort: 1}, {ID: 5002, Sort: 2}, {ID: 5003, Sort: 3},
		},
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.NewMulti(q, ddpMock, bgmMock, nil, c, nil)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}
	if summary.Matched != 1 || summary.ByBangumi != 1 {
		t.Errorf("want matched=1 by_bangumi=1, got %+v", summary)
	}
}
