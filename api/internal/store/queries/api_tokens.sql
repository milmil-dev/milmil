-- name: CreateAPIToken :one
INSERT INTO api_tokens (id, name, token_hash, token_prefix, user_id, last_ip, last_user_agent, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: GetAPITokenByHash :one
SELECT * FROM api_tokens WHERE token_hash = ? LIMIT 1;

-- name: GetAPITokenByID :one
SELECT * FROM api_tokens WHERE id = ? AND user_id = ? LIMIT 1;

-- name: ListAPITokensByUser :many
SELECT id, name, token_prefix, user_id, last_used_at, last_ip, last_user_agent, created_at, updated_at
FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC;

-- name: CountAPITokensByUser :one
SELECT COUNT(*) FROM api_tokens WHERE user_id = ?;

-- name: DeleteAPIToken :exec
DELETE FROM api_tokens WHERE id = ? AND user_id = ?;

-- name: DeleteOtherAPITokens :exec
DELETE FROM api_tokens WHERE user_id = ? AND id != ?;

-- name: UpdateAPITokenActivity :exec
UPDATE api_tokens
SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_ip = ?,
    last_user_agent = ?
WHERE id = ?;
