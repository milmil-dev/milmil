-- name: CreateTranscodeSession :one
INSERT INTO transcode_sessions (id, media_file_id, session_token, status, output_dir, codec, resolution, progress, expires_at)
VALUES (?, ?, ?, 'pending', ?, ?, ?, 0, ?)
RETURNING *;

-- name: GetTranscodeSession :one
SELECT * FROM transcode_sessions WHERE session_token = ? LIMIT 1;

-- name: UpdateTranscodeSessionStatus :exec
UPDATE transcode_sessions SET status = ?, progress = ? WHERE session_token = ?;

-- name: DeleteTranscodeSession :exec
DELETE FROM transcode_sessions WHERE session_token = ?;

-- name: ListTranscodeSessionsByFile :many
SELECT * FROM transcode_sessions WHERE media_file_id = ? ORDER BY created_at DESC;
