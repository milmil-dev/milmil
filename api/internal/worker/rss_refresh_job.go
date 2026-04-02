package worker

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/integration/aria2"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
	"github.com/riverqueue/river"
)

// RSSRefreshArgs is the job payload for periodic RSS feed refresh.
type RSSRefreshArgs struct{}

func (RSSRefreshArgs) Kind() string { return "rss_refresh" }

// RSSRefreshWorker processes RSS feeds that are due for a refresh.
type RSSRefreshWorker struct {
	river.WorkerDefaults[RSSRefreshArgs]
	queries  *store.Queries
	aria2    aria2.Client
	notifier *notification.Service
}

func (w *RSSRefreshWorker) Work(ctx context.Context, _ *river.Job[RSSRefreshArgs]) error {
	feeds, err := w.queries.ListRSSFeedsDue(ctx)
	if err != nil {
		slog.Error("rss_refresh: list due feeds", "err", err)
		return nil // Don't retry — will pick up on next tick
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
			if rule.ResolutionFilter != "" && !strings.Contains(strings.ToLower(item.Title), strings.ToLower(rule.ResolutionFilter)) {
				continue
			}
			if rule.SubgroupFilter != "" && !strings.Contains(item.Title, rule.SubgroupFilter) {
				continue
			}

			// Deduplicate: skip if already downloaded
			_, err := w.queries.GetDownloadByURL(ctx, item.Link)
			if err == nil {
				continue
			}
			if !errors.Is(err, sql.ErrNoRows) {
				continue
			}

			opts := map[string]string{}
			if rule.SaveDir != "" {
				opts["dir"] = rule.SaveDir
			}

			gid, err := w.aria2.AddURI(ctx, []string{item.Link}, opts)
			if err != nil {
				slog.Warn("rss_refresh: aria2 add", "err", err, "title", item.Title)
				continue
			}

			_, err = w.queries.CreateDownload(ctx, store.CreateDownloadParams{
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
