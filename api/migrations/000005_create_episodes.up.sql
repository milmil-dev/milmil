CREATE TABLE IF NOT EXISTS episodes (
    id                    TEXT PRIMARY KEY,
    anime_id              TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    episode_number        REAL NOT NULL,
    title                 TEXT,
    title_zh              TEXT,
    air_date              TEXT,
    synopsis              TEXT,
    thumbnail_url         TEXT,
    dandanplay_episode_id INTEGER,
    bangumi_episode_id    INTEGER,
    mal_episode_id        INTEGER,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (anime_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime_id              ON episodes(anime_id);
CREATE INDEX IF NOT EXISTS idx_episodes_dandanplay_episode_id ON episodes(dandanplay_episode_id);
