package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/library/searchmissing"
	"github.com/milmil/api/internal/store"
)

// missingSearchReq is the body for POST /api/v1/anime/:bangumiId/missing/search.
type missingSearchReq struct {
	EpisodeNumber int `json:"episode_number"`
}

// handleMissingSearch aggregates torrent-provider results for a specific
// missing episode of the given anime, returning deduped + ranked candidates.
func (h *handler) handleMissingSearch(c echo.Context) error {
	ctx := c.Request().Context()
	bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("missing-search: GetAnimeByBangumiID failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}

	var req missingSearchReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	if req.EpisodeNumber <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "episode_number required")
	}
	if anime.TotalEpisodes.Valid && req.EpisodeNumber > int(anime.TotalEpisodes.Int64) {
		return echo.NewHTTPError(http.StatusBadRequest, "episode_number beyond total")
	}

	if h.torrentRegistry == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "torrent registry not configured")
	}
	agg := searchmissing.NewAggregator(h.torrentRegistry)
	results, err := agg.Search(ctx, anime.Title, req.EpisodeNumber)
	if err != nil {
		slog.Error("missing-search: aggregator search failed", "bangumi_id", bangumiID, "ep", req.EpisodeNumber, "err", err)
		return echo.ErrInternalServerError
	}
	if results == nil {
		results = []searchmissing.Result{}
	}
	return c.JSON(http.StatusOK, map[string]any{"results": results})
}

// missingDownloadReq is the body for POST /api/v1/anime/:bangumiId/missing/download.
type missingDownloadReq struct {
	Magnet     string `json:"magnet"`
	TorrentURL string `json:"torrent_url"`
	Title      string `json:"title"`
}

// handleMissingDownload enqueues a torrent into the downloader and records it
// in the downloads table linked to the anime's bangumi_id.
func (h *handler) handleMissingDownload(c echo.Context) error {
	ctx := c.Request().Context()
	bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}
	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("missing-download: GetAnimeByBangumiID failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}

	var req missingDownloadReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	uri := req.Magnet
	if uri == "" {
		uri = req.TorrentURL
	}
	if uri == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "magnet or torrent_url required")
	}
	name := req.Title
	if name == "" {
		name = anime.Title
	}

	if h.downloader == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "downloader not configured")
	}
	gid, err := h.downloader.Add(ctx, uri, downloader.AddOptions{Name: name})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "downloader: "+err.Error())
	}

	id := uuid.NewString()
	dl, err := h.queries.CreateDownload(ctx, store.CreateDownloadParams{
		ID:        id,
		Gid:       gid,
		Url:       uri,
		Name:      name,
		Status:    "active",
		SaveDir:   "",
		RuleID:    sql.NullString{},
		BangumiID: sql.NullInt64{Int64: bangumiID, Valid: true},
		LibraryID: anime.LibraryID,
	})
	if err != nil {
		slog.Error("missing-download: CreateDownload failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{
		"download_id": dl.ID,
		"gid":         dl.Gid,
	})
}

// missingAutoRuleReq is the body for POST /api/v1/anime/:bangumiId/missing/auto-rule.
// RssFeedID is required when no existing download_rule is found for the anime
// (new rule creation); ignored when merging into an existing rule.
type missingAutoRuleReq struct {
	EpisodeNumbers []int  `json:"episode_numbers"`
	RssFeedID      string `json:"rss_feed_id"`
}

// handleMissingAutoRule creates or updates a download_rule targeting the
// anime's bangumi_id so missing episodes get auto-downloaded by the RSS
// refresher. If a rule already exists, merges the requested episode numbers
// into its EpisodeRange CSV; otherwise creates a new rule (requires rss_feed_id).
func (h *handler) handleMissingAutoRule(c echo.Context) error {
	ctx := c.Request().Context()
	bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}
	anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		slog.Error("missing-auto-rule: GetAnimeByBangumiID failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}

	var req missingAutoRuleReq
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	if len(req.EpisodeNumbers) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "episode_numbers required")
	}

	existing, err := h.queries.ListDownloadRulesByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		slog.Error("missing-auto-rule: ListDownloadRulesByBangumiID failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}
	merged := mergeEpisodes(existing, req.EpisodeNumbers)
	rangeCSV := csvInts(merged)

	if len(existing) > 0 {
		rule := existing[0]
		if err := h.queries.UpdateDownloadRule(ctx, store.UpdateDownloadRuleParams{
			Name:             rule.Name,
			Enabled:          rule.Enabled,
			RssFeedID:        rule.RssFeedID,
			FilterRegex:      rule.FilterRegex,
			ExcludeRegex:     rule.ExcludeRegex,
			SaveDir:          rule.SaveDir,
			EpisodeOffset:    rule.EpisodeOffset,
			ResolutionFilter: rule.ResolutionFilter,
			SubgroupFilter:   rule.SubgroupFilter,
			MinSeeders:       rule.MinSeeders,
			LibraryID:        rule.LibraryID,
			BangumiID:        rule.BangumiID,
			MatchMode:        rule.MatchMode,
			EpisodeFilter:    rule.EpisodeFilter,
			EpisodeRange:     rangeCSV,
			ID:               rule.ID,
		}); err != nil {
			slog.Error("missing-auto-rule: UpdateDownloadRule failed", "rule_id", rule.ID, "err", err)
			return echo.ErrInternalServerError
		}
		return c.JSON(http.StatusOK, map[string]any{
			"rule_id":       rule.ID,
			"episode_range": rangeCSV,
			"action":        "merged",
		})
	}

	// Creating a new rule requires an RSS feed (NOT NULL FK).
	if req.RssFeedID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "rss_feed_id required to create a new auto-download rule")
	}

	id := uuid.NewString()
	rule, err := h.queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
		ID:               id,
		Name:             anime.Title + " - auto",
		Enabled:          1,
		RssFeedID:        req.RssFeedID,
		FilterRegex:      "",
		ExcludeRegex:     "",
		SaveDir:          "",
		EpisodeOffset:    0,
		ResolutionFilter: "",
		SubgroupFilter:   "",
		MinSeeders:       0,
		LibraryID:        anime.LibraryID,
		BangumiID:        sql.NullInt64{Int64: bangumiID, Valid: true},
		MatchMode:        "bangumi",
		EpisodeFilter:    "range",
		EpisodeRange:     rangeCSV,
	})
	if err != nil {
		slog.Error("missing-auto-rule: CreateDownloadRule failed", "bangumi_id", bangumiID, "err", err)
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]any{
		"rule_id":       rule.ID,
		"episode_range": rangeCSV,
		"action":        "created",
	})
}

// mergeEpisodes returns the sorted, deduped union of the requested episode
// numbers and every episode number already listed in any of the given rules'
// EpisodeRange CSV fields.
func mergeEpisodes(rules []store.DownloadRule, want []int) []int {
	set := make(map[int]struct{}, len(want)+8)
	for _, n := range want {
		if n > 0 {
			set[n] = struct{}{}
		}
	}
	for _, r := range rules {
		if r.EpisodeRange == "" {
			continue
		}
		for _, piece := range splitCSV(r.EpisodeRange) {
			if n, err := strconv.Atoi(piece); err == nil && n > 0 {
				set[n] = struct{}{}
			}
		}
	}
	out := make([]int, 0, len(set))
	for n := range set {
		out = append(out, n)
	}
	sort.Ints(out)
	return out
}

// splitCSV splits on commas and whitespace, skipping empty fragments.
func splitCSV(s string) []string {
	raw := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ' ' || r == '\t' || r == '\n'
	})
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// csvInts renders a slice of ints as a comma-separated string.
func csvInts(xs []int) string {
	parts := make([]string, len(xs))
	for i, n := range xs {
		parts[i] = strconv.Itoa(n)
	}
	return strings.Join(parts, ",")
}
