-- name: UpsertMediaFile :one
INSERT INTO media_files (id, library_id, path, filename, size_bytes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(path) DO UPDATE SET
    filename   = excluded.filename,
    size_bytes = excluded.size_bytes,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: ListMediaFilePathsByLibrary :many
SELECT path FROM media_files WHERE library_id = ?;

-- name: DeleteMediaFile :exec
DELETE FROM media_files WHERE path = ?;

-- name: CountMediaFilesByLibrary :one
SELECT COUNT(*) FROM media_files WHERE library_id = ?;

-- name: UpdateMediaFileHash :exec
UPDATE media_files
SET file_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: UpdateMediaFileDandanplayID :exec
UPDATE media_files
SET dandanplay_episode_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListUnmatchedMediaFilesByLibrary :many
SELECT * FROM media_files
WHERE library_id = ? AND match_status = 'unmatched' AND file_hash IS NOT NULL;

-- name: GetMediaFileByID :one
SELECT * FROM media_files WHERE id = ? LIMIT 1;

-- name: UpdateMediaFileDandanplayIDs :exec
UPDATE media_files
SET dandanplay_episode_id = ?, dandanplay_anime_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListMatchedUnlinkedMediaFiles :many
SELECT * FROM media_files
WHERE library_id = ? AND dandanplay_episode_id IS NOT NULL AND episode_id IS NULL;

-- name: UpdateMediaFileEpisodeID :exec
UPDATE media_files
SET episode_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListMediaFilesByLibrary :many
SELECT mf.*,
       COALESCE(a.title, '') AS matched_anime_title,
       COALESCE(e.episode_number, 0) AS matched_episode_sort,
       COALESCE(a.bangumi_id, 0) AS matched_bangumi_id,
       (SELECT COUNT(*) FROM subtitle_files sf WHERE sf.media_file_id = mf.id) AS subtitle_count
FROM media_files mf
LEFT JOIN episodes e ON mf.episode_id = e.id
LEFT JOIN anime a ON e.anime_id = a.id
WHERE mf.library_id = ?
  AND (? = 'all' OR (? = 'matched' AND mf.match_status != 'unmatched') OR mf.match_status = ?)
  AND (? = '' OR mf.filename LIKE '%' || ? || '%')
ORDER BY mf.filename ASC
LIMIT ? OFFSET ?;

-- name: CountMediaFilesByStatus :one
SELECT COUNT(*) AS total
FROM media_files
WHERE library_id = ?
  AND (? = 'all' OR (? = 'matched' AND match_status != 'unmatched') OR match_status = ?)
  AND (? = '' OR filename LIKE '%' || ? || '%');

-- name: UpdateMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = ?, dandanplay_episode_id = ?, match_status = 'manual',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ClearMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = NULL, dandanplay_episode_id = NULL,
    episode_id = NULL, match_status = 'unmatched',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListAllUnmatchedMediaFilesByLibrary :many
SELECT * FROM media_files
WHERE library_id = ? AND match_status = 'unmatched';

-- name: UpdateMediaFileBangumiIDs :exec
UPDATE media_files
SET bangumi_subject_id = ?, bangumi_episode_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListBangumiMatchedUnlinkedMediaFiles :many
SELECT * FROM media_files
WHERE library_id = ? AND bangumi_subject_id IS NOT NULL AND episode_id IS NULL;
