-- name: GetSetting :one
SELECT key, value, updated_at FROM settings WHERE key = ?;

-- name: UpsertSetting :one
INSERT INTO settings (key, value, updated_at)
VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT (key) DO UPDATE
  SET value = excluded.value,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: DeleteSetting :exec
DELETE FROM settings WHERE key = ?;

-- name: ListSettings :many
SELECT key, value, updated_at FROM settings ORDER BY key;
