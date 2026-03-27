package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
)

type Service struct {
	bangumi bangumi.Client
	anilist anilist.Client
	cache   cache.Cache
}

func New(bgm bangumi.Client, al anilist.Client, c cache.Cache) *Service {
	return &Service{bangumi: bgm, anilist: al, cache: c}
}

func (s *Service) getCache(ctx context.Context, key string, target any) bool {
	data, err := s.cache.Get(ctx, key)
	if err != nil {
		return false
	}
	return json.Unmarshal(data, target) == nil
}

func (s *Service) setCache(ctx context.Context, key string, value any, ttl time.Duration) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	_ = s.cache.Set(ctx, key, data, ttl)
}

func subjectToSummary(s bangumi.Subject) AnimeSummary {
	title := s.NameCN
	if title == "" {
		title = s.Name
	}
	cover := s.Images.Large
	if cover == "" {
		cover = s.Images.Common
	}
	return AnimeSummary{
		BangumiID:     s.ID,
		Title:         title,
		TitleOriginal: s.Name,
		CoverImage:    cover,
		AirDate:       s.AirDate,
		EpisodeCount:  s.Eps,
		Score:         s.Rating.Score,
	}
}

func bangumiEpisodeToEpisode(e bangumi.Episode) Episode {
	title := e.NameCN
	if title == "" {
		title = e.Name
	}
	return Episode{
		BangumiEpisodeID: e.ID,
		Sort:             e.Sort,
		Title:            title,
		TitleOriginal:    e.Name,
		AirDate:          e.AirDate,
		Synopsis:         e.Desc,
	}
}

func (s *Service) GetCalendar(ctx context.Context) ([]CalendarDay, error) {
	cacheKey := "meta:calendar"
	var cached []CalendarDay
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	days, err := s.bangumi.GetCalendar(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]CalendarDay, 0, len(days))
	for _, d := range days {
		items := make([]AnimeSummary, 0, len(d.Items))
		for _, item := range d.Items {
			items = append(items, subjectToSummary(item))
		}
		result = append(result, CalendarDay{
			Weekday:   d.Weekday.CN,
			WeekdayEN: d.Weekday.EN,
			Items:     items,
		})
	}

	s.setCache(ctx, cacheKey, result, 2*time.Hour)
	return result, nil
}

func (s *Service) Search(ctx context.Context, query string) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:search:%s", query)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	subjects, err := s.bangumi.SearchSubjects(ctx, query)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, 0, len(subjects))
	for _, sub := range subjects {
		result = append(result, subjectToSummary(sub))
	}

	s.setCache(ctx, cacheKey, result, 1*time.Hour)
	return result, nil
}

func (s *Service) GetEpisodes(ctx context.Context, bangumiID int) ([]Episode, error) {
	cacheKey := fmt.Sprintf("meta:episodes:%d", bangumiID)
	var cached []Episode
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	eps, err := s.bangumi.GetSubjectEpisodes(ctx, bangumiID)
	if err != nil {
		return nil, err
	}

	result := make([]Episode, 0, len(eps))
	for _, e := range eps {
		result = append(result, bangumiEpisodeToEpisode(e))
	}

	s.setCache(ctx, cacheKey, result, 24*time.Hour)
	return result, nil
}

func (s *Service) GetAnimeDetail(ctx context.Context, bangumiID int) (*AnimeDetail, error) {
	cacheKey := fmt.Sprintf("meta:bangumi:%d", bangumiID)
	var cached AnimeDetail
	if s.getCache(ctx, cacheKey, &cached) {
		return &cached, nil
	}

	sub, err := s.bangumi.GetSubject(ctx, bangumiID)
	if err != nil {
		return nil, err
	}

	summary := subjectToSummary(*sub)

	tags := make([]string, 0, len(sub.Tags))
	for _, t := range sub.Tags {
		tags = append(tags, t.Name)
	}

	detail := &AnimeDetail{
		AnimeSummary: summary,
		Synopsis:     sub.Summary,
		Tags:         tags,
		Rating: Rating{
			Score: sub.Rating.Score,
			Total: sub.Rating.Total,
		},
	}

	// Enrich with AniList data (cover, banner, popularity, English title)
	if alID := s.findAniListID(ctx, bangumiID, sub.Name); alID > 0 {
		if media, err := s.anilist.GetMedia(ctx, alID); err == nil {
			detail.AniListID = media.ID
			if media.CoverImage.ExtraLarge != "" {
				detail.CoverImage = media.CoverImage.ExtraLarge
			}
			detail.BannerImage = media.BannerImage
			detail.TitleEN = media.Title.English
			detail.Popularity = media.Popularity
		}
	}

	s.setCache(ctx, cacheKey, detail, 24*time.Hour)
	return detail, nil
}

func (s *Service) findAniListID(ctx context.Context, bangumiID int, title string) int {
	xrefKey := fmt.Sprintf("meta:xref:bgm:%d", bangumiID)
	var alID int
	if s.getCache(ctx, xrefKey, &alID) {
		return alID
	}

	results, err := s.anilist.SearchMedia(ctx, title)
	if err != nil || len(results) == 0 {
		return 0
	}

	alID = results[0].ID
	s.setCache(ctx, xrefKey, alID, 7*24*time.Hour)
	reverseKey := fmt.Sprintf("meta:xref:al:%d", alID)
	s.setCache(ctx, reverseKey, bangumiID, 7*24*time.Hour)

	return alID
}

func (s *Service) GetTrending(ctx context.Context, page int) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:trending:%d", page)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	media, err := s.anilist.GetTrending(ctx, page, 20)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, len(media))
	for i, m := range media {
		result[i] = AnimeSummary{
			AniListID:     m.ID,
			Title:         m.Title.Romaji,
			TitleOriginal: m.Title.Native,
			TitleEN:       m.Title.English,
			CoverImage:    m.CoverImage.ExtraLarge,
			BannerImage:   m.BannerImage,
			EpisodeCount:  m.Episodes,
			Score:         float64(m.AverageScore) / 10.0,
		}
	}

	// Enrich with Bangumi Chinese titles concurrently
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5)

	for i := range result {
		i := i
		g.Go(func() error {
			bgmID := s.findBangumiID(gctx, result[i].AniListID, result[i].Title)
			if bgmID > 0 {
				result[i].BangumiID = bgmID
				if sub, err := s.bangumi.GetSubject(gctx, bgmID); err == nil {
					if sub.NameCN != "" {
						result[i].Title = sub.NameCN
					}
					result[i].TitleOriginal = sub.Name
					if result[i].Score == 0 {
						result[i].Score = sub.Rating.Score
					}
				}
			}
			return nil // enrichment failures are non-fatal
		})
	}
	_ = g.Wait()

	s.setCache(ctx, cacheKey, result, 6*time.Hour)
	return result, nil
}

func (s *Service) findBangumiID(ctx context.Context, anilistID int, title string) int {
	reverseKey := fmt.Sprintf("meta:xref:al:%d", anilistID)
	var bgmID int
	if s.getCache(ctx, reverseKey, &bgmID) {
		return bgmID
	}

	results, err := s.bangumi.SearchSubjects(ctx, title)
	if err != nil || len(results) == 0 {
		return 0
	}

	bgmID = results[0].ID
	s.setCache(ctx, reverseKey, bgmID, 7*24*time.Hour)
	xrefKey := fmt.Sprintf("meta:xref:bgm:%d", bgmID)
	s.setCache(ctx, xrefKey, anilistID, 7*24*time.Hour)

	return bgmID
}
