-- name: GetWatchProgress :one
SELECT * FROM watch_progress WHERE user_id = ? AND episode_id = ? LIMIT 1;

-- name: UpsertWatchProgress :one
INSERT INTO watch_progress (id, user_id, episode_id, media_file_id, position_seconds, duration_seconds, completed, last_watched_at)
VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(user_id, episode_id) DO UPDATE SET
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    completed = excluded.completed,
    media_file_id = excluded.media_file_id,
    last_watched_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: ListWatchProgressByUser :many
SELECT * FROM watch_progress WHERE user_id = ? ORDER BY last_watched_at DESC LIMIT 20;

-- name: GetWatchProgressByMediaFile :one
SELECT * FROM watch_progress WHERE user_id = ? AND media_file_id = ? LIMIT 1;

-- name: ListCompletedWatchProgress :many
SELECT * FROM watch_progress WHERE user_id = ? AND completed = 1 ORDER BY last_watched_at DESC;
