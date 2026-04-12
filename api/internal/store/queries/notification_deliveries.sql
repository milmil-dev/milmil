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

-- name: GetLastDeliveryByProvider :one
SELECT * FROM notification_deliveries
WHERE provider = ? AND status IN ('sent', 'failed')
ORDER BY updated_at DESC LIMIT 1;
