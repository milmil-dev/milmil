package commands

import (
	"context"
	"fmt"

	"github.com/milmil/api/internal/bot"
)

// IDHandler implements /id — returns the user's chat/user ID.
func IDHandler(svc *Services) bot.CommandHandler {
	return func(ctx context.Context, cmd bot.CommandContext) (*bot.BotResponse, error) {
		switch cmd.Platform {
		case "discord":
			return &bot.BotResponse{
				Text: fmt.Sprintf("Your Chat ID: `%d`", cmd.ChatID),
			}, nil
		default:
			return &bot.BotResponse{
				Text: fmt.Sprintf("Your Chat ID: <code>%d</code>", cmd.ChatID),
			}, nil
		}
	}
}
