ALTER TABLE anime ADD COLUMN anidb_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_anidb_id
  ON anime(anidb_id) WHERE anidb_id IS NOT NULL;
