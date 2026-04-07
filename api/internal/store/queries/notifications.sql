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

-- name: GetNotification :one
SELECT * FROM notifications WHERE id = ?;
