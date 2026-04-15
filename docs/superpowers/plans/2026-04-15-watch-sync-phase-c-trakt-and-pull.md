# Watch Sync Phase C — Trakt + Bidirectional Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Trakt as a third sync provider (device-code OAuth + TMDB→Trakt cache) and a 30-minute bidirectional pull job that applies max-wins conflict resolution across Bangumi, AniList, and Trakt.

**Architecture:** New `providers/trakt.go` implementing the existing `sync.Provider` interface, plus a Trakt-specific device-code OAuth handler and a `trakt_show_id` cache column on `anime`. Pull lives as `sync.Service.PullFromProvider` — fetches the remote list per provider and inserts missing `watch_progress` rows where remote progress exceeds local. Scheduler runs every 30 minutes across all `(user_id, provider)` rows where `pull_enabled = 1`.

**Tech Stack:** Go 1.24, SQLite + sqlc, existing outbox worker + Watch Sync Phase A/B infrastructure, React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-04-15-watch-sync-phase-c-trakt-and-pull-design.md`

---

## File Structure

Files to create:

- `api/migrations/000037_trakt_and_pull.up.sql`
- `api/migrations/000037_trakt_and_pull.down.sql`
- `api/internal/store/queries/sync_state.sql`
- `api/internal/sync/providers/trakt.go`
- `api/internal/sync/providers/trakt_test.go`
- `api/internal/sync/pull.go`
- `api/internal/sync/pull_test.go`
- `api/internal/worker/sync_pull_worker.go`
- `api/internal/api/trakt_oauth_handler.go`
- `api/internal/api/trakt_oauth_handler_test.go`
- `web/src/lib/api/trakt.ts`

Files to modify:

- `api/internal/store/queries/anime.sql` — add `UpdateAnimeTraktShowID`, `GetAnimeByTraktShowID`, `GetAnimeByTMDBID`
- `api/internal/sync/types.go` — add `ProviderTrakt`, `ErrNeedsResolve`
- `api/internal/sync/provider.go` — add `Trakt int64` to `ExternalIDs`
- `api/internal/sync/worker.go` — trakt_show_id resolve path before Push
- `api/internal/sync/service.go` — expose `TraktProvider()` accessor; pull lives in pull.go
- `api/internal/sync/worker.go` — `lookupAnimeByProviderID` extended with `ProviderTrakt` case
- `api/internal/worker/worker.go` — register `sync_pull` 30-min ticker
- `api/internal/api/router.go` — Trakt device code + poll routes; pull-now + pull-enabled routes
- `api/internal/api/sync_handler.go` — add last_pulled_at to status response; pull_enabled toggle
- `api/cmd/server/main.go` — construct Trakt provider, pass client_id to `NewTrakt`
- `web/src/lib/api/sync.ts` — add `pullNow`, `setPullEnabled`
- `web/src/pages/settings/IntegrationsPanel.tsx` — Trakt card with device code modal, Pull now button, pull_enabled toggle

---

## Task 1: Migration + sqlc queries

**Files:**
- Create: `api/migrations/000037_trakt_and_pull.up.sql`
- Create: `api/migrations/000037_trakt_and_pull.down.sql`
- Create: `api/internal/store/queries/sync_state.sql`
- Modify: `api/internal/store/queries/anime.sql`

- [ ] **Step 1: `000037_trakt_and_pull.up.sql`**

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

- [ ] **Step 2: `000037_trakt_and_pull.down.sql`**

```sql
DROP TABLE IF EXISTS sync_provider_state;
DROP INDEX IF EXISTS idx_anime_trakt_show_id;
ALTER TABLE anime DROP COLUMN trakt_show_id;
```

- [ ] **Step 3: Append to `anime.sql`**

```sql
-- name: UpdateAnimeTraktShowID :exec
UPDATE anime SET trakt_show_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: GetAnimeByTraktShowID :one
SELECT * FROM anime WHERE trakt_show_id = ? LIMIT 1;

-- name: GetAnimeByTMDBID :one
SELECT * FROM anime WHERE tmdb_id = ? LIMIT 1;
```

- [ ] **Step 4: Create `api/internal/store/queries/sync_state.sql`**

```sql
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
```

- [ ] **Step 5: Regenerate + build**

```bash
cd api && sqlc generate && go build ./...
```

Expected: clean. `Anime` gets `TraktShowID sql.NullInt64`. New `SyncProviderState` struct with `PullEnabled int64`, `LastPulledAt sql.NullString`.

- [ ] **Step 6: Commit**

```bash
git add api/migrations/000037_* api/internal/store/queries/ api/internal/store/
git commit -m "feat(db,store): add trakt_show_id, sync_provider_state, and queries"
```

---

## Task 2: Core types — ProviderTrakt, ErrNeedsResolve, ExternalIDs.Trakt

**Files:**
- Modify: `api/internal/sync/types.go`
- Modify: `api/internal/sync/provider.go`

- [ ] **Step 1: Add `ProviderTrakt` constant in `types.go`**

Find the existing const block with `ProviderBangumi` / `ProviderAniList` and add:

```go
const ProviderTrakt ProviderName = "trakt"
```

- [ ] **Step 2: Add `ErrNeedsResolve` + `Trakt` field in `provider.go`**

Append after the existing `ErrNeedsReauth` sentinel:

```go
// ErrNeedsResolve signals the worker that an external provider ID must be
// resolved (e.g., Trakt show id from TMDB) before the push can be retried.
var ErrNeedsResolve = errors.New("sync: needs id resolution")
```

Extend `ExternalIDs`:

```go
type ExternalIDs struct {
    AniDB             int64
    AniList           int64
    Bangumi           int64
    MAL               int64
    TMDB              int64
    Trakt             int64  // NEW
    BangumiEpisodeIDs []int64
}
```

- [ ] **Step 3: Build**

```bash
cd api && go build ./...
```

Clean.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/types.go api/internal/sync/provider.go
git commit -m "feat(sync): add ProviderTrakt, ErrNeedsResolve, Trakt external ID"
```

---

## Task 3: Trakt provider adapter

**Files:**
- Create: `api/internal/sync/providers/trakt.go`
- Create: `api/internal/sync/providers/trakt_test.go`

- [ ] **Step 1: Write the adapter**

```go
package providers

import (
    "bytes"
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "net/http"
    "strconv"
    "time"

    milmilsync "github.com/milmil/api/internal/sync"
)

const defaultTraktURL = "https://api.trakt.tv"

type Trakt struct {
    http         *http.Client
    baseURL      string
    clientID     string
    clientSecret string
}

func NewTrakt(h *http.Client, baseURL, clientID, clientSecret string) *Trakt {
    if h == nil { h = http.DefaultClient }
    if baseURL == "" { baseURL = defaultTraktURL }
    return &Trakt{http: h, baseURL: baseURL, clientID: clientID, clientSecret: clientSecret}
}

func (p *Trakt) Name() milmilsync.ProviderName { return milmilsync.ProviderTrakt }

func (p *Trakt) do(ctx context.Context, method, path, tok string, body []byte) (*http.Response, []byte, error) {
    req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, bytes.NewReader(body))
    if err != nil { return nil, nil, err }
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("trakt-api-version", "2")
    req.Header.Set("trakt-api-key", p.clientID)
    if tok != "" { req.Header.Set("Authorization", "Bearer "+tok) }
    resp, err := p.http.Do(req)
    if err != nil { return nil, nil, &milmilsync.TransientError{Err: err} }
    raw, _ := io.ReadAll(resp.Body)
    resp.Body.Close()
    return resp, raw, nil
}

func (p *Trakt) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
    if ids.TMDB == 0 {
        return errors.New("trakt: no tmdb_id on anime")
    }
    if ids.Trakt == 0 {
        return fmt.Errorf("%w: no trakt_show_id cached", milmilsync.ErrNeedsResolve)
    }
    episodes := make([]map[string]int, 0, op.Progress)
    for i := 1; i <= op.Progress; i++ {
        episodes = append(episodes, map[string]int{"number": i})
    }
    payload, _ := json.Marshal(map[string]any{
        "shows": []any{map[string]any{
            "ids":     map[string]any{"trakt": ids.Trakt},
            "seasons": []any{map[string]any{"number": 1, "episodes": episodes}},
        }},
    })
    resp, raw, err := p.do(ctx, http.MethodPost, "/sync/history", tok, payload)
    if err != nil { return err }
    return classifyTraktResponse(resp, raw, "push")
}

func (p *Trakt) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
    resp, raw, err := p.do(ctx, http.MethodGet, "/sync/watched/shows", tok, nil)
    if err != nil { return nil, err }
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("trakt watched: %d %s", resp.StatusCode, raw)
    }
    var out []struct {
        Show struct {
            IDs struct {
                Trakt int64 `json:"trakt"`
                TMDB  int64 `json:"tmdb"`
            } `json:"ids"`
        } `json:"show"`
        Plays     int    `json:"plays"`
        LastWatchedAt string `json:"last_watched_at"`
    }
    if err := json.Unmarshal(raw, &out); err != nil { return nil, err }
    entries := make([]milmilsync.RemoteEntry, 0, len(out))
    for _, o := range out {
        id := o.Show.IDs.TMDB
        if id == 0 { id = o.Show.IDs.Trakt }
        t, _ := time.Parse(time.RFC3339, o.LastWatchedAt)
        entries = append(entries, milmilsync.RemoteEntry{
            ProviderAnimeID: id,
            Status:          milmilsync.StatusWatching,
            Progress:        o.Plays,
            UpdatedAt:       t,
        })
    }
    return entries, nil
}

// SearchByTMDB looks up a Trakt show id by its TMDB id. Called from the
// worker on first push so we can cache trakt_show_id on the anime row.
func (p *Trakt) SearchByTMDB(ctx context.Context, tmdbID int64) (int64, error) {
    path := "/search/tmdb/" + strconv.FormatInt(tmdbID, 10) + "?type=show"
    resp, raw, err := p.do(ctx, http.MethodGet, path, "", nil)
    if err != nil { return 0, err }
    if resp.StatusCode != 200 {
        return 0, fmt.Errorf("trakt search: %d %s", resp.StatusCode, raw)
    }
    var hits []struct {
        Show struct {
            IDs struct {
                Trakt int64 `json:"trakt"`
            } `json:"ids"`
        } `json:"show"`
    }
    if err := json.Unmarshal(raw, &hits); err != nil { return 0, err }
    if len(hits) == 0 { return 0, errors.New("trakt: no show matches tmdb id") }
    return hits[0].Show.IDs.Trakt, nil
}

// RefreshToken matches the Phase B refresh pattern. Uses client_id + client_secret.
func (p *Trakt) RefreshToken(ctx context.Context, creds milmilsync.OAuthCreds, refreshToken string) (milmilsync.RefreshedToken, error) {
    body, _ := json.Marshal(map[string]string{
        "grant_type":    "refresh_token",
        "refresh_token": refreshToken,
        "client_id":     creds.ClientID,
        "client_secret": creds.ClientSecret,
        "redirect_uri":  "urn:ietf:wg:oauth:2.0:oob",
    })
    resp, raw, err := p.do(ctx, http.MethodPost, "/oauth/token", "", body)
    if err != nil { return milmilsync.RefreshedToken{}, err }
    switch {
    case resp.StatusCode == 200:
        var out struct {
            AccessToken  string `json:"access_token"`
            RefreshToken string `json:"refresh_token"`
            ExpiresIn    int64  `json:"expires_in"`
        }
        if err := json.Unmarshal(raw, &out); err != nil {
            return milmilsync.RefreshedToken{}, err
        }
        return milmilsync.RefreshedToken{
            AccessToken: out.AccessToken, RefreshToken: out.RefreshToken,
            ExpiresIn: time.Duration(out.ExpiresIn) * time.Second,
        }, nil
    case resp.StatusCode == 400, resp.StatusCode == 401, resp.StatusCode == 403:
        return milmilsync.RefreshedToken{}, fmt.Errorf("%w: trakt refresh %d", milmilsync.ErrNeedsReauth, resp.StatusCode)
    case resp.StatusCode >= 500:
        return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: fmt.Errorf("trakt refresh %d", resp.StatusCode)}
    default:
        return milmilsync.RefreshedToken{}, fmt.Errorf("trakt refresh %d: %s", resp.StatusCode, raw)
    }
}

type DeviceCodeResponse struct {
    DeviceCode      string `json:"device_code"`
    UserCode        string `json:"user_code"`
    VerificationURL string `json:"verification_url"`
    ExpiresIn       int    `json:"expires_in"`
    Interval        int    `json:"interval"`
}

func (p *Trakt) RequestDeviceCode(ctx context.Context) (DeviceCodeResponse, error) {
    body, _ := json.Marshal(map[string]string{"client_id": p.clientID})
    resp, raw, err := p.do(ctx, http.MethodPost, "/oauth/device/code", "", body)
    if err != nil { return DeviceCodeResponse{}, err }
    if resp.StatusCode != 200 {
        return DeviceCodeResponse{}, fmt.Errorf("trakt device_code: %d %s", resp.StatusCode, raw)
    }
    var out DeviceCodeResponse
    if err := json.Unmarshal(raw, &out); err != nil { return DeviceCodeResponse{}, err }
    return out, nil
}

type DevicePollStatus string

const (
    DevicePollPending  DevicePollStatus = "pending"
    DevicePollApproved DevicePollStatus = "approved"
    DevicePollExpired  DevicePollStatus = "expired"
    DevicePollDenied   DevicePollStatus = "denied"
)

type DevicePollResult struct {
    Status DevicePollStatus
    Token  milmilsync.RefreshedToken
}

func (p *Trakt) PollDeviceToken(ctx context.Context, deviceCode string) (DevicePollResult, error) {
    body, _ := json.Marshal(map[string]string{
        "code":          deviceCode,
        "client_id":     p.clientID,
        "client_secret": p.clientSecret,
    })
    resp, raw, err := p.do(ctx, http.MethodPost, "/oauth/device/token", "", body)
    if err != nil { return DevicePollResult{}, err }
    switch resp.StatusCode {
    case 200:
        var out struct {
            AccessToken  string `json:"access_token"`
            RefreshToken string `json:"refresh_token"`
            ExpiresIn    int64  `json:"expires_in"`
        }
        if err := json.Unmarshal(raw, &out); err != nil { return DevicePollResult{}, err }
        return DevicePollResult{
            Status: DevicePollApproved,
            Token: milmilsync.RefreshedToken{
                AccessToken: out.AccessToken, RefreshToken: out.RefreshToken,
                ExpiresIn: time.Duration(out.ExpiresIn) * time.Second,
            },
        }, nil
    case 400:
        return DevicePollResult{Status: DevicePollPending}, nil
    case 404:
        return DevicePollResult{Status: DevicePollDenied}, nil
    case 410:
        return DevicePollResult{Status: DevicePollExpired}, nil
    case 418:
        return DevicePollResult{Status: DevicePollDenied}, nil
    case 429:
        return DevicePollResult{}, &milmilsync.TransientError{Err: errors.New("trakt poll rate-limited"), RetryAfter: 5 * time.Second}
    default:
        return DevicePollResult{}, fmt.Errorf("trakt poll: %d %s", resp.StatusCode, raw)
    }
}

func classifyTraktResponse(resp *http.Response, raw []byte, what string) error {
    switch {
    case resp.StatusCode == 200 || resp.StatusCode == 201 || resp.StatusCode == 204:
        return nil
    case resp.StatusCode == 401 || resp.StatusCode == 403:
        return fmt.Errorf("%w: trakt %s %d", milmilsync.ErrNeedsReauth, what, resp.StatusCode)
    case resp.StatusCode == 429:
        retryAfter, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
        if retryAfter <= 0 { retryAfter = 30 }
        return &milmilsync.TransientError{Err: fmt.Errorf("trakt rate-limited"), RetryAfter: time.Duration(retryAfter) * time.Second}
    case resp.StatusCode >= 500:
        return &milmilsync.TransientError{Err: fmt.Errorf("trakt %s %d", what, resp.StatusCode)}
    default:
        return fmt.Errorf("trakt %s %d: %s", what, resp.StatusCode, raw)
    }
}
```

- [ ] **Step 2: Tests `trakt_test.go`**

Use `httptest.NewServer` + the pattern from `anilist_test.go` / `bangumi_test.go`. Cover:
- `TestTrakt_PushSendsHistoryPayload` (assert body includes `"trakt":<id>`, `"number":1..N`)
- `TestTrakt_PushNoTMDBFatal` (ids.TMDB=0 → error, not transient)
- `TestTrakt_PushNoTraktIDSignalsResolve` (ids.TMDB set, ids.Trakt=0 → `errors.Is(err, ErrNeedsResolve)`)
- `TestTrakt_Push401IsErrNeedsReauth`
- `TestTrakt_Push429HonorsRetryAfter`
- `TestTrakt_FetchListParsesWatched` (mock response with `plays` + `last_watched_at`)
- `TestTrakt_SearchByTMDB`
- `TestTrakt_RefreshTokenSuccess`
- `TestTrakt_RefreshInvalidGrantFatal`
- `TestTrakt_RequestDeviceCode`
- `TestTrakt_PollDevicePending` (400 → Pending status)
- `TestTrakt_PollDeviceApproved` (200 → token)
- `TestTrakt_PollDeviceExpired` (410 → Expired)

Run `cd api && go test -count=1 ./internal/sync/providers/ -run TestTrakt -v`. All pass.

- [ ] **Step 3: Commit**

```bash
git add api/internal/sync/providers/trakt.go api/internal/sync/providers/trakt_test.go
git commit -m "feat(sync): add Trakt provider adapter with device code flow"
```

---

## Task 4: Worker trakt_show_id resolve path

**Files:**
- Modify: `api/internal/sync/worker.go`
- Modify: `api/internal/sync/worker_test.go`

- [ ] **Step 1: Add resolve logic to processRow**

Find the block in `worker.go` that builds `ids := ExternalIDs{...}` before `prov.Push`. For Trakt specifically, we need to populate `ids.Trakt` from `anime.TraktShowID`; if missing, attempt a TMDB→Trakt lookup and save.

Update the block (right before `prov.Push(ctx, access, op, ids)`):

```go
ids := ExternalIDs{
    AniList: nullInt(anime.AnilistID),
    Bangumi: nullInt(anime.BangumiID),
    MAL:     nullInt(anime.MalID),
    TMDB:    nullInt(anime.TmdbID),
    AniDB:   nullInt(anime.AnidbID),
    Trakt:   nullInt(anime.TraktShowID),
    BangumiEpisodeIDs: epIDs,
}
```

(Assumes `anime.TraktShowID` sql.NullInt64.)

Then, in the per-provider dispatch, when provider is Trakt and `ids.Trakt == 0` but `ids.TMDB > 0`:

```go
if ProviderName(row.Provider) == ProviderTrakt && ids.Trakt == 0 && ids.TMDB != 0 {
    if trakt, ok := prov.(interface {
        SearchByTMDB(ctx context.Context, tmdbID int64) (int64, error)
    }); ok {
        if tid, err := trakt.SearchByTMDB(ctx, ids.TMDB); err == nil {
            ids.Trakt = tid
            _ = s.q.UpdateAnimeTraktShowID(ctx, store.UpdateAnimeTraktShowIDParams{
                TraktShowID: sql.NullInt64{Int64: tid, Valid: true},
                ID: row.AnimeID,
            })
        } else {
            s.failRow(ctx, row, "trakt: no show for tmdb_id: "+err.Error(), true)
            return 0
        }
    }
}
```

Place this right after the `ids := ExternalIDs{...}` block and before `Push`.

- [ ] **Step 2: Test**

Extend `worker_test.go`:

```go
func TestWorker_TraktResolvesShowIDOnFirstPush(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnimeWithTMDB(t, q, "a1", 42, 555) // bangumi=0, anilist=0, tmdb=555

    searchCalls := 0
    fp := &fakeProvider{
        name: ProviderTrakt,
        pushFn: func(access string) error { return nil },
        searchFn: func(tmdb int64) (int64, error) {
            searchCalls++
            return 99999, nil
        },
    }
    ts := &staticTS{access: "tok"}
    s := NewService(q, db, []Provider{fp}, ts, nil)

    _ = s.queue.Enqueue(context.Background(), "u", ProviderTrakt, "a1", SyncOp{Kind: KindProgress, Progress: 3})
    s.Drain(context.Background(), 10)

    if searchCalls != 1 { t.Errorf("expected 1 search, got %d", searchCalls) }
    anime, _ := q.GetAnime(context.Background(), "a1")
    if !anime.TraktShowID.Valid || anime.TraktShowID.Int64 != 99999 {
        t.Errorf("trakt_show_id not cached: %+v", anime.TraktShowID)
    }
}

func TestWorker_TraktCachedShowIDReusedOnSubsequent(t *testing.T) {
    // Insert anime with trakt_show_id already set; assert SearchByTMDB is NOT called.
    // ...
}
```

Extend `fakeProvider` in worker_test.go with `searchFn func(int64) (int64, error)` and a method `SearchByTMDB` that dispatches to it; this lets the type assertion in worker.go find the method.

Add helper `mustInsertAnimeWithTMDB(t, q, id, tmdb, ...)` to the shared harness.

Run tests. Commit.

```bash
git add api/internal/sync/worker.go api/internal/sync/worker_test.go api/internal/sync/testing_shared_test.go
git commit -m "feat(sync): resolve trakt_show_id from tmdb on first push"
```

---

## Task 5: Extend `lookupAnimeByProviderID` for Trakt

**Files:**
- Modify: `api/internal/sync/import.go` (or wherever lookupAnimeByProviderID lives)

- [ ] **Step 1: Add Trakt case**

Locate `lookupAnimeByProviderID` — it currently has cases for `ProviderAniList` and `ProviderBangumi`. Add:

```go
case ProviderTrakt:
    // Trakt's FetchList returns show.ids.tmdb as ProviderAnimeID.
    // Fall back to Trakt numeric id if TMDB lookup misses.
    if a, err := s.q.GetAnimeByTMDBID(ctx, sql.NullInt64{Int64: id, Valid: true}); err == nil {
        return a.ID, true
    }
    if a, err := s.q.GetAnimeByTraktShowID(ctx, sql.NullInt64{Int64: id, Valid: true}); err == nil {
        return a.ID, true
    }
```

- [ ] **Step 2: Build + commit**

```bash
cd api && go build ./...
git add api/internal/sync/import.go
git commit -m "feat(sync): resolve Trakt remote entries to local anime via tmdb"
```

---

## Task 6: PullFromProvider + scheduler worker

**Files:**
- Create: `api/internal/sync/pull.go`
- Create: `api/internal/sync/pull_test.go`
- Create: `api/internal/worker/sync_pull_worker.go`
- Modify: `api/internal/worker/worker.go`

- [ ] **Step 1: Implement `pull.go`**

```go
package sync

import (
    "context"
    "database/sql"
    "fmt"
    "time"

    "github.com/google/uuid"
    "github.com/milmil/api/internal/store"
)

type PullResult struct {
    Provider     ProviderName `json:"provider"`
    Checked      int          `json:"checked"`
    UpdatedLocal int          `json:"updated_local"`
    Skipped      int          `json:"skipped"`
    Errors       []string     `json:"errors"`
}

func (s *Service) PullFromProvider(ctx context.Context, userID string, provider ProviderName) (PullResult, error) {
    res := PullResult{Provider: provider}
    prov, ok := s.providers[provider]
    if !ok { return res, fmt.Errorf("unknown provider: %s", provider) }
    access, _, err := s.tokens.Get(ctx, userID, provider)
    if err != nil { return res, err }

    entries, err := prov.FetchList(ctx, access)
    if err != nil { return res, err }
    res.Checked = len(entries)

    for _, e := range entries {
        animeID, ok := s.lookupAnimeByProviderID(ctx, provider, e.ProviderAnimeID)
        if !ok { res.Skipped++; continue }

        localCount, _ := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
            UserID: userID, AnimeID: animeID,
        })
        localProgress := int(coerceInt64(localCount.CompletedCount))
        if e.Progress <= localProgress { continue }

        episodes, err := s.q.ListEpisodesByAnimeOrderedBySort(ctx, animeID)
        if err != nil {
            res.Errors = append(res.Errors, err.Error())
            continue
        }
        updated := false
        for i := 0; i < e.Progress && i < len(episodes); i++ {
            _, err := s.q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
                ID: uuid.NewString(),
                UserID: userID, EpisodeID: episodes[i].ID,
                Completed: 1, PositionSeconds: 0,
            })
            if err == nil { updated = true }
        }
        if updated { res.UpdatedLocal++ }
    }

    now := time.Now().UTC().Format(time.RFC3339)
    _ = s.q.UpsertSyncProviderState(ctx, store.UpsertSyncProviderStateParams{
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

- [ ] **Step 2: Tests `pull_test.go`**

Using the existing `staticTS`, `fakeProvider`, `spyHub`, and harness helpers:

```go
func TestPull_MaxWinsRemoteHigher(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)
    mustInsertEpisodes(t, q, "a1", 12, 0)
    mustMarkWatched(t, q, "u", "a1", 3)

    fp := &fakeProvider{
        name: ProviderAniList,
        fetched: []RemoteEntry{
            {ProviderAnimeID: 42, Status: StatusWatching, Progress: 7},
        },
    }
    ts := &staticTS{access: "tok"}
    hub := &spyHub{}
    s := NewService(q, db, []Provider{fp}, ts, hub)

    res, err := s.PullFromProvider(context.Background(), "u", ProviderAniList)
    if err != nil { t.Fatal(err) }
    if res.UpdatedLocal != 1 { t.Errorf("updated=%d want 1", res.UpdatedLocal) }

    counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(),
        store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a1"})
    if coerceInt64(counts.CompletedCount) != 7 {
        t.Errorf("completed=%d want 7", coerceInt64(counts.CompletedCount))
    }
    if len(hub.events) == 0 || hub.events[0].Type != "sync:pulled" {
        t.Errorf("expected sync:pulled broadcast, got %+v", hub.events)
    }
}

func TestPull_MaxWinsLocalAheadNoOp(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)
    mustInsertEpisodes(t, q, "a1", 12, 0)
    mustMarkWatched(t, q, "u", "a1", 10)

    fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
        {ProviderAnimeID: 42, Progress: 5},
    }}
    s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

    res, _ := s.PullFromProvider(context.Background(), "u", ProviderAniList)
    if res.UpdatedLocal != 0 { t.Errorf("should no-op, updated=%d", res.UpdatedLocal) }
}

func TestPull_SkipsUnknownAnime(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
        {ProviderAnimeID: 99999, Progress: 3},
    }}
    s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

    res, _ := s.PullFromProvider(context.Background(), "u", ProviderAniList)
    if res.Skipped != 1 { t.Errorf("skipped=%d want 1", res.Skipped) }
}

func TestPull_UpdatesLastPulledAt(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    fp := &fakeProvider{name: ProviderAniList}
    s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, &spyHub{})

    _, _ = s.PullFromProvider(context.Background(), "u", ProviderAniList)
    state, err := q.GetSyncProviderState(context.Background(), store.GetSyncProviderStateParams{
        UserID: "u", Provider: "anilist",
    })
    if err != nil { t.Fatal(err) }
    if !state.LastPulledAt.Valid || state.LastPulledAt.String == "" {
        t.Error("last_pulled_at not set")
    }
}
```

Run. Commit:

```bash
git add api/internal/sync/pull.go api/internal/sync/pull_test.go
git commit -m "feat(sync): add PullFromProvider with max-wins conflict resolution"
```

- [ ] **Step 3: Scheduler worker + register**

Create `api/internal/worker/sync_pull_worker.go`:

```go
package worker

import (
    "context"
    "log/slog"

    milmilsync "github.com/milmil/api/internal/sync"
    "github.com/milmil/api/internal/store"
)

type SyncPullWorker struct {
    svc *milmilsync.Service
    q   *store.Queries
}

func (w *SyncPullWorker) Run(ctx context.Context) {
    if w.svc == nil || w.q == nil { return }
    rows, err := w.q.ListPullEnabledProviders(ctx)
    if err != nil {
        slog.Warn("pull: list enabled", "err", err)
        return
    }
    for _, r := range rows {
        _, err := w.svc.PullFromProvider(ctx, r.UserID, milmilsync.ProviderName(r.Provider))
        if err != nil {
            slog.Warn("pull: provider", "user", r.UserID, "provider", r.Provider, "err", err)
        }
    }
}
```

In `worker.go`'s `Start()`, after `sync_outbox_gc`:

```go
go s.runTicker(ctx, "sync_pull", 30*time.Minute, true, func(ctx context.Context) {
    (&SyncPullWorker{svc: s.syncSvc, q: s.queries}).Run(ctx)
})
```

Build + commit:

```bash
cd api && go build ./... && go vet ./...
git add api/internal/worker/sync_pull_worker.go api/internal/worker/worker.go
git commit -m "feat(worker): register 30-minute sync_pull job"
```

---

## Task 7: Trakt OAuth handlers

**Files:**
- Create: `api/internal/api/trakt_oauth_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Write `trakt_oauth_handler.go`**

```go
package api

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"
    "time"

    "github.com/labstack/echo/v4"
    milmilsync "github.com/milmil/api/internal/sync"
    "github.com/milmil/api/internal/sync/providers"
    "github.com/milmil/api/internal/store"
)

func (h *handler) handleTraktDeviceCode(c echo.Context) error {
    ctx := c.Request().Context()
    userID := getUserID(c)

    prov, ok := h.syncSvc.ProviderByName(milmilsync.ProviderTrakt).(*providers.Trakt)
    if !ok { return echo.NewHTTPError(http.StatusServiceUnavailable, "trakt not configured") }

    dc, err := prov.RequestDeviceCode(ctx)
    if err != nil { return echo.ErrBadGateway }

    payload, _ := json.Marshal(map[string]any{
        "device_code": dc.DeviceCode,
        "expires_at":  time.Now().Add(time.Duration(dc.ExpiresIn) * time.Second).UTC().Format(time.RFC3339),
    })
    _, _ = h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
        Key: "trakt_device_code_" + userID, Value: string(payload),
    })

    return c.JSON(http.StatusOK, map[string]any{
        "user_code":        dc.UserCode,
        "verification_url": dc.VerificationURL,
        "expires_in":       dc.ExpiresIn,
        "poll_interval":    dc.Interval,
    })
}

func (h *handler) handleTraktPoll(c echo.Context) error {
    ctx := c.Request().Context()
    userID := getUserID(c)

    setting, err := h.queries.GetSetting(ctx, "trakt_device_code_"+userID)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return echo.NewHTTPError(http.StatusGone, "no device code; restart flow")
        }
        return echo.ErrInternalServerError
    }
    var stored struct {
        DeviceCode string `json:"device_code"`
        ExpiresAt  string `json:"expires_at"`
    }
    if err := json.Unmarshal([]byte(setting.Value), &stored); err != nil {
        return echo.ErrInternalServerError
    }
    if exp, err := time.Parse(time.RFC3339, stored.ExpiresAt); err == nil && time.Now().After(exp) {
        _ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
        return echo.NewHTTPError(http.StatusGone, "device code expired")
    }

    prov, ok := h.syncSvc.ProviderByName(milmilsync.ProviderTrakt).(*providers.Trakt)
    if !ok { return echo.NewHTTPError(http.StatusServiceUnavailable, "trakt not configured") }

    result, err := prov.PollDeviceToken(ctx, stored.DeviceCode)
    if err != nil { return echo.ErrBadGateway }
    switch result.Status {
    case providers.DevicePollPending:
        return c.JSON(http.StatusAccepted, map[string]string{"status": "pending"})
    case providers.DevicePollExpired:
        _ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
        return echo.NewHTTPError(http.StatusGone, "device code expired")
    case providers.DevicePollDenied:
        _ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
        return echo.NewHTTPError(http.StatusForbidden, "device code denied")
    case providers.DevicePollApproved:
        // Store token like other providers; enqueue import.
        tokenPayload, _ := json.Marshal(map[string]any{
            "access_token":  result.Token.AccessToken,
            "refresh_token": result.Token.RefreshToken,
            "expires_in":    int64(result.Token.ExpiresIn.Seconds()),
            "expires_at":    time.Now().Add(result.Token.ExpiresIn).UTC().Format(time.RFC3339),
        })
        _, _ = h.queries.UpsertSetting(ctx, store.UpsertSettingParams{
            Key: "trakt_token", Value: string(tokenPayload),
        })
        _ = h.queries.DeleteSetting(ctx, "trakt_device_code_"+userID)
        _ = h.syncSvc.EnqueueImport(ctx, userID, milmilsync.ProviderTrakt)
        return c.JSON(http.StatusOK, map[string]string{"status": "approved"})
    }
    return echo.ErrInternalServerError
}
```

Add `ProviderByName(name milmilsync.ProviderName) Provider` to `sync.Service` returning `nil` if absent. Keep it unexported from tests or just name it `Provider(name ProviderName) Provider`. Adapt call sites.

- [ ] **Step 2: Routes**

In `router.go`:

```go
authGroup.POST("/oauth/trakt/device-code", h.handleTraktDeviceCode)
authGroup.POST("/oauth/trakt/poll", h.handleTraktPoll)
```

Also add a Trakt disconnect endpoint mirroring Bangumi/AniList:

```go
authGroup.DELETE("/oauth/trakt/token", h.handleTraktDisconnect)
```

Implement `handleTraktDisconnect` in the same file as a small function mirroring `handleAniListDisconnect` (delete `trakt_token` setting + call `syncSvc.Disconnect`).

- [ ] **Step 3: Build + commit**

```bash
cd api && go build ./... && go vet ./...
git add api/internal/api/trakt_oauth_handler.go api/internal/api/router.go
git commit -m "feat(api): add Trakt device-code OAuth handlers"
```

---

## Task 8: Main wiring — construct Trakt, register provider

**Files:**
- Modify: `api/cmd/server/main.go`
- Modify: `api/internal/sync/service.go` (add `ProviderByName` accessor)

- [ ] **Step 1: Service accessor**

In `service.go`:

```go
// ProviderByName returns the registered provider or nil if absent.
func (s *Service) ProviderByName(name ProviderName) Provider {
    return s.providers[name]
}
```

- [ ] **Step 2: Main.go construction**

Near where Bangumi + AniList providers are built:

```go
// Load Trakt credentials from settings.trakt_oauth (JSON {client_id, client_secret}).
traktCreds := loadOAuthCredsOnBoot(database, "trakt_oauth") // helper — see Phase A pattern
traktProvider := providers.NewTrakt(httpClient, "", traktCreds.ClientID, traktCreds.ClientSecret)
```

Update the `NewService` call to include Trakt:

```go
syncSvc := milmilsync.NewService(queries, database,
    []milmilsync.Provider{alProvider, bgmProvider, traktProvider},
    tokenStore,
    wsHubAdapter{hub: wsHub},
)
```

If no `trakt_oauth` setting configured, `NewTrakt("", "", "")` still works — `clientID` stays empty and any API call returns 401 from Trakt; the device code endpoint surfaces a clean error. Document: admin can POST `/settings/trakt_oauth` with credentials (reuse existing OAuth creds UI if present; otherwise document API-only for Phase C).

- [ ] **Step 3: Build**

```bash
cd api && go build ./... && go vet ./...
```

Clean.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/service.go api/cmd/server/main.go
git commit -m "feat(server): construct and register Trakt provider in sync service"
```

---

## Task 9: Frontend — Trakt card + pull controls

**Files:**
- Create: `web/src/lib/api/trakt.ts`
- Modify: `web/src/lib/api/sync.ts`
- Modify: `web/src/pages/settings/IntegrationsPanel.tsx`

- [ ] **Step 1: Trakt API client**

```ts
// web/src/lib/api/trakt.ts
import { api } from "@/lib/api-client";

export interface DeviceCodeResponse {
  user_code: string;
  verification_url: string;
  expires_in: number;
  poll_interval: number;
}

export const traktApi = {
  requestDeviceCode: () =>
    api.post<DeviceCodeResponse>("/api/v1/oauth/trakt/device-code", {}),
  pollDeviceCode: () =>
    api.post<{ status: "pending" | "approved" | "expired" | "denied" }>(
      "/api/v1/oauth/trakt/poll", {}
    ),
  disconnect: () => api.delete<void>("/api/v1/oauth/trakt/token"),
};
```

- [ ] **Step 2: Extend `sync.ts`**

Add methods + types:

```ts
export type SyncProvider = "anilist" | "bangumi" | "trakt"; // Trakt added

export const syncApi = {
  // ...existing...
  pullNow: (provider: SyncProvider) =>
    api.post<PullResult>(`/api/v1/sync/${provider}/pull`, {}),
  setPullEnabled: (provider: SyncProvider, enabled: boolean) =>
    api.post<void>(`/api/v1/sync/${provider}/pull-enabled`, { enabled }),
};

export interface PullResult {
  provider: string;
  checked: number;
  updated_local: number;
  skipped: number;
  errors: string[];
}
```

Back end also needs the routes — add to `sync_handler.go`:

```go
authGroup.POST("/sync/:provider/pull", h.handleSyncPullNow)
authGroup.POST("/sync/:provider/pull-enabled", h.handleSyncSetPullEnabled)
```

Implementations call `h.syncSvc.PullFromProvider` and `h.queries.SetPullEnabled`. 5-line handlers.

- [ ] **Step 3: Trakt card in `IntegrationsPanel.tsx`**

Add a third card following the existing `OAuthProviderCard` pattern. Device code flow:

```tsx
function TraktCard({ status }: { status: SyncProviderStatus }) {
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const qc = useQueryClient();

  const start = useMutation({
    mutationFn: () => traktApi.requestDeviceCode(),
    onSuccess: (dc) => setDeviceCode(dc),
  });

  useEffect(() => {
    if (!deviceCode) return;
    const timer = setInterval(async () => {
      try {
        const res = await traktApi.pollDeviceCode();
        if (res.status === "approved") {
          clearInterval(timer);
          setDeviceCode(null);
          qc.invalidateQueries({ queryKey: syncKeys.status() });
        } else if (res.status === "expired" || res.status === "denied") {
          clearInterval(timer);
          setDeviceCode(null);
          setPollingError(res.status);
        }
      } catch (e) {
        setPollingError(String(e));
      }
    }, (deviceCode.poll_interval ?? 5) * 1000);
    return () => clearInterval(timer);
  }, [deviceCode]);

  if (deviceCode) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-4">
        <p className="text-sm text-white/80">
          Open <a href={deviceCode.verification_url} target="_blank" rel="noreferrer">{deviceCode.verification_url}</a>
          {" "}and enter code:
        </p>
        <div className="mt-2 font-mono text-2xl text-white">{deviceCode.user_code}</div>
        {pollingError && <div className="text-xs text-red-400 mt-2">{pollingError}</div>}
      </div>
    );
  }

  // Otherwise show standard card with Connect button that calls start.mutate().
  // ...existing pattern from Bangumi/AniList cards but Connect triggers device flow.
}
```

Also add to each existing provider card: `pull_enabled` toggle + "Pull now" button.

- [ ] **Step 4: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api/ web/src/pages/settings/IntegrationsPanel.tsx \
        api/internal/api/sync_handler.go api/internal/api/router.go
git commit -m "feat(web,api): Trakt device code UI + pull-now + pull-enabled controls"
```

---

## Task 10: Full validation

- [ ] **Step 1: Backend**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/sync/... ./internal/api/... ./internal/worker/...
```

All green. Pre-existing baseline failures (if any) unchanged.

- [ ] **Step 2: Frontend**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

- [ ] **Step 3: Manual E2E**

1. Configure Trakt app credentials: `settings.trakt_oauth = {"client_id":"...","client_secret":"..."}`.
2. Restart server.
3. Open Integrations panel → Trakt card → Connect → see code + URL → open URL, enter code → card shows connected within 5s.
4. Watch an episode → sync_outbox row created for Trakt → worker resolves `trakt_show_id` → pushes to `/sync/history`.
5. Wait 30 min (or trigger manually via Pull now) → PullFromProvider fetches user's Trakt watched list → max-wins reconciles.
6. Toggle `pull_enabled` off → next tick skips that provider.

- [ ] **Step 4: PR**

```bash
gh pr create --title "feat: watch sync Phase C (Trakt + bidirectional pull)" --body-file -
```

---

## Self-review notes

- **Spec coverage:** Trakt provider ✓, device code flow ✓, trakt_show_id cache ✓, `lookupAnimeByProviderID` Trakt case ✓, PullFromProvider max-wins ✓, scheduler 30-min ✓, pull_enabled toggle ✓, manual Pull now ✓, ws broadcast ✓.
- **Scope:** Phase C only. MAL, webhook, multi-season Trakt deferred.
- **Concurrency:** PullFromProvider runs per-user; two concurrent pulls on the same user is unlikely (30-min gap) but UpsertWatchProgress is idempotent anyway.
- **Known follow-ups:** MAL adapter; Trakt multi-season; conflict-resolution UI for unusual cases.
