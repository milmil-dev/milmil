-- name: ListSubtitlesByMediaFile :many
SELECT * FROM subtitle_files WHERE media_file_id = ? ORDER BY language;

-- name: CreateSubtitleFile :one
INSERT INTO subtitle_files (id, media_file_id, path, language, format, source)
VALUES (?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetSubtitleFile :one
SELECT * FROM subtitle_files WHERE id = ? LIMIT 1;

-- name: DeleteSubtitleFile :exec
DELETE FROM subtitle_files WHERE id = ?;

-- name: ListSubtitlePathsByMediaFile :many
SELECT path FROM subtitle_files WHERE media_file_id = ?;
