CREATE TABLE IF NOT EXISTS download_rules (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    enabled           INTEGER NOT NULL DEFAULT 1,
    rss_feed_id       TEXT NOT NULL REFERENCES rss_feeds(id) ON DELETE CASCADE,
    filter_regex      TEXT NOT NULL DEFAULT '',
    exclude_regex     TEXT NOT NULL DEFAULT '',
    save_dir          TEXT NOT NULL DEFAULT '',
    episode_offset    INTEGER NOT NULL DEFAULT 0,
    last_triggered_at TEXT,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_download_rules_rss_feed_id ON download_rules(rss_feed_id);
CREATE INDEX IF NOT EXISTS idx_download_rules_enabled     ON download_rules(enabled);
