package metadata_test

import (
	"context"
	"testing"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
)

// ─── Mock Bangumi Client ──────────────────────────────────────────────────────

type mockBangumi struct {
	searchFn   func(ctx context.Context, query string) ([]bangumi.Subject, error)
	calendarFn func(ctx context.Context) ([]bangumi.CalendarDay, error)
	subjectFn  func(ctx context.Context, id int) (*bangumi.Subject, error)
	episodesFn func(ctx context.Context, id int) ([]bangumi.Episode, error)
}

func (m *mockBangumi) SearchSubjects(ctx context.Context, query string) ([]bangumi.Subject, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query)
	}
	return nil, nil
}

func (m *mockBangumi) GetCalendar(ctx context.Context) ([]bangumi.CalendarDay, error) {
	if m.calendarFn != nil {
		return m.calendarFn(ctx)
	}
	return nil, nil
}

func (m *mockBangumi) GetSubject(ctx context.Context, id int) (*bangumi.Subject, error) {
	if m.subjectFn != nil {
		return m.subjectFn(ctx, id)
	}
	return nil, bangumi.ErrNotFound
}

func (m *mockBangumi) GetSubjectEpisodes(ctx context.Context, subjectID int) ([]bangumi.Episode, error) {
	if m.episodesFn != nil {
		return m.episodesFn(ctx, subjectID)
	}
	return nil, nil
}

func (m *mockBangumi) GetSubjectComments(ctx context.Context, subjectID int, limit int) ([]bangumi.SubjectComment, error) {
	return nil, nil
}

// ─── Mock AniList Client ──────────────────────────────────────────────────────

type mockAniList struct {
	searchFn   func(ctx context.Context, query string) ([]anilist.Media, error)
	mediaFn    func(ctx context.Context, id int) (*anilist.Media, error)
	trendingFn func(ctx context.Context, page, perPage int) ([]anilist.Media, error)
}

func (m *mockAniList) SearchMedia(ctx context.Context, query string) ([]anilist.Media, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query)
	}
	return nil, nil
}

func (m *mockAniList) GetMedia(ctx context.Context, id int) (*anilist.Media, error) {
	if m.mediaFn != nil {
		return m.mediaFn(ctx, id)
	}
	return nil, nil
}

func (m *mockAniList) GetTrending(ctx context.Context, page, perPage int) ([]anilist.Media, error) {
	if m.trendingFn != nil {
		return m.trendingFn(ctx, page, perPage)
	}
	return nil, nil
}

func (m *mockAniList) BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]anilist.Media, error) {
	return nil, nil
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestGetCalendar_ReturnsChinese(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items: []bangumi.Subject{{
					ID: 1, Name: "テスト", NameCN: "測試", Eps: 12,
					Rating: bangumi.Rating{Score: 8.5},
				}},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].Weekday != "星期一" {
		t.Errorf("want 星期一, got %v", days)
	}
	if days[0].Items[0].Title != "測試" {
		t.Errorf("want Chinese title 測試, got %s", days[0].Items[0].Title)
	}
}

func TestGetCalendar_CacheHit(t *testing.T) {
	callCount := 0
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			callCount++
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items:   []bangumi.Subject{},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	svc.GetCalendar(context.Background())
	svc.GetCalendar(context.Background())

	if callCount != 1 {
		t.Errorf("want 1 API call (cached), got %d", callCount)
	}
}

func TestSearch_ReturnsBangumiResults(t *testing.T) {
	bgm := &mockBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{
				ID: 425848, Name: "Frieren", NameCN: "葬送的芙莉蓮", Eps: 28,
				Rating: bangumi.Rating{Score: 9.1},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	results, err := svc.Search(context.Background(), "Frieren")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("want 1 result, got %d", len(results))
	}
	if results[0].Title != "葬送的芙莉蓮" {
		t.Errorf("want Chinese title, got %s", results[0].Title)
	}
}

func TestGetAnimeDetail_EnrichesWithAniList(t *testing.T) {
	bgm := &mockBangumi{
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return &bangumi.Subject{
				ID: 425848, Name: "Frieren", NameCN: "葬送的芙莉蓮",
				Summary: "勇者一行人打倒了魔王",
				Tags:    []bangumi.Tag{{Name: "奇幻"}},
				Rating:  bangumi.Rating{Score: 9.1, Total: 5000},
			}, nil
		},
	}
	al := &mockAniList{
		searchFn: func(ctx context.Context, query string) ([]anilist.Media, error) {
			return []anilist.Media{{
				ID:          154587,
				Title:       anilist.MediaTitle{English: "Frieren: Beyond Journey's End"},
				CoverImage:  anilist.CoverImage{ExtraLarge: "https://cover.jpg"},
				BannerImage: "https://banner.jpg",
				Popularity:  200000,
			}}, nil
		},
		mediaFn: func(ctx context.Context, id int) (*anilist.Media, error) {
			return &anilist.Media{
				ID:          154587,
				Title:       anilist.MediaTitle{English: "Frieren: Beyond Journey's End"},
				CoverImage:  anilist.CoverImage{ExtraLarge: "https://cover.jpg"},
				BannerImage: "https://banner.jpg",
				Popularity:  200000,
			}, nil
		},
	}
	svc := metadata.New(bgm, al, cache.New(""))

	detail, err := svc.GetAnimeDetail(context.Background(), 425848)
	if err != nil {
		t.Fatal(err)
	}
	if detail.CoverImage != "https://cover.jpg" {
		t.Errorf("want AniList cover, got %s", detail.CoverImage)
	}
	if detail.BannerImage != "https://banner.jpg" {
		t.Errorf("want AniList banner, got %s", detail.BannerImage)
	}
	if detail.Synopsis != "勇者一行人打倒了魔王" {
		t.Errorf("want Chinese synopsis, got %s", detail.Synopsis)
	}
}

func TestGetTrending_EnrichesWithBangumi(t *testing.T) {
	bgm := &mockBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{ID: 1, Name: "Test", NameCN: "測試動畫"}}, nil
		},
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return &bangumi.Subject{ID: 1, Name: "Test", NameCN: "測試動畫", Rating: bangumi.Rating{Score: 8.0}}, nil
		},
	}
	al := &mockAniList{
		trendingFn: func(ctx context.Context, page, perPage int) ([]anilist.Media, error) {
			return []anilist.Media{{
				ID:           100,
				Title:        anilist.MediaTitle{Romaji: "Test", Native: "テスト"},
				CoverImage:   anilist.CoverImage{ExtraLarge: "https://img.jpg"},
				AverageScore: 80,
				Episodes:     12,
			}}, nil
		},
	}
	svc := metadata.New(bgm, al, cache.New(""))

	results, err := svc.GetTrending(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("want 1, got %d", len(results))
	}
	if results[0].Title != "測試動畫" {
		t.Errorf("want Chinese title from Bangumi enrichment, got %s", results[0].Title)
	}
	if results[0].BangumiID != 1 {
		t.Errorf("want BangumiID=1, got %d", results[0].BangumiID)
	}
}
