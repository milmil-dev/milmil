# Notification Center

## Problem

Users have no way to know when downloads complete, subscriptions match new episodes, or scans finish without manually checking each page. No push notification support for external messaging apps.

## Design

### Phase 1: In-App Notification Center

#### Data Model

```sql
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  severity    TEXT NOT NULL,  -- info / success / error
  read        INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT,           -- JSON: { bangumi_id, rule_id, download_id, ... }
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
```

#### Event Types

| Type | Trigger | Severity |
|---|---|---|
| `download.started` | RSS rule matches new torrent, download begins | info |
| `download.completed` | Download status transitions to complete | success |
| `download.failed` | Download status transitions to error | error |
| `library.scan_completed` | Library scan finishes, reports new file count | info |
| `library.scan_failed` | Library scan errors | error |
| `subscribe.matched` | RSS refresh finds new matching torrents | info |
| `system.error` | System-level errors (Aria2 disconnect, etc.) | error |

#### Backend

**Notification Service** (`internal/notification/service.go`):
- `Send(ctx, type, title, message, severity, metadata)` — writes DB + broadcasts via WebSocket `notification:new`
- `List(ctx, limit, offset, filter)` — paginated list with optional type filter
- `MarkRead(ctx, id)` / `MarkAllRead(ctx)` — update read status
- `UnreadCount(ctx)` — for badge
- `DeleteOlderThan(ctx, days)` — cleanup

**Trigger Points:**
- `worker/download_sync_job.go` — on status transition to complete/error
- `worker/rss_refresh_job.go` — on new match + download
- Library scan completion callback
- Aria2 connection status change

**API Endpoints:**
```
GET    /api/v1/notifications?limit=20&offset=0&filter=downloads
GET    /api/v1/notifications/unread-count
PATCH  /api/v1/notifications/:id/read
POST   /api/v1/notifications/mark-all-read
DELETE /api/v1/notifications/clear
```

**Auto-cleanup job:** daily, deletes read notifications older than 30 days.

#### Frontend

**Bell button** — in page header, next to Aria2 status:
- Red badge with unread count
- Click opens dropdown panel

**Dropdown panel** — latest 5 notifications:
- Unread dot indicator (●/○)
- Left color bar by severity (green/blue/red)
- Click notification → mark read + navigate to relevant page
- "Mark all read" button
- "View all" → navigates to /notifications

**Full notifications page** `/notifications`:
- Filter tabs: All / Downloads / Library / System
- Time grouping: Today / Yesterday / Earlier
- Clear all button

### Phase 2 (Future): External Push

- Telegram Bot API
- Discord Webhook
- Configurable in Settings → Notifications
- Per-event-type toggle (e.g. only push download.completed to Telegram)

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Scope | Full system events, not just downloads | Downloads alone too narrow |
| UI pattern | Bell dropdown + full page | Quick preview without leaving current page |
| Priority | In-app first, external push later | Need stable notification model before adding channels |
| Storage | DB + WebSocket | History persistence + real-time delivery |
| Cleanup | Auto-delete 30-day read notifications | Prevent DB bloat |
