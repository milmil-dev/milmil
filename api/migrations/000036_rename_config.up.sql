ALTER TABLE libraries ADD COLUMN rename_template TEXT NOT NULL DEFAULT '';
ALTER TABLE libraries ADD COLUMN rename_auto INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rename_history (
    id            TEXT PRIMARY KEY,
    batch_id      TEXT NOT NULL,
    library_id    TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    media_file_id TEXT,
    old_path      TEXT NOT NULL,
    new_path      TEXT NOT NULL,
    applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    reverted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_rename_history_batch
    ON rename_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_rename_history_library_applied
    ON rename_history(library_id, applied_at DESC);
