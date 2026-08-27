-- external_devices records every Jellyfin-compatible client (Infuse, VLC,
-- Kodi…) that has signed in, so Settings › 服務 can list them and revoke one
-- without bumping the user's token_version for all the others.
CREATE TABLE external_devices (
    device_id   TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client      TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_external_devices_user ON external_devices(user_id);
