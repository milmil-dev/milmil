package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

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
