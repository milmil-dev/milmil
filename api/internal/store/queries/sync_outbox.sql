-- name: EnqueueSyncOp :exec
INSERT INTO sync_outbox (id, user_id, provider, anime_id, kind, payload, next_attempt_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- name: ListReadySyncOps :many
SELECT * FROM sync_outbox
WHERE completed_at IS NULL AND next_attempt_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
ORDER BY next_attempt_at ASC
LIMIT ?;

-- name: MarkSyncOpCompleted :exec
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: RescheduleSyncOp :exec
UPDATE sync_outbox
SET attempts = ?, next_attempt_at = ?, last_error = ?
WHERE id = ?;

-- name: CountPendingSyncOpsByUserProvider :one
SELECT COUNT(*) FROM sync_outbox
WHERE user_id = ? AND provider = ? AND completed_at IS NULL;

-- name: ListRecentSyncErrors :many
SELECT * FROM sync_outbox
WHERE user_id = ? AND provider = ? AND last_error IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- name: DeleteCompletedSyncOpsOlderThan :exec
DELETE FROM sync_outbox WHERE completed_at IS NOT NULL AND completed_at < ?;

-- name: MarkUserProviderOpsFailed :exec
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_error = ?
WHERE user_id = ? AND provider = ? AND completed_at IS NULL;

-- name: SupersedeProgressOps :exec
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_error = 'superseded'
WHERE user_id = ? AND provider = ? AND anime_id = ? AND kind = 'progress' AND completed_at IS NULL;

-- name: GetLatestCompletedSyncOp :one
SELECT * FROM sync_outbox
WHERE user_id = ? AND provider = ? AND completed_at IS NOT NULL AND last_error IS NULL
ORDER BY completed_at DESC LIMIT 1;
