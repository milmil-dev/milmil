-- name: ListDownloads :many
SELECT * FROM downloads ORDER BY created_at DESC;

-- name: CreateDownload :one
INSERT INTO downloads (id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, rule_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: GetDownloadByGID :one
SELECT * FROM downloads WHERE gid = ? LIMIT 1;

-- name: GetDownloadByURL :one
SELECT * FROM downloads WHERE url = ? LIMIT 1;

-- name: UpdateDownloadStatus :exec
UPDATE downloads SET status = ?, total_bytes = ?, completed_bytes = ?, speed_bytes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE gid = ?;

-- name: DeleteDownload :exec
DELETE FROM downloads WHERE gid = ?;
