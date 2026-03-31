-- SQLite doesn't support DROP COLUMN in older versions, so recreate
CREATE TABLE users_backup AS SELECT id, username, password_hash, created_at, updated_at FROM users;
DROP TABLE users;
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT INTO users SELECT * FROM users_backup;
DROP TABLE users_backup;
