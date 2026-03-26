CREATE TABLE IF NOT EXISTS media_files (
    id                    TEXT PRIMARY KEY,
    episode_id            TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    library_id            TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    path                  TEXT NOT NULL UNIQUE,
    filename              TEXT NOT NULL,
    size_bytes            INTEGER NOT NULL DEFAULT 0,
    duration_seconds      INTEGER,
    container_format      TEXT,
    video_codec           TEXT,
    audio_codec           TEXT,
    width                 INTEGER,
    height                INTEGER,
    file_hash             TEXT,
    dandanplay_episode_id INTEGER,
    match_status          TEXT NOT NULL DEFAULT 'unmatched',
    video_tracks          TEXT NOT NULL DEFAULT '[]',
    audio_tracks          TEXT NOT NULL DEFAULT '[]',
    subtitle_tracks       TEXT NOT NULL DEFAULT '[]',
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_media_files_episode_id            ON media_files(episode_id);
CREATE INDEX IF NOT EXISTS idx_media_files_library_id            ON media_files(library_id);
CREATE INDEX IF NOT EXISTS idx_media_files_file_hash             ON media_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_media_files_match_status          ON media_files(match_status);
CREATE INDEX IF NOT EXISTS idx_media_files_dandanplay_episode_id ON media_files(dandanplay_episode_id);
