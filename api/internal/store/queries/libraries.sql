-- name: ListLibraries :many
SELECT * FROM libraries ORDER BY name;

-- name: GetLibrary :one
SELECT * FROM libraries WHERE id = ? LIMIT 1;

-- name: CreateLibrary :one
INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: UpdateLibrary :one
UPDATE libraries
SET name = ?, path = ?, enabled = ?, scan_interval_minutes = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?
RETURNING *;

-- name: DeleteLibrary :exec
DELETE FROM libraries WHERE id = ?;

-- name: UpdateLibraryLastScanned :exec
UPDATE libraries
SET last_scanned_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at      = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
