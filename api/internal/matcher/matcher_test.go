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
	"github.com/milmil/api/internal/integration/anidb"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/tmdb"
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

type mockTMDB struct {
	searchLanguages  []string
	seasonLanguages  []string
	searchByLanguage map[string][]tmdb.TVShow
	seasonByLanguage map[string]*tmdb.Season
}

func (m *mockTMDB) SearchTV(_ context.Context, _ string, language string) ([]tmdb.TVShow, error) {
	m.searchLanguages = append(m.searchLanguages, language)
	if m.searchByLanguage != nil {
		return m.searchByLanguage[language], nil
	}
	if language != "zh-TW" {
		return nil, nil
	}
	return []tmdb.TVShow{{ID: 100, Name: "繁體番劇"}}, nil
}

func (m *mockTMDB) GetTVExternalIDs(_ context.Context, _ int) (*tmdb.ExternalIDs, error) {
	return &tmdb.ExternalIDs{}, nil
}

func (m *mockTMDB) Ping(_ context.Context) error { return nil }

func (m *mockTMDB) GetTVDetails(_ context.Context, _ int, _ string) (*tmdb.TVShow, error) {
	return &tmdb.TVShow{}, nil
}

func (m *mockTMDB) GetTVSeason(_ context.Context, _ int, _ int, language string) (*tmdb.Season, error) {
	m.seasonLanguages = append(m.seasonLanguages, language)
	if m.seasonByLanguage != nil {
		season := m.seasonByLanguage[language]
		if season == nil {
			return &tmdb.Season{}, nil
		}
		return season, nil
	}
	if language != "zh-TW" {
		return &tmdb.Season{}, nil
	}
	return &tmdb.Season{SeasonNumber: 1, Episodes: []tmdb.TVEpisode{
		{EpisodeNumber: 1, Name: "繁體集名", Overview: "繁體簡介", StillPath: "/tw.jpg"},
	}}, nil
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

func TestEnrichEpisodesFromTMDBPrefersTraditionalChineseMetadata(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()
	ctx := context.Background()

	lib, _ := seedLibraryAndFile(t, q, "")
	anime, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID:            "anime-tmdb",
		LibraryID:     sql.NullString{String: lib.ID, Valid: true},
		Title:         "Test Anime",
		TitleZh:       sql.NullString{String: "舊中文名", Valid: true},
		Status:        "unknown",
		Genres:        "[]",
		WatchStatus:   "none",
		TotalEpisodes: sql.NullInt64{Int64: 1, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	ep, err := q.CreateEpisode(ctx, store.CreateEpisodeParams{
		ID:            "episode-tmdb",
		AnimeID:       anime.ID,
		EpisodeNumber: 1,
		TitleZh:       sql.NullString{String: "舊集名", Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}

	c := cache.New("")
	defer c.Close()
	client := &mockTMDB{}
	enriched, err := matcher.EnrichEpisodesFromTMDB(ctx, q, client, c, lib.ID)
	if err != nil {
		t.Fatal(err)
	}
	if enriched != 1 {
		t.Fatalf("want 1 enriched episode, got %d", enriched)
	}

	got, err := q.GetEpisode(ctx, ep.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.TitleZh.String != "繁體集名" {
		t.Fatalf("want Traditional Chinese title, got %q", got.TitleZh.String)
	}
	if got.SynopsisZh.String != "繁體簡介" {
		t.Fatalf("want Traditional Chinese synopsis, got %q", got.SynopsisZh.String)
	}
	if got.ThumbnailUrl.String != "https://image.tmdb.org/t/p/w300/tw.jpg" {
		t.Fatalf("want TMDB thumbnail, got %q", got.ThumbnailUrl.String)
	}
	if len(client.searchLanguages) == 0 || client.searchLanguages[0] != "zh-TW" {
		t.Fatalf("want first TMDB search in zh-TW, got %v", client.searchLanguages)
	}
	if len(client.seasonLanguages) == 0 || client.seasonLanguages[0] != "zh-TW" {
		t.Fatalf("want first TMDB season fetch in zh-TW, got %v", client.seasonLanguages)
	}
}

func TestEnrichEpisodesFromTMDBUsesAppearanceLanguage(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()
	ctx := context.Background()

	if _, err := q.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:   "appearance",
		Value: `{"language":"zh-CN"}`,
	}); err != nil {
		t.Fatal(err)
	}

	lib, _ := seedLibraryAndFile(t, q, "")
	anime, err := q.CreateAnime(ctx, store.CreateAnimeParams{
		ID:            "anime-tmdb-cn",
		LibraryID:     sql.NullString{String: lib.ID, Valid: true},
		Title:         "Test Anime",
		Status:        "unknown",
		Genres:        "[]",
		WatchStatus:   "none",
		TotalEpisodes: sql.NullInt64{Int64: 1, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	ep, err := q.CreateEpisode(ctx, store.CreateEpisodeParams{
		ID:            "episode-tmdb-cn",
		AnimeID:       anime.ID,
		EpisodeNumber: 1,
	})
	if err != nil {
		t.Fatal(err)
	}

	c := cache.New("")
	defer c.Close()
	client := &mockTMDB{
		searchByLanguage: map[string][]tmdb.TVShow{
			"zh-CN": {{ID: 200, Name: "简体番剧"}},
		},
		seasonByLanguage: map[string]*tmdb.Season{
			"zh-CN": {SeasonNumber: 1, Episodes: []tmdb.TVEpisode{
				{EpisodeNumber: 1, Name: "简体集名", Overview: "简体简介"},
			}},
		},
	}
	enriched, err := matcher.EnrichEpisodesFromTMDB(ctx, q, client, c, lib.ID)
	if err != nil {
		t.Fatal(err)
	}
	if enriched != 1 {
		t.Fatalf("want 1 enriched episode, got %d", enriched)
	}

	got, err := q.GetEpisode(ctx, ep.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.TitleZh.String != "简体集名" {
		t.Fatalf("want Simplified Chinese title, got %q", got.TitleZh.String)
	}
	if len(client.searchLanguages) == 0 || client.searchLanguages[0] != "zh-CN" {
		t.Fatalf("want first TMDB search in zh-CN, got %v", client.searchLanguages)
	}
	if len(client.seasonLanguages) == 0 || client.seasonLanguages[0] != "zh-CN" {
		t.Fatalf("want first TMDB season fetch in zh-CN, got %v", client.seasonLanguages)
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
	searchResult []bangumi.Subject
	searchErr    error
	episodes     []bangumi.Episode
	episodesErr  error
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

// buildFixtureAnidbServiceUnique returns a service preloaded with one Cowboy
// Bebop anime mapped across AniDB/MAL/AniList/Bangumi/TMDB.
func buildFixtureAnidbServiceUnique(t *testing.T) *anidb.Service {
	t.Helper()
	manami := []byte(`{"data":[{"sources":[
        "https://anidb.net/anime/23",
        "https://myanimelist.net/anime/1",
        "https://anilist.co/anime/1",
        "https://themoviedb.org/tv/30991"
    ]}]}`)
	al := []byte(`<anime-list><anime anidbid="23"><bangumiid>253</bangumiid></anime></anime-list>`)
	titles := []byte(`<?xml version="1.0"?><animetitles>
        <anime aid="23"><title>Cowboy Bebop</title></anime>
    </animetitles>`)
	m, err := anidb.LoadMapping(manami)
	if err != nil {
		t.Fatal(err)
	}
	extras, err := anidb.LoadAnimeListsMapping(al)
	if err != nil {
		t.Fatal(err)
	}
	m.MergeIDSets(extras)
	ti, err := anidb.LoadTitleIndex(titles)
	if err != nil {
		t.Fatal(err)
	}
	s := anidb.NewService(nil, t.TempDir())
	s.SetIndexesForTest(m, ti)
	return s
}

// buildFixtureAnidbServiceAmbiguous returns a service whose index contains two
// titles that score within ambiguity margin of each other.
func buildFixtureAnidbServiceAmbiguous(t *testing.T) *anidb.Service {
	t.Helper()
	// Both titles of equal length → both will score 1.0 on an exact-length
	// match of the query "Confusing Show Alpha" / "Confusing Show Betaa"
	// (identical prefix, different final token of same length).
	titles := []byte(`<?xml version="1.0"?><animetitles>
        <anime aid="100"><title>Confusing Show Alpha</title></anime>
        <anime aid="101"><title>Confusing Show Betax</title></anime>
    </animetitles>`)
	m, err := anidb.LoadMapping([]byte(`{"data":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	ti, err := anidb.LoadTitleIndex(titles)
	if err != nil {
		t.Fatal(err)
	}
	s := anidb.NewService(nil, t.TempDir())
	s.SetIndexesForTest(m, ti)
	return s
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
	if summary.ByAnidbTitle != 0 {
		t.Errorf("want by_anidb_title=0 (anidb nil), got %d", summary.ByAnidbTitle)
	}
}

func TestPass4TitleFallbackMatchesUniqueHit(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	// Filename that will parse to title="Cowboy Bebop" and episode 1.
	lib, _ := seedLibraryAndFileWithName(t, q, "[SubGroup] Cowboy Bebop - 01.mkv")

	ddpMock := &mockDandanplay{
		matchResult: &dandanplay.MatchResult{IsMatched: false},
	}
	bgmMock := &mockBangumi{
		// Pass 2 must NOT match: return nothing for title search so Pass 2 fails
		// but GetSubject (called by upsertAnimeByBangumi) still returns a subject.
		searchResult: nil,
		episodes: []bangumi.Episode{
			{ID: 9001, Sort: 1}, {ID: 9002, Sort: 2},
		},
	}

	c := cache.New("")
	defer c.Close()

	anidbSvc := buildFixtureAnidbServiceUnique(t)
	m := matcher.NewMulti(q, ddpMock, bgmMock, nil, c, anidbSvc)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}
	if summary.ByAnidbTitle < 1 {
		t.Fatalf("want by_anidb_title>=1, got summary=%+v", summary)
	}
	// Verify anime row exists keyed on bangumi_id=253 (present in fixture).
	row, err := q.GetAnimeByBangumiID(context.Background(), sql.NullInt64{Int64: 253, Valid: true})
	if err != nil {
		t.Fatalf("GetAnimeByBangumiID: %v", err)
	}
	if !row.AnidbID.Valid || row.AnidbID.Int64 != 23 {
		t.Errorf("want anidb_id=23 enriched on anime row, got %+v", row.AnidbID)
	}
}

func TestPass4SkipsAmbiguousCandidates(t *testing.T) {
	q, cleanup := newTestDB(t)
	defer cleanup()

	lib, _ := seedLibraryAndFileWithName(t, q, "[SubGroup] Confusing Show - 01.mkv")

	ddpMock := &mockDandanplay{matchResult: &dandanplay.MatchResult{IsMatched: false}}
	bgmMock := &mockBangumi{}

	c := cache.New("")
	defer c.Close()

	anidbSvc := buildFixtureAnidbServiceAmbiguous(t)
	m := matcher.NewMulti(q, ddpMock, bgmMock, nil, c, anidbSvc)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}
	if summary.ByAnidbTitle != 0 {
		t.Errorf("want by_anidb_title=0 (ambiguous), got %d (summary=%+v)", summary.ByAnidbTitle, summary)
	}
	if summary.Unmatched != 1 {
		t.Errorf("want unmatched=1, got %d", summary.Unmatched)
	}
}
