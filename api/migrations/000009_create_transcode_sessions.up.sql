CREATE TABLE IF NOT EXISTS transcode_sessions (
    id            TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending',
    output_dir    TEXT NOT NULL,
    codec         TEXT,
    resolution    TEXT,
    progress      INTEGER NOT NULL DEFAULT 0,
    expires_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_transcode_sessions_token   ON transcode_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_transcode_sessions_expires ON transcode_sessions(expires_at);
