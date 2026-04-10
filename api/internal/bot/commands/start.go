package commands

import (
	"context"

	"github.com/milmil/api/internal/bot"
)

// StartHandler implements /start — welcome message and command list.
func StartHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		return &bot.BotResponse{
			Text: "<b>milmil</b> — Anime Media Server\n\n" +
				"/schedule — Weekly airing schedule\n" +
				"/search &lt;query&gt; — Search anime\n" +
				"/detail &lt;id&gt; — Anime details\n" +
				"/downloads — Active downloads\n" +
				"/subscribe &lt;anime&gt; — Auto-download subscription\n" +
				"/status — System overview\n" +
				"/mylist [status] — Your collection\n" +
				"/continue — Recently watched",
		}, nil
	}
}
