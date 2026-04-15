# Watch Sync Phase C — Trakt Adapter + Bidirectional Pull

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Depends on:** Phase A (outbox + push) and Phase B (TokenStore + refresh) already merged to main
**Follow-ups:** MAL adapter, Trakt multi-season handling, manual conflict resolution UI

## Goals

Add Trakt as a third sync provider alongside Bangumi and AniList, using device-code OAuth for self-hosted friendliness. Introduce a scheduled bidirectional pull job that reconciles remote watch progress back into milmil with a max-wins conflict resolution. Applies to all three providers.

### In scope

- New `sync.ProviderTrakt` + `providers/trakt.go` implementing the Provider interface (Push, FetchList, RefreshToken).
- Trakt OAuth device code flow: `POST /api/v1/oauth/trakt/device-code` and `POST /api/v1/oauth/trakt/poll`.
- `anime.trakt_show_id INTEGER NULL` cache column to avoid re-searching Trakt by TMDB each push.
- Trakt push logic: cache-or-resolve Trakt ID via `tmdb_id`; no `tmdb_id` → fatal dead-letter with log.
- New `sync_provider_state` table: `(user_id, provider, pull_enabled, last_pulled_at)`.
- `sync.Service.PullFromProvider(ctx, userID, provider) (PullResult, error)` with max-wins conflict resolution.
- Scheduler job `sync_pull` every 30 minutes per connected user × provider.
- Manual "Pull now" button per provider card in `IntegrationsPanel`.
- ws event `sync:pulled` with `{provider, updated_count}`.
- Per-provider `pull_enabled` toggle (opt-in).

### Out of scope

- Trakt webhook (VIP only).
- Score / rating sync (milmil has no user-score column on `anime` today).
- Manual conflict resolution UI — max-wins handles it per spec.
- Trakt multi-season show handling (assumes season=1 per milmil anime row).
- MAL adapter (separate follow-up; Trakt-only here).
- Trakt `scrobble/start|pause|stop` (real-time progress reporting) — use `sync/history` batched on push.

## Non-goals

- Replacing the existing outbox or scheduler architecture.
- Changing Bangumi / AniList push behavior.

## Architecture

### New package file: `api/internal/sync/providers/trakt.go`

```go
type Trakt struct {
    http     *http.Client
    baseURL  string
    clientID string // injected by NewService wiring; required in X-Trakt-API-Key
}

func NewTrakt(h *http.Client, baseURL, clientID string) *Trakt
func (p *Trakt) Name() ProviderName { return ProviderTrakt }
func (p *Trakt) Push(ctx, tok, op, ids) error
func (p *Trakt) FetchList(ctx, tok) ([]RemoteEntry, error)
func (p *Trakt) RefreshToken(ctx, creds, refresh) (RefreshedToken, error)

// Device-code flow methods (not on Provider interface):
func (p *Trakt) RequestDeviceCode(ctx) (DeviceCodeResponse, error)
func (p *Trakt) PollDeviceToken(ctx, deviceCode, clientSecret) (RefreshedToken, error)
```

Constants in `sync/types.go`:
```go
const ProviderTrakt ProviderName = "trakt"
```

Trakt API quirks:
- All requests require `X-Trakt-API-Key: <clientID>` plus optional `Authorization: Bearer <token>`.
- API base `https://api.trakt.tv`.
- 4xx / 5xx semantics same as other providers; 429 has `Retry-After`.
- `/sync/history` accepts `{episodes: [{ids: {trakt: id}}], shows: [{ids: {tmdb: id}, seasons: [{number, episodes: [{number}]}]}]}`. We use the `shows` variant for simplicity.

### Push implementation

```go
func (p *Trakt) Push(ctx, tok, op, ids) error {
    if ids.TMDB == 0 {
        return fmt.Errorf("trakt: no tmdb_id on anime")
    }
    // Caller (worker) is responsible for mapping ids.TMDB → trakt_show_id via
    // caching in anime.trakt_show_id. We take trakt show id via ids.Trakt
    // (add to ExternalIDs struct).
    if ids.Trakt == 0 {
        return fmt.Errorf("%w: no trakt_show_id cached", ErrNeedsResolve)
    }

    payload := map[string]any{
        "shows": []any{map[string]any{
            "ids": map[string]any{"trakt": ids.Trakt},
            "seasons": []any{map[string]any{
                "number": 1,
                "episodes": episodeNumbersUpTo(op.Progress),
            }},
        }},
    }
    return p.post(ctx, tok, "/sync/history", payload)
}
```

New `ErrNeedsResolve` sentinel in `sync/provider.go` so the worker knows to trigger TMDB→Trakt lookup.

### Worker changes — resolve trakt_show_id on demand

In `worker.go`'s processRow for Trakt: if push returns `ErrNeedsResolve`, call a helper:

```go
func (s *Service) resolveTraktShowID(ctx, anime *store.Anime) (int64, error) {
    if anime.TraktShowID.Valid { return anime.TraktShowID.Int64, nil }
    if !anime.TmdbID.Valid { return 0, errors.New("no tmdb_id") }

    trakt := s.providers[ProviderTrakt].(*providers.Trakt)
    id, err := trakt.SearchByTMDB(ctx, anime.TmdbID.Int64)
    if err != nil { return 0, err }

    // Cache for future pushes.
    _ = s.q.UpdateAnimeTraktShowID(ctx, store.UpdateAnimeTraktShowIDParams{
        ID: anime.ID,
        TraktShowID: sql.NullInt64{Int64: id, Valid: true},
    })
    return id, nil
}
```

`Trakt.SearchByTMDB(ctx, tmdbID)` hits `GET /search/tmdb/{tmdb_id}?type=show` and returns the first Trakt numeric id.

### OAuth device code flow

New file `api/internal/api/trakt_oauth_handler.go`:

```go
func (h *handler) handleTraktDeviceCode(c echo.Context) error {
    // Load client_id from settings.trakt_oauth
    trakt := h.syncSvc.TraktProvider() // exposes device code methods
    dc, err := trakt.RequestDeviceCode(ctx)
    if err != nil { return echo.ErrBadGateway }
    // Store device_code keyed by user for later polling.
    _ = h.queries.UpsertSetting(ctx, UpsertSettingParams{
        Key: "trakt_device_code_" + userID,
        Value: string(marshal({
            "device_code": dc.DeviceCode,
            "expires_at": time.Now().Add(dc.ExpiresIn * time.Second).UTC().Format(time.RFC3339),
        })),
    })
    return c.JSON(200, map[string]any{
        "user_code": dc.UserCode,
        "verification_url": dc.VerificationURL,
        "expires_in": dc.ExpiresIn,
        "poll_interval": dc.Interval,
    })
}

func (h *handler) handleTraktPoll(c echo.Context) error {
    // Read stored device_code for user, check not expired.
    // Call trakt.PollDeviceToken.
    // On success: store token like Bangumi/AniList, enqueue import.
    // On 400 pending: return 202 { status: "pending" }.
    // On expired: return 410 { status: "expired" }.
}
```

Route registration: `authGroup.POST("/oauth/trakt/device-code", ...)` and `.../poll`.

### DB migration

`000037_trakt_and_pull.up.sql`:

```sql
ALTER TABLE anime ADD COLUMN trakt_show_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_anime_trakt_show_id ON anime(trakt_show_id);

CREATE TABLE IF NOT EXISTS sync_provider_state (
    user_id        TEXT NOT NULL,
    provider       TEXT NOT NULL,
    pull_enabled   INTEGER NOT NULL DEFAULT 1,
    last_pulled_at TEXT,
    PRIMARY KEY (user_id, provider)
);
```

`.down.sql` reverses.

### New sqlc queries

In `anime.sql`:
```sql
-- name: UpdateAnimeTraktShowID :exec
UPDATE anime SET trakt_show_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: GetAnimeByTraktShowID :one
SELECT * FROM anime WHERE trakt_show_id = ? LIMIT 1;

-- name: GetAnimeByTMDBID :one
SELECT * FROM anime WHERE tmdb_id = ? LIMIT 1;
```

New `sync_state.sql`:
```sql
-- name: GetSyncProviderState :one
SELECT * FROM sync_provider_state WHERE user_id = ? AND provider = ? LIMIT 1;

-- name: UpsertSyncProviderState :exec
INSERT INTO sync_provider_state (user_id, provider, pull_enabled, last_pulled_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(user_id, provider) DO UPDATE SET
    pull_enabled = excluded.pull_enabled,
    last_pulled_at = excluded.last_pulled_at;

-- name: ListPullEnabledProviders :many
SELECT user_id, provider FROM sync_provider_state WHERE pull_enabled = 1;
```

### Pull logic — `api/internal/sync/pull.go` (new)

```go
type PullResult struct {
    Provider     ProviderName
    Checked      int
    UpdatedLocal int
    Skipped      int
    Errors       []string
}

func (s *Service) PullFromProvider(ctx context.Context, userID string, provider ProviderName) (PullResult, error) {
    res := PullResult{Provider: provider}
    prov, ok := s.providers[provider]
    if !ok { return res, fmt.Errorf("unknown provider") }
    access, _, err := s.tokens.Get(ctx, userID, provider)
    if err != nil { return res, err }

    entries, err := prov.FetchList(ctx, access)
    if err != nil { return res, err }
    res.Checked = len(entries)

    for _, e := range entries {
        animeID, ok := s.lookupAnimeByProviderID(ctx, provider, e.ProviderAnimeID)
        if !ok { res.Skipped++; continue }

        localCount, _ := s.q.CountCompletedWatchProgressByAnime(ctx, CountCompletedWatchProgressByAnimeParams{
            UserID: userID, AnimeID: animeID,
        })
        if e.Progress <= int(coerceInt64(localCount.CompletedCount)) {
            continue // max-wins: local ahead or equal, no-op
        }

        episodes, err := s.q.ListEpisodesByAnimeOrderedBySort(ctx, animeID)
        if err != nil { continue }
        updated := false
        for i := 0; i < e.Progress && i < len(episodes); i++ {
            _, _ = s.q.UpsertWatchProgress(ctx, UpsertWatchProgressParams{
                ID: uuid.NewString(),
                UserID: userID,
                EpisodeID: episodes[i].ID,
                Completed: 1,
                PositionSeconds: 0,
            })
            updated = true
        }
        if updated { res.UpdatedLocal++ }
    }

    now := time.Now().UTC().Format(time.RFC3339)
    _ = s.q.UpsertSyncProviderState(ctx, UpsertSyncProviderStateParams{
        UserID: userID, Provider: string(provider),
        PullEnabled: 1, LastPulledAt: sql.NullString{String: now, Valid: true},
    })

    if s.wsHub != nil {
        s.wsHub.Broadcast("sync:pulled", map[string]any{
            "provider": string(provider),
            "updated_count": res.UpdatedLocal,
        })
    }
    return res, nil
}
```

`lookupAnimeByProviderID` is already in `import.go` for AniList+Bangumi; extend to include Trakt:

```go
case ProviderTrakt:
    a, err := s.q.GetAnimeByTraktShowID(ctx, sqlNullInt(id))
    if err == nil { return a.ID, true }
    // Fallback: Trakt's FetchList includes show.tmdb_id; caller should pre-resolve to that
```

Trakt's `FetchList` should return `RemoteEntry.ProviderAnimeID = show.ids.tmdb` so resolver can fall back to TMDB lookup. Document this quirk.

### Scheduler job

New file `api/internal/worker/sync_pull_worker.go`:

```go
type SyncPullWorker struct{ svc *sync.Service; q *store.Queries }

func (w *SyncPullWorker) Run(ctx context.Context) {
    rows, err := w.q.ListPullEnabledProviders(ctx)
    if err != nil { slog.Warn("pull: list enabled", "err", err); return }
    for _, r := range rows {
        _, err := w.svc.PullFromProvider(ctx, r.UserID, sync.ProviderName(r.Provider))
        if err != nil { slog.Warn("pull: provider", "user", r.UserID, "provider", r.Provider, "err", err) }
    }
}
```

Register in `Scheduler.Start()`: 30-minute ticker, runs on boot.

### Frontend

- `web/src/lib/api/sync.ts` — add `pullNow(provider)` and `setPullEnabled(provider, enabled)` methods.
- `web/src/lib/api/trakt.ts` (new) — device code endpoints.
- `web/src/pages/settings/IntegrationsPanel.tsx`:
  - Third card for Trakt: Connect → opens modal showing `user_code` + link to verification URL; polling loop calls `/oauth/trakt/poll`.
  - All cards: "Pull now" button next to "Sync now"; `pull_enabled` toggle.
  - Status card displays `last_pulled_at` from `/sync/status` endpoint (extend existing endpoint).
- Use existing `sonner` for toast on pull success.

## Data flow

### Pull (30-min tick, manual button, or OAuth callback initial import)

```
worker:sync_pull (30m tick):
  rows := ListPullEnabledProviders()
  for each (user_id, provider):
    Service.PullFromProvider(user_id, provider)
      → provider.FetchList(token)
      → for each remote entry:
          local_anime := lookupAnimeByProviderID
          local_count := CountCompletedWatchProgressByAnime
          if remote.Progress > local_count:
            insert watch_progress rows for eps local_count..remote.Progress
      → UpsertSyncProviderState(last_pulled_at=now)
      → ws.Broadcast("sync:pulled", {...})
```

### Trakt push (via existing outbox)

```
PUT /watch-progress → Service.OnProgressUpdate (synchronous)
  → enqueue row per connected provider (including trakt if connected)
worker:sync_outbox_drain:
  processRow(trakt row):
    tokens.Get → access token
    anime := GetAnime(op.AnimeID)
    if anime.TmdbID.Valid==false → failRow (no mapping)
    if anime.TraktShowID.Valid==false:
      trakt_id := trakt.SearchByTMDB(anime.TmdbID.Int64)
      if not found → failRow
      UpdateAnimeTraktShowID(anime.ID, trakt_id)
      anime.TraktShowID = trakt_id
    ids := ExternalIDs{..., Trakt: anime.TraktShowID}
    provider.Push(access, op, ids)
      → POST /sync/history with shows[0].seasons[0].episodes[1..progress]
```

### Device code OAuth

```
User clicks "Connect Trakt":
  POST /api/v1/oauth/trakt/device-code
    → server: Trakt.RequestDeviceCode
    → store device_code in setting (TTL)
    → return {user_code, verification_url, poll_interval, expires_in}
  modal shows code + link; user clicks link, enters code on trakt.tv
  polling every poll_interval:
    POST /api/v1/oauth/trakt/poll
      pending → 202 retry
      approved → 200, server stores token, enqueues import
      expired → 410, user restarts
```

## Edge cases

| Case | Behavior |
|---|---|
| Trakt push with anime lacking TMDB | Fatal dead-letter; needs manual TMDB link. |
| Trakt push with TMDB but Trakt has no such show | `SearchByTMDB` returns empty → fatal dead-letter + `needs_reauth`-style event rename (actually: `sync:anime_unmapped`). |
| Pull returns anime user doesn't have | Skipped count increments; no insert. |
| Pull max-wins: local=7, remote=5 | No-op. |
| Pull max-wins: local=0, remote=12 | Insert 12 watch_progress rows. |
| `total_episodes=12` but episodes table has 10 rows (metadata incomplete) | Insert up to 10; log warn, skip 11-12. |
| Device code expires during user flow | Poll returns 410; frontend shows restart prompt. |
| User disconnects mid-pull | Worker's next tick sees no token, skips silently. |
| Trakt `season=1` assumption wrong (sequel/OVA) | Out of scope; document. Admin can manually link `trakt_show_id` or split the anime row per season. |
| Pull creates watch_progress for ep user has already watched recently | UpsertWatchProgress is idempotent on `UNIQUE(user_id, episode_id)`; last_watched_at updates. Acceptable. |
| Trakt rate limit 429 during pull | Log error, continue with next row; pull retries next tick. |
| `watch_status_override` set to "paused" | Pull never touches override; only inserts watch_progress. Downstream derivation respects. |

## Testing

**Trakt provider:**
- `trakt_test.go`:
  - `TestTrakt_PushPopulatesShowIDsAndEpisodes`
  - `TestTrakt_RefreshTokenSuccess`
  - `TestTrakt_RequestDeviceCode`
  - `TestTrakt_PollDeviceTokenPending` (400 "authorization_pending")
  - `TestTrakt_PollDeviceTokenSuccess`
  - `TestTrakt_PollDeviceTokenExpired` (410)
  - `TestTrakt_SearchByTMDB`
  - `TestTrakt_401WrapsErrNeedsReauth`
  - `TestTrakt_FetchListParsesWatched`

**Pull:**
- `pull_test.go`:
  - `TestPull_MaxWinsRemoteHigher`
  - `TestPull_MaxWinsLocalHigher` (no-op)
  - `TestPull_SkipsUnmappedAnime`
  - `TestPull_UpdatesLastPulledAt`
  - `TestPull_BroadcastsWSEvent`

**Worker:**
- `trakt_resolution_test.go`:
  - `TestWorker_TraktResolvesShowIDOnFirstPush`
  - `TestWorker_TraktCachedShowIDReusedOnSubsequent`
  - `TestWorker_TraktNoTMDBFatal`

**Integration:**
- End-to-end: device code → store token → initial import → watch_progress update → outbox enqueue → drain → Trakt mock receives `/sync/history` payload. 30-min scheduled pull reconciles.

## Rollout

1. Migration + sqlc queries (dormant).
2. Trakt provider + device code flow + OAuth handlers + settings key `trakt_oauth` with client_id+secret.
3. Worker trakt_show_id resolution + Push wiring.
4. `PullFromProvider` + scheduler job (dormant until pull_enabled toggle).
5. Frontend: Trakt card + Pull now + pull_enabled toggle.
6. Optional: Trakt API client credentials registered under milmil's own Trakt application (documented in README for users to configure their own if preferred).

## Open questions

- **Trakt app credentials provisioning**: do we ship a default milmil Trakt API client, or require users to create their own and paste credentials? Recommend ship default but allow override via `settings.trakt_oauth`.
- **Multi-season Trakt show**: out of scope; needs user-level decision on whether to add a `season` column to anime.
- **Pull frequency**: 30 min is initial guess; can tune to 15/60 later based on load.
