package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"golang.org/x/text/language"

	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/metadata"
)

// preferredLocale picks a canonical locale (zh-TW / zh-CN / zh-HK /
// en-US / ja-JP / ko-KR) for response localization. Order of preference:
//   1. The `appearance.language` setting the user picked in milmil itself
//      (so the configured UI language wins over whatever the browser says).
//   2. The browser's Accept-Language header.
//   3. zh-TW as a default — the project's primary audience and the
//      matcher's default fallback.
func (h *handler) preferredLocale(c echo.Context) string {
	if loc := h.appearanceLocale(c.Request().Context()); loc != "" {
		return loc
	}
	return parseAcceptLanguageHeader(c.Request().Header.Get("Accept-Language"))
}

// appearanceLocale reads the appearance.language setting and normalizes it.
// Returns "" if the setting isn't set or unparseable.
func (h *handler) appearanceLocale(ctx context.Context) string {
	if h.queries == nil {
		return ""
	}
	setting, err := h.queries.GetSetting(ctx, "appearance")
	if err != nil {
		return ""
	}
	var appearance struct {
		Language string `json:"language"`
	}
	if json.Unmarshal([]byte(setting.Value), &appearance) != nil {
		return ""
	}
	return canonicalizeLocale(appearance.Language)
}

func parseAcceptLanguageHeader(header string) string {
	if header == "" {
		return "zh-TW"
	}
	tags, _, err := language.ParseAcceptLanguage(header)
	if err != nil || len(tags) == 0 {
		return "zh-TW"
	}
	for _, t := range tags {
		base, _ := t.Base()
		region, _ := t.Region()
		switch base.String() {
		case "zh":
			switch region.String() {
			case "TW":
				return "zh-TW"
			case "HK", "MO":
				return "zh-HK"
			case "CN", "SG":
				return "zh-CN"
			}
			s, _ := t.Script()
			if s.String() == "Hant" {
				return "zh-TW"
			}
			if s.String() == "Hans" {
				return "zh-CN"
			}
			return "zh-TW"
		case "en":
			return "en-US"
		case "ja":
			return "ja-JP"
		case "ko":
			return "ko-KR"
		}
	}
	return "zh-TW"
}

// canonicalizeLocale maps user-input locale strings (e.g. "zh-Hant", "zh_TW",
// "en") to the canonical form used elsewhere. Returns "" if unrecognized.
func canonicalizeLocale(raw string) string {
	s := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(raw), "_", "-"))
	switch s {
	case "zh-tw", "zh-hant", "zh-hant-tw":
		return "zh-TW"
	case "zh-hk", "zh-hant-hk", "zh-mo":
		return "zh-HK"
	case "zh-cn", "zh-hans", "zh-hans-cn", "zh-sg":
		return "zh-CN"
	case "en", "en-us", "en-gb":
		return "en-US"
	case "ja", "ja-jp":
		return "ja-JP"
	case "ko", "ko-kr":
		return "ko-KR"
	}
	return ""
}

// localeNeedsTMDBOverride returns true for locales where TMDB likely has
// better-quality localized titles than Bangumi's NameCN (which is always
// 简中). zh-CN users are already well-served by Bangumi.
func localeNeedsTMDBOverride(locale string) bool {
	switch locale {
	case "zh-TW", "zh-HK", "ja-JP", "ko-KR", "en-US":
		return true
	default:
		return false
	}
}

// enrichSummariesWithTMDB overlays TMDB's localized title (and overview, when
// the existing description is empty) on a slice of AnimeSummary entries.
// Score, AirDate, Genres, BangumiID — anything Bangumi/AniList already curate
// well — are left alone. Failures are non-fatal: any per-item error degrades
// gracefully to whatever the metadata service already returned.
func (h *handler) enrichSummariesWithTMDB(ctx context.Context, summaries []metadata.AnimeSummary, locale string, refresh bool) {
	client := h.tmdbClient()
	if client == nil || len(summaries) == 0 {
		return
	}
	if !localeNeedsTMDBOverride(locale) {
		return
	}

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5)
	for i := range summaries {
		i := i
		s := summaries[i]
		searchQuery := s.TitleOriginal
		if searchQuery == "" {
			searchQuery = s.Title
		}
		if searchQuery == "" {
			continue
		}
		g.Go(func() error {
			tmdbID, err := h.lookupTMDBID(gctx, client, s.AniListID, s.BangumiID, searchQuery)
			if err != nil || tmdbID == 0 {
				return nil
			}
			show, err := h.fetchTMDBLocalizedShow(gctx, client, tmdbID, locale, refresh)
			if err != nil || show == nil {
				return nil
			}
			if show.Name != "" {
				summaries[i].Title = show.Name
			}
			if overview := h.fetchTMDBSynopsisWithFallback(gctx, client, tmdbID, locale, refresh); overview != "" {
				summaries[i].Description = overview
			}
			return nil
		})
	}
	_ = g.Wait()
}

// enrichEpisodesWithTMDB overlays TMDB localized episode titles, synopses,
// and stills onto a Bangumi-sourced episode list. This is the request-time
// equivalent of matcher.EnrichEpisodesFromTMDB (which runs at scan/match
// time and writes to the DB for library-tied anime). Used on the discover
// path so a user browsing a non-library anime still gets 繁中 episodes.
//
// Handles the multi-season case: Bangumi numbers episodes franchise-wide
// (e.g. Rent-a-Girlfriend S5 has episodes 49-60), but TMDB stores each
// season with its own 1-based numbering. We fetch the show's seasons[]
// summary, compute cumulative episode counts, and map each Bangumi sort
// number to the right TMDB (season, episode) pair.
//
// Strategy: read the TMDB show ID from the xref cache (populated by the
// /discover/anime/:id call). If not cached, skip — we don't want to add a
// blocking SearchTV roundtrip just to render episodes; the detail call
// already does that work and warms the cache.
func (h *handler) enrichEpisodesWithTMDB(ctx context.Context, eps []metadata.Episode, bangumiID int, locale string, refresh bool) {
	client := h.tmdbClient()
	if client == nil || !localeNeedsTMDBOverride(locale) || len(eps) == 0 {
		return
	}
	if bangumiID <= 0 {
		return
	}
	var tmdbID int
	if data, err := h.cache.Get(ctx, tmdbXrefKey(0, bangumiID, "")); err == nil {
		_ = json.Unmarshal(data, &tmdbID)
	}
	if tmdbID == 0 {
		return
	}
	show, err := h.fetchTMDBLocalizedShow(ctx, client, tmdbID, locale, refresh)
	if err != nil || show == nil {
		return
	}

	seasonForEpisode := make(map[int]struct {
		Season  int
		Episode int
	})
	for i := range eps {
		n := int(eps[i].Sort)
		if float64(n) != eps[i].Sort || n <= 0 {
			continue
		}
		seasonNum, episodeNum, ok := mapEpisodeToTMDBSeason(show.Seasons, n)
		if !ok {
			continue
		}
		seasonForEpisode[i] = struct {
			Season  int
			Episode int
		}{seasonNum, episodeNum}
	}
	if len(seasonForEpisode) == 0 {
		return
	}

	needed := make(map[int]bool)
	for _, m := range seasonForEpisode {
		needed[m.Season] = true
	}
	seasons := make(map[int]map[int]tmdb.TVEpisode, len(needed))
	for sn := range needed {
		s, ok := h.fetchTMDBLocalizedSeason(ctx, client, tmdbID, sn, locale, refresh)
		if !ok {
			continue
		}
		byNum := make(map[int]tmdb.TVEpisode, len(s.Episodes))
		for _, e := range s.Episodes {
			byNum[e.EpisodeNumber] = e
		}
		seasons[sn] = byNum
	}

	for i, m := range seasonForEpisode {
		byNum, ok := seasons[m.Season]
		if !ok {
			continue
		}
		te, ok := byNum[m.Episode]
		if !ok {
			continue
		}
		if te.Name != "" && !isPlaceholderEpisodeTitleString(te.Name) {
			eps[i].Title = te.Name
		}
		if te.Overview != "" {
			eps[i].Synopsis = te.Overview
		}
		if te.StillPath != "" {
			eps[i].Image = "https://image.tmdb.org/t/p/w300" + te.StillPath
		}
	}
}

// placeholderTitleRE catches the same "第 N 集 / 第 N 話" auto-generated
// titles that the metadata package strips. Defined locally so this package
// doesn't take a hard dependency on metadata internals just for one regex.
var placeholderTitleRE = regexp.MustCompile(`^第\s*\d+(?:\.\d+)?\s*[集話话期章]\s*$`)

func isPlaceholderEpisodeTitleString(title string) bool {
	return placeholderTitleRE.MatchString(strings.TrimSpace(title))
}

// mapEpisodeToTMDBSeason takes a Bangumi-style absolute episode number and
// the show's TMDB seasons[] layout and returns which (season, episode-in-
// season) pair it maps to. Skips season 0 (specials) since Bangumi rarely
// numbers across them.
func mapEpisodeToTMDBSeason(seasons []tmdb.SeasonInfo, n int) (int, int, bool) {
	if n <= 0 {
		return 0, 0, false
	}
	// Sort-stable filter: keep season_number > 0, in order they came back.
	// TMDB returns them sorted but we don't rely on it.
	cumulative := 0
	// Two passes: first to build a sorted list of regular seasons.
	regular := make([]tmdb.SeasonInfo, 0, len(seasons))
	for _, s := range seasons {
		if s.SeasonNumber <= 0 || s.EpisodeCount <= 0 {
			continue
		}
		regular = append(regular, s)
	}
	// Sort by season_number to make the cumulative walk deterministic.
	for i := 1; i < len(regular); i++ {
		for j := i; j > 0 && regular[j-1].SeasonNumber > regular[j].SeasonNumber; j-- {
			regular[j-1], regular[j] = regular[j], regular[j-1]
		}
	}
	for _, s := range regular {
		if n <= cumulative+s.EpisodeCount {
			return s.SeasonNumber, n - cumulative, true
		}
		cumulative += s.EpisodeCount
	}
	return 0, 0, false
}

func (h *handler) fetchTMDBLocalizedSeason(ctx context.Context, client tmdb.Client, tmdbID, seasonNumber int, locale string, refresh bool) (*tmdb.Season, bool) {
	cacheKey := fmt.Sprintf("tmdb:season:%s:%d:%d:%s", xrefVersion, tmdbID, seasonNumber, locale)
	if !refresh {
		if data, err := h.cache.Get(ctx, cacheKey); err == nil {
			var cached tmdb.Season
			if json.Unmarshal(data, &cached) == nil && len(cached.Episodes) > 0 {
				return &cached, true
			}
		}
	}
	season, err := client.GetTVSeason(ctx, tmdbID, seasonNumber, locale)
	if err != nil || season == nil || len(season.Episodes) == 0 {
		return nil, false
	}
	if data, err := json.Marshal(season); err == nil {
		_ = h.cache.Set(ctx, cacheKey, data, 24*time.Hour)
	}
	return season, true
}

// enrichAnimeDetailWithTMDB applies TMDB enrichment across the detail's own
// summary fields, the standalone Synopsis, recommendations, and relations.
func (h *handler) enrichAnimeDetailWithTMDB(ctx context.Context, detail *metadata.AnimeDetail, locale string, refresh bool) {
	if detail == nil {
		return
	}
	client := h.tmdbClient()
	if client == nil || !localeNeedsTMDBOverride(locale) {
		return
	}
	primary := []metadata.AnimeSummary{detail.AnimeSummary}
	h.enrichSummariesWithTMDB(ctx, primary, locale, refresh)
	detail.AnimeSummary = primary[0]

	searchQuery := detail.TitleOriginal
	if searchQuery == "" {
		searchQuery = detail.Title
	}
	if searchQuery != "" {
		if tmdbID, err := h.lookupTMDBID(ctx, client, detail.AniListID, detail.BangumiID, searchQuery); err == nil && tmdbID > 0 {
			if overview := h.fetchTMDBSynopsisWithFallback(ctx, client, tmdbID, locale, refresh); overview != "" {
				detail.Synopsis = overview
			}
		}
	}

	if len(detail.Recommendations) > 0 {
		h.enrichSummariesWithTMDB(ctx, detail.Recommendations, locale, refresh)
	}
	if len(detail.Relations) > 0 {
		rels := make([]metadata.AnimeSummary, len(detail.Relations))
		for i, r := range detail.Relations {
			rels[i] = r.Anime
		}
		h.enrichSummariesWithTMDB(ctx, rels, locale, refresh)
		for i := range detail.Relations {
			detail.Relations[i].Anime = rels[i]
		}
	}
}

// lookupTMDBID returns a TMDB show ID for the given anime, using a cache to
// avoid re-searching. anilistID/bangumiID drive the cache key when available;
// the search query is the Japanese original name. If a direct match returns
// zero results we retry with the season suffix stripped — TMDB indexes
// "彼女、お借りします" but Bangumi names it "彼女、お借りします 第5期" for the
// per-season subject.
func (h *handler) lookupTMDBID(ctx context.Context, client tmdb.Client, anilistID, bangumiID int, query string) (int, error) {
	cacheKey := tmdbXrefKey(anilistID, bangumiID, query)
	var cached int
	if data, err := h.cache.Get(ctx, cacheKey); err == nil {
		if json.Unmarshal(data, &cached) == nil {
			// Even on a cache hit, propagate to the sibling key. The detail
			// call (which has both IDs) might have populated only al:; the
			// episodes call only knows bgm: and would otherwise miss.
			h.writeXrefSiblingKey(ctx, anilistID, bangumiID, cached)
			return cached, nil
		}
	}

	// First attempt: original query.
	id, err := searchFirstTMDBID(ctx, client, query)
	if err != nil {
		if errors.Is(err, tmdb.ErrUnauthorized) {
			return 0, nil
		}
		return 0, err
	}

	// Second attempt: strip season/part suffixes and retry once. Only if
	// stripping actually changed the query — otherwise we'd be repeating
	// the same call.
	if id == 0 {
		stripped := stripSeasonSuffix(query)
		if stripped != "" && stripped != query {
			retried, retryErr := searchFirstTMDBID(ctx, client, stripped)
			if retryErr != nil && !errors.Is(retryErr, tmdb.ErrUnauthorized) {
				return 0, retryErr
			}
			id = retried
		}
	}

	_ = h.writeTMDBXrefCache(ctx, cacheKey, id)
	h.writeXrefSiblingKey(ctx, anilistID, bangumiID, id)
	return id, nil
}

// writeXrefSiblingKey ensures both al: and bgm: cache entries point at the
// same TMDB ID when both source IDs are known. Without this the episodes
// endpoint (which only knows the Bangumi ID from the URL) would miss when
// the detail endpoint had previously cached under al:.
func (h *handler) writeXrefSiblingKey(ctx context.Context, anilistID, bangumiID, tmdbID int) {
	if anilistID <= 0 || bangumiID <= 0 {
		return
	}
	alKey := fmt.Sprintf("tmdb:xref:%s:al:%d", xrefVersion, anilistID)
	bgmKey := fmt.Sprintf("tmdb:xref:%s:bgm:%d", xrefVersion, bangumiID)
	_ = h.writeTMDBXrefCache(ctx, alKey, tmdbID)
	_ = h.writeTMDBXrefCache(ctx, bgmKey, tmdbID)
}

func searchFirstTMDBID(ctx context.Context, client tmdb.Client, query string) (int, error) {
	shows, err := client.SearchTV(ctx, query, "zh-TW")
	if err != nil {
		return 0, err
	}
	if len(shows) == 0 {
		return 0, nil
	}
	return shows[0].ID, nil
}

// seasonSuffixPatterns match common season/cour markers at the end of an
// anime title. We only strip when the marker has a clear word boundary so
// we don't accidentally truncate titles like "鬼滅の刃" or "Code Geass R2".
var seasonSuffixPatterns = []*regexp.Regexp{
	regexp.MustCompile(`\s+第\s*\d+\s*[期季部章]\s*$`),                  // " 第5期" / "第 2 季"
	regexp.MustCompile(`(?i)\s+season\s+\d+\s*$`),                       // " Season 2"
	regexp.MustCompile(`(?i)\s+(?:2nd|3rd|4th|5th|6th)\s+season\s*$`),   // " 2nd Season"
	regexp.MustCompile(`(?i)\s+the\s+final\s+season\s*$`),               // " The Final Season"
	regexp.MustCompile(`(?i)\s+part\s+\d+\s*$`),                         // " Part 2"
	regexp.MustCompile(`\s+S\d+\s*$`),                                   // " S5"
	regexp.MustCompile(`\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\s*$`),       // trailing roman numerals (with leading space)
}

// stripSeasonSuffix removes a trailing season/part marker if present.
// Returns the original string if no recognized pattern matches.
func stripSeasonSuffix(s string) string {
	cleaned := strings.TrimSpace(s)
	for _, re := range seasonSuffixPatterns {
		if loc := re.FindStringIndex(cleaned); loc != nil {
			return strings.TrimSpace(cleaned[:loc[0]])
		}
	}
	return cleaned
}

// fetchTMDBLocalizedShow returns TV details in the requested locale, cached.
// Cache key carries xrefVersion so older cached entries (which lacked
// Seasons[] before that field was added to TVShow) don't keep masking real
// data — the seasons[] missing case looked identical to "TMDB has no
// season layout", which silently disabled episode enrichment.
func (h *handler) fetchTMDBLocalizedShow(ctx context.Context, client tmdb.Client, tmdbID int, locale string, refresh bool) (*tmdb.TVShow, error) {
	cacheKey := fmt.Sprintf("tmdb:tv:%s:%d:%s", xrefVersion, tmdbID, locale)
	if !refresh {
		if data, err := h.cache.Get(ctx, cacheKey); err == nil {
			var cached tmdb.TVShow
			if json.Unmarshal(data, &cached) == nil {
				return &cached, nil
			}
		}
	}
	show, err := client.GetTVDetails(ctx, tmdbID, locale)
	if err != nil || show == nil {
		return nil, err
	}
	if data, err := json.Marshal(show); err == nil {
		_ = h.cache.Set(ctx, cacheKey, data, 24*time.Hour)
	}
	return show, nil
}

// synopsisFallbackChain returns the locale order for resolving a non-empty
// synopsis. The first entry is always the requested locale; subsequent
// entries are reasonable cross-locale fallbacks. zh-CN is included for
// zh-TW/zh-HK requesters because TMDB often has 简中 metadata when 繁中
// is missing — better simplified Chinese than raw Japanese.
func synopsisFallbackChain(locale string) []string {
	switch locale {
	case "zh-TW":
		return []string{"zh-TW", "zh-HK", "zh-CN", "ja-JP", "en-US"}
	case "zh-HK":
		return []string{"zh-HK", "zh-TW", "zh-CN", "ja-JP", "en-US"}
	case "zh-CN":
		return []string{"zh-CN", "zh-TW", "zh-HK", "ja-JP", "en-US"}
	case "ja-JP":
		return []string{"ja-JP", "en-US"}
	case "ko-KR":
		return []string{"ko-KR", "en-US", "ja-JP"}
	case "en-US":
		return []string{"en-US", "ja-JP"}
	}
	return []string{locale}
}

// fetchTMDBSynopsisWithFallback walks the locale fallback chain and returns
// the first non-empty Overview. Each locale's response is cached separately
// via fetchTMDBLocalizedShow, so repeated misses don't re-hit TMDB.
func (h *handler) fetchTMDBSynopsisWithFallback(ctx context.Context, client tmdb.Client, tmdbID int, locale string, refresh bool) string {
	for _, l := range synopsisFallbackChain(locale) {
		show, err := h.fetchTMDBLocalizedShow(ctx, client, tmdbID, l, refresh)
		if err != nil || show == nil {
			continue
		}
		if show.Overview != "" {
			return show.Overview
		}
	}
	return ""
}

func (h *handler) writeTMDBXrefCache(ctx context.Context, key string, tmdbID int) error {
	data, err := json.Marshal(tmdbID)
	if err != nil {
		return err
	}
	// Positive matches: 7 days, since TMDB IDs are stable. Negative results:
	// only 1 hour, so a TMDB outage / transient empty search doesn't poison
	// the cache for a week.
	ttl := 7 * 24 * time.Hour
	if tmdbID == 0 {
		ttl = 1 * time.Hour
	}
	return h.cache.Set(ctx, key, data, ttl)
}

// xrefVersion bumps when the search/cache key shape changes so older cached
// negatives (from before season-suffix stripping) don't keep masking real
// matches. Increment when the lookup logic changes meaningfully.
const xrefVersion = "v2"

func tmdbXrefKey(anilistID, bangumiID int, query string) string {
	if anilistID > 0 {
		return fmt.Sprintf("tmdb:xref:%s:al:%d", xrefVersion, anilistID)
	}
	if bangumiID > 0 {
		return fmt.Sprintf("tmdb:xref:%s:bgm:%d", xrefVersion, bangumiID)
	}
	return fmt.Sprintf("tmdb:xref:%s:title:%s", xrefVersion, strings.ToLower(query))
}
