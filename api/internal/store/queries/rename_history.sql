-- name: InsertRenameHistory :exec
INSERT INTO rename_history (id, batch_id, library_id, media_file_id, old_path, new_path)
VALUES (?, ?, ?, ?, ?, ?);

-- name: ListRenameHistoryBatches :many
SELECT batch_id, MIN(applied_at) AS applied_at,
       COUNT(*) AS row_count,
       SUM(CASE WHEN reverted_at IS NULL THEN 0 ELSE 1 END) AS reverted_count
FROM rename_history
WHERE library_id = ?
GROUP BY batch_id
ORDER BY applied_at DESC
LIMIT ?;

-- name: ListRenameHistoryByBatch :many
SELECT * FROM rename_history WHERE batch_id = ? ORDER BY applied_at DESC;

-- name: MarkRenameHistoryReverted :exec
UPDATE rename_history SET reverted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;
