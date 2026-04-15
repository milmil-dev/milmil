ALTER TABLE anime ADD COLUMN trakt_show_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_anime_trakt_show_id ON anime(trakt_show_id);

CREATE TABLE IF NOT EXISTS sync_provider_state (
    user_id        TEXT NOT NULL,
    provider       TEXT NOT NULL,
    pull_enabled   INTEGER NOT NULL DEFAULT 1,
    last_pulled_at TEXT,
    PRIMARY KEY (user_id, provider)
);
