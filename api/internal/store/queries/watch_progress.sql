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
        a.bangumi_id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(a.bangumi_id, a.id) ORDER BY wp.last_watched_at DESC) AS rn
    FROM watch_progress wp
    JOIN episodes e ON e.id = wp.episode_id
    JOIN anime a ON a.id = e.anime_id
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

-- name: CountCompletedWatchProgressByAnime :one
SELECT
    COALESCE(SUM(CASE WHEN wp.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count,
    COALESCE(MAX(wp.last_watched_at), '') AS last_played_at,
    COALESCE(MIN(CASE WHEN wp.completed = 1 THEN wp.last_watched_at END), '') AS first_completed_at
FROM watch_progress wp
JOIN episodes e ON e.id = wp.episode_id
WHERE wp.user_id = sqlc.arg('user_id') AND e.anime_id = sqlc.arg('anime_id');

-- name: HasAnyWatchProgress :one
SELECT EXISTS(
    SELECT 1 FROM watch_progress wp
    JOIN episodes e ON e.id = wp.episode_id
    WHERE wp.user_id = sqlc.arg('user_id') AND e.anime_id = sqlc.arg('anime_id')
) AS has_progress;

-- C4 fix: list Bangumi episode IDs for all completed episodes of this anime.
-- name: ListBangumiEpisodeIDsForAnimeWatchedByUser :many
SELECT e.bangumi_episode_id
FROM episodes e
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
  AND wp.user_id = sqlc.arg('user_id')
  AND wp.completed = 1
  AND e.bangumi_episode_id IS NOT NULL;
