-- name: UpsertUserPreference :one
INSERT INTO user_preferences (id, user_id, scope, scope_id, data, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(user_id, scope, scope_id) DO UPDATE SET
    data = excluded.data,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: GetUserPreference :one
SELECT * FROM user_preferences
WHERE user_id = ? AND scope = ? AND scope_id = ?
LIMIT 1;

-- name: ListUserPreferences :many
SELECT * FROM user_preferences
WHERE user_id = ? AND scope = ?
ORDER BY updated_at DESC;

-- name: GetAllUserPreferences :many
SELECT * FROM user_preferences
WHERE user_id = ?
ORDER BY scope, scope_id;

-- name: DeleteUserPreference :exec
DELETE FROM user_preferences
WHERE user_id = ? AND scope = ? AND scope_id = ?;

-- name: CreateSegmentMark :one
INSERT INTO segment_marks (id, media_file_id, type, start_time, end_time, source, created_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(media_file_id, type, source) DO UPDATE SET
    start_time = excluded.start_time,
    end_time = excluded.end_time
RETURNING *;

-- name: ListSegmentMarks :many
SELECT * FROM segment_marks
WHERE media_file_id = ?
ORDER BY start_time ASC;

-- name: DeleteSegmentMark :exec
DELETE FROM segment_marks WHERE id = ?;

-- name: UpsertBackupConfig :one
INSERT INTO backup_configs (id, user_id, type, config, enabled)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, type) DO UPDATE SET
    config = excluded.config,
    enabled = excluded.enabled
RETURNING *;

-- name: GetBackupConfig :one
SELECT * FROM backup_configs
WHERE user_id = ? AND type = ?
LIMIT 1;

-- name: ListBackupConfigs :many
SELECT * FROM backup_configs
WHERE user_id = ?;
