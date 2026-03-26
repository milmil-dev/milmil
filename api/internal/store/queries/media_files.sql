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
