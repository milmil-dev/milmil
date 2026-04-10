package commands

import (
	"context"
	"fmt"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// ScheduleHandler implements /schedule — weekly airing schedule.
func ScheduleHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		calendar, err := svc.Metadata.GetCalendar(ctx)
		if err != nil {
			return &bot.BotResponse{Text: "Failed to load schedule."}, nil
		}

		var sb strings.Builder
		sb.WriteString("<b>Weekly Schedule</b>\n")

		hasAny := false
		for _, day := range calendar {
			if len(day.Items) == 0 {
				continue
			}
			hasAny = true
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

		if !hasAny {
			return &bot.BotResponse{Text: "No scheduled episodes this week."}, nil
		}
		return &bot.BotResponse{Text: sb.String()}, nil
	}
}
