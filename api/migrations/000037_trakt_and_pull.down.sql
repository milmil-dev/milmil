DROP TABLE IF EXISTS sync_provider_state;
DROP INDEX IF EXISTS idx_anime_trakt_show_id;
ALTER TABLE anime DROP COLUMN trakt_show_id;
