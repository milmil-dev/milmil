package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
)

type previewItem struct {
	Title             string `json:"title"`
	Link              string `json:"link"`
	Episode           string `json:"episode"`
	Subgroup          string `json:"subgroup"`
	Size              string `json:"size"`
	PublishDate       string `json:"publish_date"`
	AlreadyDownloaded bool   `json:"already_downloaded"`
}

type previewResponse struct {
	Items   []previewItem `json:"items"`
	Total   int           `json:"total"`
	Matched int           `json:"matched"`
}

func (h *handler) handlePreviewRSSFeed(c echo.Context) error {
	feedID := c.Param("id")
	ruleID := c.QueryParam("rule_id")
	ctx := c.Request().Context()

	// Get feed
	feed, err := h.queries.GetRSSFeed(ctx, feedID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	// Parse RSS feed
	items, err := rss.ParseFeed(ctx, feed.Url)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to parse feed: "+err.Error())
	}

	// Get rule if specified
	var rule *store.DownloadRule
	if ruleID != "" {
		r, err := h.queries.GetDownloadRule(ctx, ruleID)
		if err == nil {
			rule = &r
		}
	}

	// Build preview
	resp := previewResponse{Total: len(items), Items: []previewItem{}}
	for _, item := range items {
		// Apply rule filters if rule provided
		if rule != nil {
			if !rss.MatchRule(item.Title, rule.FilterRegex, rule.ExcludeRegex) {
				continue
			}
			if rule.ResolutionFilter != "" && !strings.Contains(strings.ToLower(item.Title), strings.ToLower(rule.ResolutionFilter)) {
				continue
			}
			// Subgroup filter — support comma-separated
			if rule.SubgroupFilter != "" {
				matched := false
				for _, sg := range strings.Split(rule.SubgroupFilter, ",") {
					if strings.Contains(item.Title, strings.TrimSpace(sg)) {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
			}
			// Episode range filter
			if rule.EpisodeFilter == "range" && rule.EpisodeRange != "" {
				ep := rss.ParseEpisode(item.Title)
				if ep != "" && !rss.InEpisodeRange(ep, rule.EpisodeRange) {
					continue
				}
			}
		}

		// Parse subgroup and episode from title
		subgroup := rss.ParseSubgroup(item.Title)
		episode := rss.ParseEpisode(item.Title)

		// Check if already downloaded
		_, dlErr := h.queries.GetDownloadByURL(ctx, item.Link)
		alreadyDownloaded := dlErr == nil

		pubDate := ""
		if !item.PubDate.IsZero() {
			pubDate = item.PubDate.Format("2006-01-02T15:04:05Z")
		}

		resp.Items = append(resp.Items, previewItem{
			Title:             item.Title,
			Link:              item.Link,
			Episode:           episode,
			Subgroup:          subgroup,
			Size:              item.Size,
			PublishDate:       pubDate,
			AlreadyDownloaded: alreadyDownloaded,
		})
	}
	resp.Matched = len(resp.Items)

	return c.JSON(http.StatusOK, resp)
}

type createRSSFeedRequest struct {
	Name                 string `json:"name"`
	URL                  string `json:"url"`
	Type                 string `json:"type"`
	Enabled              bool   `json:"enabled"`
	FetchIntervalMinutes int64  `json:"fetch_interval_minutes"`
}

type updateRSSFeedRequest struct {
	Name                 string `json:"name"`
	URL                  string `json:"url"`
	Type                 string `json:"type"`
	Enabled              bool   `json:"enabled"`
	FetchIntervalMinutes int64  `json:"fetch_interval_minutes"`
}

func (h *handler) handleListRSSFeeds(c echo.Context) error {
	feeds, err := h.queries.ListRSSFeeds(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, feeds)
}

func (h *handler) handleCreateRSSFeed(c echo.Context) error {
	var req createRSSFeedRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and url are required")
	}
	feedType := req.Type
	if feedType == "" {
		feedType = "rss"
	}
	interval := req.FetchIntervalMinutes
	if interval == 0 {
		interval = 30
	}
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	feed, err := h.queries.CreateRSSFeed(c.Request().Context(), store.CreateRSSFeedParams{
		ID:                   uuid.NewString(),
		Name:                 req.Name,
		Url:                  req.URL,
		Type:                 feedType,
		Enabled:              enabled,
		FetchIntervalMinutes: interval,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, feed)
}

func (h *handler) handleUpdateRSSFeed(c echo.Context) error {
	var req updateRSSFeedRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" || req.URL == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name and url are required")
	}
	feedType := req.Type
	if feedType == "" {
		feedType = "rss"
	}
	interval := req.FetchIntervalMinutes
	if interval == 0 {
		interval = 30
	}
	enabled := int64(0)
	if req.Enabled {
		enabled = 1
	}
	if err := h.queries.UpdateRSSFeed(c.Request().Context(), store.UpdateRSSFeedParams{
		ID:                   c.Param("id"),
		Name:                 req.Name,
		Url:                  req.URL,
		Type:                 feedType,
		Enabled:              enabled,
		FetchIntervalMinutes: interval,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	// Return the updated feed
	feed, err := h.queries.GetRSSFeed(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, feed)
}

func (h *handler) handleDeleteRSSFeed(c echo.Context) error {
	if err := h.queries.DeleteRSSFeed(c.Request().Context(), c.Param("id")); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleRefreshRSSFeed(c echo.Context) error {
	ctx := c.Request().Context()
	feedID := c.Param("id")

	// 1. Get feed from DB
	feed, err := h.queries.GetRSSFeed(ctx, feedID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	// 2. Parse RSS feed URL
	items, err := rss.ParseFeed(ctx, feed.Url)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "failed to parse feed: "+err.Error())
	}

	// 3. Get rules for this feed
	rules, err := h.queries.ListDownloadRulesByFeedID(ctx, feedID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// 4. For each feed item, check each rule (regex + resolution + subgroup)
	added := 0
	for _, item := range items {
		for _, rule := range rules {
			if !rss.MatchRule(item.Title, rule.FilterRegex, rule.ExcludeRegex) {
				continue
			}
			// Apply resolution filter
			if rule.ResolutionFilter != "" && !strings.Contains(strings.ToLower(item.Title), strings.ToLower(rule.ResolutionFilter)) {
				continue
			}
			// Apply subgroup filter — support comma-separated
			if rule.SubgroupFilter != "" {
				matched := false
				for _, sg := range strings.Split(rule.SubgroupFilter, ",") {
					if strings.Contains(item.Title, strings.TrimSpace(sg)) {
						matched = true
						break
					}
				}
				if !matched {
					continue
				}
			}
			// Episode range filter
			if rule.EpisodeFilter == "range" && rule.EpisodeRange != "" {
				ep := rss.ParseEpisode(item.Title)
				if ep != "" && !rss.InEpisodeRange(ep, rule.EpisodeRange) {
					continue
				}
			}

			// 5. If match AND GetDownloadByURL returns no rows -> downloader.Add + CreateDownload
			_, err := h.queries.GetDownloadByURL(ctx, item.Link)
			if err == nil {
				// Already downloaded
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				slog.Error("check download by url", "err", err)
				continue
			}

			gid, err := h.downloader.Add(ctx, item.Link, downloader.AddOptions{
				SaveDir: rule.SaveDir,
				Name:    item.Title,
			})
			if err != nil {
				slog.Error("download add", "err", err, "url", item.Link)
				continue
			}

			_, err = h.queries.CreateDownload(ctx, store.CreateDownloadParams{
				ID:        uuid.NewString(),
				Gid:       gid,
				Url:       item.Link,
				Name:      item.Title,
				Status:    "active",
				SaveDir:   rule.SaveDir,
				RuleID:    sql.NullString{String: rule.ID, Valid: true},
				BangumiID: rule.BangumiID,
				LibraryID: rule.LibraryID,
			})
			if err != nil {
				slog.Error("create download", "err", err)
				continue
			}

			_ = h.queries.UpdateDownloadRuleTriggered(ctx, rule.ID)
			added++
			break // One rule matched this item, move to next item
		}
	}

	// 6. Update feed's last_fetched_at
	if err := h.queries.UpdateRSSFeedLastFetched(ctx, feedID); err != nil {
		slog.Error("update feed last_fetched_at", "err", err)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items_found":    len(items),
		"items_added":    added,
		"rules_checked":  len(rules),
	})
}
