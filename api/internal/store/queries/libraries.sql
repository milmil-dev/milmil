-- name: ListLibraries :many
SELECT * FROM libraries ORDER BY name;

-- name: GetLibrary :one
SELECT * FROM libraries WHERE id = ? LIMIT 1;

-- name: CreateLibrary :one
INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes, source_type, source_config_encrypted, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: UpdateLibrary :one
UPDATE libraries
SET name = ?, path = ?, enabled = ?, scan_interval_minutes = ?,
    source_type = ?, source_config_encrypted = ?,
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

-- name: ListLibrariesWithStats :many
SELECT l.*,
  COALESCE(s.file_count, 0) AS file_count,
  COALESCE(s.matched_count, 0) AS matched_count,
  COALESCE(s.unmatched_count, 0) AS unmatched_count,
  COALESCE(s.total_size_bytes, 0) AS total_size_bytes
FROM libraries l
LEFT JOIN (
  SELECT library_id,
    COUNT(*) AS file_count,
    SUM(CASE WHEN match_status != 'unmatched' THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched_count,
    COALESCE(SUM(size_bytes), 0) AS total_size_bytes
  FROM media_files GROUP BY library_id
) s ON l.id = s.library_id
ORDER BY l.name ASC;

-- name: GetLibraryWithStats :one
SELECT l.*,
  COALESCE(s.file_count, 0) AS file_count,
  COALESCE(s.matched_count, 0) AS matched_count,
  COALESCE(s.unmatched_count, 0) AS unmatched_count,
  COALESCE(s.total_size_bytes, 0) AS total_size_bytes
FROM libraries l
LEFT JOIN (
  SELECT library_id,
    COUNT(*) AS file_count,
    SUM(CASE WHEN match_status != 'unmatched' THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched_count,
    COALESCE(SUM(size_bytes), 0) AS total_size_bytes
  FROM media_files GROUP BY library_id
) s ON l.id = s.library_id
WHERE l.id = ?;

-- name: UpdateLibraryRenameConfig :exec
UPDATE libraries
SET rename_template = sqlc.arg('template'),
    rename_auto = sqlc.arg('auto'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
