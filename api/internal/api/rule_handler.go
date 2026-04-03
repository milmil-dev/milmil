package api

import (
	"database/sql"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type createDownloadRuleRequest struct {
	Name             string `json:"name"`
	Enabled          bool   `json:"enabled"`
	RSSFeedID        string `json:"rss_feed_id"`
	FilterRegex      string `json:"filter_regex"`
	ExcludeRegex     string `json:"exclude_regex"`
	SaveDir          string `json:"save_dir"`
	EpisodeOffset    int64  `json:"episode_offset"`
	ResolutionFilter string `json:"resolution_filter"`
	SubGroupFilter   string `json:"subgroup_filter"`
	MinSeeders       int64  `json:"min_seeders"`
	LibraryID        string `json:"library_id"`
	BangumiID        int64  `json:"bangumi_id"`
	MatchMode        string `json:"match_mode"`
	EpisodeFilter    string `json:"episode_filter"`
	EpisodeRange     string `json:"episode_range"`
}

type updateDownloadRuleRequest struct {
	Name             string `json:"name"`
	Enabled          bool   `json:"enabled"`
	RSSFeedID        string `json:"rss_feed_id"`
	FilterRegex      string `json:"filter_regex"`
	ExcludeRegex     string `json:"exclude_regex"`
	SaveDir          string `json:"save_dir"`
	EpisodeOffset    int64  `json:"episode_offset"`
	ResolutionFilter string `json:"resolution_filter"`
	SubGroupFilter   string `json:"subgroup_filter"`
	MinSeeders       int64  `json:"min_seeders"`
	LibraryID        string `json:"library_id"`
	BangumiID        int64  `json:"bangumi_id"`
	MatchMode        string `json:"match_mode"`
	EpisodeFilter    string `json:"episode_filter"`
	EpisodeRange     string `json:"episode_range"`
}

// downloadRuleResponse is the JSON-safe representation of a DownloadRule.
// sql.NullString/NullInt64 serialize as objects; we need plain values or null.
type downloadRuleResponse struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Enabled          int64   `json:"enabled"`
	RSSFeedID        string  `json:"rss_feed_id"`
	FilterRegex      string  `json:"filter_regex"`
	ExcludeRegex     string  `json:"exclude_regex"`
	SaveDir          string  `json:"save_dir"`
	EpisodeOffset    int64   `json:"episode_offset"`
	LastTriggeredAt  *string `json:"last_triggered_at"`
	CreatedAt        string  `json:"created_at"`
	ResolutionFilter string  `json:"resolution_filter"`
	SubgroupFilter   string  `json:"subgroup_filter"`
	MinSeeders       int64   `json:"min_seeders"`
	LibraryID        *string `json:"library_id"`
	BangumiID        *int64  `json:"bangumi_id"`
	MatchMode        string  `json:"match_mode"`
	EpisodeFilter    string  `json:"episode_filter"`
	EpisodeRange     string  `json:"episode_range"`
}

func toRuleResponse(r store.DownloadRule) downloadRuleResponse {
	resp := downloadRuleResponse{
		ID:               r.ID,
		Name:             r.Name,
		Enabled:          r.Enabled,
		RSSFeedID:        r.RssFeedID,
		FilterRegex:      r.FilterRegex,
		ExcludeRegex:     r.ExcludeRegex,
		SaveDir:          r.SaveDir,
		EpisodeOffset:    r.EpisodeOffset,
		CreatedAt:        r.CreatedAt,
		ResolutionFilter: r.ResolutionFilter,
		SubgroupFilter:   r.SubgroupFilter,
		MinSeeders:       r.MinSeeders,
		MatchMode:        r.MatchMode,
		EpisodeFilter:    r.EpisodeFilter,
		EpisodeRange:     r.EpisodeRange,
	}
	if r.LastTriggeredAt.Valid {
		resp.LastTriggeredAt = &r.LastTriggeredAt.String
	}
	if r.LibraryID.Valid {
		resp.LibraryID = &r.LibraryID.String
	}
	if r.BangumiID.Valid {
		resp.BangumiID = &r.BangumiID.Int64
	}
	return resp
}

func (h *handler) handleListDownloadRules(c echo.Context) error {
	rules, err := h.queries.ListDownloadRules(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	resp := make([]downloadRuleResponse, len(rules))
	for i, r := range rules {
		resp[i] = toRuleResponse(r)
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *handler) handleCreateDownloadRule(c echo.Context) error {
	var req createDownloadRuleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.RSSFeedID == "" || req.FilterRegex == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name, rss_feed_id, and filter_regex are required")
	}
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	matchMode := req.MatchMode
	if matchMode == "" {
		matchMode = "fuzzy"
	}
	episodeFilter := req.EpisodeFilter
	if episodeFilter == "" {
		episodeFilter = "all"
	}
	rule, err := h.queries.CreateDownloadRule(c.Request().Context(), store.CreateDownloadRuleParams{
		ID:               uuid.NewString(),
		Name:             req.Name,
		Enabled:          enabled,
		RssFeedID:        req.RSSFeedID,
		FilterRegex:      req.FilterRegex,
		ExcludeRegex:     req.ExcludeRegex,
		SaveDir:          req.SaveDir,
		EpisodeOffset:    req.EpisodeOffset,
		ResolutionFilter: req.ResolutionFilter,
		SubgroupFilter:   req.SubGroupFilter,
		MinSeeders:       req.MinSeeders,
		LibraryID:        sql.NullString{String: req.LibraryID, Valid: req.LibraryID != ""},
		BangumiID:        sql.NullInt64{Int64: req.BangumiID, Valid: req.BangumiID != 0},
		MatchMode:        matchMode,
		EpisodeFilter:    episodeFilter,
		EpisodeRange:     req.EpisodeRange,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, toRuleResponse(rule))
}

func (h *handler) handleUpdateDownloadRule(c echo.Context) error {
	var req updateDownloadRuleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.RSSFeedID == "" || req.FilterRegex == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name, rss_feed_id, and filter_regex are required")
	}
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	updateMatchMode := req.MatchMode
	if updateMatchMode == "" {
		updateMatchMode = "fuzzy"
	}
	updateEpisodeFilter := req.EpisodeFilter
	if updateEpisodeFilter == "" {
		updateEpisodeFilter = "all"
	}
	if err := h.queries.UpdateDownloadRule(c.Request().Context(), store.UpdateDownloadRuleParams{
		ID:               c.Param("id"),
		Name:             req.Name,
		Enabled:          enabled,
		RssFeedID:        req.RSSFeedID,
		FilterRegex:      req.FilterRegex,
		ExcludeRegex:     req.ExcludeRegex,
		SaveDir:          req.SaveDir,
		EpisodeOffset:    req.EpisodeOffset,
		ResolutionFilter: req.ResolutionFilter,
		SubgroupFilter:   req.SubGroupFilter,
		MinSeeders:       req.MinSeeders,
		LibraryID:        sql.NullString{String: req.LibraryID, Valid: req.LibraryID != ""},
		BangumiID:        sql.NullInt64{Int64: req.BangumiID, Valid: req.BangumiID != 0},
		MatchMode:        updateMatchMode,
		EpisodeFilter:    updateEpisodeFilter,
		EpisodeRange:     req.EpisodeRange,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *handler) handleDeleteDownloadRule(c echo.Context) error {
	ctx := c.Request().Context()
	ruleID := c.Param("id")
	// Unlink downloads so they don't become orphans
	_ = h.queries.UnlinkDownloadsByRuleID(ctx, sql.NullString{String: ruleID, Valid: true})
	if err := h.queries.DeleteDownloadRule(ctx, ruleID); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
