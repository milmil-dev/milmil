CREATE TABLE IF NOT EXISTS watch_progress (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    episode_id        TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    media_file_id     TEXT REFERENCES media_files(id) ON DELETE SET NULL,
    position_seconds  INTEGER NOT NULL DEFAULT 0,
    duration_seconds  INTEGER,
    completed         INTEGER NOT NULL DEFAULT 0,
    last_watched_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    bangumi_synced_at TEXT,
    mal_synced_at     TEXT,
    anilist_synced_at TEXT,
    UNIQUE (user_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_progress_user_id    ON watch_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_episode_id ON watch_progress(episode_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_completed  ON watch_progress(user_id, completed);
