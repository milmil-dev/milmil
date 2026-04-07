# External Notification System Design

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Discord, Telegram, Generic Webhook integration for milmil notifications

## Summary

Extend the existing in-app notification system with external delivery to Discord, Telegram, and generic webhooks. Users configure providers and select which events route to which channels via a settings UI. Deliveries are tracked and retried on failure.

## Existing Foundation

milmil already has:
- `notifications` table with type, title, message, severity, metadata
- `notification.Service` with `Send()` that writes to DB and broadcasts via WebSocket
- Workers emitting `download.started`, `download.completed`, `download.failed`
- Frontend: NotificationBell, NotificationsPage, WebSocket listener
- Settings table with JSON key-value storage and encryption support

## Architecture: Provider Interface (Approach 1)

Add a `Provider` interface to the notification service. After creating the in-app notification, `Send()` fans out to all enabled providers for that event type. No event bus or external microservice.

### Provider Interface

```go
// internal/notification/provider.go
type Provider interface {
    Name() string
    Send(ctx context.Context, event NotificationEvent) error
}

type NotificationEvent struct {
    Type     string            // "download.completed", "rss.new_episode", etc.
    Title    string
    Message  string
    Severity string            // "info", "success", "error"
    Metadata map[string]string // anime name, episode, rule name, etc.
}
```

### Provider Implementations

All in `internal/notification/providers/`.

**Discord** (`discord.go`):
- POST to user-configured webhook URL
- Rich embed: color-coded by severity (green=success, red=error, blue=info)
- Embed fields populated from metadata
- Anime cover thumbnail if available in metadata

**Telegram** (`telegram.go`):
- Bot API `sendMessage` with HTML formatting
- Bold title, message body, metadata as key-value lines
- Requires bot token + chat ID

**Webhook** (`webhook.go`):
- POST raw JSON (`NotificationEvent` struct) to user-defined URL
- HMAC-SHA256 signature in `X-Signature-256` header using user-configured secret
- Consumers parse payload however they want

Providers read config from settings table at send time (no credential caching).

## Event Types

| Event | Severity | Trigger |
|---|---|---|
| `download.started` | info | RSS rule triggers a download |
| `download.completed` | success | Download finishes |
| `download.failed` | error | Download errors |
| `rss.new_episode` | info | New episode in RSS feed, no auto-download rule |
| `library.scan_complete` | info | Library scan finishes |
| `system.error` | error | Unrecoverable worker/system error |

### Fixed Message Templates

Templates are hardcoded per provider, not user-customizable.

- **Discord**: Embed with color, title, description, metadata fields, optional thumbnail
- **Telegram**: HTML — bold title, body, metadata key-value lines
- **Webhook**: Raw JSON payload

## Delivery Tracking & Retry

### New Table: `notification_deliveries`

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | UUID |
| notification_id | TEXT FK | Links to `notifications` |
| provider | TEXT | "discord", "telegram", "webhook" |
| status | TEXT | "pending", "sent", "failed" |
| attempts | INTEGER | Count, max 3 |
| last_error | TEXT | Last failure message |
| next_retry_at | TEXT | ISO 8601, null if sent/exhausted |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### Delivery Flow

1. `Service.Send()` creates in-app notification (existing)
2. For each enabled provider for this event type, insert a `pending` delivery row
3. Attempt immediate delivery in a goroutine
4. Success: status = "sent"
5. Failure: increment attempts, set `next_retry_at` (backoff: 1min, 5min, 15min)

### Retry Worker: `NotificationDeliveryWorker`

- Runs every 60 seconds
- Queries: `status = "pending" AND next_retry_at <= now() AND attempts < 3`
- Retries each, updates status
- After 3 failures: status = "failed", logged with slog

Existing `NotificationCleanupWorker` extended to delete delivery rows older than 30 days.

## Settings Configuration

### Settings Key: `"notifications"`

Stored in the existing `settings` table as JSON:

```json
{
  "providers": {
    "discord": {
      "enabled": true,
      "webhook_url": "https://discord.com/api/webhooks/..."
    },
    "telegram": {
      "enabled": true,
      "bot_token": "123456:ABC-DEF...",
      "chat_id": "-1001234567890"
    },
    "webhook": {
      "enabled": true,
      "url": "https://example.com/hook",
      "secret": "hmac-signing-secret"
    }
  },
  "events": {
    "download.started": ["discord", "telegram"],
    "download.completed": ["discord", "telegram", "webhook"],
    "download.failed": ["discord", "telegram", "webhook"],
    "rss.new_episode": ["discord"],
    "library.scan_complete": [],
    "system.error": ["discord", "telegram", "webhook"]
  }
}
```

Sensitive fields (bot tokens, secrets, webhook URLs) encrypted using existing encryption key.

### API Endpoints

- `GET /api/v1/settings/notifications` — return config (secrets masked in response)
- `PUT /api/v1/settings/notifications` — update config
- `POST /api/v1/settings/notifications/test` — send test notification to a specific provider

## Frontend: Settings UI

New "Notifications" tab in the existing Settings page.

### Layout

**Provider cards** (top):
- One card per provider (Discord, Telegram, Webhook)
- Toggle switch to enable/disable
- Credential input fields (masked by default with reveal toggle)
- "Test" button — sends test notification, shows inline success/failure

**Event routing matrix** (bottom):
- Rows = event types with human-readable labels
- Columns = enabled providers only
- Checkbox at each intersection
- Disabled providers hidden from columns

**Save button** — saves provider config and event routing in one call.

Skeleton loaders for async state. Follows existing settings page patterns.

## New Event Emission Points

**`rss.new_episode`** — `rss_refresh_job.go`:
- Feed item matches anime but no auto-download rule exists
- Metadata: anime_name, episode_number, feed_name, source_url

**`library.scan_complete`** — library scanner:
- After scan finishes
- Metadata: library_name, files_found, files_matched, duration

**`system.error`** — worker error paths:
- Job-level unrecoverable errors (not per-item failures)
- Metadata: worker_name, error_message

## Files to Create/Modify

### New Files
- `api/internal/notification/provider.go` — interface + event types
- `api/internal/notification/providers/discord.go`
- `api/internal/notification/providers/telegram.go`
- `api/internal/notification/providers/webhook.go`
- `api/migrations/000028_create_notification_deliveries.up.sql`
- `api/migrations/000028_create_notification_deliveries.down.sql`
- `api/internal/store/queries/notification_deliveries.sql`
- `api/internal/worker/notification_delivery_job.go`
- `api/internal/api/notification_settings_handler.go`
- `web/src/lib/api/notification-settings.ts`
- `web/src/pages/settings/NotificationSettingsTab.tsx`

### Modified Files
- `api/internal/notification/service.go` — fan out to providers after in-app write
- `api/internal/store/notification_deliveries.sql.go` — generated by sqlc
- `api/internal/worker/worker.go` — register delivery retry worker
- `api/internal/worker/rss_refresh_job.go` — emit `rss.new_episode`
- `api/internal/worker/notification_cleanup_job.go` — clean delivery rows
- `api/internal/api/router.go` — register notification settings endpoints
- `api/cmd/server/main.go` — wire providers into service
- `web/src/pages/settings/SettingsPage.tsx` — add Notifications tab

## Non-Goals

- User-customizable message templates
- Per-user notification preferences (single-user system)
- Push notifications (mobile/browser)
- Apprise integration
- Event bus / pub-sub architecture
