-- name: ListCollectionAnime :many
SELECT
  a.id,
  a.bangumi_id,
  a.title,
  a.title_zh,
  a.title_en,
  a.cover_image_url,
  a.total_episodes,
  a.status,
  a.watch_status,
  a.watch_status_updated_at,
  a.genres,
  a.year,
  a.season,
  a.air_date,
  a.created_at,
  a.user_score,
  a.score,
  COUNT(DISTINCT mf.id) AS local_file_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.episode_id = e.id
WHERE mf.match_status != 'unmatched'
  AND a.watch_status != 'none'
  AND (sqlc.arg(status_filter) = '' OR a.watch_status = sqlc.arg(status_filter))
  AND (sqlc.arg(search_query) = '' OR a.title LIKE '%' || sqlc.arg(search_query) || '%' OR COALESCE(a.title_zh, '') LIKE '%' || sqlc.arg(search_query) || '%')
GROUP BY a.id
ORDER BY a.watch_status_updated_at DESC, a.created_at DESC;

-- name: ListRecentlyMatchedAnime :many
SELECT
  a.id,
  a.bangumi_id,
  a.title,
  a.title_zh,
  a.cover_image_url,
  a.total_episodes,
  a.watch_status,
  a.user_score,
  COUNT(DISTINCT mf.id) AS local_file_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.episode_id = e.id
WHERE mf.match_status != 'unmatched'
  AND a.watch_status != 'none'
GROUP BY a.id
ORDER BY MAX(mf.created_at) DESC
LIMIT 10;

-- name: UpdateAnimeWatchStatus :exec
UPDATE anime
SET watch_status = sqlc.arg(watch_status),
    watch_status_updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE bangumi_id = sqlc.arg(bangumi_id);

-- name: CountCollectionByStatus :many
SELECT watch_status, COUNT(*) AS count
FROM anime a
WHERE a.watch_status != 'none'
  AND EXISTS (
    SELECT 1 FROM episodes e
    JOIN media_files mf ON mf.episode_id = e.id
    WHERE e.anime_id = a.id AND mf.match_status != 'unmatched'
  )
GROUP BY watch_status;
