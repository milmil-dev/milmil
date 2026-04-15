# Watch Sync Phase B — OAuth Token Refresh

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Depends on:** Watch Sync Phase A (merged to main)
**Follow-ups:** Trakt/MAL adapters, bidirectional pull sync, token-expiry UI warnings — separate specs

## Goals

Keep AniList and Bangumi connections alive past their OAuth access-token lifetime. When a worker push returns 401, use the stored `refresh_token` to mint a new access token, persist it, and retry the push once. If refresh itself fails, mark the row dead-letter and fire a `sync:needs_reauth` ws event so the UI can prompt the user to reconnect.

### In scope

- New `Provider.RefreshToken(ctx, creds, refreshToken)` method on the sync Provider interface.
- AniList and Bangumi adapters implement `RefreshToken` against their respective OAuth endpoints.
- New `TokenStore` interface replacing the read-only `TokenLoader`. Backed by the existing `store.Queries` settings table.
- Worker refresh-on-401 loop: single retry after a successful refresh; dead-letter on second 401 or refresh failure.
- Sentinel error `ErrNeedsReauth` distinguished from generic fatal errors so the worker can act on it.
- `sync:needs_reauth` ws event broadcast when the user must reconnect.

### Out of scope (deferred)

- Proactive refresh before expiry (the "A" vs "B" in brainstorming — we chose reactive-only).
- Trakt, MAL, Simkl adapters.
- Bidirectional pull sync.
- UI "token expires in N days" warning card.
- Refresh throttling (if two rows for the same user hit 401 simultaneously, both will trigger refresh; last-write-wins at the settings row is acceptable).

## Non-goals

- Changing how OAuth callbacks exchange the initial code for a token.
- Changing how the UI prompts for initial connection.
- Changing the outbox queue, Drain flow, or scheduler.

## Background

Phase A stores the raw token-exchange JSON response under `settings.bangumi_token` / `settings.anilist_token`. Both providers include `access_token`, `refresh_token`, and `expires_in`. Phase A's `TokenLoader` reads only `access_token` and ignores the refresh side. On 401 today the worker marks the row dead-letter and users must manually reconnect.

## Architecture

### Provider interface additions (`api/internal/sync/provider.go`)

```go
type Provider interface {
    Name() ProviderName
    Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error
    FetchList(ctx context.Context, tok string) ([]RemoteEntry, error)
    // NEW
    RefreshToken(ctx context.Context, creds OAuthCreds, refreshToken string) (RefreshedToken, error)
}

type OAuthCreds struct {
    ClientID     string
    ClientSecret string
}

type RefreshedToken struct {
    AccessToken  string
    RefreshToken string         // if empty, reuse the caller's current refresh token
    ExpiresIn    time.Duration  // 0 = unknown (treat as opaque for persistence)
}

// ErrNeedsReauth is returned by providers on 401/403 where a refresh is
// possible but also failed, OR there is no refresh token to use. Workers
// recognize this via errors.Is and mark the row dead-letter + broadcast
// sync:needs_reauth.
var ErrNeedsReauth = errors.New("sync: needs reauth")
```

### TokenStore interface (replaces `TokenLoader`)

```go
type TokenStore interface {
    // Get returns (access, refresh, err). If no connection, returns ErrNoToken.
    Get(ctx context.Context, userID string, p ProviderName) (access, refresh string, err error)
    // Put persists a refreshed token. expiresAt may be zero if unknown.
    Put(ctx context.Context, userID string, p ProviderName, access, refresh string, expiresAt time.Time) error
    // LoadCreds returns the configured OAuth client id/secret for the provider.
    LoadCreds(ctx context.Context, p ProviderName) (OAuthCreds, error)
}
```

Concrete implementation in `api/internal/sync/tokenstore.go` (new) — backed by `store.Queries` reading/writing the existing `settings` table keys (`bangumi_token`, `anilist_token`, `bangumi_oauth`, `anilist_oauth`). The token JSON blob is augmented with an `expires_at` ISO-8601 field so callers can read it back.

### Service wiring

`sync.NewService` changes:

```go
// Before:
func NewService(q *store.Queries, db *sql.DB, providers []Provider, loadToken TokenLoader) *Service

// After:
func NewService(q *store.Queries, db *sql.DB, providers []Provider, tokens TokenStore) *Service
```

Internally, the service's `OnProgressUpdate` and `FlushUser` use `tokens.Get` the same way they used `loadToken` today. The worker uses `tokens.Put` and `tokens.LoadCreds` for the refresh cycle.

### Worker refresh-on-401 flow

```
processRow(row):
    access, refresh, err := s.tokens.Get(ctx, user, provider)
    if err: failRow("no token", true); broadcast needsReauth; return

    err = provider.Push(ctx, access, op, ids)
    if err == nil: completeRow; return

    if errors.Is(err, ErrNeedsReauth) and refresh != "":
        creds, credsErr := s.tokens.LoadCreds(ctx, provider)
        if credsErr: failRow("no creds", true); broadcast needsReauth; return
        new, rErr := provider.RefreshToken(ctx, creds, refresh)
        if rErr != nil:
            if IsTransient(rErr): s.retryRow(row, te); return
            failRow("refresh failed: "+rErr, true)
            broadcast needsReauth; return
        newRefresh := new.RefreshToken; if newRefresh == "": newRefresh = refresh
        expiresAt := time.Now().Add(new.ExpiresIn)
        _ = s.tokens.Put(ctx, user, provider, new.AccessToken, newRefresh, expiresAt)
        err = provider.Push(ctx, new.AccessToken, op, ids)  // retry once
        if err == nil: completeRow; return
        // Second 401 → dead-letter.
        if errors.Is(err, ErrNeedsReauth):
            failRow("refresh succeeded but retry 401", true); broadcast needsReauth; return
        // Fall through to normal error handling below (transient vs fatal).

    if te, ok := IsTransient(err); ok: s.retryRow(row, te); return
    failRow(err.Error(), false)
```

Provider adapters switch to returning `fmt.Errorf("%w: ...", ErrNeedsReauth)` for 401/403 instead of plain `fmt.Errorf`.

### Provider endpoints

**AniList** (`providers/anilist.go`): `POST https://anilist.co/api/v2/oauth/token` with `grant_type=refresh_token`, `refresh_token=...`, `client_id=...`, `client_secret=...`. Response: `{ "access_token": "...", "refresh_token": "...", "expires_in": 31536000 }`.

**Bangumi** (`providers/bangumi.go`): `POST https://bgm.tv/oauth/access_token` with form fields `grant_type=refresh_token`, `client_id=...`, `client_secret=...`, `refresh_token=...`, `redirect_uri=<must match the one used at auth>`. Response: similar JSON shape. Bangumi rotates `refresh_token` on each refresh; AniList typically reuses.

### ws event

When the worker decides the user must reconnect, broadcast:

```go
hub.Broadcast(ws.Event{
    Type: "sync:needs_reauth",
    Payload: map[string]any{
        "user_id":  row.UserID,
        "provider": row.Provider,
    },
})
```

Frontend listens and shows a toast + badge on the Integrations card. UI treatment is a small addition to the existing `IntegrationsPanel.tsx`; no new page.

## Data flow

```
Outbox row ready
  ↓
TokenStore.Get → (access, refresh)
  ↓
Provider.Push(access) → 401/ErrNeedsReauth
  ↓
TokenStore.LoadCreds → OAuthCreds
  ↓
Provider.RefreshToken(creds, refresh) → RefreshedToken
  ↓
TokenStore.Put(new access, new refresh, expires_at)
  ↓
Provider.Push(new access) → success
  ↓
MarkSyncOpCompleted
```

## Edge cases

| Case | Behavior |
|---|---|
| No refresh token in storage | Fail-fast: dead-letter + needs_reauth (user connected before refresh was supported). |
| Refresh endpoint returns 400 ("invalid_grant" = refresh token revoked) | Fatal: dead-letter + needs_reauth. |
| Refresh endpoint returns 5xx | Transient: retry the original row next tick (no permanent damage — token still valid for now). |
| Refresh endpoint returns new refresh_token | Persist it; replaces the stored one. |
| Refresh endpoint returns empty refresh_token (AniList sometimes) | Keep the existing refresh_token unchanged. |
| Two concurrent rows for same user both hit 401 | Both fire refresh; last-write-wins on `settings.anilist_token`. Both get retried with their respective new tokens. A few µs of wasted work, harmless. |
| `expires_in` is 0 or missing | Store `expires_at = time.Time{}` (zero). Since we do reactive-only refresh, the expires_at field is informational. |
| Worker crash between Put and retry Push | Outbox row is still active; next tick re-reads the now-fresh token and re-pushes. Idempotent. |
| User manually disconnects during refresh | `tokens.Put` succeeds, but the next Push may still see the user's `needs_reauth` state elsewhere. Acceptable — worker will soon exhaust and dead-letter. |

## Testing

### Provider unit tests

`providers/anilist_test.go` and `providers/bangumi_test.go`:

- `TestRefreshToken_Success` — 200 response populates `RefreshedToken`.
- `TestRefreshToken_InvalidGrantFatal` — 400 → fatal error wrapping `ErrNeedsReauth`.
- `TestRefreshToken_5xxTransient` — 500 → TransientError.
- `TestRefreshToken_Bangumi_NewRefreshRotated` — verifies the new refresh_token is captured.
- `TestPushReturnsErrNeedsReauthOn401` — regression test: 401 is now wrapped with `ErrNeedsReauth`.

### Service/worker tests

`worker_test.go` additions:

- `TestWorkerRefreshOn401ThenRetrySucceeds`: stub provider returns 401 on first Push, then 200 on retry; stub TokenStore tracks Put calls; assert row is completed and Put was called once with new token.
- `TestWorkerRefreshFailureDeadLetters`: stub provider 401 Push → RefreshToken returns invalid_grant; assert dead-letter + `sync:needs_reauth` ws broadcast.
- `TestWorkerNoRefreshTokenDeadLetters`: TokenStore.Get returns empty refresh; assert immediate dead-letter, no RefreshToken call.
- `TestWorkerRefreshTransientRetries`: RefreshToken returns transient; row is deferred, not dead-lettered.

### TokenStore test

`tokenstore_test.go` (new) — Get/Put round-trip with real sqlite, LoadCreds reads `*_oauth` setting key format.

## Migration / compatibility

No DB migrations. The existing `settings` table keys are reused; we only extend the JSON payload with `expires_at`. Readers that ignore unknown fields (all current code) remain backward compatible. On first refresh after this ships, the new field is populated.

Removing `TokenLoader` is a breaking change within the `sync` package. Callers:
- `api/cmd/server/main.go` — one call site that constructs a closure today. Replace with a `TokenStore` implementation literal or a new `syncstore.FromQueries(q)` helper.
- Tests — each test that uses `staticTokenLoader()` needs a `staticTokenStore(access, refresh)` helper. Lives in the shared test harness.

## Rollout

1. Ship TokenStore interface + SQLite implementation + tests (dormant until used).
2. Ship provider `RefreshToken` + sentinel error + 401 wrapping (dormant until worker uses it).
3. Switch service constructor from `TokenLoader` to `TokenStore`; update main.go and tests. Ship.
4. Add worker refresh-on-401 loop. Ship.
5. Ship ws broadcast + frontend toast for `sync:needs_reauth`.

Each stage is independently revertable.

## Open questions

- **Refresh throttling.** Phase B does nothing to prevent concurrent refresh storms. If this proves problematic in production (unlikely at our scale), add a short-lived in-memory lock per (user, provider). Defer to Phase B.5.
- **Proactive expiry check.** If users report frequent `needs_reauth` events despite refresh being enabled (i.e., the refresh token itself expired because it wasn't used for a while), revisit. Bangumi refresh tokens are long-lived; AniList's behavior is not well documented but anecdotally stable for >1 year.
