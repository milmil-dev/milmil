CREATE TABLE IF NOT EXISTS subtitle_files (
    id            TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    language      TEXT NOT NULL,
    format        TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'local',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_subtitle_files_media_file_id ON subtitle_files(media_file_id);
