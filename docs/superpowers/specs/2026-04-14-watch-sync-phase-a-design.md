# Watch State Sync — Phase A (Bangumi + AniList)

**Date:** 2026-04-14
**Status:** Draft → awaiting user review
**Follow-ups:** Phase B (Trakt, MAL, bidirectional pull, conflict UI) — separate spec

## Goals

Finish the half-done Bangumi and AniList OAuth integrations so milmil automatically pushes every watch-progress update to both trackers, imports existing state on first connect, handles rate limits and transient failures, and exposes clean sync-status UX. Keep the design provider-agnostic so Trakt/MAL adapters slide in later without a rewrite.

### In scope

- Outbox queue (`sync_outbox` table) plus a scheduler worker that drains it with retry + exponential backoff.
- Auto push on every `watch_progress` write, producing both Bangumi and AniList ops.
- Correct status derivation: `watching → completed → repeating`, with a per-anime `watch_status_override` for manual `paused` / `dropped`.
- Per-anime sync opt-out (`anime.sync_disabled`).
- One-shot initial import when OAuth connect succeeds: populate milmil watch state from remote, never overwrite existing milmil state.
- Rate-limit awareness (honor `Retry-After`), token refresh for AniList, dead-letter after 30 attempts.
- Settings UI: connection cards with last-synced time, pending count, recent errors, disconnect + "Sync Now".
- Anime detail UI: sync toggle per anime.

### Out of scope (deferred to Phase B)

- Trakt and MAL adapters.
- Periodic bidirectional pull sync with conflict resolution.
- UI for resolving divergent watch states between milmil and trackers.
- Exporting the whole library on demand (Phase A import-on-connect covers the realistic need).
- **OAuth token refresh.** AniList tokens last ~1 year; Bangumi similar. Phase A treats 401/403 as fatal — worker marks the row dead-letter and emits a `sync:needs_reauth` ws event; user reconnects via the existing OAuth flow. Automatic refresh using the stored `refresh_token` ships in Phase B.

## Non-goals

- Replacing the existing manual "Sync" button (keep it; wire it to flush the queue).
- Rewriting the OAuth plumbing (existing code in `api/internal/api/oauth_handler.go` stays; we move push logic into the new sync package).
- Changing how milmil resolves `anilist_id` / `bangumi_id` (Phase 1 enrichment covers this).

## Architecture

### New package — `api/internal/sync/`

| File | Responsibility |
|---|---|
| `queue.go` | `Enqueue(ctx, userID, provider, animeID, kind, payload)` inserts into `sync_outbox`. Non-blocking. |
| `worker.go` | `Drain(ctx)` — picks ready rows, dispatches to the provider adapter, updates `attempts` / `next_attempt_at` / `last_error`, marks `completed_at` on success, broadcasts ws events on dead-letter / needs_reauth. |
| `status.go` | `DeriveStatus(ctx, animeID, userID) (WatchStatus, error)` — pure derivation from watch_progress + override. |
| `provider.go` | `Provider` interface: `Push(ctx, token, op SyncOp) error`. `SyncOp` is a tagged union keyed by `kind`. |
| `providers/bangumi.go` | Wraps existing `bgm.tv` PUT episode + PATCH collection calls; maps milmil statuses. |
| `providers/anilist.go` | Wraps AniList GraphQL `SaveMediaListEntry`; handles token refresh, rate limits. |
| `import.go` | `ImportFromProvider(ctx, userID, provider)` — one-shot full-list fetch on OAuth connect. |
| `service.go` | Facade: the handlers and worker call this; it composes queue + status + providers. |

### DB migrations

`000033_create_sync_outbox.up.sql`:

```sql
CREATE TABLE sync_outbox (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    provider        TEXT NOT NULL,     -- 'bangumi' | 'anilist'
    anime_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,     -- 'progress' | 'status' | 'import'
    payload         TEXT NOT NULL,     -- JSON
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    completed_at    TEXT
);
CREATE INDEX idx_sync_outbox_ready
    ON sync_outbox(next_attempt_at) WHERE completed_at IS NULL;
CREATE INDEX idx_sync_outbox_user_provider
    ON sync_outbox(user_id, provider, completed_at);
```

`000034_anime_sync_flags.up.sql`:

```sql
ALTER TABLE anime ADD COLUMN sync_disabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE anime ADD COLUMN watch_status_override TEXT NOT NULL DEFAULT '';
```

### Scheduler integration

Add to `Scheduler`:

- `sync_outbox_drain` — every 10 seconds, run immediately on boot. Calls `sync.Service.Drain(ctx)`.
- `sync_outbox_gc` — every 24 hours. Deletes rows where `completed_at < now - 30d`.

### Handler changes

- `PUT /api/v1/watch-progress` (existing handler): after DB write, call `sync.Service.OnProgressUpdate(ctx, userID, animeID)`. The service derives status and enqueues one row per enabled provider. Non-blocking; errors from Enqueue are logged but do not fail the request.
- `POST /api/v1/oauth/{provider}/callback`: after token stored, enqueue `kind=import` row. Worker will pick it up on the next tick.
- `POST /api/v1/oauth/{provider}/sync` (existing "Sync now"): replaced — now enqueues a full-library push (one row per anime with a valid provider ID) and returns immediately. Response body reports how many were enqueued; the UI polls status.
- `POST /api/v1/oauth/{provider}/disconnect`: updates pending rows to `completed_at=now, last_error='disconnected'` and deletes the token.
- `GET /api/v1/sync/status` (new): returns per-provider connection, last-synced, pending/failed counts, recent errors.

### Frontend

- `web/src/pages/settings/IntegrationsPage.tsx` (new or extended from existing settings tabs) — Bangumi + AniList connection cards. Each card shows: connected? last synced? pending count, recent errors (last 5), [Sync now] / [Disconnect].
- `web/src/pages/AnimeDetailPage.tsx` — add a small toggle or overflow menu action: "Exclude from tracker sync." Writes `anime.sync_disabled`.
- `web/src/lib/api/sync.ts` — typed client for the new `/sync/status` endpoint.

## Data flow

### Push on watch-progress update

```
PUT /watch-progress
  → UPDATE watch_progress
  → sync.Service.OnProgressUpdate(userID, animeID):
      if anime.sync_disabled → return
      status := DeriveStatus(animeID, userID)
      for provider in [bangumi, anilist] where user has token and anime has provider-id:
          Enqueue(user, provider, animeID, "progress",
                  {status, progress_count, episode_ids_since_last_sync})
  → return 200
```

### Worker drain (every 10s)

```
rows := SELECT ... WHERE next_attempt_at <= now AND completed_at IS NULL LIMIT 50
for each row (grouped by user, provider — one goroutine per provider):
    token := loadToken(user, provider)
    if !token.Valid():
        if provider == "anilist" && refreshable:
            refresh → retry
        else:
            mark row dead-letter, broadcast ws "sync:needs_reauth"
            continue
    err := provider.Push(ctx, token, op)
    if err == nil:
        UPDATE completed_at = now
        continue
    attempts++
    if resp is 429 and Retry-After header present:
        next_attempt_at = now + retryAfter
    else:
        next_attempt_at = now + backoff(attempts)  // 1m, 2m, 4m, 8m, 16m, 32m, 1h, 2h, 4h, cap 24h
    last_error = err.Error()
    if attempts >= 30:
        broadcast ws "sync:dead_letter" {user, provider, anime_id}
```

### Status derivation

```
DeriveStatus(animeID, userID):
    override := SELECT watch_status_override FROM anime WHERE id = animeID
    if override != '' → return override   // paused / dropped / user-chosen
    total := anime.total_episodes  (0 if unknown)
    watched := COUNT(watch_progress WHERE anime=X, user=Y, played_at IS NOT NULL)
    last_played := MAX(watch_progress.played_at)
    first_completed_at := MIN(watch_progress.played_at WHERE watched == total)
    if watched == 0:
        if exists in user_collection → "planning"
        else → "none"
    if 0 < watched < total → "watching"
    if watched == total:
        if last_played > first_completed_at → "repeating"
        else → "completed"
```

Milmil status → provider enum:

| milmil | AniList | Bangumi |
|---|---|---|
| watching | CURRENT | 3 (do / 在看) |
| completed | COMPLETED | 2 (collect / 看过) |
| planning | PLANNING | 1 (wish / 想看) |
| repeating | REPEATING | 3 (do — Bangumi lacks repeating) |
| paused | PAUSED | 4 (on_hold / 搁置) |
| dropped | DROPPED | 5 (dropped / 抛弃) |

### OAuth connect import

```
POST /oauth/anilist/callback (success)
  → store token
  → Enqueue(user, "anilist", animeID="", kind="import", payload={})
worker picks up import row:
  → provider.FetchList(ctx, token) → []RemoteEntry
  → for each remote entry:
      anime := find by anilist_id/bangumi_id
      if not found → skip
      if user has ANY watch_progress for this anime → skip (no conflict resolution)
      else → INSERT watch_progress from remote; set anime.watch_status_override if remote status is paused/dropped
  → mark row complete
  → ws broadcast "sync:imported" {provider, imported_count}
```

## Edge cases

| Case | Behavior |
|---|---|
| Anime has no `anilist_id`/`bangumi_id` | skip enqueue silently; log info. Phase 1 enrichment resolves most. |
| `sync_disabled = 1` | skip enqueue; manual "Sync Now" also respects the flag. |
| Token missing / revoked | First push attempt gets 401 → mark row dead-letter; ws `sync:needs_reauth`; subsequent enqueues are paused for that provider until reconnect. |
| AniList rate-limit (429) | Honor `Retry-After`. All rows for that user+provider share the same next_attempt_at. |
| Bangumi API down (5xx) | Backoff per-row independently. |
| `total_episodes` unknown (0) | Skip auto-transition to completed; only `watching`/`repeating` possible via override. |
| Same anime enqueued many times while worker drains | Worker coalesces consecutive `progress` rows for same (user, provider, anime) — use the newest payload, mark older rows completed. |
| Disconnect mid-drain | Worker checks `token.exists` per row; missing → mark row `disconnected`. |
| Duplicate commits (crash mid-push) | Adapter calls are idempotent: SaveMediaListEntry with same progress is last-write-wins at AniList; Bangumi PUT episode status is idempotent. |
| User deletes watch_progress entry | Status derivation picks it up on next update trigger; if `total` drops below watched nothing to push (no deletion API in Phase A). |

## Testing

- `sync/queue_test.go` — enqueue, dedupe-coalesce, dead-letter threshold, backoff math (`1m..24h`).
- `sync/status_test.go` — all 6 transitions, override precedence, unknown-total safety.
- `sync/providers/bangumi_test.go` — httptest mock; PUT episode status, PATCH collection, error paths (404, 401, 500).
- `sync/providers/anilist_test.go` — httptest mock with GraphQL; SaveMediaListEntry payloads for each status, token refresh on 401, honor `Retry-After` on 429.
- `sync/import_test.go` — full import flow with fake provider list; skip-on-existing semantics.
- Integration: real sqlite + fake HTTP servers; watch-progress handler enqueues → worker drains → both providers receive correct op. Assert `watch-progress` handler latency adds <5ms for enqueue.
- Regression: existing oauth manual sync still works (just delegates to the queue now).

## Rollout

1. Migrations + outbox + worker (feature dormant; no auto-enqueue yet).
2. Move existing manual sync handlers to enqueue full push. Verify queue drains correctly against real Bangumi / AniList in a staging account.
3. Wire `OnProgressUpdate` hook. Watch the queue depth metric; keep an eye on dead-letter events.
4. Enable import-on-connect.
5. Ship UI.

Each stage can ship independently and be reverted by unhooking the caller; the `sync_outbox` table harmless if idle.

## Open questions

- Backoff cap: 24h means a stuck row won't retry for a day after the 9th failure. Worth adding a manual "retry now" button in the UI error list. Tentatively yes, but cheap to add later.
- Phase B pull-sync cadence: unknown until we have Phase A usage data. Defer.
- Whether to expose a "Sync disabled reason" on anime (user chose / no provider ID / provider errored) — cosmetic, defer.
