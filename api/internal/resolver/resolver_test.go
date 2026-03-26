package resolver_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/resolver"
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

// seedLibraryAndMatchedFile creates a library and a media file that has been
// matched by DandanPlay (has dandanplay_episode_id and dandanplay_anime_id set,
// but episode_id is NULL — i.e. unlinked).
func seedLibraryAndMatchedFile(t *testing.T, q *store.Queries, ddpEpisodeID, ddpAnimeID int64) (store.Library, store.MediaFile) {
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

	// Set file hash + dandanplay IDs (simulating matcher output)
	err = q.UpdateMediaFileHash(ctx, store.UpdateMediaFileHashParams{
		FileHash: sql.NullString{String: "abc123", Valid: true},
		ID:       mf.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	err = q.UpdateMediaFileDandanplayIDs(ctx, store.UpdateMediaFileDandanplayIDsParams{
		DandanplayEpisodeID: sql.NullInt64{Int64: ddpEpisodeID, Valid: true},
		DandanplayAnimeID:   sql.NullInt64{Int64: ddpAnimeID, Valid: true},
		ID:                  mf.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	mf, err = q.GetMediaFileByID(ctx, mf.ID)
	if err != nil {
		t.Fatal(err)
	}

	return lib, mf
}

// ─── Mocks ─────────────────────────────────────────────────────────────────────

type mockDandanplay struct {
	bangumiInfo    *dandanplay.BangumiInfo
	bangumiInfoErr error
}

func (m *mockDandanplay) MatchFile(_ context.Context, _, _ string, _ int64, _ int) (*dandanplay.MatchResult, error) {
	return nil, nil
}
func (m *mockDandanplay) GetComments(_ context.Context, _ int64) ([]dandanplay.Comment, error) {
	return nil, nil
}
func (m *mockDandanplay) PostComment(_ context.Context, _ int64, _ dandanplay.PostCommentReq) error {
	return nil
}
func (m *mockDandanplay) GetBangumiInfo(_ context.Context, _ int64) (*dandanplay.BangumiInfo, error) {
	return m.bangumiInfo, m.bangumiInfoErr
}

type mockBangumi struct {
	subject    *bangumi.Subject
	subjectErr error
	episodes   []bangumi.Episode
	episodesErr error
}

func (m *mockBangumi) SearchSubjects(_ context.Context, _ string) ([]bangumi.Subject, error) {
	return nil, nil
}
func (m *mockBangumi) GetCalendar(_ context.Context) ([]bangumi.CalendarDay, error) {
	return nil, nil
}
func (m *mockBangumi) GetSubject(_ context.Context, _ int) (*bangumi.Subject, error) {
	return m.subject, m.subjectErr
}
func (m *mockBangumi) GetSubjectEpisodes(_ context.Context, _ int) ([]bangumi.Episode, error) {
	return m.episodes, m.episodesErr
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

func TestResolveLibrary_CreatesAnimeAndEpisodes(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndMatchedFile(t, q, 90001, 100)

	ddp := &mockDandanplay{
		bangumiInfo: &dandanplay.BangumiInfo{
			AnimeID:    100,
			AnimeTitle: "Test Anime",
			BangumiID:  42,
		},
	}
	bgm := &mockBangumi{
		subject: &bangumi.Subject{
			ID:     42,
			Name:   "Test Anime",
			NameCN: "测试动画",
			Eps:    12,
			Images: bangumi.Images{Large: "https://img.example.com/cover.jpg"},
		},
		episodes: []bangumi.Episode{
			{ID: 90001, Sort: 1, Name: "Episode 1", NameCN: "第一集"},
			{ID: 90002, Sort: 2, Name: "Episode 2", NameCN: "第二集"},
		},
	}

	c := cache.New("")
	defer c.Close()

	r := resolver.New(q, bgm, ddp, c)
	summary, err := r.ResolveLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("ResolveLibrary: %v", err)
	}

	if summary.AnimeCreated != 1 {
		t.Errorf("want anime_created=1, got %d", summary.AnimeCreated)
	}
	if summary.EpisodesCreated != 2 {
		t.Errorf("want episodes_created=2, got %d", summary.EpisodesCreated)
	}

	// Verify anime record was created
	anime, err := q.GetAnimeByBangumiID(context.Background(), sql.NullInt64{Int64: 42, Valid: true})
	if err != nil {
		t.Fatalf("GetAnimeByBangumiID: %v", err)
	}
	if anime.Title != "测试动画" {
		t.Errorf("want title=测试动画, got %s", anime.Title)
	}

	// Verify episodes
	eps, err := q.ListEpisodesByAnimeID(context.Background(), anime.ID)
	if err != nil {
		t.Fatalf("ListEpisodesByAnimeID: %v", err)
	}
	if len(eps) != 2 {
		t.Fatalf("want 2 episodes, got %d", len(eps))
	}
}

func TestResolveLibrary_LinksFiles(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndMatchedFile(t, q, 90001, 100)

	ddp := &mockDandanplay{
		bangumiInfo: &dandanplay.BangumiInfo{
			AnimeID:    100,
			AnimeTitle: "Test Anime",
			BangumiID:  42,
		},
	}
	bgm := &mockBangumi{
		subject: &bangumi.Subject{
			ID:     42,
			Name:   "Test Anime",
			NameCN: "测试动画",
			Eps:    12,
		},
		episodes: []bangumi.Episode{
			{ID: 90001, Sort: 1, Name: "Episode 1", NameCN: "第一集"},
		},
	}

	c := cache.New("")
	defer c.Close()

	r := resolver.New(q, bgm, ddp, c)
	summary, err := r.ResolveLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("ResolveLibrary: %v", err)
	}

	if summary.FilesLinked != 1 {
		t.Errorf("want files_linked=1, got %d", summary.FilesLinked)
	}

	// Verify the media file now has episode_id set
	mf, err := q.GetMediaFileByID(context.Background(), "mf-1")
	if err != nil {
		t.Fatalf("GetMediaFileByID: %v", err)
	}
	if !mf.EpisodeID.Valid {
		t.Error("want episode_id to be set, got NULL")
	}
}

func TestResolveLibrary_SkipsExistingAnime(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndMatchedFile(t, q, 90001, 100)

	// Pre-create the anime record
	_, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
		ID:                  "existing-anime",
		LibraryID:           sql.NullString{String: lib.ID, Valid: true},
		Title:               "Already Exists",
		Status:              "unknown",
		Genres:              "[]",
		BangumiID:           sql.NullInt64{Int64: 42, Valid: true},
		DandanplayBangumiID: sql.NullInt64{Int64: 100, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}

	ddp := &mockDandanplay{
		bangumiInfo: &dandanplay.BangumiInfo{
			AnimeID:    100,
			AnimeTitle: "Test Anime",
			BangumiID:  42,
		},
	}
	bgm := &mockBangumi{
		// GetSubject should NOT be called since anime already exists
		episodes: []bangumi.Episode{
			{ID: 90001, Sort: 1, Name: "Episode 1"},
		},
	}

	c := cache.New("")
	defer c.Close()

	r := resolver.New(q, bgm, ddp, c)
	summary, err := r.ResolveLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("ResolveLibrary: %v", err)
	}

	// Should not have created a new anime
	if summary.AnimeCreated != 0 {
		t.Errorf("want anime_created=0, got %d", summary.AnimeCreated)
	}
}
