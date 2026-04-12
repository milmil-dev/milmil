package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// StartHandler implements /start — welcome message with system summary and button grid.
func StartHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		return buildStartMenu(ctx, svc)
	}
}

// MenuCallback handles the "menu" callback to re-render the /start menu.
func MenuCallback(svc *Services) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		return buildStartMenu(ctx, svc)
	}
}

func buildStartMenu(ctx context.Context, svc *Services) (*bot.BotResponse, error) {
	// Gather summary counts
	downloads, _ := svc.Queries.ListActiveDownloads(ctx)
	feeds, _ := svc.Queries.ListRSSFeeds(ctx)
	rules, _ := svc.Queries.ListDownloadRules(ctx)

	summary := fmt.Sprintf(
		"<b>milmil</b> — Anime Media Server\n\n"+
			"📥 <b>%d</b> active downloads\n"+
			"📡 <b>%d</b> RSS feeds\n"+
			"📋 <b>%d</b> subscription rules",
		len(downloads), len(feeds), len(rules),
	)

	return &bot.BotResponse{
		Text: summary,
		Buttons: [][]bot.BotButton{
			{
				{Label: "📅 Schedule", Data: "cmd:schedule"},
				{Label: "🔍 Search", Data: "cmd:search"},
			},
			{
				{Label: "📥 Downloads", Data: "cmd:downloads"},
				{Label: "📊 Status", Data: "cmd:status"},
			},
			{
				{Label: "📚 My List", Data: "cmd:mylist"},
				{Label: "▶ Continue", Data: "cmd:continue"},
			},
			{
				{Label: "🆕 Recent", Data: "cmd:recent"},
				{Label: "👀 Watching", Data: "cmd:watching"},
				{Label: "📈 Trending", Data: "cmd:trending"},
			},
			{
				{Label: "📁 Library", Data: "cmd:library"},
				{Label: "🔄 Scan", Data: "cmd:scan"},
				{Label: "🆔 My ID", Data: "cmd:id"},
			},
		},
	}, nil
}
