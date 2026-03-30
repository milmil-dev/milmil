package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
	"unicode"

	"golang.org/x/sync/errgroup"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/anizip"
	"github.com/milmil/api/internal/integration/bangumi"
)

type Service struct {
	bangumi bangumi.Client
	anilist anilist.Client
	anizip  *anizip.Client
	cache   cache.Cache
}

func New(bgm bangumi.Client, al anilist.Client, c cache.Cache) *Service {
	return &Service{bangumi: bgm, anilist: al, anizip: anizip.New(), cache: c}
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

func anilistMediaToSummary(m anilist.Media) AnimeSummary {
	title := m.Title.Romaji
	if m.Title.Native != "" {
		title = m.Title.Native
	}
	cover := m.CoverImage.ExtraLarge
	if cover == "" {
		cover = m.CoverImage.Large
	}
	return AnimeSummary{
		AniListID:     m.ID,
		Title:         title,
		TitleOriginal: m.Title.Romaji,
		TitleEN:       m.Title.English,
		CoverImage:    cover,
		BannerImage:   m.BannerImage,
		Genres:        m.Genres,
		EpisodeCount:  m.Episodes,
		Score:         float64(m.AverageScore) / 10.0,
	}
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

	// Enrich with next episode number concurrently
	today := time.Now().Format("2006-01-02")
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(8)

	for di := range result {
		for ii := range result[di].Items {
			di, ii := di, ii
			bgmID := result[di].Items[ii].BangumiID
			if bgmID == 0 {
				continue
			}
			g.Go(func() error {
				eps, err := s.bangumi.GetSubjectEpisodes(gctx, bgmID)
				if err != nil || len(eps) == 0 {
					return nil
				}
				aired := 0
				for _, ep := range eps {
					if ep.AirDate != "" && ep.AirDate <= today {
						aired++
					}
				}
				result[di].Items[ii].NextEpisode = aired + 1
				return nil
			})
		}
	}
	_ = g.Wait()

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

	// Enrich with ani.zip episode images (TVDB thumbnails + duration).
	// Try to get AniList ID from: 1) cached detail, 2) cross-ref cache, 3) fresh search
	alID := 0
	detailCacheKey := fmt.Sprintf("meta:bangumi:%d", bangumiID)
	var cachedDetail AnimeDetail
	if s.getCache(ctx, detailCacheKey, &cachedDetail) && cachedDetail.AniListID > 0 {
		alID = cachedDetail.AniListID
	}
	if alID == 0 {
		if sub, subErr := s.bangumi.GetSubject(ctx, bangumiID); subErr == nil {
			alID = s.findAniListID(ctx, bangumiID, sub.Name)
		}
	}
	if alID > 0 {
		azResp, azErr := s.anizip.GetEpisodes(ctx, alID)
		if azErr == nil && azResp.Episodes != nil {
			// Calculate offset: min sort → maps to ani.zip key "1"
			minSort := result[0].Sort
			for _, ep := range result {
				if ep.Sort < minSort {
					minSort = ep.Sort
				}
			}
			offset := int(minSort) - 1 // e.g. minSort=14 → offset=13

			for i := range result {
				absKey := fmt.Sprintf("%d", int(result[i].Sort))
				relKey := fmt.Sprintf("%d", int(result[i].Sort)-offset)

				// Try absolute key first, then relative (1-based)
				ep, ok := azResp.Episodes[absKey]
				if !ok {
					ep, ok = azResp.Episodes[relKey]
				}
				if ok {
					if ep.Image != "" {
						result[i].Image = ep.Image
					}
					if ep.Runtime > 0 {
						result[i].Duration = ep.Runtime
					}
					// Use ani.zip summary if Bangumi synopsis is empty or in Japanese
					// (Bangumi often returns Japanese descriptions for episodes)
					if ep.Summary != "" && (result[i].Synopsis == "" || isJapanese(result[i].Synopsis)) {
						result[i].Synopsis = ep.Summary
					}
				}
			}
		}
	}

	s.setCache(ctx, cacheKey, result, 24*time.Hour)
	return result, nil
}

// isJapanese detects if text contains Japanese-specific characters (hiragana/katakana).
// Chinese text uses only CJK ideographs, while Japanese mixes in kana.
func isJapanese(text string) bool {
	for _, r := range text {
		if unicode.In(r, unicode.Hiragana, unicode.Katakana) {
			return true
		}
	}
	return false
}

type BangumiComment struct {
	ID        int    `json:"id"`
	Username  string `json:"username"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar,omitempty"`
	Rate      int    `json:"rate"`
	Comment   string `json:"comment"`
	UpdatedAt int64  `json:"updated_at"`
}

func (s *Service) GetComments(ctx context.Context, bangumiID int) ([]BangumiComment, error) {
	cacheKey := fmt.Sprintf("meta:comments:%d", bangumiID)
	var cached []BangumiComment
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	raw, err := s.bangumi.GetSubjectComments(ctx, bangumiID, 20)
	if err != nil {
		return nil, err
	}

	result := make([]BangumiComment, 0, len(raw))
	for _, c := range raw {
		if c.Comment == "" {
			continue
		}
		result = append(result, BangumiComment{
			ID:        c.ID,
			Username:  c.User.Username,
			Nickname:  c.User.Nickname,
			Avatar:    c.User.Avatar.Medium,
			Rate:      c.Rate,
			Comment:   c.Comment,
			UpdatedAt: c.UpdatedAt,
		})
	}

	s.setCache(ctx, cacheKey, result, 1*time.Hour)
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

	// Enrich with AniList data (cover, banner, popularity, English title, relations, recommendations)
	if alID := s.findAniListID(ctx, bangumiID, sub.Name); alID > 0 {
		if media, err := s.anilist.GetMedia(ctx, alID); err == nil {
			detail.AniListID = media.ID
			if media.CoverImage.ExtraLarge != "" {
				detail.CoverImage = media.CoverImage.ExtraLarge
			}
			detail.BannerImage = media.BannerImage
			detail.TitleEN = media.Title.English
			detail.Popularity = media.Popularity
			if media.Trailer != nil && media.Trailer.ID != "" && media.Trailer.Site == "youtube" {
				detail.TrailerURL = "https://www.youtube.com/embed/" + media.Trailer.ID
			}

			// Relations (prequel, sequel, side story, etc.)
			if media.Relations != nil {
				for _, edge := range media.Relations.Edges {
					if edge.Node.Format != "ANIME" && edge.Node.Format != "OVA" && edge.Node.Format != "ONA" && edge.Node.Format != "MOVIE" && edge.Node.Format != "SPECIAL" {
						continue
					}
					detail.Relations = append(detail.Relations, RelatedAnime{
						RelationType: edge.RelationType,
						Anime:        anilistMediaToSummary(edge.Node),
					})
				}
			}

			// Recommendations
			if media.Recommendations != nil {
				for _, rec := range media.Recommendations.Nodes {
					if rec.MediaRecommendation != nil && rec.MediaRecommendation.Format != "MANGA" {
						detail.Recommendations = append(detail.Recommendations, anilistMediaToSummary(*rec.MediaRecommendation))
					}
				}
			}

			// Reviews
			if media.Reviews != nil {
				for _, r := range media.Reviews.Nodes {
					detail.Reviews = append(detail.Reviews, UserReview{
						ID:       r.ID,
						Summary:  r.Summary,
						Score:    r.Score,
						Username: r.User.Name,
						Avatar:   r.User.Avatar.Medium,
					})
				}
			}

			// Characters
			if media.Characters != nil {
				for _, edge := range media.Characters.Edges {
					char := AnimeCharacter{
						Role: edge.Role,
						Character: CharacterPerson{
							ID:         edge.Node.ID,
							Name:       edge.Node.Name.Full,
							NameNative: edge.Node.Name.Native,
							Image:      edge.Node.Image.Medium,
						},
					}
					if len(edge.VoiceActors) > 0 {
						va := edge.VoiceActors[0]
						char.VoiceActor = &CharacterPerson{
							ID:         va.ID,
							Name:       va.Name.Full,
							NameNative: va.Name.Native,
							Image:      va.Image.Medium,
						}
					}
					detail.Characters = append(detail.Characters, char)
				}
			}
		}
	}

	s.setCache(ctx, cacheKey, detail, 24*time.Hour)
	return detail, nil
}

func (s *Service) BrowseByGenre(ctx context.Context, genre string, page int) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:genre:%s:%d", genre, page)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	media, err := s.anilist.BrowseByGenre(ctx, genre, page, 20)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, len(media))
	for i, m := range media {
		result[i] = anilistMediaToSummary(m)
	}

	s.setCache(ctx, cacheKey, result, 6*time.Hour)
	return result, nil
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

// ResolveBangumiID finds the Bangumi subject ID for a given AniList ID.
// It checks the cross-ref cache first, then fetches the AniList title and
// searches Bangumi to find a match.
func (s *Service) ResolveBangumiID(ctx context.Context, anilistID int) (int, error) {
	// Check reverse cache first
	reverseKey := fmt.Sprintf("meta:xref:al:%d", anilistID)
	var bangumiID int
	if s.getCache(ctx, reverseKey, &bangumiID) && bangumiID > 0 {
		return bangumiID, nil
	}

	// Fetch AniList media to get the title
	media, err := s.anilist.GetMedia(ctx, anilistID)
	if err != nil {
		return 0, err
	}

	// Search Bangumi using the native (Japanese) title first, then romaji
	titles := []string{media.Title.Native, media.Title.Romaji, media.Title.English}
	for _, title := range titles {
		if title == "" {
			continue
		}
		subjects, err := s.bangumi.SearchSubjects(ctx, title)
		if err != nil || len(subjects) == 0 {
			continue
		}
		bangumiID = subjects[0].ID
		// Cache both directions
		s.setCache(ctx, reverseKey, bangumiID, 7*24*time.Hour)
		fwdKey := fmt.Sprintf("meta:xref:bgm:%d", bangumiID)
		s.setCache(ctx, fwdKey, anilistID, 7*24*time.Hour)
		return bangumiID, nil
	}

	return 0, bangumi.ErrNotFound
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
			Description:   m.Description,
			Genres:        m.Genres,
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
					if sub.Summary != "" {
						result[i].Description = sub.Summary
					}
					// Always prefer Bangumi score (consistent with detail page)
					if sub.Rating.Score > 0 {
						result[i].Score = sub.Rating.Score
					}
					if sub.AirDate != "" {
						result[i].AirDate = sub.AirDate
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
