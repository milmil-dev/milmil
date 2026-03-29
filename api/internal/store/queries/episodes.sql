-- name: GetEpisode :one
SELECT * FROM episodes WHERE id = ? LIMIT 1;

-- name: GetEpisodeByDandanplayID :one
SELECT * FROM episodes WHERE dandanplay_episode_id = ? LIMIT 1;

-- name: CreateEpisode :one
INSERT INTO episodes (id, anime_id, episode_number, title, title_zh, air_date,
    dandanplay_episode_id, bangumi_episode_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: ListEpisodesByAnimeID :many
SELECT * FROM episodes WHERE anime_id = ? ORDER BY episode_number;

-- name: UpdateEpisodeTMDBMetadata :exec
UPDATE episodes
SET synopsis_zh = COALESCE(NULLIF(?, ''), synopsis_zh),
    title_zh = COALESCE(NULLIF(?, ''), title_zh),
    thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: GetEpisodeByAnimeAndNumber :one
SELECT * FROM episodes WHERE anime_id = ? AND episode_number = ? LIMIT 1;
