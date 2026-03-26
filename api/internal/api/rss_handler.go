package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
)

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

	// 4. For each feed item, check each rule
	added := 0
	for _, item := range items {
		for _, rule := range rules {
			if !rss.MatchRule(item.Title, rule.FilterRegex, rule.ExcludeRegex) {
				continue
			}

			// 5. If match AND GetDownloadByURL returns no rows -> aria2.AddURI + CreateDownload
			_, err := h.queries.GetDownloadByURL(ctx, item.Link)
			if err == nil {
				// Already downloaded
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				slog.Error("check download by url", "err", err)
				continue
			}

			opts := map[string]string{}
			if rule.SaveDir != "" {
				opts["dir"] = rule.SaveDir
			}

			gid, err := h.aria2.AddURI(ctx, []string{item.Link}, opts)
			if err != nil {
				slog.Error("aria2 add", "err", err, "url", item.Link)
				continue
			}

			_, err = h.queries.CreateDownload(ctx, store.CreateDownloadParams{
				ID:      uuid.NewString(),
				Gid:     gid,
				Url:     item.Link,
				Name:    item.Title,
				Status:  "active",
				SaveDir: rule.SaveDir,
				RuleID:  sql.NullString{String: rule.ID, Valid: true},
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
