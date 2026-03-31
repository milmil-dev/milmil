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

-- name: ListRecentProgressWithAnime :many
WITH ranked AS (
    SELECT
        wp.id, wp.user_id, wp.episode_id, wp.media_file_id,
        wp.position_seconds, wp.duration_seconds, wp.completed, wp.last_watched_at,
        e.anime_id, e.episode_number,
        ROW_NUMBER() OVER (PARTITION BY e.anime_id ORDER BY wp.last_watched_at DESC) AS rn
    FROM watch_progress wp
    JOIN episodes e ON e.id = wp.episode_id
    WHERE wp.user_id = ?
)
SELECT
    r.id, r.user_id, r.episode_id, r.media_file_id,
    r.position_seconds, r.duration_seconds, r.completed, r.last_watched_at,
    a.id AS anime_id, a.title AS anime_title, a.title_zh AS anime_title_zh,
    a.cover_image_url AS anime_cover_image_url, a.bangumi_id AS anime_bangumi_id,
    r.episode_number
FROM ranked r
JOIN anime a ON a.id = r.anime_id
WHERE r.rn = 1
ORDER BY r.last_watched_at DESC
LIMIT 20;

-- name: GetWatchProgressByMediaFile :one
SELECT * FROM watch_progress WHERE user_id = ? AND media_file_id = ? LIMIT 1;

-- name: ListCompletedWatchProgress :many
SELECT * FROM watch_progress WHERE user_id = ? AND completed = 1 ORDER BY last_watched_at DESC;
