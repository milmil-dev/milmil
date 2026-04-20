-- name: UpsertExternalDanmaku :one
INSERT INTO external_danmaku (media_file_id, source, video_id, part_index, comments_json, comment_count)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(media_file_id, source) DO UPDATE SET
    video_id = excluded.video_id,
    part_index = excluded.part_index,
    comments_json = excluded.comments_json,
    comment_count = excluded.comment_count,
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: GetExternalDanmakuByMediaFile :many
SELECT * FROM external_danmaku
WHERE media_file_id = ?
ORDER BY source;

-- name: DeleteExternalDanmaku :exec
DELETE FROM external_danmaku
WHERE media_file_id = ? AND source = ?;

-- name: DeleteAllExternalDanmaku :exec
DELETE FROM external_danmaku
WHERE media_file_id = ?;
