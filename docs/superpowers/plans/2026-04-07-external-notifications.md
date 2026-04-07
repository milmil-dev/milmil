# External Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discord, Telegram, and generic webhook notification delivery to the existing in-app notification system.

**Architecture:** Provider interface pattern — `notification.Service.Send()` fans out to enabled external providers after creating the in-app notification. Deliveries are tracked in a new table and retried by a worker. Configuration stored in the existing settings table.

**Tech Stack:** Go (Echo, sqlc, slog), SQLite, React 19, TanStack Router/Query/Form, Tailwind CSS v4, Lingui i18n

---

### Task 1: Database Migration — notification_deliveries table

**Files:**
- Create: `api/migrations/000029_create_notification_deliveries.up.sql`
- Create: `api/migrations/000029_create_notification_deliveries.down.sql`

- [ ] **Step 1: Create up migration**

```sql
-- api/migrations/000029_create_notification_deliveries.up.sql
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_retry_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_notification_deliveries_pending
    ON notification_deliveries(status, next_retry_at)
    WHERE status = 'pending';

CREATE INDEX idx_notification_deliveries_notification_id
    ON notification_deliveries(notification_id);
```

- [ ] **Step 2: Create down migration**

```sql
-- api/migrations/000029_create_notification_deliveries.down.sql
DROP INDEX IF EXISTS idx_notification_deliveries_notification_id;
DROP INDEX IF EXISTS idx_notification_deliveries_pending;
DROP TABLE IF EXISTS notification_deliveries;
```

- [ ] **Step 3: Verify migration applies**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds (migrations are embedded via `embed.go`)

- [ ] **Step 4: Commit**

```bash
git add api/migrations/000029_create_notification_deliveries.*
git commit -m "feat(notifications): add notification_deliveries migration"
```

---

### Task 2: sqlc Queries for notification_deliveries

**Files:**
- Create: `api/internal/store/queries/notification_deliveries.sql`
- Modify: `api/internal/store/` (regenerate with sqlc)

- [ ] **Step 1: Write SQL queries**

```sql
-- api/internal/store/queries/notification_deliveries.sql

-- name: CreateNotificationDelivery :one
INSERT INTO notification_deliveries (id, notification_id, provider, status, attempts, last_error, next_retry_at, created_at, updated_at)
VALUES (?, ?, ?, 'pending', 0, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: ListPendingDeliveries :many
SELECT * FROM notification_deliveries
WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?) AND attempts < 3
ORDER BY created_at ASC
LIMIT 50;

-- name: UpdateDeliverySuccess :exec
UPDATE notification_deliveries
SET status = 'sent', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: UpdateDeliveryFailure :exec
UPDATE notification_deliveries
SET attempts = attempts + 1,
    last_error = ?,
    next_retry_at = ?,
    status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: DeleteOldDeliveries :exec
DELETE FROM notification_deliveries WHERE created_at < ?;
```

- [ ] **Step 2: Regenerate sqlc**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && sqlc generate`
Expected: Generates `api/internal/store/notification_deliveries.sql.go` with the query methods

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/notification_deliveries.sql api/internal/store/notification_deliveries.sql.go
git commit -m "feat(notifications): add sqlc queries for delivery tracking"
```

---

### Task 3: Provider Interface and NotificationEvent Type

**Files:**
- Create: `api/internal/notification/provider.go`

- [ ] **Step 1: Create the provider interface and event type**

```go
// api/internal/notification/provider.go
package notification

import "context"

// NotificationEvent is the payload passed to external notification providers.
type NotificationEvent struct {
	Type     string            `json:"type"`
	Title    string            `json:"title"`
	Message  string            `json:"message"`
	Severity string            `json:"severity"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// Provider delivers notifications to an external service (Discord, Telegram, etc.).
type Provider interface {
	// Name returns the provider identifier (e.g. "discord", "telegram", "webhook").
	Name() string
	// Send delivers a single notification event. Returns an error on failure.
	Send(ctx context.Context, event NotificationEvent) error
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add api/internal/notification/provider.go
git commit -m "feat(notifications): add Provider interface and NotificationEvent type"
```

---

### Task 4: Discord Provider

**Files:**
- Create: `api/internal/notification/providers/discord.go`
- Create: `api/internal/notification/providers/discord_test.go`

- [ ] **Step 1: Write test for Discord provider**

```go
// api/internal/notification/providers/discord_test.go
package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestDiscordProvider_Send(t *testing.T) {
	var receivedBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected application/json content type")
		}
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	p := NewDiscordProvider(server.URL, &http.Client{})
	err := p.Send(context.Background(), notification.NotificationEvent{
		Type:     "download.completed",
		Title:    "Download Complete",
		Message:  "Frieren S2E03",
		Severity: "success",
		Metadata: map[string]string{"rule_name": "Frieren Auto"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedBody == nil {
		t.Fatal("no body received")
	}
	embeds, ok := receivedBody["embeds"].([]any)
	if !ok || len(embeds) == 0 {
		t.Fatal("expected embeds array")
	}
}

func TestDiscordProvider_Name(t *testing.T) {
	p := NewDiscordProvider("https://example.com", &http.Client{})
	if p.Name() != "discord" {
		t.Errorf("expected 'discord', got %q", p.Name())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestDiscordProvider -v`
Expected: FAIL — `NewDiscordProvider` not defined

- [ ] **Step 3: Implement Discord provider**

```go
// api/internal/notification/providers/discord.go
package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/milmil/api/internal/notification"
)

// discordEmbed represents a Discord webhook embed.
type discordEmbed struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Color       int            `json:"color"`
	Fields      []discordField `json:"fields,omitempty"`
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type discordPayload struct {
	Embeds []discordEmbed `json:"embeds"`
}

var severityColors = map[string]int{
	"success": 0x22c55e, // green
	"error":   0xef4444, // red
	"info":    0x3b82f6, // blue
}

// DiscordProvider sends notifications via Discord webhooks.
type DiscordProvider struct {
	webhookURL string
	client     *http.Client
}

func NewDiscordProvider(webhookURL string, client *http.Client) *DiscordProvider {
	return &DiscordProvider{webhookURL: webhookURL, client: client}
}

func (d *DiscordProvider) Name() string { return "discord" }

func (d *DiscordProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	color := severityColors[event.Severity]
	if color == 0 {
		color = severityColors["info"]
	}

	embed := discordEmbed{
		Title:       event.Title,
		Description: event.Message,
		Color:       color,
	}

	for k, v := range event.Metadata {
		embed.Fields = append(embed.Fields, discordField{
			Name: k, Value: v, Inline: true,
		})
	}

	payload := discordPayload{Embeds: []discordEmbed{embed}}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("discord: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("discord: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("discord: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("discord: unexpected status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestDiscordProvider -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/notification/providers/
git commit -m "feat(notifications): add Discord webhook provider"
```

---

### Task 5: Telegram Provider

**Files:**
- Create: `api/internal/notification/providers/telegram.go`
- Create: `api/internal/notification/providers/telegram_test.go`

- [ ] **Step 1: Write test for Telegram provider**

```go
// api/internal/notification/providers/telegram_test.go
package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestTelegramProvider_Send(t *testing.T) {
	var receivedBody map[string]any
	var receivedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		json.NewDecoder(r.Body).Decode(&receivedBody)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	p := NewTelegramProvider("testtoken123", "12345", &http.Client{})
	p.baseURL = server.URL // override for testing

	err := p.Send(context.Background(), notification.NotificationEvent{
		Type:     "download.completed",
		Title:    "Download Complete",
		Message:  "Frieren S2E03",
		Severity: "success",
		Metadata: map[string]string{"rule_name": "Frieren Auto"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedPath != "/bottesttoken123/sendMessage" {
		t.Errorf("unexpected path: %s", receivedPath)
	}
	chatID, _ := receivedBody["chat_id"].(string)
	if chatID != "12345" {
		t.Errorf("expected chat_id '12345', got %q", chatID)
	}
	parseMode, _ := receivedBody["parse_mode"].(string)
	if parseMode != "HTML" {
		t.Errorf("expected parse_mode 'HTML', got %q", parseMode)
	}
}

func TestTelegramProvider_Name(t *testing.T) {
	p := NewTelegramProvider("token", "chat", &http.Client{})
	if p.Name() != "telegram" {
		t.Errorf("expected 'telegram', got %q", p.Name())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestTelegramProvider -v`
Expected: FAIL — `NewTelegramProvider` not defined

- [ ] **Step 3: Implement Telegram provider**

```go
// api/internal/notification/providers/telegram.go
package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/milmil/api/internal/notification"
)

var severityEmoji = map[string]string{
	"success": "✅",
	"error":   "❌",
	"info":    "ℹ️",
}

// TelegramProvider sends notifications via the Telegram Bot API.
type TelegramProvider struct {
	botToken string
	chatID   string
	client   *http.Client
	baseURL  string // overridable for testing
}

func NewTelegramProvider(botToken, chatID string, client *http.Client) *TelegramProvider {
	return &TelegramProvider{
		botToken: botToken,
		chatID:   chatID,
		client:   client,
		baseURL:  "https://api.telegram.org",
	}
}

func (t *TelegramProvider) Name() string { return "telegram" }

func (t *TelegramProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	emoji := severityEmoji[event.Severity]
	if emoji == "" {
		emoji = severityEmoji["info"]
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s <b>%s</b>\n%s", emoji, event.Title, event.Message))

	for k, v := range event.Metadata {
		sb.WriteString(fmt.Sprintf("\n%s: %s", k, v))
	}

	payload := map[string]string{
		"chat_id":    t.chatID,
		"text":       sb.String(),
		"parse_mode": "HTML",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("telegram: marshal: %w", err)
	}

	url := fmt.Sprintf("%s/bot%s/sendMessage", t.baseURL, t.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("telegram: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram: unexpected status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestTelegramProvider -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/notification/providers/
git commit -m "feat(notifications): add Telegram bot provider"
```

---

### Task 6: Webhook Provider

**Files:**
- Create: `api/internal/notification/providers/webhook.go`
- Create: `api/internal/notification/providers/webhook_test.go`

- [ ] **Step 1: Write test for Webhook provider**

```go
// api/internal/notification/providers/webhook_test.go
package providers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/notification"
)

func TestWebhookProvider_Send(t *testing.T) {
	secret := "test-secret"
	var receivedBody []byte
	var receivedSig string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		receivedSig = r.Header.Get("X-Signature-256")
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := NewWebhookProvider(server.URL, secret, &http.Client{})
	err := p.Send(context.Background(), notification.NotificationEvent{
		Type:     "download.completed",
		Title:    "Download Complete",
		Message:  "Frieren S2E03",
		Severity: "success",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify body is valid JSON with expected fields
	var parsed notification.NotificationEvent
	if err := json.Unmarshal(receivedBody, &parsed); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	if parsed.Type != "download.completed" {
		t.Errorf("expected type download.completed, got %s", parsed.Type)
	}

	// Verify HMAC signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(receivedBody)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if receivedSig != expected {
		t.Errorf("signature mismatch:\n  got:  %s\n  want: %s", receivedSig, expected)
	}
}

func TestWebhookProvider_SendNoSecret(t *testing.T) {
	var receivedSig string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSig = r.Header.Get("X-Signature-256")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := NewWebhookProvider(server.URL, "", &http.Client{})
	err := p.Send(context.Background(), notification.NotificationEvent{
		Type: "test", Title: "Test", Message: "msg", Severity: "info",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receivedSig != "" {
		t.Errorf("expected no signature header when secret is empty, got %q", receivedSig)
	}
}

func TestWebhookProvider_Name(t *testing.T) {
	p := NewWebhookProvider("https://example.com", "", &http.Client{})
	if p.Name() != "webhook" {
		t.Errorf("expected 'webhook', got %q", p.Name())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestWebhookProvider -v`
Expected: FAIL — `NewWebhookProvider` not defined

- [ ] **Step 3: Implement Webhook provider**

```go
// api/internal/notification/providers/webhook.go
package providers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/milmil/api/internal/notification"
)

// WebhookProvider sends notification events as JSON POST to a user-defined URL.
type WebhookProvider struct {
	url    string
	secret string
	client *http.Client
}

func NewWebhookProvider(url, secret string, client *http.Client) *WebhookProvider {
	return &WebhookProvider{url: url, secret: secret, client: client}
}

func (w *WebhookProvider) Name() string { return "webhook" }

func (w *WebhookProvider) Send(ctx context.Context, event notification.NotificationEvent) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("webhook: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("webhook: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if w.secret != "" {
		mac := hmac.New(sha256.New, []byte(w.secret))
		mac.Write(body)
		sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Signature-256", sig)
	}

	resp, err := w.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("webhook: unexpected status %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/providers/ -run TestWebhookProvider -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/notification/providers/
git commit -m "feat(notifications): add generic webhook provider with HMAC signing"
```

---

### Task 7: Notification Settings Config Type and Loader

**Files:**
- Create: `api/internal/notification/config.go`
- Create: `api/internal/notification/config_test.go`

- [ ] **Step 1: Write test for config loading**

```go
// api/internal/notification/config_test.go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/ -run TestNotificationConfig -v`
Expected: FAIL — types not defined

- [ ] **Step 3: Implement config types**

```go
// api/internal/notification/config.go
package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/milmil/api/internal/store"
)

type DiscordConfig struct {
	Enabled    bool   `json:"enabled"`
	WebhookURL string `json:"webhook_url"`
}

type TelegramConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

type WebhookConfig struct {
	Enabled bool   `json:"enabled"`
	URL     string `json:"url"`
	Secret  string `json:"secret"`
}

type ProvidersConfig struct {
	Discord  DiscordConfig  `json:"discord"`
	Telegram TelegramConfig `json:"telegram"`
	Webhook  WebhookConfig  `json:"webhook"`
}

type NotificationConfig struct {
	Providers ProvidersConfig    `json:"providers"`
	Events    map[string][]string `json:"events"`
}

// ProvidersForEvent returns the provider names configured for an event type.
func (c *NotificationConfig) ProvidersForEvent(eventType string) []string {
	if c.Events == nil {
		return nil
	}
	return c.Events[eventType]
}

// EnabledProvidersForEvent returns only providers that are both configured for
// the event AND enabled in the providers config.
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

// LoadNotificationConfig reads the "notifications" key from the settings table.
// Returns a zero-value config if no settings are stored yet.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/ -run TestNotificationConfig -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/notification/config.go api/internal/notification/config_test.go
git commit -m "feat(notifications): add notification config types and loader"
```

---

### Task 8: Extend notification.Service to Dispatch to External Providers

**Files:**
- Modify: `api/internal/notification/service.go`
- Create: `api/internal/notification/dispatch.go`
- Create: `api/internal/notification/dispatch_test.go`

- [ ] **Step 1: Write test for external dispatch**

```go
// api/internal/notification/dispatch_test.go
package notification

import (
	"context"
	"sync"
	"testing"
)

// mockProvider records calls for testing.
type mockProvider struct {
	name   string
	mu     sync.Mutex
	events []NotificationEvent
	err    error
}

func (m *mockProvider) Name() string { return m.name }
func (m *mockProvider) Send(_ context.Context, event NotificationEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
	return m.err
}

func TestDispatcher_Dispatch(t *testing.T) {
	discord := &mockProvider{name: "discord"}
	telegram := &mockProvider{name: "telegram"}

	d := &Dispatcher{
		providers: map[string]Provider{
			"discord":  discord,
			"telegram": telegram,
		},
	}

	event := NotificationEvent{
		Type:     "download.completed",
		Title:    "Test",
		Message:  "test msg",
		Severity: "success",
	}

	results := d.Dispatch(context.Background(), event, []string{"discord", "telegram"})

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	for _, r := range results {
		if r.Err != nil {
			t.Errorf("provider %s failed: %v", r.Provider, r.Err)
		}
	}
	if len(discord.events) != 1 {
		t.Errorf("discord: expected 1 event, got %d", len(discord.events))
	}
	if len(telegram.events) != 1 {
		t.Errorf("telegram: expected 1 event, got %d", len(telegram.events))
	}
}

func TestDispatcher_SkipUnknownProvider(t *testing.T) {
	d := &Dispatcher{providers: map[string]Provider{}}
	results := d.Dispatch(context.Background(), NotificationEvent{}, []string{"unknown"})
	if len(results) != 0 {
		t.Errorf("expected 0 results for unknown provider, got %d", len(results))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/ -run TestDispatcher -v`
Expected: FAIL — `Dispatcher` not defined

- [ ] **Step 3: Implement dispatcher**

```go
// api/internal/notification/dispatch.go
package notification

import "context"

// DispatchResult records the outcome of sending to one provider.
type DispatchResult struct {
	Provider string
	Err      error
}

// Dispatcher holds registered providers and sends events to them.
type Dispatcher struct {
	providers map[string]Provider
}

// NewDispatcher creates a dispatcher with the given providers.
func NewDispatcher(providers []Provider) *Dispatcher {
	m := make(map[string]Provider, len(providers))
	for _, p := range providers {
		m[p.Name()] = p
	}
	return &Dispatcher{providers: m}
}

// Dispatch sends the event to the specified providers synchronously.
// Unknown provider names are silently skipped.
func (d *Dispatcher) Dispatch(ctx context.Context, event NotificationEvent, providerNames []string) []DispatchResult {
	var results []DispatchResult
	for _, name := range providerNames {
		p, ok := d.providers[name]
		if !ok {
			continue
		}
		err := p.Send(ctx, event)
		results = append(results, DispatchResult{Provider: name, Err: err})
	}
	return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/ -run TestDispatcher -v`
Expected: PASS

- [ ] **Step 5: Modify Service.Send() to fan out to external providers**

Modify `api/internal/notification/service.go`:

The `Service` struct needs a `queries` field (already has it), plus a `dispatcher` field. Update `NewService` to accept an optional dispatcher. After writing the in-app notification, spawn a goroutine that loads config, determines enabled providers, creates delivery rows, and attempts immediate dispatch.

```go
// Updated Service struct and Send method in service.go

// Add to Service struct:
//   dispatcher *Dispatcher

// Add to NewService:
//   func NewService(queries *store.Queries, wsHub *ws.Hub, dispatcher *Dispatcher) *Service

// In Send(), after the wsHub broadcast, add:
//   if s.dispatcher != nil {
//       go s.dispatchExternal(notifType, title, message, severity, metadata, notif.ID)
//   }
```

Add a new method `dispatchExternal` to `service.go`:

```go
func (s *Service) dispatchExternal(notifType, title, message, severity string, metadata map[string]any, notifID string) {
	ctx := context.Background()

	cfg, err := LoadNotificationConfig(ctx, s.queries)
	if err != nil {
		slog.Error("notification: load config for dispatch", "err", err)
		return
	}

	providerNames := cfg.EnabledProvidersForEvent(notifType)
	if len(providerNames) == 0 {
		return
	}

	// Convert metadata to string map for the event
	strMeta := make(map[string]string, len(metadata))
	for k, v := range metadata {
		strMeta[k] = fmt.Sprintf("%v", v)
	}

	event := NotificationEvent{
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: strMeta,
	}

	now := time.Now().Format(time.RFC3339)
	for _, providerName := range providerNames {
		deliveryID := uuid.NewString()
		_, err := s.queries.CreateNotificationDelivery(ctx, store.CreateNotificationDeliveryParams{
			ID:             deliveryID,
			NotificationID: notifID,
			Provider:       providerName,
		})
		if err != nil {
			slog.Error("notification: create delivery", "provider", providerName, "err", err)
			continue
		}

		results := s.dispatcher.Dispatch(ctx, event, []string{providerName})
		if len(results) > 0 && results[0].Err != nil {
			// Schedule retry
			nextRetry := time.Now().Add(1 * time.Minute).Format(time.RFC3339)
			_ = s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: results[0].Err.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          deliveryID,
			})
			slog.Warn("notification: delivery failed, will retry",
				"provider", providerName, "err", results[0].Err)
		} else {
			_ = s.queries.UpdateDeliverySuccess(ctx, store.UpdateDeliverySuccessParams{ID: deliveryID})
			slog.Debug("notification: delivered", "provider", providerName, "notif_id", notifID)
		}
	}
	_ = now // used in CreateNotificationDelivery via SQL
}
```

Note: The exact field names in `store.UpdateDeliveryFailureParams` and `store.UpdateDeliverySuccessParams` will depend on the sqlc-generated code from Task 2. Adapt the field names to match. The sqlc query `UpdateDeliverySuccess` takes just `ID`, and `UpdateDeliveryFailure` takes `LastError`, `NextRetryAt`, `ID`.

- [ ] **Step 6: Update NewService signature**

In `service.go`, change:
```go
// Old:
func NewService(queries *store.Queries, wsHub *ws.Hub) *Service {
	return &Service{queries: queries, wsHub: wsHub}
}

// New:
func NewService(queries *store.Queries, wsHub *ws.Hub, dispatcher *Dispatcher) *Service {
	return &Service{queries: queries, wsHub: wsHub, dispatcher: dispatcher}
}
```

Add `dispatcher *Dispatcher` to the `Service` struct.

Add these imports to `service.go`: `"database/sql"`, `"fmt"` (if not already there).

- [ ] **Step 7: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build fails because `main.go` calls `NewService` with 2 args. This is fixed in Task 10 (wiring). For now, just verify the notification package compiles:
Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go vet ./internal/notification/...`
Expected: No errors in the notification package itself

- [ ] **Step 8: Commit**

```bash
git add api/internal/notification/
git commit -m "feat(notifications): add dispatcher and external delivery in Service.Send"
```

---

### Task 9: Delivery Retry Worker

**Files:**
- Create: `api/internal/worker/notification_delivery_job.go`

- [ ] **Step 1: Implement the delivery retry worker**

```go
// api/internal/worker/notification_delivery_job.go
package worker

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// NotificationDeliveryWorker retries failed external notification deliveries.
type NotificationDeliveryWorker struct {
	queries    *store.Queries
	dispatcher *notification.Dispatcher
}

func (w *NotificationDeliveryWorker) Run(ctx context.Context) {
	if w.dispatcher == nil {
		return
	}

	now := time.Now().Format(time.RFC3339)
	deliveries, err := w.queries.ListPendingDeliveries(ctx, now)
	if err != nil {
		slog.Error("notification_delivery: list pending", "err", err)
		return
	}
	if len(deliveries) == 0 {
		return
	}

	slog.Debug("notification_delivery: retrying", "count", len(deliveries))

	for _, d := range deliveries {
		// Load the original notification to reconstruct the event
		// For retries we need the notification data — query it
		notif, err := w.queries.GetNotification(ctx, d.NotificationID)
		if err != nil {
			slog.Error("notification_delivery: get notification", "id", d.NotificationID, "err", err)
			// Mark as failed if notification no longer exists
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: "notification not found", Valid: true},
				NextRetryAt: sql.NullString{Valid: false},
				ID:          d.ID,
			})
			continue
		}

		// Parse metadata
		strMeta := make(map[string]string)
		if notif.Metadata.Valid {
			// metadata is stored as JSON — parse it
			var rawMeta map[string]any
			if err := json.Unmarshal([]byte(notif.Metadata.String), &rawMeta); err == nil {
				for k, v := range rawMeta {
					strMeta[k] = fmt.Sprintf("%v", v)
				}
			}
		}

		event := notification.NotificationEvent{
			Type:     notif.Type,
			Title:    notif.Title,
			Message:  notif.Message,
			Severity: notif.Severity,
			Metadata: strMeta,
		}

		results := w.dispatcher.Dispatch(ctx, event, []string{d.Provider})
		if len(results) > 0 && results[0].Err != nil {
			// Calculate backoff: attempt 1→5min, attempt 2→15min
			backoff := 5 * time.Minute
			if d.Attempts >= 1 {
				backoff = 15 * time.Minute
			}
			nextRetry := time.Now().Add(backoff).Format(time.RFC3339)
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: results[0].Err.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          d.ID,
			})
			slog.Warn("notification_delivery: retry failed",
				"provider", d.Provider, "attempt", d.Attempts+1, "err", results[0].Err)
		} else {
			_ = w.queries.UpdateDeliverySuccess(ctx, d.ID)
			slog.Info("notification_delivery: retry succeeded",
				"provider", d.Provider, "notification_id", d.NotificationID)
		}
	}
}
```

Note: This worker needs a `GetNotification` sqlc query. Add to `api/internal/store/queries/notifications.sql`:

```sql
-- name: GetNotification :one
SELECT * FROM notifications WHERE id = ?;
```

Then regenerate sqlc: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && sqlc generate`

Add required imports to the worker file: `"encoding/json"`, `"fmt"`.

- [ ] **Step 2: Register worker in scheduler**

Modify `api/internal/worker/worker.go`:

Add `dispatcher *notification.Dispatcher` field to the `Scheduler` struct.

Update `NewScheduler` to accept it:
```go
func NewScheduler(
	queries *store.Queries,
	dlManager downloader.Manager,
	sc *scanner.Scanner,
	matcherSvc *matcher.Matcher,
	resolverSvc *resolver.Resolver,
	tmdbClient tmdb.Client,
	cacheClient cache.Cache,
	notifier *notification.Service,
	wsHub *ws.Hub,
	dispatcher *notification.Dispatcher,
) *Scheduler {
```

Add to `Start()` method, after the notification cleanup ticker:
```go
// Notification delivery retry — every 60 seconds
go s.runTicker(ctx, "notification_delivery", 60*time.Second, false, func(ctx context.Context) {
	w := &NotificationDeliveryWorker{queries: s.queries, dispatcher: s.dispatcher}
	w.Run(ctx)
})
```

- [ ] **Step 3: Extend notification cleanup to delete old deliveries**

In the existing notification cleanup ticker in `Start()`, extend the cleanup function:
```go
go s.runTicker(ctx, "notification_cleanup", 24*time.Hour, false, func(ctx context.Context) {
	if err := s.notifier.CleanupOld(ctx, 30); err != nil {
		slog.Error("notification_cleanup: failed", "err", err)
	}
	cutoff := time.Now().AddDate(0, 0, -30).Format(time.RFC3339)
	if err := s.queries.DeleteOldDeliveries(ctx, cutoff); err != nil {
		slog.Error("notification_cleanup: deliveries failed", "err", err)
	}
})
```

- [ ] **Step 4: Verify the notification package builds**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go vet ./internal/notification/... ./internal/worker/...`
Expected: May fail due to main.go wiring (fixed in Task 10), but packages themselves should be clean

- [ ] **Step 5: Commit**

```bash
git add api/internal/worker/ api/internal/store/queries/notifications.sql api/internal/store/notifications.sql.go
git commit -m "feat(notifications): add delivery retry worker"
```

---

### Task 10: Wire Everything in main.go

**Files:**
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Build providers and dispatcher in main.go**

After the `notifier` creation line (`notifier := notification.NewService(...)`) and before creating the router, add:

```go
// External notification providers
httpNotifClient := &http.Client{Timeout: 10 * time.Second}
notifCfg, _ := notification.LoadNotificationConfig(context.Background(), store.New(database))

var notifProviders []notification.Provider
if notifCfg.Providers.Discord.Enabled && notifCfg.Providers.Discord.WebhookURL != "" {
	notifProviders = append(notifProviders, providers.NewDiscordProvider(
		notifCfg.Providers.Discord.WebhookURL, httpNotifClient,
	))
}
if notifCfg.Providers.Telegram.Enabled && notifCfg.Providers.Telegram.BotToken != "" {
	notifProviders = append(notifProviders, providers.NewTelegramProvider(
		notifCfg.Providers.Telegram.BotToken, notifCfg.Providers.Telegram.ChatID, httpNotifClient,
	))
}
if notifCfg.Providers.Webhook.Enabled && notifCfg.Providers.Webhook.URL != "" {
	notifProviders = append(notifProviders, providers.NewWebhookProvider(
		notifCfg.Providers.Webhook.URL, notifCfg.Providers.Webhook.Secret, httpNotifClient,
	))
}
dispatcher := notification.NewDispatcher(notifProviders)
```

Update the `notifier` line:
```go
notifier := notification.NewService(store.New(database), wsHub, dispatcher)
```

Update the `worker.NewScheduler` call to pass `dispatcher`:
```go
sched := worker.NewScheduler(
	store.New(database), dlEngine, sc, matcherSvc, resolverSvc, tmdbClient, cacheClient, notifier, wsHub, dispatcher,
)
```

Add import: `"github.com/milmil/api/internal/notification/providers"`

**Important design note:** This loads config once at startup. When users change notification settings via the API, the dispatcher needs to reload. There are two approaches:
1. Reload providers on every `Send()` call (simpler, slight overhead)
2. Hot-reload dispatcher when settings change

Since `dispatchExternal` in `service.go` already loads config per-call via `LoadNotificationConfig`, we should make the dispatcher always have all 3 providers registered (even if disabled), and let the config-based filtering in `EnabledProvidersForEvent` handle enable/disable. This avoids needing to rebuild the dispatcher on settings change.

**Revised approach**: Always register all 3 providers. The dispatcher always has discord/telegram/webhook. The `dispatchExternal` method checks `EnabledProvidersForEvent` which reads fresh config each time.

Update the provider setup in main.go to always register all 3:
```go
// External notification providers — always register all, config controls enable/disable
httpNotifClient := &http.Client{Timeout: 10 * time.Second}
dispatcher := notification.NewDispatcher([]notification.Provider{
	providers.NewDiscordProvider("", httpNotifClient),
	providers.NewTelegramProvider("", "", httpNotifClient),
	providers.NewWebhookProvider("", "", httpNotifClient),
})
notifier := notification.NewService(store.New(database), wsHub, dispatcher)
```

But wait — the providers have empty URLs at startup. We need each provider to read its config dynamically. **Better approach**: Make each provider accept a config-loader function rather than static credentials.

**Revised provider design**: Each provider's `Send` method should load its own config from the settings table. Pass a `ConfigLoader` function.

Actually, the simplest approach: In `dispatchExternal` (service.go), after loading config, create fresh provider instances with the current credentials and dispatch through them directly, bypassing the pre-registered dispatcher.

Update `dispatchExternal` in service.go:
```go
func (s *Service) dispatchExternal(notifType, title, message, severity string, metadata map[string]any, notifID string) {
	ctx := context.Background()

	cfg, err := LoadNotificationConfig(ctx, s.queries)
	if err != nil {
		slog.Error("notification: load config for dispatch", "err", err)
		return
	}

	providerNames := cfg.EnabledProvidersForEvent(notifType)
	if len(providerNames) == 0 {
		return
	}

	strMeta := make(map[string]string, len(metadata))
	for k, v := range metadata {
		strMeta[k] = fmt.Sprintf("%v", v)
	}

	event := NotificationEvent{
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: strMeta,
	}

	for _, providerName := range providerNames {
		deliveryID := uuid.NewString()
		_, err := s.queries.CreateNotificationDelivery(ctx, store.CreateNotificationDeliveryParams{
			ID:             deliveryID,
			NotificationID: notifID,
			Provider:       providerName,
		})
		if err != nil {
			slog.Error("notification: create delivery", "provider", providerName, "err", err)
			continue
		}

		provider := s.buildProvider(providerName, &cfg)
		if provider == nil {
			continue
		}

		sendErr := provider.Send(ctx, event)
		if sendErr != nil {
			nextRetry := time.Now().Add(1 * time.Minute).Format(time.RFC3339)
			_ = s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          deliveryID,
			})
			slog.Warn("notification: delivery failed, will retry",
				"provider", providerName, "err", sendErr)
		} else {
			_ = s.queries.UpdateDeliverySuccess(ctx, deliveryID)
		}
	}
}

func (s *Service) buildProvider(name string, cfg *NotificationConfig) Provider {
	client := &http.Client{Timeout: 10 * time.Second}
	switch name {
	case "discord":
		if cfg.Providers.Discord.WebhookURL == "" {
			return nil
		}
		return providers.NewDiscordProvider(cfg.Providers.Discord.WebhookURL, client)
	case "telegram":
		if cfg.Providers.Telegram.BotToken == "" {
			return nil
		}
		return providers.NewTelegramProvider(cfg.Providers.Telegram.BotToken, cfg.Providers.Telegram.ChatID, client)
	case "webhook":
		if cfg.Providers.Webhook.URL == "" {
			return nil
		}
		return providers.NewWebhookProvider(cfg.Providers.Webhook.URL, cfg.Providers.Webhook.Secret, client)
	}
	return nil
}
```

This means the `Dispatcher` type is no longer needed in `Service` — we can simplify. The `Dispatcher` is still useful for the retry worker though.

**Final approach:**
- Remove `dispatcher` from `Service` struct. `Service.Send()` builds providers on-the-fly from config.
- Keep `Dispatcher` for the retry worker (which also builds providers on-the-fly from config).
- `NewService` reverts to `(queries, wsHub)` — no dispatcher needed.
- The retry worker also loads config and builds providers per-run.

This eliminates the startup config problem entirely. Simplify accordingly:
- `NewService(queries *store.Queries, wsHub *ws.Hub) *Service` — unchanged from original
- `Service` has a `dispatchExternal` method that loads config and builds providers
- Retry worker has a `buildProvider` helper that does the same
- No `Dispatcher` struct needed at all — remove `dispatch.go`

Replace `dispatch.go` with `buildProvider` as a package-level function in `service.go`. The retry worker imports it.

Actually, to keep it clean: make `buildProvider` a package-level function in `config.go` so both `service.go` and the retry worker can use it.

Let me restructure this task. The key change is:

1. `Service` doesn't need a dispatcher — it loads config + builds providers per `Send()` call
2. Retry worker does the same
3. `main.go` doesn't change at all (NewService signature stays the same)
4. `Scheduler` doesn't need a dispatcher parameter

This is simpler. Let me rewrite from Step 1.

- [ ] **Step 1: Add BuildProvider to config.go**

Add to `api/internal/notification/config.go`:

```go
import (
	"net/http"
	"time"

	"github.com/milmil/api/internal/notification/providers"
)

// BuildProvider creates a Provider instance from the current config.
// Returns nil if the provider has no credentials configured.
func BuildProvider(name string, cfg *NotificationConfig) Provider {
	client := &http.Client{Timeout: 10 * time.Second}
	switch name {
	case "discord":
		if cfg.Providers.Discord.WebhookURL == "" {
			return nil
		}
		return providers.NewDiscordProvider(cfg.Providers.Discord.WebhookURL, client)
	case "telegram":
		if cfg.Providers.Telegram.BotToken == "" {
			return nil
		}
		return providers.NewTelegramProvider(cfg.Providers.Telegram.BotToken, cfg.Providers.Telegram.ChatID, client)
	case "webhook":
		if cfg.Providers.Webhook.URL == "" {
			return nil
		}
		return providers.NewWebhookProvider(cfg.Providers.Webhook.URL, cfg.Providers.Webhook.Secret, client)
	}
	return nil
}
```

- [ ] **Step 2: Remove Dispatcher, update dispatchExternal in service.go**

Delete `api/internal/notification/dispatch.go` and `dispatch_test.go`.

Update `dispatchExternal` in `service.go` to use `BuildProvider`:

```go
func (s *Service) dispatchExternal(notifType, title, message, severity string, metadata map[string]any, notifID string) {
	ctx := context.Background()

	cfg, err := LoadNotificationConfig(ctx, s.queries)
	if err != nil {
		slog.Error("notification: load config for dispatch", "err", err)
		return
	}

	providerNames := cfg.EnabledProvidersForEvent(notifType)
	if len(providerNames) == 0 {
		return
	}

	strMeta := make(map[string]string, len(metadata))
	for k, v := range metadata {
		strMeta[k] = fmt.Sprintf("%v", v)
	}

	event := NotificationEvent{
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: strMeta,
	}

	for _, name := range providerNames {
		deliveryID := uuid.NewString()
		_, err := s.queries.CreateNotificationDelivery(ctx, store.CreateNotificationDeliveryParams{
			ID:             deliveryID,
			NotificationID: notifID,
			Provider:       name,
		})
		if err != nil {
			slog.Error("notification: create delivery", "provider", name, "err", err)
			continue
		}

		provider := BuildProvider(name, &cfg)
		if provider == nil {
			continue
		}

		if sendErr := provider.Send(ctx, event); sendErr != nil {
			nextRetry := time.Now().Add(1 * time.Minute).Format(time.RFC3339)
			_ = s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          deliveryID,
			})
			slog.Warn("notification: delivery failed, will retry", "provider", name, "err", sendErr)
		} else {
			_ = s.queries.UpdateDeliverySuccess(ctx, deliveryID)
		}
	}
}
```

Add call in `Send()` after the wsHub broadcast:
```go
go s.dispatchExternal(notifType, title, message, severity, metadata, notif.ID)
```

- [ ] **Step 3: Update retry worker to use BuildProvider**

In `notification_delivery_job.go`, replace the `dispatcher` field with `queries` only. The worker loads config and builds providers:

```go
type NotificationDeliveryWorker struct {
	queries *store.Queries
}

func (w *NotificationDeliveryWorker) Run(ctx context.Context) {
	now := time.Now().Format(time.RFC3339)
	deliveries, err := w.queries.ListPendingDeliveries(ctx, now)
	if err != nil {
		slog.Error("notification_delivery: list pending", "err", err)
		return
	}
	if len(deliveries) == 0 {
		return
	}

	cfg, err := notification.LoadNotificationConfig(ctx, w.queries)
	if err != nil {
		slog.Error("notification_delivery: load config", "err", err)
		return
	}

	for _, d := range deliveries {
		provider := notification.BuildProvider(d.Provider, &cfg)
		if provider == nil {
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: "provider not configured", Valid: true},
				NextRetryAt: sql.NullString{Valid: false},
				ID:          d.ID,
			})
			continue
		}

		notif, err := w.queries.GetNotification(ctx, d.NotificationID)
		if err != nil {
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: "notification not found", Valid: true},
				NextRetryAt: sql.NullString{Valid: false},
				ID:          d.ID,
			})
			continue
		}

		strMeta := make(map[string]string)
		if notif.Metadata.Valid {
			var rawMeta map[string]any
			if err := json.Unmarshal([]byte(notif.Metadata.String), &rawMeta); err == nil {
				for k, v := range rawMeta {
					strMeta[k] = fmt.Sprintf("%v", v)
				}
			}
		}

		event := notification.NotificationEvent{
			Type:     notif.Type,
			Title:    notif.Title,
			Message:  notif.Message,
			Severity: notif.Severity,
			Metadata: strMeta,
		}

		if sendErr := provider.Send(ctx, event); sendErr != nil {
			backoff := 5 * time.Minute
			if d.Attempts >= 1 {
				backoff = 15 * time.Minute
			}
			nextRetry := time.Now().Add(backoff).Format(time.RFC3339)
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          d.ID,
			})
		} else {
			_ = w.queries.UpdateDeliverySuccess(ctx, d.ID)
		}
	}
}
```

- [ ] **Step 4: Scheduler stays unchanged**

Since `Service.NewService` signature is unchanged and the retry worker only needs `queries`, the `Scheduler` struct and `NewScheduler` don't change. Just add the retry ticker:

```go
// In Start(), add after notification cleanup:
go s.runTicker(ctx, "notification_delivery", 60*time.Second, false, func(ctx context.Context) {
	w := &NotificationDeliveryWorker{queries: s.queries}
	w.Run(ctx)
})
```

- [ ] **Step 5: main.go stays unchanged**

No changes to `main.go` — `NewService` signature is the same, `NewScheduler` is the same.

- [ ] **Step 6: Verify full build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 7: Run all tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/notification/... ./internal/notification/providers/...`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add api/internal/notification/ api/internal/worker/ api/cmd/server/
git commit -m "feat(notifications): wire external dispatch and delivery retry"
```

---

### Task 11: Notification Settings API Endpoints

**Files:**
- Create: `api/internal/api/notification_settings_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Implement notification settings handlers**

```go
// api/internal/api/notification_settings_handler.go
package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleGetNotificationSettings(c echo.Context) error {
	cfg, err := notification.LoadNotificationConfig(c.Request().Context(), h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Mask sensitive fields
	resp := cfg
	if resp.Providers.Discord.WebhookURL != "" {
		resp.Providers.Discord.WebhookURL = maskString(resp.Providers.Discord.WebhookURL)
	}
	if resp.Providers.Telegram.BotToken != "" {
		resp.Providers.Telegram.BotToken = maskString(resp.Providers.Telegram.BotToken)
	}
	if resp.Providers.Webhook.Secret != "" {
		resp.Providers.Webhook.Secret = maskString(resp.Providers.Webhook.Secret)
	}

	return c.JSON(http.StatusOK, resp)
}

func maskString(s string) string {
	if len(s) <= 8 {
		return "••••••••"
	}
	return s[:4] + "••••••••" + s[len(s)-4:]
}

func (h *handler) handleUpdateNotificationSettings(c echo.Context) error {
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	var cfg notification.NotificationConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON")
	}

	// If masked values are sent back, merge with existing config
	existing, _ := notification.LoadNotificationConfig(c.Request().Context(), h.queries)
	if isMasked(cfg.Providers.Discord.WebhookURL) {
		cfg.Providers.Discord.WebhookURL = existing.Providers.Discord.WebhookURL
	}
	if isMasked(cfg.Providers.Telegram.BotToken) {
		cfg.Providers.Telegram.BotToken = existing.Providers.Telegram.BotToken
	}
	if isMasked(cfg.Providers.Webhook.Secret) {
		cfg.Providers.Webhook.Secret = existing.Providers.Webhook.Secret
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		return echo.ErrInternalServerError
	}

	_, err = h.queries.UpsertSetting(c.Request().Context(), store.UpsertSettingParams{
		Key:   "notifications",
		Value: string(data),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func isMasked(s string) bool {
	return len(s) > 0 && (s == "••••••••" || (len(s) > 8 && s[4:12] == "••••••••"))
}

func (h *handler) handleTestNotification(c echo.Context) error {
	var req struct {
		Provider string `json:"provider"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid body")
	}

	cfg, err := notification.LoadNotificationConfig(c.Request().Context(), h.queries)
	if err != nil {
		return echo.ErrInternalServerError
	}

	provider := notification.BuildProvider(req.Provider, &cfg)
	if provider == nil {
		return echo.NewHTTPError(http.StatusBadRequest, "provider not configured")
	}

	event := notification.NotificationEvent{
		Type:     "test",
		Title:    "Test Notification",
		Message:  "This is a test notification from milmil.",
		Severity: "info",
	}

	if err := provider.Send(c.Request().Context(), event); err != nil {
		return c.JSON(http.StatusOK, map[string]any{
			"success": false,
			"error":   err.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]any{"success": true})
}
```

- [ ] **Step 2: Register routes in router.go**

Add to `api/internal/api/router.go`, after the existing notifications group:

```go
// Notification Settings — protected
notifSettingsGroup := v1.Group("/settings/notifications", jwtMiddleware(cfg.JWTSecret))
notifSettingsGroup.GET("", h.handleGetNotificationSettings)
notifSettingsGroup.PUT("", h.handleUpdateNotificationSettings)
notifSettingsGroup.POST("/test", h.handleTestNotification)
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/notification_settings_handler.go api/internal/api/router.go
git commit -m "feat(notifications): add notification settings API endpoints"
```

---

### Task 12: Add New Event Emission Points

**Files:**
- Modify: `api/internal/worker/rss_refresh_job.go`
- Modify: `api/internal/worker/download_sync_job.go`

- [ ] **Step 1: Add rss.new_episode emission**

In `api/internal/worker/rss_refresh_job.go`, in the `refreshFeed` method, after checking all rules for an item and finding no match, emit a notification. Add after the inner `for _, rule := range rules` loop ends (after the `break` in the matching block), before the outer loop continues:

The current logic: for each item, iterate rules. If a rule matches, download and break. If no rule matches, the item is silently skipped.

To detect "new episode, no matching rule": track whether any rule matched the item.

```go
// In refreshFeed, replace the inner loop with:
for _, item := range items {
    matched := false
    for _, rule := range rules {
        // ... existing matching logic ...
        // After successful download:
        matched = true
        added++
        break
    }
    if !matched && len(rules) > 0 {
        // New episode detected but no rule matched
        w.notifier.Send(ctx, "rss.new_episode", "New Episode Available", item.Title, "info",
            map[string]any{"feed_name": feed.Name, "source_url": item.Link})
    }
}
```

Note: Only emit `rss.new_episode` if there ARE rules for this feed (meaning the user is interested in this feed's content). If there are no rules at all, don't spam — the user hasn't set up auto-download for this feed.

Actually, on reflection, this would be very noisy (every unmatched RSS item). A better approach: only emit when the item is NEW (not seen before) AND no rule matches. But tracking "seen" items requires a new table or tracking mechanism. 

Simplest approach: skip `rss.new_episode` for now — it would require additional infrastructure to avoid spam. Remove it from the plan and from the events list. The 5 remaining events are sufficient.

- [ ] **Step 2: Add library.scan_complete emission**

In `api/internal/worker/download_sync_job.go`, in `triggerFullPipeline`, after the final `slog.Info("download_sync: full pipeline complete")`:

```go
w.notifier.Send(ctx, "library.scan_complete", "Library Scan Complete", lib.Name, "info",
    map[string]any{"library_id": libraryID, "library_name": lib.Name})
```

The `DownloadSyncWorker` struct already has `notifier`.

- [ ] **Step 3: Add system.error emission for worker-level failures**

In `download_sync_job.go`, `triggerFullPipeline`, when scan fails:
```go
if err := w.scanner.ScanLibrary(ctx, lib, configJSON); err != nil {
    slog.Error("download_sync: scan library", "library", lib.Name, "err", err)
    w.notifier.Send(ctx, "system.error", "Library Scan Failed", err.Error(), "error",
        map[string]any{"library_name": lib.Name, "worker": "download_sync"})
    return
}
```

In `rss_refresh_job.go`, `Run`, when listing feeds fails:
```go
if err != nil {
    slog.Error("rss_refresh: list due feeds", "err", err)
    w.notifier.Send(ctx, "system.error", "RSS Refresh Failed", err.Error(), "error",
        map[string]any{"worker": "rss_refresh"})
    return
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add api/internal/worker/
git commit -m "feat(notifications): add library.scan_complete and system.error events"
```

---

### Task 13: Frontend — Notification Settings API Client

**Files:**
- Create: `web/src/lib/api/notification-settings.ts`

- [ ] **Step 1: Create the API client**

```typescript
// web/src/lib/api/notification-settings.ts
import { api } from '../api-client';

export interface DiscordConfig {
  enabled: boolean;
  webhook_url: string;
}

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  secret: string;
}

export interface ProvidersConfig {
  discord: DiscordConfig;
  telegram: TelegramConfig;
  webhook: WebhookConfig;
}

export interface NotificationSettings {
  providers: ProvidersConfig;
  events: Record<string, string[]>;
}

export const notificationSettingsApi = {
  get: () => api.get<NotificationSettings>('/api/v1/settings/notifications'),
  update: (data: NotificationSettings) => api.put<void>('/api/v1/settings/notifications', data),
  test: (provider: string) =>
    api.post<{ success: boolean; error?: string }>('/api/v1/settings/notifications/test', { provider }),
};

export const notificationSettingsKeys = {
  settings: () => ['notification-settings'] as const,
};

export const NOTIFICATION_EVENTS = [
  { id: 'download.started', labelKey: 'notifications.event.downloadStarted' },
  { id: 'download.completed', labelKey: 'notifications.event.downloadCompleted' },
  { id: 'download.failed', labelKey: 'notifications.event.downloadFailed' },
  { id: 'library.scan_complete', labelKey: 'notifications.event.libraryScanComplete' },
  { id: 'system.error', labelKey: 'notifications.event.systemError' },
] as const;

export const PROVIDERS = ['discord', 'telegram', 'webhook'] as const;
export type ProviderName = (typeof PROVIDERS)[number];
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api/notification-settings.ts
git commit -m "feat(notifications): add notification settings API client"
```

---

### Task 14: Frontend — NotificationSettingsPanel Component

**Files:**
- Create: `web/src/pages/settings/NotificationSettingsPanel.tsx`
- Modify: `web/src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Create the NotificationSettingsPanel**

```tsx
// web/src/pages/settings/NotificationSettingsPanel.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick02Icon, Alert02Icon, Loading03Icon } from '@hugeicons/core-free-icons';

import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  notificationSettingsApi,
  notificationSettingsKeys,
  NOTIFICATION_EVENTS,
  PROVIDERS,
  type NotificationSettings,
  type ProviderName,
} from '@/lib/api/notification-settings';

const INPUT_CLASS = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

const PROVIDER_LABELS: Record<ProviderName, string> = {
  discord: 'Discord',
  telegram: 'Telegram',
  webhook: 'Webhook',
};

const EVENT_LABELS: Record<string, ReturnType<typeof msg>> = {
  'download.started': msg`notifications.event.downloadStarted`,
  'download.completed': msg`notifications.event.downloadCompleted`,
  'download.failed': msg`notifications.event.downloadFailed`,
  'library.scan_complete': msg`notifications.event.libraryScanComplete`,
  'system.error': msg`notifications.event.systemError`,
};

const DEFAULT_SETTINGS: NotificationSettings = {
  providers: {
    discord: { enabled: false, webhook_url: '' },
    telegram: { enabled: false, bot_token: '', chat_id: '' },
    webhook: { enabled: false, url: '', secret: '' },
  },
  events: {},
};

export function NotificationSettingsPanel() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: notificationSettingsKeys.settings(),
    queryFn: notificationSettingsApi.get,
  });

  const [local, setLocal] = useState<NotificationSettings | null>(null);

  // Initialize local state when data loads
  const current = local ?? settings ?? DEFAULT_SETTINGS;

  const saveMutation = useMutation({
    mutationFn: notificationSettingsApi.update,
    onSuccess: () => {
      toast.success(i18n._(msg`settings.saved`));
      queryClient.invalidateQueries({ queryKey: notificationSettingsKeys.settings() });
      setLocal(null);
    },
    onError: () => toast.error(i18n._(msg`settings.saveFailed`)),
  });

  const testMutation = useMutation({
    mutationFn: notificationSettingsApi.test,
  });

  const updateProvider = <K extends ProviderName>(
    provider: K,
    updates: Partial<NotificationSettings['providers'][K]>,
  ) => {
    setLocal((prev) => {
      const base = prev ?? settings ?? DEFAULT_SETTINGS;
      return {
        ...base,
        providers: {
          ...base.providers,
          [provider]: { ...base.providers[provider], ...updates },
        },
      };
    });
  };

  const toggleEventProvider = (eventId: string, provider: string) => {
    setLocal((prev) => {
      const base = prev ?? settings ?? DEFAULT_SETTINGS;
      const events = { ...base.events };
      const current = events[eventId] ?? [];
      if (current.includes(provider)) {
        events[eventId] = current.filter((p) => p !== provider);
      } else {
        events[eventId] = [...current, provider];
      }
      return { ...base, events };
    });
  };

  const handleTest = async (provider: string) => {
    // Save first, then test
    const result = await testMutation.mutateAsync(provider);
    if (result.success) {
      toast.success(i18n._(msg`notifications.testSuccess`));
    } else {
      toast.error(result.error ?? i18n._(msg`notifications.testFailed`));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const enabledProviders = PROVIDERS.filter((p) => current.providers[p].enabled);

  return (
    <div className="space-y-6">
      {/* Discord */}
      <SettingsCard label="Discord">
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={current.providers.discord.enabled}
              onChange={(e) => updateProvider('discord', { enabled: e.target.checked })}
              className="rounded border-white/20 bg-transparent"
            />
            <span className="text-sm text-white/70">{i18n._(msg`notifications.enable`)}</span>
          </label>
          {current.providers.discord.enabled && (
            <>
              <Field>
                <FieldLabel>Webhook URL</FieldLabel>
                <PasswordInput
                  value={current.providers.discord.webhook_url}
                  onChange={(e) => updateProvider('discord', { webhook_url: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className={INPUT_CLASS}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTest('discord')}
                disabled={testMutation.isPending}
              >
                {i18n._(msg`notifications.test`)}
              </Button>
            </>
          )}
        </div>
      </SettingsCard>

      {/* Telegram */}
      <SettingsCard label="Telegram">
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={current.providers.telegram.enabled}
              onChange={(e) => updateProvider('telegram', { enabled: e.target.checked })}
              className="rounded border-white/20 bg-transparent"
            />
            <span className="text-sm text-white/70">{i18n._(msg`notifications.enable`)}</span>
          </label>
          {current.providers.telegram.enabled && (
            <>
              <Field>
                <FieldLabel>Bot Token</FieldLabel>
                <PasswordInput
                  value={current.providers.telegram.bot_token}
                  onChange={(e) => updateProvider('telegram', { bot_token: e.target.value })}
                  placeholder="123456:ABC-DEF..."
                  className={INPUT_CLASS}
                />
              </Field>
              <Field>
                <FieldLabel>Chat ID</FieldLabel>
                <Input
                  value={current.providers.telegram.chat_id}
                  onChange={(e) => updateProvider('telegram', { chat_id: e.target.value })}
                  placeholder="-1001234567890"
                  className={INPUT_CLASS}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTest('telegram')}
                disabled={testMutation.isPending}
              >
                {i18n._(msg`notifications.test`)}
              </Button>
            </>
          )}
        </div>
      </SettingsCard>

      {/* Webhook */}
      <SettingsCard label="Webhook">
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={current.providers.webhook.enabled}
              onChange={(e) => updateProvider('webhook', { enabled: e.target.checked })}
              className="rounded border-white/20 bg-transparent"
            />
            <span className="text-sm text-white/70">{i18n._(msg`notifications.enable`)}</span>
          </label>
          {current.providers.webhook.enabled && (
            <>
              <Field>
                <FieldLabel>URL</FieldLabel>
                <Input
                  value={current.providers.webhook.url}
                  onChange={(e) => updateProvider('webhook', { url: e.target.value })}
                  placeholder="https://example.com/hook"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field>
                <FieldLabel>HMAC Secret</FieldLabel>
                <PasswordInput
                  value={current.providers.webhook.secret}
                  onChange={(e) => updateProvider('webhook', { secret: e.target.value })}
                  placeholder={i18n._(msg`notifications.secretPlaceholder`)}
                  className={INPUT_CLASS}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTest('webhook')}
                disabled={testMutation.isPending}
              >
                {i18n._(msg`notifications.test`)}
              </Button>
            </>
          )}
        </div>
      </SettingsCard>

      {/* Event Routing Matrix */}
      {enabledProviders.length > 0 && (
        <SettingsCard label={i18n._(msg`notifications.eventRouting`)}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-4 text-white/50 font-medium">
                    {i18n._(msg`notifications.event`)}
                  </th>
                  {enabledProviders.map((p) => (
                    <th key={p} className="text-center py-2 px-3 text-white/50 font-medium">
                      {PROVIDER_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_EVENTS.map((event) => (
                  <tr key={event.id} className="border-b border-white/[0.03]">
                    <td className="py-2.5 pr-4 text-white/70">
                      {i18n._(EVENT_LABELS[event.id])}
                    </td>
                    {enabledProviders.map((p) => (
                      <td key={p} className="text-center py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={(current.events[event.id] ?? []).includes(p)}
                          onChange={() => toggleEventProvider(event.id, p)}
                          className="rounded border-white/20 bg-transparent"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate(current)}
          disabled={saveMutation.isPending || !local}
        >
          {saveMutation.isPending ? i18n._(msg`settings.saving`) : i18n._(msg`settings.save`)}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Notifications" tab to SettingsPage**

In `web/src/pages/settings/SettingsPage.tsx`:

Add import:
```typescript
import { NotificationSettingsPanel } from './NotificationSettingsPanel';
import { Notification03Icon } from '@hugeicons/core-free-icons';
```

Add to `TABS` array (after 'download'):
```typescript
{ id: 'notifications', labelKey: msg`settings.nav.notifications`, icon: Notification03Icon },
```

Add to `PANELS`:
```typescript
notifications: NotificationSettingsPanel,
```

Update `TabId` type — it derives from `TABS` automatically.

- [ ] **Step 3: Verify build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/settings/NotificationSettingsPanel.tsx web/src/pages/settings/SettingsPage.tsx web/src/lib/api/notification-settings.ts
git commit -m "feat(notifications): add notification settings UI panel"
```

---

### Task 15: i18n — Extract and Add Translation Keys

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/ja/messages.po`
- Modify: `web/src/locales/ko/messages.po`
- Modify: `web/src/locales/zh-CN/messages.po`
- Modify: `web/src/locales/zh-HK/messages.po`
- Modify: `web/src/locales/zh-TW/messages.po`

- [ ] **Step 1: Extract new strings**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract`

- [ ] **Step 2: Add English translations**

In `web/src/locales/en/messages.po`, add translations for the new keys:
- `settings.nav.notifications` → "Notifications"
- `notifications.enable` → "Enable"
- `notifications.test` → "Test"
- `notifications.testSuccess` → "Test notification sent!"
- `notifications.testFailed` → "Test notification failed"
- `notifications.secretPlaceholder` → "Optional signing secret"
- `notifications.eventRouting` → "Event Routing"
- `notifications.event` → "Event"
- `notifications.event.downloadStarted` → "Download Started"
- `notifications.event.downloadCompleted` → "Download Completed"
- `notifications.event.downloadFailed` → "Download Failed"
- `notifications.event.libraryScanComplete` → "Library Scan Complete"
- `notifications.event.systemError` → "System Error"

- [ ] **Step 3: Add translations for other locales**

Translate the above keys into ja, ko, zh-CN, zh-HK, zh-TW.

- [ ] **Step 4: Compile translations**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:compile`

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/
git commit -m "feat(notifications): add i18n translations for notification settings"
```

---

### Task 16: End-to-End Verification

- [ ] **Step 1: Build backend**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server`
Expected: Build succeeds

- [ ] **Step 2: Run backend tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./...`
Expected: All tests pass

- [ ] **Step 3: Build frontend**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Frontend typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No type errors

- [ ] **Step 5: Verify app runs**

Ask user to run the app and test:
1. Navigate to Settings → Notifications tab
2. Enable Discord, enter a webhook URL, click Test
3. Enable Telegram, enter bot token + chat ID, click Test
4. Configure event routing matrix
5. Save settings
6. Trigger a download and verify external notifications arrive

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(notifications): address E2E test findings"
```
