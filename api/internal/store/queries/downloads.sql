-- name: ListDownloads :many
SELECT * FROM downloads ORDER BY created_at DESC;

-- name: CreateDownload :one
INSERT INTO downloads (id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, rule_id, bangumi_id, library_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: GetDownloadByID :one
SELECT * FROM downloads WHERE id = ? LIMIT 1;

-- name: GetDownloadByGID :one
SELECT * FROM downloads WHERE gid = ? LIMIT 1;

-- name: GetDownloadByURL :one
SELECT * FROM downloads WHERE url = ? LIMIT 1;

-- name: UpdateDownloadStatus :exec
UPDATE downloads SET status = ?, total_bytes = ?, completed_bytes = ?, speed_bytes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE gid = ?;

-- name: DeleteDownload :exec
DELETE FROM downloads WHERE gid = ?;

-- name: ListDownloadsByRuleID :many
SELECT * FROM downloads WHERE rule_id = ? ORDER BY created_at DESC;

-- name: ListActiveDownloads :many
SELECT * FROM downloads WHERE status IN ('active', 'waiting', 'paused') ORDER BY created_at DESC;

-- name: ListCompletedDownloads :many
SELECT * FROM downloads WHERE status = 'complete' ORDER BY updated_at DESC LIMIT 50;

-- name: ListDownloadsByLibraryID :many
SELECT * FROM downloads WHERE library_id = ? ORDER BY created_at DESC;

-- name: UnlinkDownloadsByRuleID :exec
UPDATE downloads SET rule_id = NULL WHERE rule_id = ?;
