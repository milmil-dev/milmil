package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/milmil/api/internal/store"
)

// DiscordConfig holds Discord webhook notification settings.
type DiscordConfig struct {
	Enabled    bool   `json:"enabled"`
	WebhookURL string `json:"webhook_url"`
}

// TelegramConfig holds Telegram bot notification settings.
type TelegramConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

// WebhookConfig holds generic webhook notification settings.
type WebhookConfig struct {
	Enabled bool   `json:"enabled"`
	URL     string `json:"url"`
	Secret  string `json:"secret"`
}

// ProvidersConfig groups all external notification provider configurations.
type ProvidersConfig struct {
	Discord  DiscordConfig  `json:"discord"`
	Telegram TelegramConfig `json:"telegram"`
	Webhook  WebhookConfig  `json:"webhook"`
}

// NotificationConfig is the top-level notification settings object stored in
// the settings table under the "notifications" key.
type NotificationConfig struct {
	Providers ProvidersConfig     `json:"providers"`
	Events    map[string][]string `json:"events"`
	Bot       BotConfig           `json:"bot"`
}

// TelegramBotConfig holds interactive Telegram bot settings.
type TelegramBotConfig struct {
	Enabled               bool    `json:"enabled"`
	BotToken              string  `json:"bot_token"`
	WebhookURL            string  `json:"webhook_url"`
	AllowedChatIDs        []int64 `json:"allowed_chat_ids"`
	ReportInterval        string  `json:"report_interval"`         // e.g. "24h", "12h"; empty = disabled
	Language              string  `json:"language"`                // bot response language; empty = follow system
	AiringReminderMinutes int     `json:"airing_reminder_minutes"` // 0 = disabled, e.g. 30 = remind 30min before
	DailyDigestTime       string  `json:"daily_digest_time"`       // HH:mm in user local time, empty = disabled
}

// DiscordBotConfig holds interactive Discord bot settings.
type DiscordBotConfig struct {
	Enabled         bool     `json:"enabled"`
	BotToken        string   `json:"bot_token"`
	ApplicationID   string   `json:"application_id"`
	AllowedGuildIDs []string `json:"allowed_guild_ids"`
	ReportInterval  string   `json:"report_interval"` // e.g. "24h", "12h"; empty = disabled
}

// BotConfig groups all interactive bot settings.
type BotConfig struct {
	Telegram TelegramBotConfig `json:"telegram"`
	Discord  DiscordBotConfig  `json:"discord"`
}

// ProvidersForEvent returns the provider names subscribed to eventType.
func (c *NotificationConfig) ProvidersForEvent(eventType string) []string {
	if c.Events == nil {
		return nil
	}
	return c.Events[eventType]
}

// EnabledProvidersForEvent returns only providers that are both subscribed to
// the event AND have their Enabled flag set to true.
func (c *NotificationConfig) EnabledProvidersForEvent(eventType string) []string {
	all := c.ProvidersForEvent(eventType)
	enabled := make([]string, 0, len(all))
	for _, name := range all {
		switch name {
		case "discord":
			if c.Providers.Discord.Enabled {
				enabled = append(enabled, name)
			}
		case "telegram":
			if c.Providers.Telegram.Enabled {
				enabled = append(enabled, name)
			}
		case "webhook":
			if c.Providers.Webhook.Enabled {
				enabled = append(enabled, name)
			}
		}
	}
	return enabled
}

// LoadNotificationConfig reads and parses the notification config from the
// settings table. Returns a zero-value config when no setting exists.
func LoadNotificationConfig(ctx context.Context, queries *store.Queries) (NotificationConfig, error) {
	setting, err := queries.GetSetting(ctx, "notifications")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return NotificationConfig{}, nil
		}
		return NotificationConfig{}, err
	}
	var cfg NotificationConfig
	if err := json.Unmarshal([]byte(setting.Value), &cfg); err != nil {
		return NotificationConfig{}, err
	}
	return cfg, nil
}

// ProviderFactory is a function that builds a Provider from its config fields.
type ProviderFactory func(fields map[string]string) Provider

// providerFactories is the global registry of provider factories.
var providerFactories = map[string]ProviderFactory{}

// RegisterProviderFactory registers a factory for the named provider.
// Call this from init() in each provider implementation.
func RegisterProviderFactory(name string, factory ProviderFactory) {
	providerFactories[name] = factory
}

// BuildProvider creates a Provider instance from the current config.
// Returns nil if the named provider has no credentials or no registered factory.
func BuildProvider(name string, cfg *NotificationConfig) Provider {
	factory, ok := providerFactories[name]
	if !ok {
		return nil
	}

	fields := make(map[string]string)
	switch name {
	case "discord":
		if cfg.Providers.Discord.WebhookURL == "" {
			return nil
		}
		fields["webhook_url"] = cfg.Providers.Discord.WebhookURL
	case "telegram":
		if cfg.Providers.Telegram.BotToken == "" {
			return nil
		}
		fields["bot_token"] = cfg.Providers.Telegram.BotToken
		fields["chat_id"] = cfg.Providers.Telegram.ChatID
	case "webhook":
		if cfg.Providers.Webhook.URL == "" {
			return nil
		}
		fields["url"] = cfg.Providers.Webhook.URL
		fields["secret"] = cfg.Providers.Webhook.Secret
	default:
		return nil
	}

	return factory(fields)
}
