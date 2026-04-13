package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// DailyDigestWorker sends a single daily summary of today's airing anime
// that the user is watching. Runs every 5 minutes, sends once per day
// when the configured time is reached.
type DailyDigestWorker struct {
	queries  *store.Queries
	metadata *metadata.Service
	notifier *notification.Service

	mu       sync.Mutex
	sentDate string // YYYY-MM-DD, tracks whether today's digest was already sent
}

func NewDailyDigestWorker(
	queries *store.Queries,
	metadataSvc *metadata.Service,
	notifier *notification.Service,
) *DailyDigestWorker {
	return &DailyDigestWorker{
		queries:  queries,
		metadata: metadataSvc,
		notifier: notifier,
	}
}

func (w *DailyDigestWorker) Run(ctx context.Context) {
	cfg, err := notification.LoadNotificationConfig(ctx, w.queries)
	if err != nil {
		slog.Debug("daily_digest: load config failed", "err", err)
		return
	}

	digestTime := cfg.Bot.Telegram.DailyDigestTime
	if digestTime == "" {
		return
	}

	// Parse configured time (HH:mm)
	targetHour, targetMin, ok := parseHHMM(digestTime)
	if !ok {
		slog.Warn("daily_digest: invalid time format", "time", digestTime)
		return
	}

	// Use Asia/Hong_Kong since user's language is zh-HK
	loc := time.FixedZone("Asia/HongKong", 8*60*60)
	now := time.Now().In(loc)
	todayStr := now.Format("2006-01-02")

	// Check if already sent today
	w.mu.Lock()
	if w.sentDate == todayStr {
		w.mu.Unlock()
		return
	}
	w.mu.Unlock()

	// Check if current time has passed the target time
	target := time.Date(now.Year(), now.Month(), now.Day(), targetHour, targetMin, 0, 0, loc)
	if now.Before(target) {
		return
	}

	// Mark as sent before doing work (prevent double-send)
	w.mu.Lock()
	if w.sentDate == todayStr {
		w.mu.Unlock()
		return
	}
	w.sentDate = todayStr
	w.mu.Unlock()

	// Get calendar
	calendar, err := w.metadata.GetCalendar(ctx)
	if err != nil {
		slog.Error("daily_digest: get calendar", "err", err)
		// Reset so we retry next tick
		w.mu.Lock()
		w.sentDate = ""
		w.mu.Unlock()
		return
	}

	// Find today's anime (use JST weekday since Bangumi uses JST)
	jst := time.FixedZone("Asia/Tokyo", 9*60*60)
	todayWeekday := time.Now().In(jst).Weekday()
	var todayItems []metadata.AnimeSummary
	for _, day := range calendar {
		if matchesWeekday(day.WeekdayEN, todayWeekday) {
			todayItems = day.Items
			break
		}
	}

	if len(todayItems) == 0 {
		slog.Debug("daily_digest: no items for today")
		return
	}

	// Filter to anime the user watches
	watchingIDs := buildWatchingSet(ctx, w.queries)
	if len(watchingIDs) == 0 {
		return
	}

	var watchingToday []metadata.AnimeSummary
	for _, item := range todayItems {
		if item.BangumiID > 0 && watchingIDs[item.BangumiID] {
			watchingToday = append(watchingToday, item)
		}
	}

	if len(watchingToday) == 0 {
		slog.Debug("daily_digest: no watched anime airing today")
		return
	}

	// Sort by air time
	sort.Slice(watchingToday, func(i, j int) bool {
		return watchingToday[i].AirTime < watchingToday[j].AirTime
	})

	// Build message
	var sb strings.Builder
	for _, item := range watchingToday {
		title := item.Title
		if title == "" {
			title = item.TitleOriginal
		}
		epStr := ""
		if item.NextEpisode > 0 {
			epStr = fmt.Sprintf(" EP%d", item.NextEpisode)
		}
		timeStr := item.AirTime
		if timeStr == "" {
			timeStr = "TBA"
		}
		sb.WriteString(fmt.Sprintf("• %s%s (%s)\n", title, epStr, timeStr))
	}

	notifTitle := fmt.Sprintf("📅 今日更新 (%d部)", len(watchingToday))
	notifMessage := strings.TrimRight(sb.String(), "\n")

	w.notifier.Send(ctx, "anime.daily_digest", notifTitle, notifMessage, "info",
		map[string]any{"count": len(watchingToday)})

	slog.Info("daily_digest: sent", "count", len(watchingToday))
}

// buildWatchingSet returns Bangumi IDs from collection + download rules.
func buildWatchingSet(ctx context.Context, queries *store.Queries) map[int]bool {
	ids := make(map[int]bool)

	collection, err := queries.ListCollectionAnime(ctx, store.ListCollectionAnimeParams{
		StatusFilter: "watching",
		SearchQuery:  "",
	})
	if err == nil {
		for _, item := range collection {
			if item.BangumiID.Valid && item.BangumiID.Int64 > 0 {
				ids[int(item.BangumiID.Int64)] = true
			}
		}
	}

	rules, err := queries.ListDownloadRules(ctx)
	if err == nil {
		for _, rule := range rules {
			if rule.Enabled == 1 && rule.BangumiID.Valid && rule.BangumiID.Int64 > 0 {
				ids[int(rule.BangumiID.Int64)] = true
			}
		}
	}

	return ids
}

func parseHHMM(s string) (hour, min int, ok bool) {
	if len(s) != 5 || s[2] != ':' {
		return 0, 0, false
	}
	_, err := fmt.Sscanf(s, "%d:%d", &hour, &min)
	if err != nil || hour < 0 || hour > 23 || min < 0 || min > 59 {
		return 0, 0, false
	}
	return hour, min, true
}
