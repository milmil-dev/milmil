package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/milmil/api/internal/bot"
)

var weekdayLabels = []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}

// ScheduleHandler implements /schedule — shows day picker buttons first.
func ScheduleHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		// If args provided (e.g. from callback), show that day directly
		if args := strings.TrimSpace(cmd.Args); args != "" {
			return buildDaySchedule(ctx, svc, args)
		}

		// Show day picker buttons with dates
		now := time.Now().In(time.FixedZone("JST", 9*3600))
		todayWd := int(now.Weekday())
		if todayWd == 0 {
			todayWd = 7 // Sunday = 7
		}
		tomorrowWd := todayWd%7 + 1
		if tomorrowWd == 0 {
			tomorrowWd = 7
		}
		tomorrow := now.AddDate(0, 0, 1)

		buttons := [][]bot.BotButton{
			{
				{Label: fmt.Sprintf("📅 Today %s", now.Format("1/2")), Data: fmt.Sprintf("sched:%d", todayWd)},
				{Label: fmt.Sprintf("📅 Tomorrow %s", tomorrow.Format("1/2")), Data: fmt.Sprintf("sched:%d", tomorrowWd)},
			},
			{
				{Label: "Mon", Data: "sched:1"},
				{Label: "Tue", Data: "sched:2"},
				{Label: "Wed", Data: "sched:3"},
				{Label: "Thu", Data: "sched:4"},
			},
			{
				{Label: "Fri", Data: "sched:5"},
				{Label: "Sat", Data: "sched:6"},
				{Label: "Sun", Data: "sched:7"},
				{Label: "All", Data: "sched:all"},
			},
		}

		return &bot.BotResponse{
			Text:    "<b>Schedule</b>\nSelect a day to view airing anime:",
			Buttons: buttons,
		}, nil
	}
}

// ScheduleCallback handles "sched:<weekday>" callbacks.
func ScheduleCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		parts := strings.SplitN(cb.Data, ":", 2)
		if len(parts) < 2 {
			return &bot.BotResponse{Text: "Invalid callback."}, nil
		}
		return buildDaySchedule(ctx, svc, parts[1])
	}
}

func buildDaySchedule(ctx context.Context, svc *Services, dayArg string) (*bot.BotResponse, error) {
	calendar, err := svc.Metadata.GetCalendar(ctx)
	if err != nil {
		return &bot.BotResponse{Text: "Failed to load schedule."}, nil
	}

	// Show all days
	if dayArg == "all" {
		var sb strings.Builder
		sb.WriteString("<b>Weekly Schedule</b>\n")
		for _, day := range calendar {
			if len(day.Items) == 0 {
				continue
			}
			dayName := day.WeekdayEN
			if dayName == "" {
				dayName = day.Weekday
			}
			sb.WriteString(fmt.Sprintf("\n<b>%s</b>\n", dayName))
			for _, item := range day.Items {
				title := item.Title
				if title == "" {
					title = item.TitleOriginal
				}
				airTime := ""
				if item.AirTime != "" {
					airTime = " " + item.AirTime
				}
				sb.WriteString(fmt.Sprintf("  • %s%s\n", title, airTime))
			}
		}
		return &bot.BotResponse{
			Text: sb.String(),
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Back", Data: "cmd:schedule"}},
			},
		}, nil
	}

	// Parse weekday number (1=Monday ... 7=Sunday)
	var targetDay int
	if _, err := fmt.Sscanf(dayArg, "%d", &targetDay); err != nil || targetDay < 1 || targetDay > 7 {
		return &bot.BotResponse{Text: "Invalid day."}, nil
	}

	// Map to Bangumi weekday (Bangumi uses 1=Mon ... 7=Sun, same as ours)
	var matchedDay *struct {
		name  string
		items []struct {
			title   string
			airTime string
			id      int
		}
	}

	for _, day := range calendar {
		// Match by WeekdayEN name or by position
		dayIdx := weekdayIndex(day.WeekdayEN)
		if dayIdx == targetDay {
			var items []struct {
				title   string
				airTime string
				id      int
			}
			for _, item := range day.Items {
				title := item.Title
				if title == "" {
					title = item.TitleOriginal
				}
				items = append(items, struct {
					title   string
					airTime string
					id      int
				}{title: title, airTime: item.AirTime, id: item.BangumiID})
			}
			dayName := day.WeekdayEN
			if dayName == "" {
				dayName = day.Weekday
			}
			matchedDay = &struct {
				name  string
				items []struct {
					title   string
					airTime string
					id      int
				}
			}{name: dayName, items: items}
			break
		}
	}

	if matchedDay == nil || len(matchedDay.items) == 0 {
		return &bot.BotResponse{
			Text: fmt.Sprintf("No anime airing on <b>%s</b>.", weekdayLabels[targetDay-1]),
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Back", Data: "cmd:schedule"}},
			},
		}, nil
	}

	// Calculate the date for the target weekday
	now := time.Now().In(time.FixedZone("JST", 9*3600))
	todayWd := int(now.Weekday())
	if todayWd == 0 {
		todayWd = 7
	}
	daysUntil := targetDay - todayWd
	if daysUntil < 0 {
		daysUntil += 7
	}
	targetDate := now.AddDate(0, 0, daysUntil)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("<b>%s %s</b> (%d anime)\n\n", matchedDay.name, targetDate.Format("2006/1/2"), len(matchedDay.items)))
	for _, item := range matchedDay.items {
		airTime := ""
		if item.airTime != "" {
			airTime = " " + item.airTime
		}
		sb.WriteString(fmt.Sprintf("• %s%s\n", item.title, airTime))
	}

	// Add detail buttons for first 5 anime
	var buttons [][]bot.BotButton
	limit := len(matchedDay.items)
	if limit > 5 {
		limit = 5
	}
	for i := 0; i < limit; i++ {
		item := matchedDay.items[i]
		if item.id > 0 {
			shortTitle := item.title
			if len(shortTitle) > 15 {
				shortTitle = shortTitle[:15] + ".."
			}
			buttons = append(buttons, []bot.BotButton{
				{Label: shortTitle, Data: fmt.Sprintf("detail:%d", item.id)},
			})
		}
	}
	buttons = append(buttons, []bot.BotButton{
		{Label: "⬅️ Back", Data: "cmd:schedule"},
	})

	return &bot.BotResponse{
		Text:    sb.String(),
		Buttons: buttons,
	}, nil
}

func weekdayIndex(name string) int {
	switch strings.ToLower(name) {
	case "monday":
		return 1
	case "tuesday":
		return 2
	case "wednesday":
		return 3
	case "thursday":
		return 4
	case "friday":
		return 5
	case "saturday":
		return 6
	case "sunday":
		return 7
	default:
		return 0
	}
}
