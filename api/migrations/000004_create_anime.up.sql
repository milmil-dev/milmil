CREATE TABLE IF NOT EXISTS anime (
    id                    TEXT PRIMARY KEY,
    library_id            TEXT REFERENCES libraries(id) ON DELETE SET NULL,
    title                 TEXT NOT NULL,
    title_zh              TEXT,
    title_en              TEXT,
    synopsis              TEXT,
    cover_image_url       TEXT,
    total_episodes        INTEGER,
    status                TEXT NOT NULL DEFAULT 'unknown',
    air_date              TEXT,
    year                  INTEGER,
    season                TEXT,
    genres                TEXT NOT NULL DEFAULT '[]',
    is_custom             INTEGER NOT NULL DEFAULT 0,
    anilist_id            INTEGER,
    bangumi_id            INTEGER,
    dandanplay_bangumi_id INTEGER,
    mal_id                INTEGER,
    tmdb_id               INTEGER,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_anime_library_id  ON anime(library_id);
CREATE INDEX IF NOT EXISTS idx_anime_anilist_id  ON anime(anilist_id);
CREATE INDEX IF NOT EXISTS idx_anime_bangumi_id  ON anime(bangumi_id);
CREATE INDEX IF NOT EXISTS idx_anime_status      ON anime(status);
CREATE INDEX IF NOT EXISTS idx_anime_year_season ON anime(year, season);
