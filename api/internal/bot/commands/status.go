package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// StatusHandler implements /status — system overview.
func StatusHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		downloads, _ := svc.Queries.ListActiveDownloads(ctx)
		feeds, _ := svc.Queries.ListRSSFeeds(ctx)
		rules, _ := svc.Queries.ListDownloadRules(ctx)

		engineStatus := "disconnected"
		if svc.Downloader != nil && svc.Downloader.Healthy() {
			engineStatus = "connected"
		}

		return &bot.BotResponse{
			Text: "<b>System Status</b>",
			Fields: []bot.BotField{
				{Label: "Engine", Value: engineStatus, Inline: true},
				{Label: "Active Downloads", Value: fmt.Sprintf("%d", len(downloads)), Inline: true},
				{Label: "RSS Feeds", Value: fmt.Sprintf("%d", len(feeds)), Inline: true},
				{Label: "Download Rules", Value: fmt.Sprintf("%d", len(rules)), Inline: true},
			},
		}, nil
	}
}
