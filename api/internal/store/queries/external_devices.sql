-- name: UpsertExternalDevice :one
INSERT INTO external_devices (device_id, user_id, client, device_name, first_seen, last_seen, revoked)
VALUES (?, ?, ?, ?, ?, ?, 0)
ON CONFLICT(device_id) DO UPDATE SET
    user_id = excluded.user_id,
    client = excluded.client,
    device_name = excluded.device_name,
    last_seen = excluded.last_seen,
    revoked = 0
RETURNING *;

-- name: TouchExternalDevice :exec
UPDATE external_devices SET last_seen = ? WHERE device_id = ?;

-- name: GetExternalDevice :one
SELECT * FROM external_devices WHERE device_id = ?;

-- name: ListExternalDevices :many
SELECT * FROM external_devices ORDER BY last_seen DESC;

-- name: CountActiveExternalDevices :one
SELECT COUNT(*) FROM external_devices WHERE revoked = 0;

-- name: RevokeExternalDevice :execrows
UPDATE external_devices SET revoked = 1 WHERE device_id = ?;
