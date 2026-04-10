package telegram

import (
	"context"
	"log/slog"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/milmil/api/internal/bot"
	"github.com/milmil/api/internal/notification"
)

// Adapter runs the milmil Telegram interactive bot. It can transport updates
// via long-polling (for self-hosted installs) or via webhook POSTs (for
// deployments that expose a public URL).
type Adapter struct {
	api    *tgbotapi.BotAPI
	router *bot.Router
	cfg    notification.TelegramBotConfig
	cancel context.CancelFunc
}

// New creates a Telegram adapter bound to the provided command/callback router.
// It registers the commands menu with Telegram (setMyCommands) so clients show
// a nice command list, but does not start any transport. Call StartPolling or
// HandleWebhookUpdate to actually process updates.
func New(cfg notification.TelegramBotConfig, router *bot.Router) (*Adapter, error) {
	api, err := tgbotapi.NewBotAPI(cfg.BotToken)
	if err != nil {
		return nil, err
	}
	api.Debug = false

	a := &Adapter{
		api:    api,
		router: router,
		cfg:    cfg,
	}

	commands := []tgbotapi.BotCommand{
		{Command: "start", Description: "Welcome & help"},
		{Command: "schedule", Description: "Weekly airing schedule"},
		{Command: "search", Description: "Search anime"},
		{Command: "detail", Description: "Anime details"},
		{Command: "downloads", Description: "Active downloads"},
		{Command: "subscribe", Description: "Auto-download subscription"},
		{Command: "status", Description: "System overview"},
		{Command: "mylist", Description: "Your collection"},
		{Command: "continue", Description: "Continue watching"},
	}
	cmdCfg := tgbotapi.NewSetMyCommands(commands...)
	if _, err := api.Request(cmdCfg); err != nil {
		slog.Warn("telegram: failed to set commands menu", "err", err)
	}

	slog.Info("telegram: bot ready", "username", api.Self.UserName)
	return a, nil
}

// StartPolling deletes any existing webhook and begins long-polling for
// updates. It dispatches each update to a goroutine so slow handlers don't
// block the poll loop. StartPolling returns when ctx is cancelled or Stop is
// called.
func (a *Adapter) StartPolling(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	a.cancel = cancel

	// Remove any existing webhook so polling can receive updates.
	if _, err := a.api.Request(tgbotapi.DeleteWebhookConfig{}); err != nil {
		slog.Warn("telegram: delete webhook failed", "err", err)
	}

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 30

	updates := a.api.GetUpdatesChan(u)

	slog.Info("telegram: polling started")

	for {
		select {
		case <-ctx.Done():
			a.api.StopReceivingUpdates()
			slog.Info("telegram: polling stopped")
			return
		case update := <-updates:
			go a.handleUpdate(ctx, update)
		}
	}
}

// HandleWebhookUpdate processes a single update that arrived via a webhook
// POST. It runs the handler in a goroutine so the HTTP handler can return
// immediately.
func (a *Adapter) HandleWebhookUpdate(update tgbotapi.Update) {
	go a.handleUpdate(context.Background(), update)
}

// Stop cancels the polling context, if any.
func (a *Adapter) Stop() {
	if a.cancel != nil {
		a.cancel()
	}
}

func (a *Adapter) handleUpdate(ctx context.Context, update tgbotapi.Update) {
	if update.CallbackQuery != nil {
		a.handleCallback(ctx, update.CallbackQuery)
		return
	}

	if update.Message == nil || !update.Message.IsCommand() {
		return
	}

	a.handleCommand(ctx, update.Message)
}

func (a *Adapter) handleCommand(ctx context.Context, msg *tgbotapi.Message) {
	if !a.isAllowed(msg.Chat.ID) {
		return
	}

	cmd := bot.CommandContext{
		Command:  msg.Command(),
		Args:     msg.CommandArguments(),
		ChatID:   msg.Chat.ID,
		Platform: "telegram",
	}

	resp, err := a.router.HandleCommand(ctx, cmd)
	if err != nil {
		slog.Error("telegram: command error", "cmd", cmd.Command, "err", err)
		resp = &bot.BotResponse{Text: "An error occurred."}
	}

	out := RenderMessage(cmd.ChatID, resp)
	if _, err := a.api.Send(out); err != nil {
		slog.Error("telegram: send failed", "err", err)
	}
}

func (a *Adapter) handleCallback(ctx context.Context, cq *tgbotapi.CallbackQuery) {
	if cq.Message == nil {
		return
	}
	if !a.isAllowed(cq.Message.Chat.ID) {
		return
	}

	// Acknowledge the callback so Telegram clears the loading spinner.
	if _, err := a.api.Request(tgbotapi.NewCallback(cq.ID, "")); err != nil {
		slog.Warn("telegram: callback ack failed", "err", err)
	}

	cb := bot.CallbackContext{
		Data:      cq.Data,
		ChatID:    cq.Message.Chat.ID,
		MessageID: cq.Message.MessageID,
		Platform:  "telegram",
	}

	resp, err := a.router.HandleCallback(ctx, cb)
	if err != nil {
		slog.Error("telegram: callback error", "data", cb.Data, "err", err)
		return
	}

	// Try to edit the existing message in place. Editing a photo message as
	// text will fail, so fall back to sending a brand new message in that case.
	edit := RenderEditMessage(cb.ChatID, cb.MessageID, resp)
	if _, err := a.api.Send(edit); err != nil {
		slog.Debug("telegram: edit failed, sending new message", "err", err)
		out := RenderMessage(cb.ChatID, resp)
		if _, err := a.api.Send(out); err != nil {
			slog.Error("telegram: fallback send failed", "err", err)
		}
	}
}

func (a *Adapter) isAllowed(chatID int64) bool {
	if len(a.cfg.AllowedChatIDs) == 0 {
		return true
	}
	for _, id := range a.cfg.AllowedChatIDs {
		if id == chatID {
			return true
		}
	}
	return false
}
