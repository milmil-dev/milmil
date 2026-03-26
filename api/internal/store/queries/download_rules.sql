-- name: ListDownloadRules :many
SELECT * FROM download_rules ORDER BY name;

-- name: CreateDownloadRule :one
INSERT INTO download_rules (id, name, enabled, rss_feed_id, filter_regex, exclude_regex, save_dir, episode_offset, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: UpdateDownloadRule :exec
UPDATE download_rules SET name = ?, enabled = ?, rss_feed_id = ?, filter_regex = ?, exclude_regex = ?, save_dir = ?, episode_offset = ? WHERE id = ?;

-- name: DeleteDownloadRule :exec
DELETE FROM download_rules WHERE id = ?;

-- name: ListDownloadRulesByFeedID :many
SELECT * FROM download_rules WHERE rss_feed_id = ? AND enabled = 1;

-- name: UpdateDownloadRuleTriggered :exec
UPDATE download_rules SET last_triggered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?;
