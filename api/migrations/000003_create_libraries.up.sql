CREATE TABLE IF NOT EXISTS libraries (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    path                  TEXT NOT NULL,
    enabled               INTEGER NOT NULL DEFAULT 1,
    scan_interval_minutes INTEGER NOT NULL DEFAULT 60,
    last_scanned_at       TEXT,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
