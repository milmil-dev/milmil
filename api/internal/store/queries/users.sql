-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = ? LIMIT 1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = ? LIMIT 1;

-- name: CreateUser :one
INSERT INTO users (id, username, password_hash, created_at, updated_at)
VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: EnableTwoFactor :exec
UPDATE users SET totp_secret = ?, two_factor_enabled = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: DisableTwoFactor :exec
UPDATE users SET totp_secret = '', two_factor_enabled = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: SetTOTPSecret :exec
UPDATE users SET totp_secret = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: BumpTokenVersion :exec
UPDATE users SET token_version = token_version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: SetUserAvatar :exec
UPDATE users SET avatar_path = ?, avatar_updated_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;

-- name: ClearUserAvatar :exec
UPDATE users SET avatar_path = NULL, avatar_updated_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;
