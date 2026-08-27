package metadata_test

import (
	"context"
	"errors"
	"testing"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/bilibili"
	"github.com/milmil/api/internal/integration/jikan"
	"github.com/milmil/api/internal/metadata"
)

// ─── Mock Bangumi Client ──────────────────────────────────────────────────────

type mockBangumi struct {
	searchFn      func(ctx context.Context, query string) ([]bangumi.Subject, error)
	searchByTagFn func(ctx context.Context, tags []string, sort string, page, limit int) ([]bangumi.Subject, int, error)
	calendarFn    func(ctx context.Context) ([]bangumi.CalendarDay, error)
	subjectFn     func(ctx context.Context, id int) (*bangumi.Subject, error)
	episodesFn    func(ctx context.Context, id int) ([]bangumi.Episode, error)
}

func (m *mockBangumi) SearchSubjects(ctx context.Context, query string, opts ...bangumi.SearchOption) ([]bangumi.Subject, error) {
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

func (m *mockBangumi) SearchByTag(ctx context.Context, tags []string, sort string, page, limit int) ([]bangumi.Subject, int, error) {
	if m.searchByTagFn != nil {
		return m.searchByTagFn(ctx, tags, sort, page, limit)
	}
	return nil, 0, nil
}

// ─── Mock AniList Client ──────────────────────────────────────────────────────

type mockAniList struct {
	searchFn   func(ctx context.Context, query string, isAdult bool) ([]anilist.Media, error)
	mediaFn    func(ctx context.Context, id int) (*anilist.Media, error)
	trendingFn func(ctx context.Context, page, perPage int) ([]anilist.Media, error)
	airingFn   func(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error)
}

func (m *mockAniList) SearchMedia(ctx context.Context, query string, isAdult bool) ([]anilist.Media, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query, isAdult)
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

func (m *mockAniList) Browse(ctx context.Context, filter anilist.BrowseFilter, page, perPage int) ([]anilist.Media, error) {
	return nil, nil
}

func (m *mockAniList) GetAiringSchedule(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
	if m.airingFn != nil {
		return m.airingFn(ctx, from, to)
	}
	return nil, nil
}

func (m *mockAniList) GetMediaRelations(ctx context.Context, id int) (*anilist.Media, error) {
	return nil, nil
}

// ─── Stub air-time fallbacks ──────────────────────────────────────────────────

type stubBilibili struct{ eps []bilibili.Episode }

func (s *stubBilibili) Timeline(ctx context.Context) ([]bilibili.Episode, error) {
	return s.eps, nil
}

type stubJikan struct{ entries []jikan.Anime }

func (s *stubJikan) CurrentSeason(ctx context.Context) ([]jikan.Anime, error) {
	return s.entries, nil
}

// newService builds a Service with the network-backed air-time fallbacks
// stubbed out so tests never leave the process.
func newService(bgm bangumi.Client, al anilist.Client, c cache.Cache) *metadata.Service {
	return metadata.New(bgm, al, c, metadata.WithAirTimeSources(&stubBilibili{}, &stubJikan{}))
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
	svc := newService(bgm, &mockAniList{}, cache.New(""))

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
	svc := newService(bgm, &mockAniList{}, cache.New(""))

	svc.GetCalendar(context.Background())
	svc.GetCalendar(context.Background())

	if callCount != 1 {
		t.Errorf("want 1 API call (cached), got %d", callCount)
	}
}

func TestGetCalendar_FallsBackToStaleOnUpstreamError(t *testing.T) {
	callCount := 0
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			callCount++
			if callCount == 1 {
				return []bangumi.CalendarDay{{
					Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
					Items: []bangumi.Subject{{
						ID: 1, Name: "テスト", NameCN: "測試",
					}},
				}}, nil
			}
			return nil, errors.New("bangumi 502")
		},
	}
	c := cache.New("")
	svc := newService(bgm, &mockAniList{}, c)

	if _, err := svc.GetCalendar(context.Background()); err != nil {
		t.Fatalf("seed call: %v", err)
	}

	// Expire the fresh cache so the next call must hit upstream.
	if err := c.Del(context.Background(), "meta:calendar"); err != nil {
		t.Fatalf("del fresh: %v", err)
	}

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatalf("want stale fallback, got error: %v", err)
	}
	if len(days) != 1 || len(days[0].Items) != 1 || days[0].Items[0].Title != "測試" {
		t.Errorf("want stale calendar with 測試, got %+v", days)
	}
	if callCount != 2 {
		t.Errorf("want upstream called twice (seed + retry-after-fresh-expire), got %d", callCount)
	}
}

func TestGetCalendar_FallsBackToAniListWhenBangumiFailsAndNoStale(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return nil, errors.New("bangumi 502")
		},
	}
	// 2024-01-01 09:00 JST = Monday
	mondayJST := int64(1704067200)
	al := &mockAniList{
		airingFn: func(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
			return []anilist.AiringSchedule{{
				AiringAt: int(mondayJST),
				Episode:  5,
				Media: anilist.Media{
					ID:         100,
					Title:      anilist.MediaTitle{Romaji: "Test", Native: "テスト"},
					CoverImage: anilist.CoverImage{ExtraLarge: "https://cover.jpg"},
				},
			}}, nil
		},
	}
	svc := newService(bgm, al, cache.New(""))

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatalf("want AniList fallback, got error: %v", err)
	}

	var monday *metadata.CalendarDay
	for i, d := range days {
		if d.WeekdayEN == "Mon" {
			monday = &days[i]
			break
		}
	}
	if monday == nil {
		t.Fatalf("Monday not found in fallback calendar: %+v", days)
	}
	if len(monday.Items) != 1 {
		t.Fatalf("want 1 Monday item, got %d", len(monday.Items))
	}
	item := monday.Items[0]
	if item.AniListID != 100 {
		t.Errorf("want AniListID=100, got %d", item.AniListID)
	}
	if item.CoverImage != "https://cover.jpg" {
		t.Errorf("want cover image, got %q", item.CoverImage)
	}
	if item.NextEpisode != 5 {
		t.Errorf("want NextEpisode=5, got %d", item.NextEpisode)
	}
	if item.AirTime != "09:00" {
		t.Errorf("want AirTime=09:00, got %q", item.AirTime)
	}
}

func TestGetCalendar_AirTimeSurvivesProviderTitleDrift(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items: []bangumi.Subject{
					// AniList appends a tagline Bangumi omits.
					{ID: 1, Name: "最強出涸らし皇子の暗躍帝位争い", NameCN: "最强废渣皇子暗中活跃于帝位之争"},
					// AniList uses full-width digits, Bangumi half-width.
					{ID: 2, Name: "ここは俺に任せて先に行けと言ってから10年がたったら伝説になっていた。", NameCN: "于是10年后我成为了传说"},
				},
			}}, nil
		},
	}
	al := &mockAniList{
		airingFn: func(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
			return []anilist.AiringSchedule{
				{
					AiringAt: 1704110220, // 2024-01-01 20:57 JST
					Media: anilist.Media{ID: 100, Title: anilist.MediaTitle{
						Native: "最強出涸らし皇子の暗躍帝位争い 無能を演じるSSランク皇子は皇位継承戦を影から支配する",
					}},
				},
				{
					AiringAt: 1704067200, // 2024-01-01 09:00 JST
					Media: anilist.Media{ID: 101, Title: anilist.MediaTitle{
						Native: "ここは俺に任せて先に行けと言ってから１０年がたったら伝説になっていた。",
					}},
				},
			}, nil
		},
	}
	svc := newService(bgm, al, cache.New(""))

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || len(days[0].Items) != 2 {
		t.Fatalf("want 1 day with 2 items, got %+v", days)
	}
	if got := days[0].Items[0].AirTime; got != "20:57" {
		t.Errorf("subtitle-drift item: want AirTime=20:57, got %q", got)
	}
	if got := days[0].Items[1].AirTime; got != "09:00" {
		t.Errorf("full-width item: want AirTime=09:00, got %q", got)
	}
}

func TestGetCalendar_AirTimeFallsBackToBilibiliAndJikan(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items: []bangumi.Subject{
					// Donghua — absent from AniList's schedule, on Bilibili's
					// timeline under the same simplified-Chinese title.
					{ID: 1, Name: "万古至尊：李云霄传", NameCN: ""},
					// JP anime AniList has no schedule for; MAL knows the slot.
					{ID: 2, Name: "北斗の拳 拳王軍ザコたちの挽歌 第2クール", NameCN: "北斗神拳 第二季"},
				},
			}}, nil
		},
	}
	b := &stubBilibili{eps: []bilibili.Episode{
		// 2024-01-01 09:00 CST = 10:00 JST — the calendar's contract is JST.
		{Title: "万古至尊：李云霄传", PubTS: 1704070800},
	}}
	j := &stubJikan{entries: []jikan.Anime{{
		Titles: []jikan.Title{
			{Type: "Default", Title: "Hokuto no Ken: Ken-Ou Gun Zako-tachi no Banka"},
			{Type: "Japanese", Title: "北斗の拳 拳王軍ザコたちの挽歌 第2クール"},
		},
		Broadcast: jikan.Broadcast{Day: "Mondays", Time: "23:00", Timezone: "Asia/Tokyo"},
	}}}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""), metadata.WithAirTimeSources(b, j))

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || len(days[0].Items) != 2 {
		t.Fatalf("want 1 day with 2 items, got %+v", days)
	}
	if got := days[0].Items[0].AirTime; got != "10:00" {
		t.Errorf("bilibili item: want AirTime=10:00 (JST), got %q", got)
	}
	if got := days[0].Items[1].AirTime; got != "23:00" {
		t.Errorf("jikan item: want AirTime=23:00, got %q", got)
	}
}

func TestGetCalendar_PrefersStaleOverAniListFallback(t *testing.T) {
	callCount := 0
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			callCount++
			if callCount == 1 {
				return []bangumi.CalendarDay{{
					Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
					Items: []bangumi.Subject{{
						ID: 1, Name: "テスト", NameCN: "從Bangumi來的測試",
					}},
				}}, nil
			}
			return nil, errors.New("bangumi 502")
		},
	}
	airingCalls := 0
	al := &mockAniList{
		airingFn: func(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
			airingCalls++
			return nil, nil
		},
	}
	c := cache.New("")
	svc := newService(bgm, al, c)

	if _, err := svc.GetCalendar(context.Background()); err != nil {
		t.Fatalf("seed: %v", err)
	}
	airingCallsAfterSeed := airingCalls

	if err := c.Del(context.Background(), "meta:calendar"); err != nil {
		t.Fatal(err)
	}

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatalf("want stale, got error: %v", err)
	}
	if len(days) != 1 || days[0].Items[0].Title != "從Bangumi來的測試" {
		t.Errorf("want stale Bangumi data, got %+v", days)
	}
	// AniList fallback path must NOT have been triggered when stale was available.
	if airingCalls != airingCallsAfterSeed {
		t.Errorf("AniList airing schedule called for fallback when stale was available")
	}
}

func TestGetCalendar_ReturnsErrorWhenNoStaleAvailable(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return nil, errors.New("bangumi 502")
		},
	}
	al := &mockAniList{
		airingFn: func(ctx context.Context, from, to int64) ([]anilist.AiringSchedule, error) {
			return nil, errors.New("anilist down too")
		},
	}
	svc := newService(bgm, al, cache.New(""))

	if _, err := svc.GetCalendar(context.Background()); err == nil {
		t.Fatal("want error when both Bangumi and AniList fail with no stale cache")
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
	svc := newService(bgm, &mockAniList{}, cache.New(""))

	results, err := svc.Search(context.Background(), "Frieren", false)
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
		searchFn: func(ctx context.Context, query string, isAdult bool) ([]anilist.Media, error) {
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
	svc := newService(bgm, al, cache.New(""))

	detail, err := svc.GetAnimeDetail(context.Background(), 425848, false)
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

func TestGetAnimeDetail_RefreshBypassesCache(t *testing.T) {
	calls := 0
	bgm := &mockBangumi{
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			calls++
			return &bangumi.Subject{
				ID: 425848, Name: "Frieren", NameCN: "葬送的芙莉蓮",
				Summary: "勇者一行人打倒了魔王",
				Rating:  bangumi.Rating{Score: 9.1, Total: 5000},
			}, nil
		},
	}
	al := &mockAniList{
		searchFn: func(ctx context.Context, query string, isAdult bool) ([]anilist.Media, error) {
			return nil, nil
		},
	}
	svc := newService(bgm, al, cache.New(""))

	if _, err := svc.GetAnimeDetail(context.Background(), 425848, false); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetAnimeDetail(context.Background(), 425848, false); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 Bangumi call before refresh, got %d", calls)
	}
	if _, err := svc.GetAnimeDetail(context.Background(), 425848, true); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 Bangumi calls after refresh=true, got %d", calls)
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
	svc := newService(bgm, al, cache.New(""))

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

func TestBrowseByTag_MapsAniListSortsToBangumi(t *testing.T) {
	cases := map[string]string{
		"":                "rank",
		"POPULARITY_DESC": "heat",
		"TRENDING_DESC":   "heat",
		"SCORE_DESC":      "score",
		"START_DATE_DESC": "rank",
		"heat":            "heat",
	}
	for input, want := range cases {
		var got string
		bgm := &mockBangumi{
			searchByTagFn: func(ctx context.Context, tags []string, sort string, page, limit int) ([]bangumi.Subject, int, error) {
				got = sort
				return nil, 0, nil
			},
		}
		svc := newService(bgm, &mockAniList{}, cache.New(""))
		if _, err := svc.BrowseByTag(context.Background(), []string{"原创"}, input, 1); err != nil {
			t.Fatalf("BrowseByTag(sort=%q): %v", input, err)
		}
		if got != want {
			t.Errorf("sort %q sent to Bangumi as %q, want %q", input, got, want)
		}
	}
}
