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
