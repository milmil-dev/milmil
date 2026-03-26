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
