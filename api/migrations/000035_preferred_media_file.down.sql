DROP INDEX IF EXISTS idx_episodes_preferred_media_file_id;
ALTER TABLE episodes DROP COLUMN preferred_manually_set;
ALTER TABLE episodes DROP COLUMN preferred_media_file_id;
