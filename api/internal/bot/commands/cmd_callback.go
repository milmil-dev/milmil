package commands

import (
	"context"
	"strings"

	"github.com/milmil/api/internal/bot"
)

// CmdCallback handles inline button presses from the /start menu grid.
// Callback data format: "cmd:<command_name>" (e.g. "cmd:schedule", "cmd:downloads").
// It builds a synthetic CommandContext and dispatches through the registered handlers.
func CmdCallback(svc *Services, router *bot.Router) bot.CallbackHandler {
	return func(ctx context.Context, cb bot.CallbackContext) (*bot.BotResponse, error) {
		cmdName := strings.TrimPrefix(cb.Data, "cmd:")

		return router.HandleCommand(ctx, bot.CommandContext{
			Command:  cmdName,
			ChatID:   cb.ChatID,
			Platform: cb.Platform,
		})
	}
}
