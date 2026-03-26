-- name: ListRSSFeeds :many
SELECT * FROM rss_feeds ORDER BY name;

-- name: CreateRSSFeed :one
INSERT INTO rss_feeds (id, name, url, type, enabled, fetch_interval_minutes, created_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: UpdateRSSFeed :exec
UPDATE rss_feeds SET name = ?, url = ?, type = ?, enabled = ?, fetch_interval_minutes = ? WHERE id = ?;

-- name: DeleteRSSFeed :exec
DELETE FROM rss_feeds WHERE id = ?;

-- name: GetRSSFeed :one
SELECT * FROM rss_feeds WHERE id = ? LIMIT 1;

-- name: UpdateRSSFeedLastFetched :exec
UPDATE rss_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?;
