-- name: CreateAuditLog :one
INSERT INTO audit_log (
  id, user_id, token_id, agent_label, action_type, target_type, target_id,
  before_json, after_json, confidence, parent_id, dry_run
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetAuditLog :one
SELECT * FROM audit_log WHERE id = ? LIMIT 1;

-- name: ListAuditLogByUser :many
-- action_type and since are optional filters: pass NULL to skip.
-- All params are explicitly numbered (sqlc.arg / sqlc.narg) to avoid the
-- mixed `?` + `?N` parameter counting bug in modernc-sqlite.
SELECT * FROM audit_log
WHERE user_id = sqlc.arg('user_id')
  AND (sqlc.narg('action_type') IS NULL OR action_type = sqlc.narg('action_type'))
  AND (sqlc.narg('since') IS NULL OR created_at >= sqlc.narg('since'))
ORDER BY created_at DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset_n');

-- name: ListAuditLogChildren :many
SELECT * FROM audit_log WHERE parent_id = ? ORDER BY created_at ASC;

-- name: MarkAuditUndone :exec
UPDATE audit_log
SET undone_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    undone_by = ?
WHERE id = ?;
