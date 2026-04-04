-- user_preferences: stores global and per-series player preferences as JSON
CREATE TABLE IF NOT EXISTS user_preferences (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope      TEXT NOT NULL DEFAULT 'global',
    scope_id   TEXT NOT NULL DEFAULT '',
    data       TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(user_id, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_scope ON user_preferences(user_id, scope, scope_id);

-- segment_marks: OP/ED/recap time markers for media files
CREATE TABLE IF NOT EXISTS segment_marks (
    id            TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    start_time    REAL NOT NULL,
    end_time      REAL NOT NULL,
    source        TEXT NOT NULL DEFAULT 'manual',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(media_file_id, type, source)
);

-- backup_configs: WebDAV/S3 backup target configuration
CREATE TABLE IF NOT EXISTS backup_configs (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    config       TEXT NOT NULL DEFAULT '{}',
    enabled      INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT,
    UNIQUE(user_id, type)
);
