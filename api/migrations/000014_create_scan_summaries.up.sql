CREATE TABLE IF NOT EXISTS scan_summaries (
    id              TEXT PRIMARY KEY,
    library_id      TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    completed_at    TEXT,
    files_found     INTEGER NOT NULL DEFAULT 0,
    files_matched   INTEGER NOT NULL DEFAULT 0,
    files_unmatched INTEGER NOT NULL DEFAULT 0,
    errors          TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_scan_summaries_library_id ON scan_summaries(library_id);
CREATE INDEX IF NOT EXISTS idx_scan_summaries_started_at ON scan_summaries(started_at);
