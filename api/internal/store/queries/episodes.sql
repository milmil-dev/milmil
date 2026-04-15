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

-- name: ListEpisodesByAnimeIDWithAirDate :many
SELECT id, anime_id, episode_number, air_date FROM episodes
WHERE anime_id = ? ORDER BY episode_number ASC;

-- name: ListEpisodesByLibraryIDWithAirDate :many
SELECT e.id, e.anime_id, e.episode_number, e.air_date
FROM episodes e
JOIN anime a ON a.id = e.anime_id
WHERE a.library_id = ? ORDER BY e.anime_id, e.episode_number ASC;

-- name: SetEpisodePreferredAuto :exec
-- Only writes when no manual preference is set yet.
UPDATE episodes
SET preferred_media_file_id = sqlc.arg('file_id'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id') AND preferred_manually_set = 0;

-- name: SetEpisodePreferredManual :exec
UPDATE episodes
SET preferred_media_file_id = sqlc.arg('file_id'),
    preferred_manually_set = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
