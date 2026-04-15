CREATE TABLE IF NOT EXISTS sync_outbox (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    provider        TEXT NOT NULL,
    anime_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_ready
    ON sync_outbox(next_attempt_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_provider
    ON sync_outbox(user_id, provider, completed_at);
