package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
	_ "modernc.org/sqlite"
)

// ─── Stubs ────────────────────────────────────────────────────────────────────

type stubBangumi struct {
	searchFn   func(ctx context.Context, query string) ([]bangumi.Subject, error)
	calendarFn func(ctx context.Context) ([]bangumi.CalendarDay, error)
	subjectFn  func(ctx context.Context, id int) (*bangumi.Subject, error)
	episodesFn func(ctx context.Context, id int) ([]bangumi.Episode, error)
}

func (m *stubBangumi) SearchSubjects(ctx context.Context, q string, opts ...bangumi.SearchOption) ([]bangumi.Subject, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, q)
	}
	return nil, nil
}
func (m *stubBangumi) GetCalendar(ctx context.Context) ([]bangumi.CalendarDay, error) {
	if m.calendarFn != nil {
		return m.calendarFn(ctx)
	}
	return nil, nil
}
func (m *stubBangumi) GetSubject(ctx context.Context, id int) (*bangumi.Subject, error) {
	if m.subjectFn != nil {
		return m.subjectFn(ctx, id)
	}
	return nil, bangumi.ErrNotFound
}
func (m *stubBangumi) GetSubjectEpisodes(ctx context.Context, id int) ([]bangumi.Episode, error) {
	if m.episodesFn != nil {
		return m.episodesFn(ctx, id)
	}
	return nil, nil
}
func (m *stubBangumi) GetSubjectComments(ctx context.Context, subjectID int, limit int) ([]bangumi.SubjectComment, error) {
	return nil, nil
}
func (m *stubBangumi) SearchByTag(ctx context.Context, tags []string, sort string, page, limit int) ([]bangumi.Subject, int, error) {
	return nil, 0, nil
}

type stubAniList struct {
	searchFn   func(ctx context.Context, query string) ([]anilist.Media, error)
	mediaFn    func(ctx context.Context, id int) (*anilist.Media, error)
	trendingFn func(ctx context.Context, page, perPage int) ([]anilist.Media, error)
}

func (m *stubAniList) SearchMedia(ctx context.Context, q string, isAdult bool) ([]anilist.Media, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, q)
	}
	return nil, nil
}
func (m *stubAniList) GetMedia(ctx context.Context, id int) (*anilist.Media, error) {
	if m.mediaFn != nil {
		return m.mediaFn(ctx, id)
	}
	return nil, nil
}
func (m *stubAniList) GetTrending(ctx context.Context, p, pp int) ([]anilist.Media, error) {
	if m.trendingFn != nil {
		return m.trendingFn(ctx, p, pp)
	}
	return nil, nil
}
func (m *stubAniList) BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]anilist.Media, error) {
	return nil, nil
}
func (m *stubAniList) Browse(ctx context.Context, filter anilist.BrowseFilter, page, perPage int) ([]anilist.Media, error) {
	return nil, nil
}
func (m *stubAniList) GetAiringSchedule(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
	return nil, nil
}

func (m *stubAniList) GetMediaRelations(ctx context.Context, id int) (*anilist.Media, error) {
	return nil, nil
}

// ─── Helper ───────────────────────────────────────────────────────────────────

func newTestAppWithMetadata(t *testing.T, bgm bangumi.Client, al anilist.Client) *echo.Echo {
	t.Helper()
	database, dsn := newTestDB(t)
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(bgm, al, c)
	return api.NewRouter(cfg, database, c, metadataSvc, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, noopChecker())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestCalendar_Success(t *testing.T) {
	bgm := &stubBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items:   []bangumi.Subject{{ID: 1, Name: "Test", NameCN: "測試", Eps: 12}},
			}}, nil
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/calendar", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSearch_MissingQuery(t *testing.T) {
	e := newTestAppWithMetadata(t, &stubBangumi{}, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/search", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestSearch_Success(t *testing.T) {
	bgm := &stubBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{ID: 1, Name: "Frieren", NameCN: "芙莉蓮", Eps: 28}}, nil
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/search?q=Frieren", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnimeDetail_NotFound(t *testing.T) {
	bgm := &stubBangumi{
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return nil, bangumi.ErrNotFound
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/anime/99999", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}
