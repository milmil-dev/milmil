package notification

import (
	"encoding/json"
	"testing"
)

func TestNotificationConfig_Unmarshal(t *testing.T) {
	raw := `{
		"providers": {
			"discord": {"enabled": true, "webhook_url": "https://discord.com/api/webhooks/test"},
			"telegram": {"enabled": false, "bot_token": "tok", "chat_id": "123"},
			"webhook": {"enabled": true, "url": "https://example.com/hook", "secret": "s3cret"}
		},
		"events": {
			"download.completed": ["discord", "webhook"],
			"download.failed": ["discord"]
		}
	}`

	var cfg NotificationConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if !cfg.Providers.Discord.Enabled {
		t.Error("expected discord enabled")
	}
	if cfg.Providers.Telegram.Enabled {
		t.Error("expected telegram disabled")
	}
	if cfg.Providers.Webhook.URL != "https://example.com/hook" {
		t.Errorf("unexpected webhook url: %s", cfg.Providers.Webhook.URL)
	}

	providers := cfg.ProvidersForEvent("download.completed")
	if len(providers) != 2 || providers[0] != "discord" || providers[1] != "webhook" {
		t.Errorf("unexpected providers for download.completed: %v", providers)
	}

	providers = cfg.ProvidersForEvent("download.started")
	if len(providers) != 0 {
		t.Errorf("expected no providers for unconfigured event, got %v", providers)
	}
}

func TestNotificationConfig_EnabledProviders(t *testing.T) {
	cfg := NotificationConfig{
		Providers: ProvidersConfig{
			Discord:  DiscordConfig{Enabled: true, WebhookURL: "https://test"},
			Telegram: TelegramConfig{Enabled: false},
			Webhook:  WebhookConfig{Enabled: true, URL: "https://test"},
		},
		Events: map[string][]string{
			"download.completed": {"discord", "telegram", "webhook"},
		},
	}

	providers := cfg.EnabledProvidersForEvent("download.completed")
	if len(providers) != 2 {
		t.Errorf("expected 2 enabled providers, got %d: %v", len(providers), providers)
	}
}

func TestBuildProvider_NilWhenNoFactory(t *testing.T) {
	cfg := &NotificationConfig{}
	if p := BuildProvider("unknown", cfg); p != nil {
		t.Error("expected nil provider for unknown name")
	}
}

func TestBuildProvider_NilWhenEmptyCredentials(t *testing.T) {
	// Register a dummy factory for testing the credential gate
	called := false
	RegisterProviderFactory("discord", func(fields map[string]string) Provider {
		called = true
		return nil
	})
	defer delete(providerFactories, "discord")

	cfg := &NotificationConfig{} // empty discord config — no webhook_url

	if p := BuildProvider("discord", cfg); p != nil {
		t.Error("expected nil provider for empty discord config")
	}
	if called {
		t.Error("factory should not be called when credentials are empty")
	}
}

func TestBuildProvider_CallsFactoryWithFields(t *testing.T) {
	var gotFields map[string]string
	RegisterProviderFactory("discord", func(fields map[string]string) Provider {
		gotFields = fields
		return nil
	})
	defer delete(providerFactories, "discord")

	cfg := &NotificationConfig{
		Providers: ProvidersConfig{
			Discord: DiscordConfig{Enabled: true, WebhookURL: "https://hooks.test/abc"},
		},
	}

	BuildProvider("discord", cfg)
	if gotFields["webhook_url"] != "https://hooks.test/abc" {
		t.Errorf("expected webhook_url field, got %v", gotFields)
	}
}
