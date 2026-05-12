package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
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
		MediaType:     m.Format,
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
	// Bangumi fills "第 N 集" / "第 N 話" as a placeholder when the episode
	// has no real title yet (typically unaired episodes). Treat that as
	// empty so the UI can hide the title row instead of duplicating the
	// episode-number badge already shown above it.
	if isPlaceholderEpisodeTitle(title) {
		title = ""
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

// placeholderEpisodeTitleRE matches "第 N 集" / "第N話" / "第 N 期" forms
// that Bangumi auto-generates for episodes without titles. Whitespace is
// optional; the unit covers Chinese 集, Japanese 話/话, and 期/章.
var placeholderEpisodeTitleRE = regexp.MustCompile(`^第\s*\d+(?:\.\d+)?\s*[集話话期章]\s*$`)

func isPlaceholderEpisodeTitle(title string) bool {
	return placeholderEpisodeTitleRE.MatchString(strings.TrimSpace(title))
}

func (s *Service) GetCalendar(ctx context.Context) ([]CalendarDay, error) {
	const (
		cacheKey      = "meta:calendar"
		staleCacheKey = "meta:calendar:stale"
		freshTTL      = 2 * time.Hour
		staleTTL      = 7 * 24 * time.Hour
	)
	var cached []CalendarDay
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	days, err := s.bangumi.GetCalendar(ctx)
	if err != nil {
		// Bangumi sometimes returns 502 (Cloudflare upstream failure). Try, in order:
		// 1) last known good Bangumi calendar (preserves Chinese titles + Bangumi IDs)
		// 2) live AniList airing schedule (fresh but no Bangumi-side cross-ref)
		var stale []CalendarDay
		if s.getCache(ctx, staleCacheKey, &stale) && len(stale) > 0 {
			return stale, nil
		}
		if alResult, alErr := s.calendarFromAniList(ctx); alErr == nil && len(alResult) > 0 {
			return alResult, nil
		}
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

	// Enrich with air times from AniList airing schedule
	s.enrichCalendarAirTimes(ctx, result)

	s.setCache(ctx, cacheKey, result, freshTTL)
	s.setCache(ctx, staleCacheKey, result, staleTTL)
	return result, nil
}

// calendarFromAniList builds a 7-day calendar from AniList's airing schedule.
// Used as fallback when Bangumi is unreachable and no stale cache is available.
// Items lack BangumiID, so library cross-ref will be empty until Bangumi recovers.
func (s *Service) calendarFromAniList(ctx context.Context) ([]CalendarDay, error) {
	now := time.Now()
	schedules, err := s.anilist.GetAiringSchedule(ctx, now.Unix(), now.Add(7*24*time.Hour).Unix())
	if err != nil {
		return nil, err
	}

	jst := time.FixedZone("Asia/Tokyo", 9*60*60)
	type names struct{ cn, en string }
	weekdays := map[time.Weekday]names{
		time.Monday:    {"星期一", "Mon"},
		time.Tuesday:   {"星期二", "Tue"},
		time.Wednesday: {"星期三", "Wed"},
		time.Thursday:  {"星期四", "Thu"},
		time.Friday:    {"星期五", "Fri"},
		time.Saturday:  {"星期六", "Sat"},
		time.Sunday:    {"星期日", "Sun"},
	}
	order := []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday, time.Sunday}

	grouped := make(map[time.Weekday][]anilist.AiringSchedule, 7)
	for _, sched := range schedules {
		wd := time.Unix(int64(sched.AiringAt), 0).In(jst).Weekday()
		grouped[wd] = append(grouped[wd], sched)
	}

	result := make([]CalendarDay, 0, 7)
	for _, wd := range order {
		scheds := grouped[wd]
		items := make([]AnimeSummary, 0, len(scheds))
		seen := make(map[int]bool, len(scheds))
		for _, sched := range scheds {
			if seen[sched.Media.ID] {
				continue
			}
			seen[sched.Media.ID] = true
			sum := anilistMediaToSummary(sched.Media)
			sum.AirTime = time.Unix(int64(sched.AiringAt), 0).In(jst).Format("15:04")
			sum.NextEpisode = sched.Episode
			items = append(items, sum)
		}
		result = append(result, CalendarDay{
			Weekday:   weekdays[wd].cn,
			WeekdayEN: weekdays[wd].en,
			Items:     items,
		})
	}
	return result, nil
}

// enrichCalendarAirTimes fetches the week's airing schedule from AniList and
// matches entries to Bangumi calendar items by native (Japanese) title.
func (s *Service) enrichCalendarAirTimes(ctx context.Context, days []CalendarDay) {
	now := time.Now()
	from := now.Add(-24 * time.Hour).Unix()
	to := now.Add(7 * 24 * time.Hour).Unix()

	schedules, err := s.anilist.GetAiringSchedule(ctx, from, to)
	if err != nil || len(schedules) == 0 {
		return
	}

	// Build lookup: normalized title → air time string (HH:mm JST)
	jst := time.FixedZone("Asia/Tokyo", 9*60*60)
	type airInfo struct {
		time string
	}
	lookup := make(map[string]airInfo, len(schedules))
	for _, s := range schedules {
		t := time.Unix(int64(s.AiringAt), 0).In(jst)
		info := airInfo{time: t.Format("15:04")}
		if s.Media.Title.Native != "" {
			lookup[normalizeTitle(s.Media.Title.Native)] = info
		}
		if s.Media.Title.Romaji != "" {
			lookup[normalizeTitle(s.Media.Title.Romaji)] = info
		}
	}

	// Match against Bangumi items
	for di := range days {
		for ii := range days[di].Items {
			item := &days[di].Items[ii]
			if info, ok := lookup[normalizeTitle(item.TitleOriginal)]; ok {
				item.AirTime = info.time
			} else if info, ok := lookup[normalizeTitle(item.Title)]; ok {
				item.AirTime = info.time
			}
		}
	}
}

func normalizeTitle(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ToLower(s)
	// Remove common punctuation differences
	s = strings.Map(func(r rune) rune {
		switch r {
		case '　', ' ', '-', '–', '—', '~', '〜', '・', ':', '：', '!', '！', '?', '？', ',', '、', '.', '。':
			return -1
		}
		return r
	}, s)
	return s
}

func (s *Service) Search(ctx context.Context, query string, isAdult bool) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:search:%s:%v", query, isAdult)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	if isAdult {
		// Search Bangumi (with nsfw flag) and AniList adult in parallel
		g, gctx := errgroup.WithContext(ctx)
		var subjects []bangumi.Subject
		var adultMedia []anilist.Media
		g.Go(func() error {
			var err error
			subjects, err = s.bangumi.SearchSubjects(gctx, query, bangumi.WithNSFW())
			return err
		})
		g.Go(func() error {
			var err error
			adultMedia, err = s.anilist.SearchMedia(gctx, query, true)
			return err
		})
		if err := g.Wait(); err != nil {
			return nil, err
		}

		// If AniList adult search returned nothing (e.g. Chinese query),
		// fall back to popular adult anime so the toggle always shows adult content.
		if len(adultMedia) == 0 {
			fallback, err := s.anilist.Browse(ctx, anilist.BrowseFilter{IsAdult: true, Sort: "POPULARITY_DESC"}, 1, 20)
			if err == nil {
				adultMedia = fallback
			}
		}

		result := make([]AnimeSummary, 0, len(subjects)+len(adultMedia))
		for _, sub := range subjects {
			result = append(result, subjectToSummary(sub))
		}
		for _, m := range adultMedia {
			result = append(result, anilistMediaToSummary(m))
		}
		s.setCache(ctx, cacheKey, result, 1*time.Hour)
		return result, nil
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

// SearchWithVariants searches using multiple query variants in parallel,
// deduplicating results by Bangumi subject ID.
func (s *Service) SearchWithVariants(ctx context.Context, variants []string, isAdult bool) ([]AnimeSummary, error) {
	if len(variants) == 0 {
		return nil, nil
	}

	// Try first variant — if it returns ≥5 results, skip the rest
	first, err := s.Search(ctx, variants[0], isAdult)
	if err != nil {
		return nil, err
	}
	if len(first) >= 5 || len(variants) == 1 {
		return first, nil
	}

	// Search remaining variants in parallel
	type variantResult struct {
		results []AnimeSummary
	}
	g, gctx := errgroup.WithContext(ctx)
	remaining := make([]variantResult, len(variants)-1)
	for i, v := range variants[1:] {
		g.Go(func() error {
			r, err := s.Search(gctx, v, isAdult)
			if err != nil {
				return nil // Don't fail — just skip this variant
			}
			remaining[i] = variantResult{results: r}
			return nil
		})
	}
	_ = g.Wait()

	// Merge and deduplicate
	seen := make(map[string]struct{})
	var merged []AnimeSummary
	addResults := func(results []AnimeSummary) {
		for _, r := range results {
			key := fmt.Sprintf("%d-%d", r.BangumiID, r.AniListID)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, r)
		}
	}
	addResults(first)
	for _, vr := range remaining {
		addResults(vr.results)
	}
	return merged, nil
}

func (s *Service) GetEpisodes(ctx context.Context, bangumiID int) ([]Episode, error) {
	cacheKey := fmt.Sprintf("meta:episodes:%d", bangumiID)
	var cached []Episode
	if s.getCache(ctx, cacheKey, &cached) {
		// Strip Bangumi auto-generated "第 N 集" placeholders from cached
		// data too — entries written before the read-time filter existed
		// still carry them, and we don't want to wait 24h for the cache
		// to expire.
		for i := range cached {
			if isPlaceholderEpisodeTitle(cached[i].Title) {
				cached[i].Title = ""
			}
		}
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

func (s *Service) GetAnimeDetail(ctx context.Context, bangumiID int, refresh bool) (*AnimeDetail, error) {
	cacheKey := fmt.Sprintf("meta:bangumi:%d", bangumiID)
	if !refresh {
		var cached AnimeDetail
		if s.getCache(ctx, cacheKey, &cached) {
			return &cached, nil
		}
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
			if media.Format != "" {
				detail.MediaType = media.Format
			}
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

// GetAnimeDetailByAniList constructs an AnimeDetail purely from AniList data.
// Used when no Bangumi entry exists for an anime (e.g., certain OVAs, specials).
func (s *Service) GetAnimeDetailByAniList(ctx context.Context, anilistID int) (*AnimeDetail, error) {
	cacheKey := fmt.Sprintf("meta:anilist:%d", anilistID)
	var cached AnimeDetail
	if s.getCache(ctx, cacheKey, &cached) {
		return &cached, nil
	}

	media, err := s.anilist.GetMedia(ctx, anilistID)
	if err != nil {
		return nil, err
	}

	summary := anilistMediaToSummary(*media)
	detail := &AnimeDetail{
		AnimeSummary: summary,
		Synopsis:     media.Description,
		BannerImage:  media.BannerImage,
		Popularity:   media.Popularity,
		Tags:         media.Genres,
		Rating: Rating{
			Score: float64(media.AverageScore) / 10.0,
		},
	}

	if media.Trailer != nil && media.Trailer.ID != "" && media.Trailer.Site == "youtube" {
		detail.TrailerURL = "https://www.youtube.com/embed/" + media.Trailer.ID
	}

	// Relations
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

	// Enrich with Bangumi Chinese titles (same pattern as GetTrending/Browse)
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5)

	for i := range result {
		i := i
		g.Go(func() error {
			bgmID := s.findBangumiID(gctx, result[i].AniListID, result[i].TitleOriginal)
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
					if sub.Rating.Score > 0 {
						result[i].Score = sub.Rating.Score
					}
					if sub.AirDate != "" {
						result[i].AirDate = sub.AirDate
					}
				}
			}
			return nil
		})
	}
	_ = g.Wait()

	s.setCache(ctx, cacheKey, result, 6*time.Hour)
	return result, nil
}

// BrowseFilter mirrors the AniList browse filter for the metadata layer.
type BrowseFilter struct {
	Genre    string
	Genres   []string
	Sort     string
	Year     int
	Season   string
	MinScore int
	Status   string
	Format   string
	IsAdult  bool
}

func (s *Service) Browse(ctx context.Context, filter BrowseFilter, page int) ([]AnimeSummary, error) {
	genreKey := filter.Genre
	if len(filter.Genres) > 0 {
		genreKey = fmt.Sprintf("%v", filter.Genres)
	}
	cacheKey := fmt.Sprintf("meta:browse:%s:%s:%d:%s:%d:%s:%s:%v:%d",
		genreKey, filter.Sort, filter.Year, filter.Season, filter.MinScore, filter.Status, filter.Format, filter.IsAdult, page)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	alFilter := anilist.BrowseFilter{
		Genre:    filter.Genre,
		Genres:   filter.Genres,
		Sort:     filter.Sort,
		Year:     filter.Year,
		Season:   filter.Season,
		MinScore: filter.MinScore,
		Status:   filter.Status,
		Format:   filter.Format,
	}

	var media []anilist.Media
	if filter.IsAdult {
		// Fetch both normal and adult results in parallel
		bg, bgctx := errgroup.WithContext(ctx)
		var normalMedia, adultMedia []anilist.Media
		bg.Go(func() error {
			var err error
			normalMedia, err = s.anilist.Browse(bgctx, alFilter, page, 50)
			return err
		})
		adultFilter := alFilter
		adultFilter.IsAdult = true
		bg.Go(func() error {
			var err error
			adultMedia, err = s.anilist.Browse(bgctx, adultFilter, page, 50)
			return err
		})
		if err := bg.Wait(); err != nil {
			return nil, err
		}
		// Deduplicate by ID: normal first, then adult
		seen := make(map[int]bool, len(normalMedia))
		for _, m := range normalMedia {
			seen[m.ID] = true
		}
		media = append(normalMedia, filterUnseen(adultMedia, seen)...)
	} else {
		var err error
		media, err = s.anilist.Browse(ctx, alFilter, page, 50)
		if err != nil {
			return nil, err
		}
	}

	result := make([]AnimeSummary, len(media))
	for i, m := range media {
		result[i] = anilistMediaToSummary(m)
	}

	// Enrich with Bangumi Chinese titles (same pattern as GetTrending)
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5)

	for i := range result {
		i := i
		g.Go(func() error {
			bgmID := s.findBangumiID(gctx, result[i].AniListID, result[i].TitleOriginal)
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
					if sub.Rating.Score > 0 {
						result[i].Score = sub.Rating.Score
					}
					if sub.AirDate != "" {
						result[i].AirDate = sub.AirDate
					}
				}
			}
			return nil
		})
	}
	_ = g.Wait()

	s.setCache(ctx, cacheKey, result, 6*time.Hour)
	return result, nil
}

func filterUnseen(media []anilist.Media, seen map[int]bool) []anilist.Media {
	out := make([]anilist.Media, 0, len(media))
	for _, m := range media {
		if !seen[m.ID] {
			out = append(out, m)
		}
	}
	return out
}

func (s *Service) BrowseByTag(ctx context.Context, tags []string, sort string, page int) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:tag:%v:%s:%d", tags, sort, page)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	subjects, _, err := s.bangumi.SearchByTag(ctx, tags, sort, page, 20)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, 0, len(subjects))
	for _, sub := range subjects {
		result = append(result, subjectToSummary(sub))
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

	results, err := s.anilist.SearchMedia(ctx, title, false)
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
		// Only accept exact title matches to avoid mismatching
		// "Title" to "Title 2nd Season" or unrelated results.
		matched := false
		for _, sub := range subjects {
			if sub.Name == title || sub.NameCN == title {
				bangumiID = sub.ID
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
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
