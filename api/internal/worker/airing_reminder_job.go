package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// AiringReminderWorker checks for upcoming anime episodes and sends
// notifications before they air. It runs every 5 minutes and deduplicates
// reminders using an in-memory map that resets daily.
type AiringReminderWorker struct {
	queries  *store.Queries
	metadata *metadata.Service
	notifier *notification.Service

	mu       sync.Mutex
	sent     map[string]bool // "bangumiID:date" -> true
	sentDate string          // YYYY-MM-DD, reset when date changes
}

// NewAiringReminderWorker creates a new airing reminder worker.
func NewAiringReminderWorker(
	queries *store.Queries,
	metadataSvc *metadata.Service,
	notifier *notification.Service,
) *AiringReminderWorker {
	return &AiringReminderWorker{
		queries:  queries,
		metadata: metadataSvc,
		notifier: notifier,
		sent:     make(map[string]bool),
	}
}

// Run checks the airing calendar and sends reminders for anime the user is
// watching or has download rules for.
func (w *AiringReminderWorker) Run(ctx context.Context) {
	// Load config to check if reminders are enabled
	cfg, err := notification.LoadNotificationConfig(ctx, w.queries)
	if err != nil {
		slog.Debug("airing_reminder: load config failed", "err", err)
		return
	}

	reminderMinutes := cfg.Bot.Telegram.AiringReminderMinutes
	if reminderMinutes <= 0 {
		return
	}

	// Reset sent map on new day
	jst := time.FixedZone("Asia/Tokyo", 9*60*60)
	nowJST := time.Now().In(jst)
	todayStr := nowJST.Format("2006-01-02")

	w.mu.Lock()
	if w.sentDate != todayStr {
		w.sent = make(map[string]bool)
		w.sentDate = todayStr
	}
	w.mu.Unlock()

	// Get today's weekday index (Monday=0 in Bangumi calendar)
	calendar, err := w.metadata.GetCalendar(ctx)
	if err != nil {
		slog.Error("airing_reminder: get calendar", "err", err)
		return
	}

	// Find today's day in the calendar by matching weekday
	todayWeekday := nowJST.Weekday() // Sunday=0, Monday=1, ...
	var todayItems []metadata.AnimeSummary
	for _, day := range calendar {
		if matchesWeekday(day.WeekdayEN, todayWeekday) {
			todayItems = day.Items
			break
		}
	}

	if len(todayItems) == 0 {
		return
	}

	// Build set of Bangumi IDs the user is watching or has rules for
	watchingIDs := buildWatchingSet(ctx, w.queries)
	if len(watchingIDs) == 0 {
		return
	}

	reminderWindow := time.Duration(reminderMinutes) * time.Minute

	for _, item := range todayItems {
		if item.BangumiID == 0 || item.AirTime == "" {
			continue
		}

		if !watchingIDs[item.BangumiID] {
			continue
		}

		// Parse air time (HH:mm in JST)
		airTime, err := time.ParseInLocation("15:04", item.AirTime, jst)
		if err != nil {
			continue
		}

		// Construct full air datetime for today in JST
		airDateTime := time.Date(nowJST.Year(), nowJST.Month(), nowJST.Day(),
			airTime.Hour(), airTime.Minute(), 0, 0, jst)

		timeUntil := airDateTime.Sub(nowJST)

		// Send reminder if within window and not yet aired
		if timeUntil > 0 && timeUntil <= reminderWindow {
			dedupKey := fmt.Sprintf("%d:%s", item.BangumiID, todayStr)

			w.mu.Lock()
			alreadySent := w.sent[dedupKey]
			if !alreadySent {
				w.sent[dedupKey] = true
			}
			w.mu.Unlock()

			if alreadySent {
				continue
			}

			// Format time until for display
			minutesUntil := int(timeUntil.Minutes())
			timeUntilStr := fmt.Sprintf("%d minutes", minutesUntil)
			if minutesUntil >= 60 {
				timeUntilStr = fmt.Sprintf("%dh%dm", minutesUntil/60, minutesUntil%60)
			}

			title := item.Title
			if title == "" {
				title = item.TitleOriginal
			}

			episodeStr := ""
			if item.NextEpisode > 0 {
				episodeStr = fmt.Sprintf(" EP%d", item.NextEpisode)
			}

			notifTitle := fmt.Sprintf("%s%s will air in %s", title, episodeStr, timeUntilStr)
			notifMessage := fmt.Sprintf("%s%s airs at %s (JST)", title, episodeStr, item.AirTime)

			w.notifier.Send(ctx, "anime.airing", notifTitle, notifMessage, "info",
				map[string]any{
					"bangumi_id":     item.BangumiID,
					"anime_name":     title,
					"episode_number": item.NextEpisode,
					"air_time":       item.AirTime,
					"time_until":     timeUntilStr,
				})

			slog.Info("airing_reminder: sent",
				"anime", title,
				"episode", item.NextEpisode,
				"air_time", item.AirTime,
				"time_until", timeUntilStr)
		}
	}
}

// matchesWeekday checks if an English weekday name matches a time.Weekday.
func matchesWeekday(weekdayEN string, wd time.Weekday) bool {
	switch wd {
	case time.Sunday:
		return weekdayEN == "Sunday" || weekdayEN == "Sun"
	case time.Monday:
		return weekdayEN == "Monday" || weekdayEN == "Mon"
	case time.Tuesday:
		return weekdayEN == "Tuesday" || weekdayEN == "Tue"
	case time.Wednesday:
		return weekdayEN == "Wednesday" || weekdayEN == "Wed"
	case time.Thursday:
		return weekdayEN == "Thursday" || weekdayEN == "Thu"
	case time.Friday:
		return weekdayEN == "Friday" || weekdayEN == "Fri"
	case time.Saturday:
		return weekdayEN == "Saturday" || weekdayEN == "Sat"
	}
	return false
}
