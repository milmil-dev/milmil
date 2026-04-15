-- name: GetAnime :one
SELECT * FROM anime WHERE id = ? LIMIT 1;

-- name: GetAnimeByBangumiID :one
SELECT * FROM anime WHERE bangumi_id = ? LIMIT 1;

-- name: CreateAnime :one
INSERT INTO anime (id, library_id, title, title_zh, title_en, synopsis, cover_image_url,
    total_episodes, status, air_date, year, season, genres, bangumi_id, dandanplay_bangumi_id,
    watch_status, score,
    created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: ListAnimeByLibraryID :many
SELECT * FROM anime WHERE library_id = ? ORDER BY title;

-- name: ListAnimeByLibrary :many
SELECT * FROM anime WHERE library_id = ?;

-- name: DeleteAnime :exec
DELETE FROM anime WHERE id = ?;

-- name: DeleteEpisodesByAnimeID :exec
DELETE FROM episodes WHERE anime_id = ?;

-- name: UnlinkMediaFilesByAnimeID :exec
UPDATE media_files SET episode_id = NULL, match_status = 'unmatched'
WHERE episode_id IN (SELECT id FROM episodes WHERE anime_id = ?);

-- name: UpdateAnimeLibraryID :exec
UPDATE anime SET library_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: UpdateAnimeTMDBID :exec
UPDATE anime SET tmdb_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: UpdateAnimeUserScore :exec
UPDATE anime SET user_score = sqlc.arg(user_score), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE bangumi_id = sqlc.arg(bangumi_id);

-- name: UpdateAnimeScore :exec
UPDATE anime SET score = sqlc.arg(score), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE bangumi_id = sqlc.arg(bangumi_id) AND (score = 0 OR score != sqlc.arg(score));

-- name: GetAnimeByAnidbID :one
SELECT * FROM anime WHERE anidb_id = ? LIMIT 1;

-- name: UpdateAnimeExternalIDs :exec
-- Fills only NULL columns; never overwrites an existing value.
UPDATE anime SET
    anidb_id   = COALESCE(anidb_id,   sqlc.narg('anidb_id')),
    anilist_id = COALESCE(anilist_id, sqlc.narg('anilist_id')),
    bangumi_id = COALESCE(bangumi_id, sqlc.narg('bangumi_id')),
    mal_id     = COALESCE(mal_id,     sqlc.narg('mal_id')),
    tmdb_id    = COALESCE(tmdb_id,    sqlc.narg('tmdb_id')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = sqlc.arg('id');

-- name: UpdateAnimeSyncFlags :exec
UPDATE anime
SET sync_disabled = sqlc.arg('sync_disabled'),
    watch_status_override = sqlc.arg('watch_status_override'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');

-- name: ListAnimeForUserWithProviderID :many
-- A5 fix: only animes with at least one completed watch_progress episode.
SELECT DISTINCT a.* FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE wp.user_id = sqlc.arg('user_id')
  AND wp.completed = 1
  AND ( (sqlc.arg('provider') = 'anilist' AND a.anilist_id IS NOT NULL)
     OR (sqlc.arg('provider') = 'bangumi' AND a.bangumi_id IS NOT NULL) )
  AND a.sync_disabled = 0;
