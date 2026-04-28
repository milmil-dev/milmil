-- name: CreateScanSummary :one
INSERT INTO scan_summaries (id, library_id)
VALUES (?, ?)
RETURNING *;

-- name: CompleteScanSummary :exec
UPDATE scan_summaries
SET completed_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    files_found     = ?,
    files_unmatched = ?
WHERE id = ?;

-- name: ListScanSummaries :many
SELECT * FROM scan_summaries
WHERE library_id = ?
ORDER BY started_at DESC
LIMIT 10;

-- name: GetLatestScanSummary :one
-- Returns the most recent scan_summary for a library, or sql.ErrNoRows if
-- no scan has ever run for that library.
SELECT * FROM scan_summaries
WHERE library_id = ?
ORDER BY started_at DESC
LIMIT 1;
