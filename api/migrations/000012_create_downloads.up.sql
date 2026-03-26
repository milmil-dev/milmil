CREATE TABLE IF NOT EXISTS downloads (
    id              TEXT PRIMARY KEY,
    gid             TEXT NOT NULL UNIQUE,
    url             TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'waiting',
    total_bytes     INTEGER NOT NULL DEFAULT 0,
    completed_bytes INTEGER NOT NULL DEFAULT 0,
    speed_bytes     INTEGER NOT NULL DEFAULT 0,
    save_dir        TEXT NOT NULL DEFAULT '',
    rule_id         TEXT REFERENCES download_rules(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_rule_id ON downloads(rule_id);
