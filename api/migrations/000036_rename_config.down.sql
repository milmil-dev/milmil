DROP INDEX IF EXISTS idx_rename_history_library_applied;
DROP INDEX IF EXISTS idx_rename_history_batch;
DROP TABLE IF EXISTS rename_history;
ALTER TABLE libraries DROP COLUMN rename_auto;
ALTER TABLE libraries DROP COLUMN rename_template;
