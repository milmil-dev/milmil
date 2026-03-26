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
