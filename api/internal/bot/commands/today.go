package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/milmil/api/internal/bot"
)

// TodayHandler implements /today — shows today's airing anime filtered to
// what the user is watching (collection + download rules).
func TodayHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		calendar, err := svc.Metadata.GetCalendar(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load calendar."}, nil
		}

		jst := time.FixedZone("JST", 9*3600)
		nowJST := time.Now().In(jst)
		todayWeekday := nowJST.Weekday()

		var todayItems []struct {
			title   string
			airTime string
			ep      int
			id      int
		}
		var dayName string

		for _, day := range calendar {
			if weekdayIndex(day.WeekdayEN) == jstWeekdayNum(todayWeekday) {
				dayName = day.WeekdayEN
				for _, item := range day.Items {
					title := item.Title
					if title == "" {
						title = item.TitleOriginal
					}
					todayItems = append(todayItems, struct {
						title   string
						airTime string
						ep      int
						id      int
					}{title: title, airTime: item.AirTime, ep: item.NextEpisode, id: item.BangumiID})
				}
				break
			}
		}

		if len(todayItems) == 0 {
			return &bot.BotResponse{
				Text: "No anime airing today.",
				Buttons: [][]bot.BotButton{
					{{Label: "📅 Full Schedule", Data: "cmd:schedule"}},
				},
			}, nil
		}

		// Build watching set from download rules (collection table may not exist)
		watchingIDs := make(map[int]bool)
		rules, err := svc.Queries.ListDownloadRules(ctx)
		if err == nil {
			for _, rule := range rules {
				if rule.Enabled == 1 && rule.BangumiID.Valid && rule.BangumiID.Int64 > 0 {
					watchingIDs[int(rule.BangumiID.Int64)] = true
				}
			}
		}

		// Split into watching and other
		var watching, other []struct {
			title   string
			airTime string
			ep      int
			id      int
		}
		for _, item := range todayItems {
			if item.id > 0 && watchingIDs[item.id] {
				watching = append(watching, item)
			} else {
				other = append(other, item)
			}
		}

		var sb strings.Builder
		fmt.Fprintf(&sb, "<b>📅 Today — %s %s</b>\n", dayName, nowJST.Format("1/2"))

		if len(watching) > 0 {
			fmt.Fprintf(&sb, "\n<b>⭐ Watching (%d)</b>\n", len(watching))
			for _, item := range watching {
				epStr := ""
				if item.ep > 0 {
					epStr = fmt.Sprintf(" EP%d", item.ep)
				}
				timeStr := ""
				if item.airTime != "" {
					timeStr = " " + item.airTime
				}
				fmt.Fprintf(&sb, "  • %s%s%s\n", item.title, epStr, timeStr)
			}
		}

		if len(other) > 0 {
			fmt.Fprintf(&sb, "\n<b>📺 All (%d)</b>\n", len(other))
			for _, item := range other {
				timeStr := ""
				if item.airTime != "" {
					timeStr = " " + item.airTime
				}
				fmt.Fprintf(&sb, "  • %s%s\n", item.title, timeStr)
			}
		}

		// Buttons: detail for watching, subscribe for unwatched
		var buttons [][]bot.BotButton
		for _, item := range watching {
			if item.id > 0 {
				shortTitle := item.title
				if len(shortTitle) > 20 {
					shortTitle = shortTitle[:20] + ".."
				}
				buttons = append(buttons, []bot.BotButton{
					{Label: fmt.Sprintf("⭐ %s", shortTitle), Data: fmt.Sprintf("detail:%d", item.id)},
				})
			}
		}
		// Show subscribe buttons for unwatched anime (up to 5)
		subCount := 0
		for _, item := range other {
			if item.id > 0 && subCount < 5 {
				shortTitle := item.title
				if len(shortTitle) > 18 {
					shortTitle = shortTitle[:18] + ".."
				}
				buttons = append(buttons, []bot.BotButton{
					{Label: fmt.Sprintf("➕ 追番 %s", shortTitle), Data: fmt.Sprintf("sub_pick:%d", item.id)},
				})
				subCount++
			}
		}
		buttons = append(buttons, []bot.BotButton{
			{Label: "📅 Full Schedule", Data: "cmd:schedule"},
			{Label: "🏠 Menu", Data: "menu:main"},
		})

		return &bot.BotResponse{
			Text:    sb.String(),
			Buttons: buttons,
		}, nil
	}
}

// jstWeekdayNum converts time.Weekday to 1=Mon...7=Sun used by weekdayIndex.
func jstWeekdayNum(wd time.Weekday) int {
	if wd == time.Sunday {
		return 7
	}
	return int(wd)
}
