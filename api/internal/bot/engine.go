package bot

import (
	"context"
	"log/slog"

	"github.com/milmil/api/internal/notification"
)

// StoppableAdapter is implemented by both Telegram and Discord adapters.
type StoppableAdapter interface {
	Stop()
}

// TelegramStartFunc starts the Telegram adapter.
type TelegramStartFunc func(cfg notification.TelegramBotConfig, router *Router) (StoppableAdapter, error)

// DiscordStartFunc starts the Discord adapter.
type DiscordStartFunc func(cfg notification.DiscordBotConfig, router *Router) (StoppableAdapter, error)

// PollingAdapter is implemented by adapters that support long polling.
type PollingAdapter interface {
	StartPolling(ctx context.Context)
}

// Engine manages bot lifecycle.
type Engine struct {
	router   *Router
	telegram StoppableAdapter
	discord  StoppableAdapter
	cancel   context.CancelFunc
}

func NewEngine(router *Router) *Engine {
	return &Engine{router: router}
}

// Router returns the command router.
func (e *Engine) Router() *Router {
	return e.router
}

// TelegramAdapter returns the Telegram adapter (or nil).
func (e *Engine) TelegramAdapter() StoppableAdapter {
	return e.telegram
}

// Start launches enabled bot adapters based on config.
func (e *Engine) Start(ctx context.Context, cfg notification.NotificationConfig, startTg TelegramStartFunc, startDiscord DiscordStartFunc) {
	ctx, cancel := context.WithCancel(ctx)
	e.cancel = cancel

	if cfg.Bot.Telegram.Enabled && cfg.Bot.Telegram.BotToken != "" {
		adapter, err := startTg(cfg.Bot.Telegram, e.router)
		if err != nil {
			slog.Error("bot: telegram start failed", "err", err)
		} else {
			e.telegram = adapter
			// Start polling if no webhook URL configured
			if cfg.Bot.Telegram.WebhookURL == "" {
				if poller, ok := adapter.(PollingAdapter); ok {
					go poller.StartPolling(ctx)
				}
			}
		}
	}

	if cfg.Bot.Discord.Enabled && cfg.Bot.Discord.BotToken != "" {
		adapter, err := startDiscord(cfg.Bot.Discord, e.router)
		if err != nil {
			slog.Error("bot: discord start failed", "err", err)
		} else {
			e.discord = adapter
		}
	}
}

// MessageSender can push a BotResponse to a specific chat.
type MessageSender interface {
	SendToChat(chatID int64, resp *BotResponse) error
}

// BroadcastToAll sends a BotResponse to all configured bot channels.
// Used by the report worker and other proactive notification features.
func (e *Engine) BroadcastToAll(cfg notification.NotificationConfig, resp *BotResponse) {
	if sender, ok := e.telegram.(MessageSender); ok && e.telegram != nil {
		for _, chatID := range cfg.Bot.Telegram.AllowedChatIDs {
			if err := sender.SendToChat(chatID, resp); err != nil {
				slog.Error("bot: broadcast telegram failed", "chat_id", chatID, "err", err)
			}
		}
	}
	// Discord broadcast could be added here when the Discord adapter supports it.
}

// Stop shuts down all adapters.
func (e *Engine) Stop() {
	if e.cancel != nil {
		e.cancel()
	}
	if e.telegram != nil {
		e.telegram.Stop()
	}
	if e.discord != nil {
		e.discord.Stop()
	}
}
