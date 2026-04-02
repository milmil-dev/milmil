# Notification Center — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-app notification center with bell dropdown, full page, DB persistence, and WebSocket real-time push for download, library, and system events.

**Architecture:** New `notifications` table + sqlc queries, notification service wrapping DB + WebSocket broadcast, trigger points in existing workers/handlers, frontend bell component + notifications page.

**Tech Stack:** Go (sqlc, Echo, River), SQLite, WebSocket, React 19, TanStack Query/Router, Tailwind CSS v4, Lingui i18n

**Design doc:** `docs/plans/2026-04-02-notification-center-design.md`

---

## Task 1: Database — Create notifications table and sqlc queries

**Files:**
- Create: `api/migrations/000026_create_notifications.up.sql`
- Create: `api/migrations/000026_create_notifications.down.sql`
- Create: `api/internal/store/queries/notifications.sql`
- Regenerate: `api/internal/store/` (sqlc generate)

**Step 1: Create migration**

`api/migrations/000026_create_notifications.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info',
  read        INTEGER NOT NULL DEFAULT 0,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
```

`api/migrations/000026_create_notifications.down.sql`:
```sql
DROP TABLE IF EXISTS notifications;
```

**Step 2: Create sqlc queries**

`api/internal/store/queries/notifications.sql`:
```sql
-- name: ListNotifications :many
SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?;

-- name: ListNotificationsByType :many
SELECT * FROM notifications WHERE type LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?;

-- name: CountUnreadNotifications :one
SELECT COUNT(*) FROM notifications WHERE read = 0;

-- name: CreateNotification :one
INSERT INTO notifications (id, type, title, message, severity, read, metadata, created_at)
VALUES (?, ?, ?, ?, ?, 0, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: MarkNotificationRead :exec
UPDATE notifications SET read = 1 WHERE id = ?;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read = 1 WHERE read = 0;

-- name: DeleteOldReadNotifications :exec
DELETE FROM notifications WHERE read = 1 AND created_at < ?;

-- name: DeleteAllNotifications :exec
DELETE FROM notifications;
```

**Step 3: Regenerate sqlc**

Run: `cd api && sqlc generate`

**Step 4: Verify build**

Run: `cd api && go build ./...`

**Step 5: Commit**

```
feat: add notifications table and sqlc queries
```

---

## Task 2: Backend — Notification service

**Files:**
- Create: `api/internal/notification/service.go`

**Step 1: Create notification service**

```go
package notification

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type Service struct {
	queries *store.Queries
	wsHub   *ws.Hub
}

func NewService(queries *store.Queries, wsHub *ws.Hub) *Service {
	return &Service{queries: queries, wsHub: wsHub}
}

// Send creates a notification in DB and broadcasts via WebSocket.
func (s *Service) Send(ctx context.Context, notifType, title, message, severity string, metadata map[string]any) {
	metaJSON := ""
	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			metaJSON = string(b)
		}
	}

	notif, err := s.queries.CreateNotification(ctx, store.CreateNotificationParams{
		ID:       uuid.NewString(),
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: &metaJSON,
	})
	if err != nil {
		slog.Error("notification: failed to create", "type", notifType, "err", err)
		return
	}

	// Broadcast via WebSocket
	s.wsHub.Broadcast(ws.Event{
		Type: "notification:new",
		Data: notif,
	})
}

func (s *Service) UnreadCount(ctx context.Context) (int64, error) {
	return s.queries.CountUnreadNotifications(ctx)
}

func (s *Service) List(ctx context.Context, limit, offset int64, typeFilter string) ([]store.Notification, error) {
	if typeFilter != "" {
		return s.queries.ListNotificationsByType(ctx, store.ListNotificationsByTypeParams{
			Type:   typeFilter + "%",
			Limit:  limit,
			Offset: offset,
		})
	}
	return s.queries.ListNotifications(ctx, store.ListNotificationsParams{
		Limit:  limit,
		Offset: offset,
	})
}

func (s *Service) MarkRead(ctx context.Context, id string) error {
	return s.queries.MarkNotificationRead(ctx, id)
}

func (s *Service) MarkAllRead(ctx context.Context) error {
	return s.queries.MarkAllNotificationsRead(ctx)
}

func (s *Service) Clear(ctx context.Context) error {
	return s.queries.DeleteAllNotifications(ctx)
}

func (s *Service) CleanupOld(ctx context.Context, days int) error {
	cutoff := time.Now().AddDate(0, 0, -days).Format(time.RFC3339)
	return s.queries.DeleteOldReadNotifications(ctx, &cutoff)
}
```

**Step 2: Verify build**

Run: `cd api && go build ./...`

**Step 3: Commit**

```
feat: add notification service with DB + WebSocket broadcast
```

---

## Task 3: Backend — API endpoints

**Files:**
- Create: `api/internal/api/notification_handler.go`
- Modify: `api/internal/api/router.go` (register routes + inject service)

**Step 1: Create handler**

`api/internal/api/notification_handler.go` — handlers for:
- `GET /api/v1/notifications` — list with `?limit=20&offset=0&filter=download`
- `GET /api/v1/notifications/unread-count` — returns `{ count: N }`
- `PATCH /api/v1/notifications/:id/read` — mark one as read
- `POST /api/v1/notifications/mark-all-read` — mark all as read
- `DELETE /api/v1/notifications` — clear all

**Step 2: Register routes in router.go**

Add to the JWT-protected group:
```go
notifGroup := v1.Group("/notifications", jwtMiddleware(cfg.JWTSecret))
notifGroup.GET("", h.handleListNotifications)
notifGroup.GET("/unread-count", h.handleUnreadCount)
notifGroup.PATCH("/:id/read", h.handleMarkNotificationRead)
notifGroup.POST("/mark-all-read", h.handleMarkAllRead)
notifGroup.DELETE("", h.handleClearNotifications)
```

**Step 3: Add notification service to handler struct**

Add `notifier *notification.Service` to the `handler` struct in router.go and wire it up.

**Step 4: Verify build**

Run: `cd api && go build ./...`

**Step 5: Commit**

```
feat: add notification API endpoints
```

---

## Task 4: Backend — Wire notifications into workers

**Files:**
- Modify: `api/internal/worker/download_sync_job.go` (add notifications on complete/error)
- Modify: `api/internal/worker/rss_refresh_job.go` (add notification on new match)
- Modify: `api/internal/worker/worker.go` (inject notification service)

**Step 1: Add notification service to workers**

Add `notifier *notification.Service` field to `DownloadSyncWorker` and `RSSRefreshWorker`.

**Step 2: Add notifications to download_sync_job.go**

At line 62 (where `newStatus == "complete"` is detected):
```go
if newStatus == "complete" && dl.Status != "complete" {
    w.notifier.Send(ctx, "download.completed", "Download Complete", dl.Name, "success",
        map[string]any{"download_id": dl.ID, "gid": dl.Gid, "bangumi_id": dl.BangumiID})
}
if newStatus == "error" && dl.Status != "error" {
    w.notifier.Send(ctx, "download.failed", "Download Failed", dl.Name, "error",
        map[string]any{"download_id": dl.ID, "gid": dl.Gid})
}
```

**Step 3: Add notifications to rss_refresh_job.go**

When a new torrent is matched and download is triggered:
```go
w.notifier.Send(ctx, "download.started", "New Episode", item.Title, "info",
    map[string]any{"rule_id": rule.ID, "rule_name": rule.Name})
```

**Step 4: Wire notification service in worker.go**

Pass `notifier` to worker constructors.

**Step 5: Verify build**

Run: `cd api && go build ./...`

**Step 6: Commit**

```
feat: emit notifications from download sync and RSS refresh workers
```

---

## Task 5: Backend — Notification cleanup job

**Files:**
- Create: `api/internal/worker/notification_cleanup_job.go`
- Modify: `api/internal/worker/worker.go` (register job)

**Step 1: Create cleanup job**

Runs daily, deletes read notifications older than 30 days.

```go
type NotificationCleanupWorker struct {
    river.WorkerDefaults[NotificationCleanupArgs]
    notifier *notification.Service
}

func (w *NotificationCleanupWorker) Work(ctx context.Context, _ *river.Job[NotificationCleanupArgs]) error {
    return w.notifier.CleanupOld(ctx, 30)
}
```

**Step 2: Register in worker.go with daily interval**

**Step 3: Verify + commit**

```
feat: add daily notification cleanup job
```

---

## Task 6: Frontend — Notification API client and store

**Files:**
- Create: `web/src/lib/api/notifications.ts`

**Step 1: Create API client**

```typescript
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'error';
  read: number;
  metadata: string | null;
  created_at: string;
}

export const notificationApi = {
  list: (params?: { limit?: number; offset?: number; filter?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.filter) qs.set('filter', params.filter);
    return api.get<Notification[]>(`/api/v1/notifications?${qs}`);
  },
  unreadCount: () => api.get<{ count: number }>('/api/v1/notifications/unread-count'),
  markRead: (id: string) => api.patch<void>(`/api/v1/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/api/v1/notifications/mark-all-read'),
  clear: () => api.delete<void>('/api/v1/notifications'),
};

export const notificationKeys = {
  list: (filter?: string) => ['notifications', filter ?? 'all'] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};
```

**Step 2: Commit**

```
feat: add notification API client
```

---

## Task 7: Frontend — Bell button with dropdown

**Files:**
- Create: `web/src/components/NotificationBell.tsx`
- Modify: `web/src/pages/DownloadsPage.tsx` or `web/src/App.tsx` (add bell to header)

**Step 1: Create NotificationBell component**

- Bell icon with red badge (unread count) — query `notificationApi.unreadCount()` every 30s
- Click opens dropdown panel (recent 5 notifications)
- Each notification: severity color bar, title, message, time ago, read/unread dot
- Click notification → mark read + navigate based on type
- "Mark all read" button
- "View all" link → `/notifications`
- Listen for WebSocket `notification:new` → invalidate queries, show toast

**Step 2: Add bell to app header/layout**

Place next to Aria2 status or in the top nav area.

**Step 3: Add WebSocket listener for `notification:new` in `__root.tsx`**

```typescript
if (event.type === 'notification:new') {
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
```

**Step 4: Commit**

```
feat: add notification bell with dropdown panel
```

---

## Task 8: Frontend — Full notifications page

**Files:**
- Create: `web/src/pages/NotificationsPage.tsx`
- Create: `web/src/routes/notifications.tsx`

**Step 1: Create route and page**

- Filter tabs: All / Downloads / Library / System
- Time-grouped list: Today / Yesterday / Earlier
- Each notification card: severity icon, title, message, timestamp, read status
- Click → mark read
- Clear all button
- Pagination (load more)

**Step 2: Add to sidebar navigation**

Add notification page link in `AppSidebar.tsx`.

**Step 3: Add i18n keys and translations**

New keys: `notifications.title`, `notifications.markAllRead`, `notifications.clearAll`, `notifications.empty`, `notifications.today`, `notifications.yesterday`, `notifications.earlier`, `notifications.filter.*`

**Step 4: Commit**

```
feat: add full notifications page with filters and time grouping
```

---

## Task 9: E2E Tests

**Files:**
- Create: `web/e2e/notifications.spec.ts`

**Tests:**
1. Bell shows unread count badge
2. Clicking bell opens dropdown with notifications
3. Clicking notification marks it as read
4. Mark all read clears badge
5. Navigate to full notifications page
6. Filter tabs work (All/Downloads/Library/System)
7. Clear all removes notifications

**Commit:**
```
test: add notification center E2E tests
```
