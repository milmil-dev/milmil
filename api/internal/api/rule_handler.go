package api

import (
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
}

func (h *handler) handleListDownloadRules(c echo.Context) error {
	rules, err := h.queries.ListDownloadRules(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, rules)
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
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, rule)
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
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "updated"})
}

func (h *handler) handleDeleteDownloadRule(c echo.Context) error {
	if err := h.queries.DeleteDownloadRule(c.Request().Context(), c.Param("id")); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
