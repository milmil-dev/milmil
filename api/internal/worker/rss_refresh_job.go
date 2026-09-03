package worker

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"uuid"

	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
)

// RSSRefreshWorker processes RSS feeds that are due for a refresh.
type RSSRefreshWorker struct {
	queries    *store.Queries
	downloader downloader.Manager
	notifier   *notification.Service
}

func (w *RSSRefreshWorker) Run(ctx context.Context) error {
	feeds, err := w.queries.ListRSSFeedsDue(ctx)
	if err != nil {
		slog.Error("rss_refresh: list due feeds", "err", err)
		w.notifier.Send(ctx, "system.error", "RSS Refresh Failed", err.Error(), "error",
			map[string]any{"worker": "rss_refresh"})
		return fmt.Errorf("list due feeds: %w", err)
	}
	if len(feeds) == 0 {
		return nil
	}

	slog.Info("rss_refresh: checking feeds", "count", len(feeds))

	for _, feed := range feeds {
		w.refreshFeed(ctx, feed)
	}
	return nil
}

func (w *RSSRefreshWorker) refreshFeed(ctx context.Context, feed store.RssFeed) {
	items, err := rss.ParseFeed(ctx, feed.Url)
	if err != nil {
		slog.Warn("rss_refresh: parse feed", "feed", feed.Name, "err", err)
		return
	}

	rules, err := w.queries.ListDownloadRulesByFeedID(ctx, feed.ID)
	if err != nil {
		slog.Error("rss_refresh: list rules", "feed", feed.Name, "err", err)
		return
	}

	added := 0
	for _, item := range items {
		for _, rule := range rules {
			if !rss.MatchRule(item.Title, rule.FilterRegex, rule.ExcludeRegex) {
				continue
			}
			if !rss.MatchesResolution(item.Title, rule.ResolutionFilter) {
				continue
			}
			// Multi-subgroup matching (comma-separated)
			if rule.SubgroupFilter != "" {
				matched := false
				for sg := range strings.SplitSeq(rule.SubgroupFilter, ",") {
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

			_, err := w.queries.GetDownloadByURL(ctx, item.Link)
			if err == nil {
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				continue
			}

			// Resolve save dir from library path (authoritative) with rule fallback
			saveDir := rule.SaveDir
			if rule.LibraryID.Valid {
				if lib, libErr := w.queries.GetLibrary(ctx, rule.LibraryID.String); libErr == nil {
					saveDir = lib.Path
				}
			}

			gid, err := w.downloader.Add(ctx, item.Link, downloader.AddOptions{
				SaveDir: saveDir,
				Name:    item.Title,
			})
			if err != nil {
				slog.Warn("rss_refresh: download add", "err", err, "title", item.Title)
				continue
			}

			_, err = w.queries.CreateDownload(ctx, store.CreateDownloadParams{
				ID:        uuid.New().String(),
				Gid:       gid,
				Url:       item.Link,
				Name:      item.Title,
				Status:    "active",
				SaveDir:   saveDir,
				RuleID:    sql.NullString{String: rule.ID, Valid: true},
				BangumiID: rule.BangumiID,
				LibraryID: rule.LibraryID,
			})
			if err != nil {
				slog.Error("rss_refresh: create download", "err", err)
				continue
			}

			_ = w.queries.UpdateDownloadRuleTriggered(ctx, rule.ID)

			w.notifier.Send(ctx, "download.started", "New Episode", item.Title, "info",
				map[string]any{"rule_id": rule.ID, "rule_name": rule.Name})

			added++
			break
		}
	}

	if err := w.queries.UpdateRSSFeedLastFetched(ctx, feed.ID); err != nil {
		slog.Error("rss_refresh: update last_fetched_at", "err", err)
	}

	if added > 0 {
		slog.Info("rss_refresh: downloads added", "feed", feed.Name, "added", added)
	}
}
