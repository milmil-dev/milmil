DROP INDEX IF EXISTS idx_anime_watch_status;
ALTER TABLE anime DROP COLUMN watch_status_updated_at;
ALTER TABLE anime DROP COLUMN watch_status;
