package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// StatsHandler implements /stats — collection and system statistics.
func StatsHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		fields := []bot.BotField{}

		// Collection counts by status
		statusCounts, err := svc.Queries.CountCollectionByStatus(ctx)
		if err == nil {
			for _, sc := range statusCounts {
				label := sc.WatchStatus
				if label == "" {
					continue
				}
				// Capitalize first letter
				label = string(label[0]-32) + label[1:]
				fields = append(fields, bot.BotField{
					Label:  label,
					Value:  fmt.Sprintf("%d", sc.Count),
					Inline: true,
				})
			}
		}

		// Active downloads
		downloads, err := svc.Queries.ListActiveDownloads(ctx)
		if err == nil {
			fields = append(fields, bot.BotField{
				Label:  "Downloads",
				Value:  fmt.Sprintf("%d active", len(downloads)),
				Inline: true,
			})
		}

		// RSS feeds
		feeds, err := svc.Queries.ListRSSFeeds(ctx)
		if err == nil {
			fields = append(fields, bot.BotField{
				Label:  "RSS Feeds",
				Value:  fmt.Sprintf("%d", len(feeds)),
				Inline: true,
			})
		}

		// Download rules
		rules, err := svc.Queries.ListDownloadRules(ctx)
		if err == nil {
			fields = append(fields, bot.BotField{
				Label:  "Rules",
				Value:  fmt.Sprintf("%d", len(rules)),
				Inline: true,
			})
		}

		// Libraries
		libraries, err := svc.Queries.ListLibraries(ctx)
		if err == nil {
			fields = append(fields, bot.BotField{
				Label:  "Libraries",
				Value:  fmt.Sprintf("%d", len(libraries)),
				Inline: true,
			})
		}

		return &bot.BotResponse{
			Text:   "<b>📊 Stats</b>",
			Fields: fields,
			Buttons: [][]bot.BotButton{
				{{Label: "⬅️ Menu", Data: "cmd:start"}},
			},
		}, nil
	}
}
