ALTER TABLE episodes ADD COLUMN preferred_media_file_id TEXT
  REFERENCES media_files(id) ON DELETE SET NULL;
ALTER TABLE episodes ADD COLUMN preferred_manually_set INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_episodes_preferred_media_file_id
  ON episodes(preferred_media_file_id);
