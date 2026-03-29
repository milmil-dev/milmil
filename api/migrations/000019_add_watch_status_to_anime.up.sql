ALTER TABLE anime ADD COLUMN watch_status TEXT NOT NULL DEFAULT 'watching'
  CHECK (watch_status IN ('none', 'watching', 'planning', 'completed', 'paused', 'dropped'));
ALTER TABLE anime ADD COLUMN watch_status_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_anime_watch_status ON anime(watch_status);
