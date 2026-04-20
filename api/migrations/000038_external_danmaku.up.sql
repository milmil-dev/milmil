CREATE TABLE IF NOT EXISTS external_danmaku (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_file_id TEXT NOT NULL,
    source TEXT NOT NULL,
    video_id TEXT NOT NULL,
    part_index INTEGER NOT NULL DEFAULT 0,
    comments_json TEXT NOT NULL,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(media_file_id, source)
);
CREATE INDEX IF NOT EXISTS idx_external_danmaku_media_file
    ON external_danmaku(media_file_id);
