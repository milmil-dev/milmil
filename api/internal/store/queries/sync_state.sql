-- name: GetSyncProviderState :one
SELECT * FROM sync_provider_state WHERE user_id = ? AND provider = ? LIMIT 1;

-- name: UpsertSyncProviderState :exec
INSERT INTO sync_provider_state (user_id, provider, pull_enabled, last_pulled_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(user_id, provider) DO UPDATE SET
    pull_enabled = excluded.pull_enabled,
    last_pulled_at = COALESCE(excluded.last_pulled_at, sync_provider_state.last_pulled_at);

-- name: ListPullEnabledProviders :many
SELECT user_id, provider FROM sync_provider_state WHERE pull_enabled = 1;

-- name: SetPullEnabled :exec
INSERT INTO sync_provider_state (user_id, provider, pull_enabled)
VALUES (?, ?, ?)
ON CONFLICT(user_id, provider) DO UPDATE SET pull_enabled = excluded.pull_enabled;
