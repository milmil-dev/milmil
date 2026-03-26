CREATE TABLE IF NOT EXISTS rss_feeds (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL,
    url                    TEXT NOT NULL,
    type                   TEXT NOT NULL DEFAULT 'custom',
    enabled                INTEGER NOT NULL DEFAULT 1,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
    last_fetched_at        TEXT,
    created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
