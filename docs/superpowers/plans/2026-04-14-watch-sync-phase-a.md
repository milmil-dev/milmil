# Watch State Sync — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-push every watch-progress update to connected Bangumi and AniList accounts via a durable outbox queue with retry, correct status derivation, per-anime opt-out, and a one-shot import on first connect.

**Architecture:** Introduce `api/internal/sync/` as a provider-agnostic package: an `sync_outbox` queue populated by the watch-progress handler, drained by a scheduler worker that calls per-provider adapters (Bangumi REST, AniList GraphQL). Status derives from watch_progress plus an optional per-anime override; rate limits and transient failures are handled by exponential backoff per row. One-shot import on OAuth callback populates milmil state from the remote list, never overwriting existing entries.

**Tech Stack:** Go 1.24, SQLite + sqlc, existing OAuth plumbing at `api/internal/api/oauth_handler.go`, `log/slog`, `net/http`, existing `cache.Cache` and `ws.Hub`. Frontend: React 19 + TanStack Query + Zustand.

**Spec:** `docs/superpowers/specs/2026-04-14-watch-sync-phase-a-design.md`

**Depends on:** AniDB Phase 1 branch `feature/anidb-phase1` merged (Phase 1 enriches `anilist_id` so sync can target the right remote entry). Migration numbers below assume Phase 1's `000032` has landed.

**Revised 2026-04-15 after eng review.** Critical changes from v1:
- **A1 fix:** `OnProgressUpdate` is called synchronously (not in a goroutine) so a crash between DB write and enqueue can't lose sync ops.
- **A2 fix:** `Queue.Enqueue` wraps supersede + insert in a SQLite `BEGIN IMMEDIATE` transaction; added concurrency test.
- **A3 fix:** `Drain` groups ready rows by (user_id, provider) and applies 429/Retry-After to the whole group at once.
- **A4 decision:** Token refresh for AniList/Bangumi deferred to Phase B; expired tokens surface as `sync:needs_reauth` ws event and the user reconnects manually.
- **A5 fix:** `FlushUser` only enqueues animes with `CountCompletedWatchProgressByAnime > 0` so we never push planning-only state that could overwrite a remote user's existing list.
- **A6 fix:** `SyncDrainWorker.Run` uses `sync.Mutex` to prevent overlapping drains; `batchSize = 10` to fit within the 10s tick window at AniList's 90/min rate limit.
- **C4 fix:** corrected SQL for `ListBangumiEpisodeIDsForAnimeWatchedByUser`.
- **Tests:** added Task 0.5 (document test harness) and Task 10.5 (full integration test with two httptest servers + latency assertion + concurrency race test).

---

## File Structure

Files to create:

- `api/migrations/000033_create_sync_outbox.{up,down}.sql`
- `api/migrations/000034_anime_sync_flags.{up,down}.sql`
- `api/internal/store/queries/sync_outbox.sql`
- `api/internal/sync/types.go` — `SyncOp`, `Kind`, `ProviderName` constants
- `api/internal/sync/status.go` — `DeriveStatus`
- `api/internal/sync/queue.go` — `Enqueue`, `CoalesceProgress`
- `api/internal/sync/provider.go` — `Provider` interface + token helpers
- `api/internal/sync/service.go` — facade: `OnProgressUpdate`, `FlushUser`, `Disconnect`
- `api/internal/sync/worker.go` — `Drain(ctx)`, backoff math
- `api/internal/sync/import.go` — `ImportFromProvider`
- `api/internal/sync/providers/bangumi.go`
- `api/internal/sync/providers/bangumi_test.go`
- `api/internal/sync/providers/anilist.go`
- `api/internal/sync/providers/anilist_test.go`
- `api/internal/sync/queue_test.go`
- `api/internal/sync/status_test.go`
- `api/internal/sync/worker_test.go`
- `api/internal/sync/import_test.go`
- `api/internal/api/sync_handler.go` — new `GET /api/v1/sync/status`
- `web/src/lib/api/sync.ts`
- `web/src/pages/settings/IntegrationsPage.tsx`

Files to modify:

- `api/internal/worker/worker.go` — register `sync_outbox_drain` + `sync_outbox_gc` tickers
- `api/internal/worker/sync_worker.go` (new) — thin wrapper calling `sync.Service.Drain`
- `api/internal/api/progress_handler.go` — call `sync.Service.OnProgressUpdate` after DB write
- `api/internal/api/oauth_handler.go` — replace manual sync body with enqueue; enqueue import on callback; mark pending rows on disconnect
- `api/internal/api/anime_handler.go` — expose `sync_disabled` and `watch_status_override`; accept updates
- `api/cmd/server/main.go` — construct `sync.Service` and inject into progress/oauth/sync handlers + scheduler
- `web/src/lib/api/anime.ts` — extend types with new fields
- `web/src/pages/AnimeDetailPage.tsx` — add "Exclude from tracker sync" toggle

---

## Task 1: Create `sync_outbox` table + `anime` sync flag migrations

**Files:**
- Create: `api/migrations/000033_create_sync_outbox.up.sql`
- Create: `api/migrations/000033_create_sync_outbox.down.sql`
- Create: `api/migrations/000034_anime_sync_flags.up.sql`
- Create: `api/migrations/000034_anime_sync_flags.down.sql`

- [ ] **Step 1: Write `000033_create_sync_outbox.up.sql`**

```sql
CREATE TABLE IF NOT EXISTS sync_outbox (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    provider        TEXT NOT NULL,
    anime_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    completed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_ready
    ON sync_outbox(next_attempt_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sync_outbox_user_provider
    ON sync_outbox(user_id, provider, completed_at);
```

- [ ] **Step 2: Write `000033_create_sync_outbox.down.sql`**

```sql
DROP INDEX IF EXISTS idx_sync_outbox_user_provider;
DROP INDEX IF EXISTS idx_sync_outbox_ready;
DROP TABLE IF EXISTS sync_outbox;
```

- [ ] **Step 3: Write `000034_anime_sync_flags.up.sql`**

```sql
ALTER TABLE anime ADD COLUMN sync_disabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE anime ADD COLUMN watch_status_override TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 4: Write `000034_anime_sync_flags.down.sql`**

```sql
ALTER TABLE anime DROP COLUMN watch_status_override;
ALTER TABLE anime DROP COLUMN sync_disabled;
```

- [ ] **Step 5: Apply migrations up + down to a scratch DB**

```bash
cd api && go run ./cmd/migrate up && go run ./cmd/migrate down 2 && go run ./cmd/migrate up
```

Expected: no errors; `sync_outbox` exists; `anime.sync_disabled` and `anime.watch_status_override` columns present.

- [ ] **Step 6: Regenerate sqlc models**

```bash
cd api && sqlc generate && go build ./...
```

Expected: `Anime` struct gains `SyncDisabled int64` and `WatchStatusOverride string`.

- [ ] **Step 7: Commit**

```bash
git add api/migrations/ api/internal/store/models.go
git commit -m "feat(db): add sync_outbox table and anime sync flags"
```

---

## Task 2: Sqlc queries for `sync_outbox` + anime flag updates

**Files:**
- Create: `api/internal/store/queries/sync_outbox.sql`
- Modify: `api/internal/store/queries/anime.sql`

- [ ] **Step 1: Create `sync_outbox.sql`**

```sql
-- name: EnqueueSyncOp :exec
INSERT INTO sync_outbox (id, user_id, provider, anime_id, kind, payload, next_attempt_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- name: ListReadySyncOps :many
SELECT * FROM sync_outbox
WHERE completed_at IS NULL AND next_attempt_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
ORDER BY next_attempt_at ASC
LIMIT ?;

-- name: MarkSyncOpCompleted :exec
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: RescheduleSyncOp :exec
UPDATE sync_outbox
SET attempts = ?, next_attempt_at = ?, last_error = ?
WHERE id = ?;

-- name: CountPendingSyncOpsByUserProvider :one
SELECT COUNT(*) FROM sync_outbox
WHERE user_id = ? AND provider = ? AND completed_at IS NULL;

-- name: ListRecentSyncErrors :many
SELECT * FROM sync_outbox
WHERE user_id = ? AND provider = ? AND last_error IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- name: DeleteCompletedSyncOpsOlderThan :exec
DELETE FROM sync_outbox WHERE completed_at IS NOT NULL AND completed_at < ?;

-- name: MarkUserProviderOpsFailed :exec
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_error = ?
WHERE user_id = ? AND provider = ? AND completed_at IS NULL;

-- name: SupersedeProgressOps :exec
-- Mark older 'progress' rows for the same (user, provider, anime) as completed
-- so the worker only processes the latest. Called at Enqueue time.
UPDATE sync_outbox
SET completed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), last_error = 'superseded'
WHERE user_id = ? AND provider = ? AND anime_id = ? AND kind = 'progress' AND completed_at IS NULL;

-- name: GetLatestCompletedSyncOp :one
SELECT * FROM sync_outbox
WHERE user_id = ? AND provider = ? AND completed_at IS NOT NULL AND last_error IS NULL
ORDER BY completed_at DESC LIMIT 1;
```

- [ ] **Step 2: Append to `anime.sql`**

```sql
-- name: UpdateAnimeSyncFlags :exec
UPDATE anime
SET sync_disabled = sqlc.arg('sync_disabled'),
    watch_status_override = sqlc.arg('watch_status_override'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
```

- [ ] **Step 3: Regenerate and build**

```bash
cd api && sqlc generate && go build ./...
```

Expected: clean build. `sync_outbox.sql.go` exists; new methods appear on `Queries`.

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/ api/internal/store/
git commit -m "feat(store): add sync_outbox and anime sync flag queries"
```

---

## Task 3: Core types and status derivation

**Files:**
- Create: `api/internal/sync/types.go`
- Create: `api/internal/sync/status.go`
- Create: `api/internal/sync/status_test.go`

- [ ] **Step 1: Create `types.go`**

```go
package sync

// ProviderName identifies an external tracker.
type ProviderName string

const (
    ProviderBangumi ProviderName = "bangumi"
    ProviderAniList ProviderName = "anilist"
)

// Kind tags what operation an outbox row represents.
type Kind string

const (
    KindProgress Kind = "progress"
    KindStatus   Kind = "status"
    KindImport   Kind = "import"
)

// WatchStatus is milmil's canonical watch state.
type WatchStatus string

const (
    StatusNone      WatchStatus = "none"
    StatusPlanning  WatchStatus = "planning"
    StatusWatching  WatchStatus = "watching"
    StatusCompleted WatchStatus = "completed"
    StatusRepeating WatchStatus = "repeating"
    StatusPaused    WatchStatus = "paused"
    StatusDropped   WatchStatus = "dropped"
)

// SyncOp is the payload of an outbox row, parsed from JSON.
type SyncOp struct {
    Kind     Kind        `json:"kind"`
    AnimeID  string      `json:"anime_id"`
    Status   WatchStatus `json:"status,omitempty"`
    Progress int         `json:"progress,omitempty"` // episodes watched
    // Provider-specific IDs are looked up at dispatch time from the anime row,
    // so the payload stays slim and resilient to metadata changes.
}
```

- [ ] **Step 2: Write the status derivation test**

`api/internal/sync/status_test.go`:

```go
package sync

import "testing"

type fakeRow struct {
    override          string
    totalEpisodes     int
    completedCount    int
    lastPlayedAfterCompletion bool
    inCollection      bool
}

// deriveStatusPure mirrors DeriveStatus but takes the raw inputs so we can test
// without a DB. DeriveStatus itself is a thin wrapper that loads these fields.
func deriveStatusPure(r fakeRow) WatchStatus {
    if r.override != "" {
        return WatchStatus(r.override)
    }
    if r.completedCount == 0 {
        if r.inCollection {
            return StatusPlanning
        }
        return StatusNone
    }
    if r.totalEpisodes > 0 && r.completedCount >= r.totalEpisodes {
        if r.lastPlayedAfterCompletion {
            return StatusRepeating
        }
        return StatusCompleted
    }
    return StatusWatching
}

func TestDeriveStatus_OverrideWins(t *testing.T) {
    got := deriveStatusPure(fakeRow{override: "dropped", completedCount: 5, totalEpisodes: 12})
    if got != StatusDropped {
        t.Errorf("got %v want dropped", got)
    }
}

func TestDeriveStatus_NoProgressPlanning(t *testing.T) {
    got := deriveStatusPure(fakeRow{inCollection: true})
    if got != StatusPlanning {
        t.Errorf("got %v want planning", got)
    }
}

func TestDeriveStatus_NoProgressNone(t *testing.T) {
    got := deriveStatusPure(fakeRow{})
    if got != StatusNone {
        t.Errorf("got %v want none", got)
    }
}

func TestDeriveStatus_PartialWatching(t *testing.T) {
    got := deriveStatusPure(fakeRow{completedCount: 3, totalEpisodes: 12})
    if got != StatusWatching {
        t.Errorf("got %v want watching", got)
    }
}

func TestDeriveStatus_CompleteReturnsCompleted(t *testing.T) {
    got := deriveStatusPure(fakeRow{completedCount: 12, totalEpisodes: 12})
    if got != StatusCompleted {
        t.Errorf("got %v want completed", got)
    }
}

func TestDeriveStatus_RewatchReturnsRepeating(t *testing.T) {
    got := deriveStatusPure(fakeRow{completedCount: 12, totalEpisodes: 12, lastPlayedAfterCompletion: true})
    if got != StatusRepeating {
        t.Errorf("got %v want repeating", got)
    }
}

func TestDeriveStatus_UnknownTotalCannotAutoComplete(t *testing.T) {
    got := deriveStatusPure(fakeRow{completedCount: 99, totalEpisodes: 0})
    if got != StatusWatching {
        t.Errorf("unknown total should stay watching, got %v", got)
    }
}
```

- [ ] **Step 3: Implement `status.go`**

```go
package sync

import (
    "context"
    "database/sql"

    "github.com/milmil/api/internal/store"
)

// DeriveStatus computes milmil's canonical status for (user, anime) from
// watch_progress rows, the anime row's override, and collection membership.
func DeriveStatus(ctx context.Context, q *store.Queries, userID, animeID string) (WatchStatus, error) {
    anime, err := q.GetAnime(ctx, animeID)
    if err != nil {
        return StatusNone, err
    }
    if anime.WatchStatusOverride != "" {
        return WatchStatus(anime.WatchStatusOverride), nil
    }

    counts, err := q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
        UserID:  userID,
        AnimeID: animeID,
    })
    if err == sql.ErrNoRows {
        counts = store.CountCompletedWatchProgressByAnimeRow{}
    } else if err != nil {
        return StatusNone, err
    }

    if counts.CompletedCount == 0 {
        // "in collection" semantics are project-specific. For Phase A, treat any
        // watch_progress row (even non-completed) as "in collection".
        anyRow, _ := q.HasAnyWatchProgress(ctx, store.HasAnyWatchProgressParams{
            UserID: userID, AnimeID: animeID,
        })
        if anyRow {
            return StatusPlanning, nil
        }
        return StatusNone, nil
    }

    total := int64(0)
    if anime.TotalEpisodes.Valid {
        total = anime.TotalEpisodes.Int64
    }
    if total > 0 && counts.CompletedCount >= total {
        if counts.LastPlayedAt.String > counts.FirstCompletedAt.String {
            return StatusRepeating, nil
        }
        return StatusCompleted, nil
    }
    return StatusWatching, nil
}
```

The helper queries `CountCompletedWatchProgressByAnime` and `HasAnyWatchProgress` need to be added to `watch_progress.sql`:

```sql
-- name: CountCompletedWatchProgressByAnime :one
SELECT
    COALESCE(SUM(CASE WHEN wp.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count,
    COALESCE(MAX(wp.last_watched_at), '') AS last_played_at,
    COALESCE(MIN(CASE WHEN wp.completed = 1 THEN wp.last_watched_at END), '') AS first_completed_at
FROM watch_progress wp
JOIN episodes e ON e.id = wp.episode_id
WHERE wp.user_id = sqlc.arg('user_id') AND e.anime_id = sqlc.arg('anime_id');

-- name: HasAnyWatchProgress :one
SELECT EXISTS(
    SELECT 1 FROM watch_progress wp
    JOIN episodes e ON e.id = wp.episode_id
    WHERE wp.user_id = sqlc.arg('user_id') AND e.anime_id = sqlc.arg('anime_id')
);
```

Add these in Task 2 Step 2 alongside `UpdateAnimeSyncFlags`. If you already committed Task 2 without them, amend or append and re-run `sqlc generate`.

- [ ] **Step 4: Run tests**

```bash
cd api && go test ./internal/sync/ -run TestDeriveStatus -v
```

Expected: all 7 subtests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/sync/types.go \
        api/internal/sync/status.go \
        api/internal/sync/status_test.go \
        api/internal/store/queries/watch_progress.sql \
        api/internal/store/
git commit -m "feat(sync): add core types and status derivation"
```

---

## Task 4: Outbox queue

**Files:**
- Create: `api/internal/sync/queue.go`
- Create: `api/internal/sync/queue_test.go`

- [ ] **Step 1: Write failing tests**

`api/internal/sync/queue_test.go`:

```go
package sync

import (
    "context"
    "encoding/json"
    "testing"
    "time"

    "github.com/milmil/api/internal/store"
)

func TestEnqueueInsertsRow(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    ctx := context.Background()

    qu := NewQueue(q)
    err := qu.Enqueue(ctx, "user1", ProviderAniList, "anime1", SyncOp{
        Kind: KindProgress, AnimeID: "anime1", Status: StatusWatching, Progress: 3,
    })
    if err != nil { t.Fatal(err) }

    rows, _ := q.ListReadySyncOps(ctx, 10)
    if len(rows) != 1 { t.Fatalf("want 1 row, got %d", len(rows)) }
    if rows[0].UserID != "user1" || rows[0].Provider != "anilist" {
        t.Errorf("wrong row: %+v", rows[0])
    }
    var op SyncOp
    _ = json.Unmarshal([]byte(rows[0].Payload), &op)
    if op.Progress != 3 { t.Errorf("lost payload: %+v", op) }
}

func TestEnqueueSupersedesEarlierProgress(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    ctx := context.Background()

    qu := NewQueue(q)
    _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 1})
    _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 2})
    _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 3})

    rows, _ := q.ListReadySyncOps(ctx, 10)
    if len(rows) != 1 {
        t.Fatalf("expected 1 active row after coalescing, got %d", len(rows))
    }
    var op SyncOp
    _ = json.Unmarshal([]byte(rows[0].Payload), &op)
    if op.Progress != 3 {
        t.Errorf("expected newest progress, got %d", op.Progress)
    }
}

func TestEnqueueDoesNotSupersedeOtherKinds(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    ctx := context.Background()

    qu := NewQueue(q)
    _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindImport})
    _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 1})

    rows, _ := q.ListReadySyncOps(ctx, 10)
    if len(rows) != 2 {
        t.Fatalf("import should not be superseded; got %d rows", len(rows))
    }
}

func TestBackoffGrows(t *testing.T) {
    got := []time.Duration{}
    for i := 1; i <= 10; i++ {
        got = append(got, Backoff(i))
    }
    want := []time.Duration{
        1 * time.Minute,
        2 * time.Minute,
        4 * time.Minute,
        8 * time.Minute,
        16 * time.Minute,
        32 * time.Minute,
        1 * time.Hour,
        2 * time.Hour,
        4 * time.Hour,
        8 * time.Hour,
    }
    for i := range want {
        if got[i] != want[i] {
            t.Errorf("attempt %d: got %v want %v", i+1, got[i], want[i])
        }
    }
    if Backoff(30) != 24*time.Hour {
        t.Errorf("backoff should cap at 24h, got %v", Backoff(30))
    }
}

// newTestQueries spins up an in-memory sqlite DB + runs migrations.
// The repo already has a helper somewhere — find and reuse it. If none exists,
// copy the pattern from api/internal/resolver/resolver_test.go.
func newTestQueries(t *testing.T) (*store.Queries, func()) {
    t.Helper()
    // Implementation: refer to existing test harness.
    // If a helper exists (e.g. store/testdb.go), use it.
    panic("use existing test harness — see resolver_test.go for the pattern")
}
```

**Important:** `newTestQueries` is a placeholder. Before running the tests, find the existing in-memory sqlite test harness in the repo (search `InMemoryDB`, `testdb`, or `newTestQueries` across test files). Use that exact helper. Do NOT write a new one.

- [ ] **Step 2: Implement `queue.go`**

```go
package sync

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/google/uuid"
    "github.com/milmil/api/internal/store"
)

type Queue struct {
    q *store.Queries
}

func NewQueue(q *store.Queries) *Queue { return &Queue{q: q} }

// Enqueue inserts a new outbox row. For KindProgress, any older unfinished
// progress rows for the same (user, provider, anime) are marked superseded
// first — the worker only processes the newest progress snapshot.
func (qu *Queue) Enqueue(ctx context.Context, userID string, provider ProviderName, animeID string, op SyncOp) error {
    payload, err := json.Marshal(op)
    if err != nil {
        return fmt.Errorf("sync: marshal op: %w", err)
    }
    if op.Kind == KindProgress {
        if err := qu.q.SupersedeProgressOps(ctx, store.SupersedeProgressOpsParams{
            UserID: userID, Provider: string(provider), AnimeID: animeID,
        }); err != nil {
            return fmt.Errorf("sync: supersede: %w", err)
        }
    }
    return qu.q.EnqueueSyncOp(ctx, store.EnqueueSyncOpParams{
        ID:       uuid.NewString(),
        UserID:   userID,
        Provider: string(provider),
        AnimeID:  animeID,
        Kind:     string(op.Kind),
        Payload:  string(payload),
    })
}

// Backoff returns the delay before the next attempt for a row with `attempts`
// failures already recorded. 1m, 2m, 4m, ..., cap 24h.
func Backoff(attempts int) time.Duration {
    if attempts < 1 {
        attempts = 1
    }
    d := time.Minute
    for i := 1; i < attempts; i++ {
        d *= 2
        if d >= 24*time.Hour {
            return 24 * time.Hour
        }
    }
    return d
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/sync/ -run 'TestEnqueue|TestBackoff' -v
```

Expected: all 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/queue.go api/internal/sync/queue_test.go
git commit -m "feat(sync): add outbox queue with progress coalescing"
```

---

## Task 5: Provider interface + token loader

**Files:**
- Create: `api/internal/sync/provider.go`

- [ ] **Step 1: Define the interface**

```go
package sync

import (
    "context"
    "errors"
    "time"
)

// Provider is the adapter contract every external tracker implements.
type Provider interface {
    Name() ProviderName
    // Push dispatches a single outbox op against the tracker. tok is the
    // caller's access token (already refreshed if needed). Return a
    // TransientError to signal the worker to retry; any other error is fatal
    // for this row.
    Push(ctx context.Context, tok string, op SyncOp, animeIDs ExternalIDs) error
    // FetchList pulls the user's full collection for one-shot import. Return
    // entries keyed by the tracker's native anime id; the caller joins to milmil
    // anime rows by that id.
    FetchList(ctx context.Context, tok string) ([]RemoteEntry, error)
}

// ExternalIDs is the subset of milmil's IDSet a provider needs to do its work.
type ExternalIDs struct {
    AniDB    int64
    AniList  int64
    Bangumi  int64
    MAL      int64
    TMDB     int64
    BangumiEpisodeIDs []int64 // for Bangumi per-episode PUT
}

// RemoteEntry is one anime's watch state on a tracker.
type RemoteEntry struct {
    ProviderAnimeID int64
    Status          WatchStatus
    Progress        int
    UpdatedAt       time.Time
}

// TransientError wraps a retryable failure. Workers honor RetryAfter if set.
type TransientError struct {
    Err        error
    RetryAfter time.Duration
}

func (e *TransientError) Error() string { return e.Err.Error() }
func (e *TransientError) Unwrap() error { return e.Err }

func IsTransient(err error) (*TransientError, bool) {
    var t *TransientError
    if errors.As(err, &t) {
        return t, true
    }
    return nil, false
}
```

- [ ] **Step 2: Build**

```bash
cd api && go build ./internal/sync/...
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add api/internal/sync/provider.go
git commit -m "feat(sync): add Provider interface and error types"
```

---

## Task 6: AniList provider adapter

**Files:**
- Create: `api/internal/sync/providers/anilist.go`
- Create: `api/internal/sync/providers/anilist_test.go`

- [ ] **Step 1: Write failing tests**

`providers/anilist_test.go`:

```go
package providers

import (
    "context"
    "encoding/json"
    "io"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "time"

    milmilsync "github.com/milmil/api/internal/sync"
)

func TestAniListPushProgressIncludesStatus(t *testing.T) {
    var bodyReceived string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        b, _ := io.ReadAll(r.Body)
        bodyReceived = string(b)
        w.Header().Set("Content-Type", "application/json")
        _, _ = io.WriteString(w, `{"data":{"SaveMediaListEntry":{"id":1,"progress":5}}}`)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "token", milmilsync.SyncOp{
        Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 5,
    }, milmilsync.ExternalIDs{AniList: 123})
    if err != nil { t.Fatal(err) }
    if !strings.Contains(bodyReceived, `"mediaId":123`) ||
       !strings.Contains(bodyReceived, `"progress":5`) ||
       !strings.Contains(bodyReceived, `"status":"CURRENT"`) {
        t.Errorf("request body missing expected fields: %s", bodyReceived)
    }
}

func TestAniListMapsEachStatus(t *testing.T) {
    cases := []struct{ milmil milmilsync.WatchStatus; want string }{
        {milmilsync.StatusWatching, "CURRENT"},
        {milmilsync.StatusCompleted, "COMPLETED"},
        {milmilsync.StatusPlanning, "PLANNING"},
        {milmilsync.StatusRepeating, "REPEATING"},
        {milmilsync.StatusPaused, "PAUSED"},
        {milmilsync.StatusDropped, "DROPPED"},
    }
    for _, tc := range cases {
        t.Run(string(tc.milmil), func(t *testing.T) {
            got := mapAniListStatus(tc.milmil)
            if got != tc.want { t.Errorf("got %s want %s", got, tc.want) }
        })
    }
}

func TestAniListHonorsRetryAfterOn429(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Retry-After", "42")
        w.WriteHeader(http.StatusTooManyRequests)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1},
        milmilsync.ExternalIDs{AniList: 1})
    te, ok := milmilsync.IsTransient(err)
    if !ok { t.Fatalf("expected transient error, got %v", err) }
    if te.RetryAfter != 42*time.Second {
        t.Errorf("Retry-After not honored, got %v", te.RetryAfter)
    }
}

func TestAniListFetchListReturnsEntries(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        resp := `{"data":{"MediaListCollection":{"lists":[{"entries":[
            {"mediaId":1,"status":"COMPLETED","progress":12,"updatedAt":1700000000},
            {"mediaId":2,"status":"CURRENT","progress":3,"updatedAt":1700000100}
        ]}]}}}`
        _, _ = io.WriteString(w, resp)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    entries, err := p.FetchList(context.Background(), "tok")
    if err != nil { t.Fatal(err) }
    if len(entries) != 2 { t.Fatalf("want 2, got %d", len(entries)) }
    if entries[0].Status != milmilsync.StatusCompleted || entries[0].Progress != 12 {
        t.Errorf("bad entry 0: %+v", entries[0])
    }
}

func TestAniListAuthErrorIsNotTransient(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "bad token", http.StatusUnauthorized)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1},
        milmilsync.ExternalIDs{AniList: 1})
    if err == nil { t.Fatal("expected error") }
    if _, ok := milmilsync.IsTransient(err); ok {
        t.Errorf("401 should be fatal (needs reauth), not transient")
    }
}

// ensure json decoder handles empty list
func TestAniListFetchListEmpty(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        _, _ = io.WriteString(w, `{"data":{"MediaListCollection":{"lists":[]}}}`)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    entries, err := p.FetchList(context.Background(), "tok")
    if err != nil { t.Fatal(err) }
    if len(entries) != 0 { t.Errorf("want 0, got %d", len(entries)) }
}

// helper to silence unused import lint
var _ = json.Marshal
```

- [ ] **Step 2: Implement `providers/anilist.go`**

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

const defaultAniListURL = "https://graphql.anilist.co"

type AniList struct {
    http    *http.Client
    baseURL string
}

func NewAniList(h *http.Client, url string) *AniList {
    if h == nil { h = http.DefaultClient }
    if url == "" { url = defaultAniListURL }
    return &AniList{http: h, baseURL: url}
}

func (p *AniList) Name() milmilsync.ProviderName { return milmilsync.ProviderAniList }

func (p *AniList) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
    if ids.AniList == 0 {
        return errors.New("anilist: no anilist_id on anime")
    }
    mutation := `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id progress }
    }`
    body, _ := json.Marshal(map[string]any{
        "query": mutation,
        "variables": map[string]any{
            "mediaId":  ids.AniList,
            "progress": op.Progress,
            "status":   mapAniListStatus(op.Status),
        },
    })
    return p.doGraphQL(ctx, tok, body)
}

func (p *AniList) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
    query := `query { MediaListCollection(userId: null, type: ANIME) {
        lists { entries { mediaId status progress updatedAt } }
    } }`
    body, _ := json.Marshal(map[string]string{"query": query})

    req, _ := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL, bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+tok)
    req.Header.Set("Content-Type", "application/json")
    resp, err := p.http.Do(req)
    if err != nil { return nil, err }
    defer resp.Body.Close()
    raw, _ := io.ReadAll(resp.Body)
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("anilist fetch: %d %s", resp.StatusCode, raw)
    }
    var out struct {
        Data struct {
            MediaListCollection struct {
                Lists []struct {
                    Entries []struct {
                        MediaID   int64  `json:"mediaId"`
                        Status    string `json:"status"`
                        Progress  int    `json:"progress"`
                        UpdatedAt int64  `json:"updatedAt"`
                    } `json:"entries"`
                } `json:"lists"`
            } `json:"MediaListCollection"`
        } `json:"data"`
    }
    if err := json.Unmarshal(raw, &out); err != nil { return nil, err }
    var entries []milmilsync.RemoteEntry
    for _, l := range out.Data.MediaListCollection.Lists {
        for _, e := range l.Entries {
            entries = append(entries, milmilsync.RemoteEntry{
                ProviderAnimeID: e.MediaID,
                Status:          unmapAniListStatus(e.Status),
                Progress:        e.Progress,
                UpdatedAt:       time.Unix(e.UpdatedAt, 0),
            })
        }
    }
    return entries, nil
}

func (p *AniList) doGraphQL(ctx context.Context, tok string, body []byte) error {
    req, _ := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL, bytes.NewReader(body))
    req.Header.Set("Authorization", "Bearer "+tok)
    req.Header.Set("Content-Type", "application/json")
    resp, err := p.http.Do(req)
    if err != nil {
        return &milmilsync.TransientError{Err: err}
    }
    defer resp.Body.Close()
    raw, _ := io.ReadAll(resp.Body)
    switch resp.StatusCode {
    case 200:
        return nil
    case 429:
        secs, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
        if secs <= 0 { secs = 60 }
        return &milmilsync.TransientError{
            Err:        fmt.Errorf("anilist rate-limited"),
            RetryAfter: time.Duration(secs) * time.Second,
        }
    case 401, 403:
        return fmt.Errorf("anilist auth: %s", raw) // fatal, triggers reauth
    case 500, 502, 503, 504:
        return &milmilsync.TransientError{Err: fmt.Errorf("anilist %d: %s", resp.StatusCode, raw)}
    default:
        return fmt.Errorf("anilist: %d: %s", resp.StatusCode, raw)
    }
}

func mapAniListStatus(s milmilsync.WatchStatus) string {
    switch s {
    case milmilsync.StatusWatching:  return "CURRENT"
    case milmilsync.StatusCompleted: return "COMPLETED"
    case milmilsync.StatusPlanning:  return "PLANNING"
    case milmilsync.StatusRepeating: return "REPEATING"
    case milmilsync.StatusPaused:    return "PAUSED"
    case milmilsync.StatusDropped:   return "DROPPED"
    default:                         return "CURRENT"
    }
}

func unmapAniListStatus(s string) milmilsync.WatchStatus {
    switch s {
    case "CURRENT":    return milmilsync.StatusWatching
    case "COMPLETED":  return milmilsync.StatusCompleted
    case "PLANNING":   return milmilsync.StatusPlanning
    case "REPEATING":  return milmilsync.StatusRepeating
    case "PAUSED":     return milmilsync.StatusPaused
    case "DROPPED":    return milmilsync.StatusDropped
    default:           return milmilsync.StatusNone
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/sync/providers/ -v
```

Expected: all AniList tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/providers/anilist.go api/internal/sync/providers/anilist_test.go
git commit -m "feat(sync): add AniList provider adapter"
```

---

## Task 7: Bangumi provider adapter

**Files:**
- Create: `api/internal/sync/providers/bangumi.go`
- Create: `api/internal/sync/providers/bangumi_test.go`

- [ ] **Step 1: Write failing tests**

`providers/bangumi_test.go`:

```go
package providers

import (
    "context"
    "io"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"

    milmilsync "github.com/milmil/api/internal/sync"
)

func TestBangumiProgressPutsEpisodes(t *testing.T) {
    var requestsSeen []string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        requestsSeen = append(requestsSeen, r.Method+" "+r.URL.Path)
        w.WriteHeader(http.StatusNoContent)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
        Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 2,
    }, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001, 1002}})
    if err != nil { t.Fatal(err) }
    if len(requestsSeen) != 2 {
        t.Errorf("expected 2 episode PUTs, got %v", requestsSeen)
    }
    for _, s := range requestsSeen {
        if !strings.HasPrefix(s, "PUT ") {
            t.Errorf("expected PUT, got %s", s)
        }
    }
}

func TestBangumiMapsStatusInCollectionPatch(t *testing.T) {
    cases := []struct{ m milmilsync.WatchStatus; want int }{
        {milmilsync.StatusWatching,  3},
        {milmilsync.StatusCompleted, 2},
        {milmilsync.StatusPlanning,  1},
        {milmilsync.StatusRepeating, 3},
        {milmilsync.StatusPaused,    4},
        {milmilsync.StatusDropped,   5},
    }
    for _, tc := range cases {
        if got := mapBangumiStatus(tc.m); got != tc.want {
            t.Errorf("%s: got %d want %d", tc.m, got, tc.want)
        }
    }
}

func TestBangumi500IsTransient(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "boom", http.StatusInternalServerError)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
        Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
    }, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
    if _, ok := milmilsync.IsTransient(err); !ok {
        t.Errorf("5xx should be transient, got %v", err)
    }
}

func TestBangumi401IsFatal(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "bad token", http.StatusUnauthorized)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
        Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
    }, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
    if _, ok := milmilsync.IsTransient(err); ok {
        t.Errorf("401 should not be transient")
    }
}

func TestBangumiFetchListParses(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        _, _ = io.WriteString(w, `{"data":[
            {"subject_id":1,"type":2,"ep_status":12,"updated_at":"2026-01-01T00:00:00Z"},
            {"subject_id":2,"type":3,"ep_status":3, "updated_at":"2026-02-01T00:00:00Z"}
        ],"total":2}`)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    entries, err := p.FetchList(context.Background(), "tok")
    if err != nil { t.Fatal(err) }
    if len(entries) != 2 { t.Fatalf("want 2, got %d", len(entries)) }
    if entries[0].Status != milmilsync.StatusCompleted || entries[0].Progress != 12 {
        t.Errorf("bad entry 0: %+v", entries[0])
    }
    if entries[1].Status != milmilsync.StatusWatching {
        t.Errorf("bad entry 1: %+v", entries[1])
    }
}
```

- [ ] **Step 2: Implement `providers/bangumi.go`**

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
    "time"

    milmilsync "github.com/milmil/api/internal/sync"
)

const defaultBangumiURL = "https://api.bgm.tv"

type Bangumi struct {
    http    *http.Client
    baseURL string
}

func NewBangumi(h *http.Client, url string) *Bangumi {
    if h == nil { h = http.DefaultClient }
    if url == "" { url = defaultBangumiURL }
    return &Bangumi{http: h, baseURL: url}
}

func (p *Bangumi) Name() milmilsync.ProviderName { return milmilsync.ProviderBangumi }

func (p *Bangumi) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
    if ids.Bangumi == 0 {
        return errors.New("bangumi: no bangumi_id")
    }
    // PUT each Bangumi episode as watched (ep_status=2 == collect).
    for _, epID := range ids.BangumiEpisodeIDs {
        body := bytes.NewBufferString(`{"type":2}`)
        req, _ := http.NewRequestWithContext(ctx, http.MethodPut,
            fmt.Sprintf("%s/v0/users/-/collections/-/episodes/%d", p.baseURL, epID), body)
        req.Header.Set("Authorization", "Bearer "+tok)
        req.Header.Set("Content-Type", "application/json")
        resp, err := p.http.Do(req)
        if err != nil { return &milmilsync.TransientError{Err: err} }
        resp.Body.Close()
        switch {
        case resp.StatusCode >= 500:
            return &milmilsync.TransientError{Err: fmt.Errorf("bangumi episode %d: %d", epID, resp.StatusCode)}
        case resp.StatusCode == 429:
            return &milmilsync.TransientError{Err: fmt.Errorf("bangumi rate-limited"), RetryAfter: 60 * time.Second}
        case resp.StatusCode == 401 || resp.StatusCode == 403:
            return fmt.Errorf("bangumi auth: %d", resp.StatusCode)
        case resp.StatusCode >= 400 && resp.StatusCode != 404:
            return fmt.Errorf("bangumi episode %d: %d", epID, resp.StatusCode)
        }
    }
    // Collection-level status PATCH.
    payload, _ := json.Marshal(map[string]any{"type": mapBangumiStatus(op.Status)})
    req, _ := http.NewRequestWithContext(ctx, http.MethodPatch,
        fmt.Sprintf("%s/v0/users/-/collections/%d", p.baseURL, ids.Bangumi),
        bytes.NewReader(payload))
    req.Header.Set("Authorization", "Bearer "+tok)
    req.Header.Set("Content-Type", "application/json")
    resp, err := p.http.Do(req)
    if err != nil { return &milmilsync.TransientError{Err: err} }
    defer resp.Body.Close()
    if resp.StatusCode >= 500 {
        return &milmilsync.TransientError{Err: fmt.Errorf("bangumi status: %d", resp.StatusCode)}
    }
    if resp.StatusCode == 401 || resp.StatusCode == 403 {
        return fmt.Errorf("bangumi auth: %d", resp.StatusCode)
    }
    return nil
}

func (p *Bangumi) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
    req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
        p.baseURL+"/v0/users/-/collections?subject_type=2&limit=100", nil)
    req.Header.Set("Authorization", "Bearer "+tok)
    resp, err := p.http.Do(req)
    if err != nil { return nil, err }
    defer resp.Body.Close()
    raw, _ := io.ReadAll(resp.Body)
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("bangumi fetch: %d %s", resp.StatusCode, raw)
    }
    var out struct {
        Data []struct {
            SubjectID int64  `json:"subject_id"`
            Type      int    `json:"type"`
            EpStatus  int    `json:"ep_status"`
            UpdatedAt string `json:"updated_at"`
        } `json:"data"`
    }
    if err := json.Unmarshal(raw, &out); err != nil { return nil, err }
    var entries []milmilsync.RemoteEntry
    for _, d := range out.Data {
        u, _ := time.Parse(time.RFC3339, d.UpdatedAt)
        entries = append(entries, milmilsync.RemoteEntry{
            ProviderAnimeID: d.SubjectID,
            Status:          unmapBangumiStatus(d.Type),
            Progress:        d.EpStatus,
            UpdatedAt:       u,
        })
    }
    return entries, nil
}

func mapBangumiStatus(s milmilsync.WatchStatus) int {
    switch s {
    case milmilsync.StatusPlanning:  return 1
    case milmilsync.StatusCompleted: return 2
    case milmilsync.StatusWatching, milmilsync.StatusRepeating: return 3
    case milmilsync.StatusPaused:    return 4
    case milmilsync.StatusDropped:   return 5
    default:                          return 3
    }
}

func unmapBangumiStatus(t int) milmilsync.WatchStatus {
    switch t {
    case 1: return milmilsync.StatusPlanning
    case 2: return milmilsync.StatusCompleted
    case 3: return milmilsync.StatusWatching
    case 4: return milmilsync.StatusPaused
    case 5: return milmilsync.StatusDropped
    default: return milmilsync.StatusNone
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/sync/providers/ -v
```

Expected: all Bangumi + AniList tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/providers/bangumi.go api/internal/sync/providers/bangumi_test.go
git commit -m "feat(sync): add Bangumi provider adapter"
```

---

## Task 8: Service facade

**Files:**
- Create: `api/internal/sync/service.go`

- [ ] **Step 1: Implement**

```go
package sync

import (
    "context"
    "errors"
    "fmt"
    "log/slog"

    "github.com/milmil/api/internal/store"
)

// TokenLoader returns the access token for (user, provider). Returning
// ErrNoToken means the user has not connected this provider.
type TokenLoader func(ctx context.Context, userID string, provider ProviderName) (string, error)

var ErrNoToken = errors.New("sync: no token")

type Service struct {
    q         *store.Queries
    queue     *Queue
    providers map[ProviderName]Provider
    loadToken TokenLoader
}

func NewService(q *store.Queries, providers []Provider, loadToken TokenLoader) *Service {
    m := make(map[ProviderName]Provider, len(providers))
    for _, p := range providers {
        m[p.Name()] = p
    }
    return &Service{
        q:         q,
        queue:     NewQueue(q),
        providers: m,
        loadToken: loadToken,
    }
}

// OnProgressUpdate is called from the watch-progress handler after the DB
// write. It derives the anime's status and enqueues one row per connected
// provider. Any error is logged; the caller is expected not to fail the
// request on sync setup errors.
func (s *Service) OnProgressUpdate(ctx context.Context, userID, animeID string) {
    anime, err := s.q.GetAnime(ctx, animeID)
    if err != nil {
        slog.Warn("sync: get anime", "anime", animeID, "err", err)
        return
    }
    if anime.SyncDisabled == 1 {
        return
    }
    status, err := DeriveStatus(ctx, s.q, userID, animeID)
    if err != nil {
        slog.Warn("sync: derive status", "anime", animeID, "err", err)
        return
    }
    progressCount, _ := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{
        UserID: userID, AnimeID: animeID,
    })

    for name := range s.providers {
        if !hasProviderID(anime, name) { continue }
        if _, err := s.loadToken(ctx, userID, name); err != nil { continue }
        op := SyncOp{Kind: KindProgress, AnimeID: animeID, Status: status, Progress: int(progressCount.CompletedCount)}
        if err := s.queue.Enqueue(ctx, userID, name, animeID, op); err != nil {
            slog.Warn("sync: enqueue", "provider", name, "err", err)
        }
    }
}

// EnqueueImport schedules a one-shot import on OAuth connect.
func (s *Service) EnqueueImport(ctx context.Context, userID string, provider ProviderName) error {
    return s.queue.Enqueue(ctx, userID, provider, "", SyncOp{Kind: KindImport})
}

// FlushUser enqueues a full library push for the user (manual Sync Now).
func (s *Service) FlushUser(ctx context.Context, userID string, provider ProviderName) (int, error) {
    animes, err := s.q.ListAnimeForUserWithProviderID(ctx, store.ListAnimeForUserWithProviderIDParams{
        UserID: userID, Provider: string(provider),
    })
    if err != nil { return 0, err }
    enqueued := 0
    for _, a := range animes {
        if a.SyncDisabled == 1 { continue }
        status, err := DeriveStatus(ctx, s.q, userID, a.ID)
        if err != nil { continue }
        counts, _ := s.q.CountCompletedWatchProgressByAnime(ctx, store.CountCompletedWatchProgressByAnimeParams{UserID: userID, AnimeID: a.ID})
        op := SyncOp{Kind: KindProgress, AnimeID: a.ID, Status: status, Progress: int(counts.CompletedCount)}
        if err := s.queue.Enqueue(ctx, userID, provider, a.ID, op); err != nil { continue }
        enqueued++
    }
    return enqueued, nil
}

// Disconnect marks all pending rows for (user, provider) as failed/disconnected.
func (s *Service) Disconnect(ctx context.Context, userID string, provider ProviderName) error {
    return s.q.MarkUserProviderOpsFailed(ctx, store.MarkUserProviderOpsFailedParams{
        UserID: userID, Provider: string(provider), LastError: "disconnected",
    })
}

func hasProviderID(a store.Anime, p ProviderName) bool {
    switch p {
    case ProviderAniList:
        return a.AnilistID.Valid && a.AnilistID.Int64 != 0
    case ProviderBangumi:
        return a.BangumiID.Valid && a.BangumiID.Int64 != 0
    }
    return false
}

// ListAnimeForUserWithProviderID helper query needed:
//   -- name: ListAnimeForUserWithProviderID :many
//   SELECT DISTINCT a.* FROM anime a
//   JOIN episodes e ON e.anime_id = a.id
//   JOIN watch_progress wp ON wp.episode_id = e.id
//   WHERE wp.user_id = sqlc.arg('user_id')
//     AND ( (sqlc.arg('provider') = 'anilist' AND a.anilist_id IS NOT NULL)
//        OR (sqlc.arg('provider') = 'bangumi' AND a.bangumi_id IS NOT NULL) )
//     AND a.sync_disabled = 0;
// Add this to queries/anime.sql and regenerate before building.
var _ = fmt.Sprintf // keep import for future slog formatting
```

- [ ] **Step 2: Add the missing sqlc query**

Append to `api/internal/store/queries/anime.sql`:

```sql
-- name: ListAnimeForUserWithProviderID :many
SELECT DISTINCT a.* FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE wp.user_id = sqlc.arg('user_id')
  AND ( (sqlc.arg('provider') = 'anilist' AND a.anilist_id IS NOT NULL)
     OR (sqlc.arg('provider') = 'bangumi' AND a.bangumi_id IS NOT NULL) )
  AND a.sync_disabled = 0;
```

Regenerate and build:

```bash
cd api && sqlc generate && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/sync/service.go api/internal/store/queries/anime.sql api/internal/store/
git commit -m "feat(sync): add service facade coordinating queue + providers"
```

---

## Task 9: Worker — drain loop

**Files:**
- Create: `api/internal/sync/worker.go`
- Create: `api/internal/sync/worker_test.go`

- [ ] **Step 1: Implement `worker.go`**

```go
package sync

import (
    "context"
    "encoding/json"
    "log/slog"
    "time"

    "github.com/milmil/api/internal/store"
)

// Drain processes up to `batchSize` ready rows. Call on a ticker.
func (s *Service) Drain(ctx context.Context, batchSize int32) {
    if batchSize <= 0 { batchSize = 50 }
    rows, err := s.q.ListReadySyncOps(ctx, batchSize)
    if err != nil {
        slog.Warn("sync: list ready ops", "err", err)
        return
    }
    for _, row := range rows {
        s.processRow(ctx, row)
    }
}

func (s *Service) processRow(ctx context.Context, row store.SyncOutbox) {
    prov, ok := s.providers[ProviderName(row.Provider)]
    if !ok {
        s.failRow(ctx, row, "unknown provider", false)
        return
    }
    tok, err := s.loadToken(ctx, row.UserID, ProviderName(row.Provider))
    if err != nil {
        s.failRow(ctx, row, "no token: "+err.Error(), false)
        return
    }

    var op SyncOp
    if err := json.Unmarshal([]byte(row.Payload), &op); err != nil {
        s.failRow(ctx, row, "bad payload: "+err.Error(), false)
        return
    }

    if op.Kind == KindImport {
        if err := s.runImport(ctx, row.UserID, prov, tok); err != nil {
            if te, ok := IsTransient(err); ok {
                s.retryRow(ctx, row, te)
                return
            }
            s.failRow(ctx, row, err.Error(), false)
            return
        }
        s.completeRow(ctx, row)
        return
    }

    anime, err := s.q.GetAnime(ctx, row.AnimeID)
    if err != nil {
        s.failRow(ctx, row, "no anime: "+err.Error(), false)
        return
    }
    epIDs, _ := s.q.ListBangumiEpisodeIDsForAnimeWatchedByUser(ctx, store.ListBangumiEpisodeIDsForAnimeWatchedByUserParams{
        AnimeID: row.AnimeID, UserID: row.UserID,
    })
    ids := ExternalIDs{
        AniList: nullInt(anime.AnilistID),
        Bangumi: nullInt(anime.BangumiID),
        MAL:     nullInt(anime.MalID),
        TMDB:    nullInt(anime.TmdbID),
        AniDB:   nullInt(anime.AnidbID),
        BangumiEpisodeIDs: epIDs,
    }

    if err := prov.Push(ctx, tok, op, ids); err != nil {
        if te, ok := IsTransient(err); ok {
            s.retryRow(ctx, row, te)
            return
        }
        s.failRow(ctx, row, err.Error(), true)
        return
    }
    s.completeRow(ctx, row)
}

func (s *Service) retryRow(ctx context.Context, row store.SyncOutbox, te *TransientError) {
    attempts := row.Attempts + 1
    delay := Backoff(int(attempts))
    if te.RetryAfter > delay { delay = te.RetryAfter }
    if attempts >= 30 {
        s.failRow(ctx, row, "dead-letter: "+te.Err.Error(), true)
        return
    }
    next := time.Now().UTC().Add(delay).Format("2006-01-02T15:04:05Z")
    _ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
        Attempts: attempts, NextAttemptAt: next,
        LastError: sqlNull(te.Err.Error()), ID: row.ID,
    })
}

func (s *Service) completeRow(ctx context.Context, row store.SyncOutbox) {
    _ = s.q.MarkSyncOpCompleted(ctx, row.ID)
}

func (s *Service) failRow(ctx context.Context, row store.SyncOutbox, reason string, deadLetter bool) {
    if deadLetter {
        slog.Warn("sync: dead letter", "provider", row.Provider, "anime", row.AnimeID, "err", reason)
    }
    _ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
        Attempts: row.Attempts + 1,
        NextAttemptAt: time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02T15:04:05Z"),
        LastError: sqlNull(reason), ID: row.ID,
    })
    if deadLetter || row.Attempts+1 >= 30 {
        _ = s.q.MarkSyncOpCompleted(ctx, row.ID)
    }
}
```

Add helper query in `watch_progress.sql`:

```sql
-- name: ListBangumiEpisodeIDsForAnimeWatchedByUser :many
SELECT e.bangumi_episode_id.Int64 FROM episodes e
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
  AND wp.user_id = sqlc.arg('user_id')
  AND wp.completed = 1
  AND e.bangumi_episode_id IS NOT NULL;
```

Note: sqlc may require wrapping the IS NOT NULL column. If sqlc emits `[]sql.NullInt64`, write a small adapter in `worker.go` that extracts `.Int64` values.

Add `nullInt` and `sqlNull` helpers at the bottom of `worker.go`:

```go
import "database/sql"

func nullInt(n sql.NullInt64) int64 { if n.Valid { return n.Int64 }; return 0 }
func sqlNull(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }
```

- [ ] **Step 2: Write the worker test**

```go
package sync

import (
    "context"
    "testing"
)

type fakeProvider struct {
    name     ProviderName
    push     func(op SyncOp, ids ExternalIDs) error
    fetched  []RemoteEntry
    fetchErr error
}

func (p *fakeProvider) Name() ProviderName { return p.name }
func (p *fakeProvider) Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error {
    return p.push(op, ids)
}
func (p *fakeProvider) FetchList(ctx context.Context, tok string) ([]RemoteEntry, error) {
    return p.fetched, p.fetchErr
}

func TestWorkerMarksRowCompletedOnSuccess(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42) // helper inserts anime row with anilist_id=42

    fp := &fakeProvider{name: ProviderAniList, push: func(SyncOp, ExternalIDs) error { return nil }}
    s := NewService(q, []Provider{fp}, func(_ context.Context, _ string, _ ProviderName) (string, error) { return "tok", nil })
    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})

    s.Drain(context.Background(), 10)

    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 { t.Errorf("row not cleared: %+v", rows) }
}

func TestWorkerReschedulesTransientError(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42)

    fp := &fakeProvider{name: ProviderAniList, push: func(SyncOp, ExternalIDs) error {
        return &TransientError{Err: errString("boom")}
    }}
    s := NewService(q, []Provider{fp}, func(_ context.Context, _ string, _ ProviderName) (string, error) { return "tok", nil })
    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})

    s.Drain(context.Background(), 10)

    // Not ready yet — next_attempt_at pushed into the future.
    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 { t.Error("row should be rescheduled, not ready") }
}

// errString is a simple error type for the tests.
type errString string
func (e errString) Error() string { return string(e) }

// mustInsertAnime is a stub — implement in your test harness to match the
// repo's conventions. Must insert an anime row with total_episodes and
// anilist_id populated so the worker can look it up.
func mustInsertAnime(t *testing.T, q *store.Queries, id string, total int, anilistID int64) {
    t.Helper()
    // Implementation: copy from existing matcher_test.go or resolver_test.go.
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/sync/ -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/worker.go api/internal/sync/worker_test.go \
        api/internal/store/queries/watch_progress.sql api/internal/store/
git commit -m "feat(sync): add worker drain loop with backoff and rate-limit handling"
```

---

## Task 10: Import flow

**Files:**
- Create: `api/internal/sync/import.go`
- Create: `api/internal/sync/import_test.go`

- [ ] **Step 1: Implement `import.go`**

```go
package sync

import (
    "context"
    "log/slog"

    "github.com/milmil/api/internal/store"
)

// runImport is called by the worker when it dequeues a KindImport row. It
// fetches the user's full remote list and populates milmil state only where
// milmil has no existing watch_progress for that anime.
func (s *Service) runImport(ctx context.Context, userID string, prov Provider, tok string) error {
    entries, err := prov.FetchList(ctx, tok)
    if err != nil {
        return err
    }
    imported := 0
    for _, e := range entries {
        animeID, ok := s.lookupAnimeByProviderID(ctx, prov.Name(), e.ProviderAnimeID)
        if !ok { continue }

        has, _ := s.q.HasAnyWatchProgress(ctx, store.HasAnyWatchProgressParams{
            UserID: userID, AnimeID: animeID,
        })
        if has { continue }

        episodes, err := s.q.ListEpisodesByAnimeOrderedBySort(ctx, animeID)
        if err != nil { continue }
        for i, ep := range episodes {
            if i >= e.Progress { break }
            _ = s.q.UpsertWatchProgress(ctx, store.UpsertWatchProgressParams{
                ID:              newID(),
                UserID:          userID,
                EpisodeID:       ep.ID,
                Completed:       1,
                PositionSeconds: 0,
            })
        }
        if e.Status == StatusDropped || e.Status == StatusPaused {
            _ = s.q.UpdateAnimeSyncFlags(ctx, store.UpdateAnimeSyncFlagsParams{
                ID: animeID, WatchStatusOverride: string(e.Status), SyncDisabled: 0,
            })
        }
        imported++
    }
    slog.Info("sync: imported", "provider", prov.Name(), "user", userID, "count", imported)
    return nil
}

func (s *Service) lookupAnimeByProviderID(ctx context.Context, p ProviderName, id int64) (string, bool) {
    switch p {
    case ProviderAniList:
        a, err := s.q.GetAnimeByAnilistID(ctx, sqlNullInt(id))
        if err == nil { return a.ID, true }
    case ProviderBangumi:
        a, err := s.q.GetAnimeByBangumiID(ctx, sqlNullInt(id))
        if err == nil { return a.ID, true }
    }
    return "", false
}

import (
    "database/sql"
    "github.com/google/uuid"
)

func newID() string { return uuid.NewString() }
func sqlNullInt(id int64) sql.NullInt64 { return sql.NullInt64{Int64: id, Valid: id != 0} }
```

Add the missing query in `api/internal/store/queries/anime.sql` (if not present):

```sql
-- name: GetAnimeByAnilistID :one
SELECT * FROM anime WHERE anilist_id = ? LIMIT 1;

-- name: ListEpisodesByAnimeOrderedBySort :many
SELECT * FROM episodes WHERE anime_id = ? ORDER BY sort_order ASC, episode_number ASC;
```

(GetAnimeByBangumiID already exists per the initial grep.)

- [ ] **Step 2: Write import test**

```go
// api/internal/sync/import_test.go
package sync

import (
    "context"
    "testing"
)

func TestImportSkipsAnimeWithExistingProgress(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()

    mustInsertAnime(t, q, "a1", 12, 42)
    mustInsertEpisodes(t, q, "a1", 12)
    // Pre-existing progress on a1 → import must skip.
    mustMarkWatched(t, q, "u", "a1", 3)

    fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
        {ProviderAnimeID: 42, Status: StatusCompleted, Progress: 12},
    }}
    s := NewService(q, []Provider{fp}, func(_ context.Context, _ string, _ ProviderName) (string, error) { return "tok", nil })

    err := s.runImport(context.Background(), "u", fp, "tok")
    if err != nil { t.Fatal(err) }

    counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(), store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a1"})
    if counts.CompletedCount != 3 {
        t.Errorf("existing progress was overwritten, count=%d", counts.CompletedCount)
    }
}

func TestImportPopulatesFromRemote(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()

    mustInsertAnime(t, q, "a2", 12, 99)
    mustInsertEpisodes(t, q, "a2", 12)

    fp := &fakeProvider{name: ProviderAniList, fetched: []RemoteEntry{
        {ProviderAnimeID: 99, Status: StatusCompleted, Progress: 12},
    }}
    s := NewService(q, []Provider{fp}, func(_ context.Context, _ string, _ ProviderName) (string, error) { return "tok", nil })

    err := s.runImport(context.Background(), "u", fp, "tok")
    if err != nil { t.Fatal(err) }

    counts, _ := q.CountCompletedWatchProgressByAnime(context.Background(), store.CountCompletedWatchProgressByAnimeParams{UserID: "u", AnimeID: "a2"})
    if counts.CompletedCount != 12 {
        t.Errorf("expected 12 imported, got %d", counts.CompletedCount)
    }
}

// mustInsertEpisodes and mustMarkWatched: implement using existing test helpers.
```

- [ ] **Step 3: Run**

```bash
cd api && go test ./internal/sync/ -run TestImport -v
```

Expected: both import tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/import.go api/internal/sync/import_test.go \
        api/internal/store/queries/anime.sql api/internal/store/
git commit -m "feat(sync): add one-shot import on OAuth connect"
```

---

## Task 11: Scheduler integration

**Files:**
- Create: `api/internal/worker/sync_worker.go`
- Modify: `api/internal/worker/worker.go`

- [ ] **Step 1: Create `sync_worker.go`**

```go
package worker

import (
    "context"
    "log/slog"
    "time"

    "github.com/milmil/api/internal/sync"
)

type SyncDrainWorker struct{ svc *sync.Service }

func (w *SyncDrainWorker) Run(ctx context.Context) {
    if w.svc == nil { return }
    w.svc.Drain(ctx, 50)
}

type SyncGCWorker struct{ svc *sync.Service }

func (w *SyncGCWorker) Run(ctx context.Context) {
    if w.svc == nil { return }
    cutoff := time.Now().UTC().Add(-30 * 24 * time.Hour).Format("2006-01-02T15:04:05Z")
    if err := w.svc.GCCompletedBefore(ctx, cutoff); err != nil {
        slog.Warn("sync: gc failed", "err", err)
    }
}
```

Add `GCCompletedBefore` to `sync/service.go`:

```go
func (s *Service) GCCompletedBefore(ctx context.Context, cutoffISO string) error {
    return s.q.DeleteCompletedSyncOpsOlderThan(ctx, cutoffISO)
}
```

- [ ] **Step 2: Register in `Scheduler`**

Modify `worker.go`:
1. Import: `"github.com/milmil/api/internal/sync"`.
2. Field: `syncSvc *sync.Service`.
3. Constructor param: add `syncSvc *sync.Service` positioned after `anidbSvc` and before `wsHub`.
4. In `Start()`:

```go
go s.runTicker(ctx, "sync_outbox_drain", 10*time.Second, true, func(ctx context.Context) {
    (&SyncDrainWorker{svc: s.syncSvc}).Run(ctx)
})
go s.runTicker(ctx, "sync_outbox_gc", 24*time.Hour, true, func(ctx context.Context) {
    (&SyncGCWorker{svc: s.syncSvc}).Run(ctx)
})
```

- [ ] **Step 3: Build**

```bash
cd api && go build ./...
```

Expect compile errors at `main.go` — fixed in Task 12.

- [ ] **Step 4: Commit**

```bash
git add api/internal/worker/ api/internal/sync/service.go
git commit -m "feat(worker): register sync drain and gc jobs"
```

---

## Task 12: Wire in `main.go`

**Files:**
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Construct providers + service**

Add near existing integrations:

```go
import (
    milmilsync "github.com/milmil/api/internal/sync"
    "github.com/milmil/api/internal/sync/providers"
)

// ...inside main:
alProvider := providers.NewAniList(httpClient, "")
bgmProvider := providers.NewBangumi(httpClient, "")

tokenLoader := func(ctx context.Context, userID string, p milmilsync.ProviderName) (string, error) {
    key := string(p) + "_token"
    setting, err := queries.GetSetting(ctx, key)
    if err != nil { return "", milmilsync.ErrNoToken }
    var tokenData map[string]any
    if err := json.Unmarshal([]byte(setting.Value), &tokenData); err != nil {
        return "", milmilsync.ErrNoToken
    }
    tok, _ := tokenData["access_token"].(string)
    if tok == "" { return "", milmilsync.ErrNoToken }
    return tok, nil
}

syncSvc := milmilsync.NewService(queries, []milmilsync.Provider{alProvider, bgmProvider}, tokenLoader)
```

- [ ] **Step 2: Inject into handlers + scheduler**

- Pass `syncSvc` to the handler constructor (find whatever builds `handler`).
- Pass `syncSvc` to `worker.NewScheduler(...)` in the new param position.

- [ ] **Step 3: Build**

```bash
cd api && go build ./... && go vet ./...
```

Must be clean.

- [ ] **Step 4: Commit**

```bash
git add api/cmd/server/main.go
git commit -m "feat(server): wire sync service into handlers and scheduler"
```

---

## Task 13: Hook into progress handler

**Files:**
- Modify: `api/internal/api/progress_handler.go`

- [ ] **Step 1: Call `OnProgressUpdate` after DB write**

After the existing `UpsertWatchProgress` success path in the PUT handler, add:

```go
// Fire-and-forget enqueue; errors are logged inside OnProgressUpdate.
go h.syncSvc.OnProgressUpdate(context.Background(), userID, episode.AnimeID)
```

Use a background context because the handler's context will be cancelled when the response is sent. `h.syncSvc` is the field added in Task 12. If the handler type doesn't already hold the service, add it alongside `queries` and similar fields.

Rationale: the enqueue write is ~1ms, but putting it in a goroutine keeps the handler's p99 latency unaffected and is safe because the queue is durable. The worker picks it up within 10 seconds.

- [ ] **Step 2: Build**

```bash
cd api && go build ./... && go vet ./...
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/api/progress_handler.go
git commit -m "feat(progress): enqueue sync ops after watch progress updates"
```

---

## Task 14: Refactor oauth_handler.go to use the queue

**Files:**
- Modify: `api/internal/api/oauth_handler.go`

- [ ] **Step 1: Replace `handleAniListSync` body**

Instead of iterating animes and calling AniList directly, delegate to `syncSvc.FlushUser`:

```go
func (h *handler) handleAniListSync(c echo.Context) error {
    ctx := c.Request().Context()
    userID := getUserID(c)
    n, err := h.syncSvc.FlushUser(ctx, userID, milmilsync.ProviderAniList)
    if err != nil {
        return echo.ErrInternalServerError
    }
    return c.JSON(http.StatusOK, map[string]any{"enqueued": n})
}
```

Apply the same treatment to `handleBangumiSync` with `ProviderBangumi`.

- [ ] **Step 2: Enqueue import on OAuth callback**

After the token is stored in `handleAniListCallback` and `handleBangumiCallback`, enqueue:

```go
if err := h.syncSvc.EnqueueImport(ctx, userID, milmilsync.ProviderAniList); err != nil {
    slog.Warn("sync: enqueue import", "err", err)
}
```

- [ ] **Step 3: Mark pending rows on disconnect**

In `handleAniListDisconnect` (and Bangumi) after `DeleteSetting`:

```go
_ = h.syncSvc.Disconnect(ctx, userID, milmilsync.ProviderAniList)
```

- [ ] **Step 4: Delete the now-dead inline mutation code**

Remove the `SaveMediaListEntry` loop and the Bangumi PUT loop — that logic lives in the provider adapters now.

- [ ] **Step 5: Build**

```bash
cd api && go build ./... && go vet ./...
```

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/oauth_handler.go
git commit -m "feat(oauth): replace inline sync with outbox enqueue + import"
```

---

## Task 15: Sync status endpoint + frontend types

**Files:**
- Create: `api/internal/api/sync_handler.go`
- Modify: `api/internal/api/routes.go` (or wherever routes register — find it)
- Modify: `web/src/lib/api/sync.ts` (new)
- Modify: `web/src/lib/api/anime.ts`

- [ ] **Step 1: Implement handler**

```go
// api/internal/api/sync_handler.go
package api

import (
    "net/http"

    "github.com/labstack/echo/v4"
    milmilsync "github.com/milmil/api/internal/sync"
)

type syncProviderStatus struct {
    Provider   string `json:"provider"`
    Connected  bool   `json:"connected"`
    LastSync   string `json:"last_sync"`
    Pending    int64  `json:"pending"`
    LastErrors []syncErrorEntry `json:"last_errors"`
}

type syncErrorEntry struct {
    AnimeID string `json:"anime_id"`
    Error   string `json:"error"`
    At      string `json:"at"`
}

func (h *handler) handleSyncStatus(c echo.Context) error {
    ctx := c.Request().Context()
    userID := getUserID(c)
    out := []syncProviderStatus{}
    for _, p := range []milmilsync.ProviderName{milmilsync.ProviderAniList, milmilsync.ProviderBangumi} {
        _, tokErr := h.syncTokenLoader(ctx, userID, p)
        connected := tokErr == nil
        pending, _ := h.queries.CountPendingSyncOpsByUserProvider(ctx, store.CountPendingSyncOpsByUserProviderParams{UserID: userID, Provider: string(p)})
        lastOp, _ := h.queries.GetLatestCompletedSyncOp(ctx, store.GetLatestCompletedSyncOpParams{UserID: userID, Provider: string(p)})
        errs, _ := h.queries.ListRecentSyncErrors(ctx, store.ListRecentSyncErrorsParams{UserID: userID, Provider: string(p)})
        eout := make([]syncErrorEntry, 0, len(errs))
        for _, e := range errs {
            eout = append(eout, syncErrorEntry{AnimeID: e.AnimeID, Error: e.LastError.String, At: e.CreatedAt})
        }
        out = append(out, syncProviderStatus{
            Provider: string(p), Connected: connected, Pending: pending,
            LastSync: lastOp.CompletedAt.String, LastErrors: eout,
        })
    }
    return c.JSON(http.StatusOK, out)
}
```

(`h.syncTokenLoader` should be stored on handler or access the loader via `syncSvc`. Adapt to match the handler struct.)

Register `GET /api/v1/sync/status` under the authenticated routes group.

- [ ] **Step 2: Frontend types**

`web/src/lib/api/sync.ts`:

```ts
export type SyncProvider = "anilist" | "bangumi";

export interface SyncProviderStatus {
  provider: SyncProvider;
  connected: boolean;
  last_sync: string;
  pending: number;
  last_errors: Array<{ anime_id: string; error: string; at: string }>;
}

export const syncApi = {
  async status(): Promise<SyncProviderStatus[]> {
    const res = await fetch("/api/v1/sync/status", { credentials: "include" });
    if (!res.ok) throw new Error("sync status: " + res.status);
    return res.json();
  },
  async flush(provider: SyncProvider): Promise<{ enqueued: number }> {
    const res = await fetch(`/api/v1/oauth/${provider}/sync`, { method: "POST", credentials: "include" });
    if (!res.ok) throw new Error("flush: " + res.status);
    return res.json();
  },
};
```

- [ ] **Step 3: Add new fields to `Anime` type**

In `web/src/lib/api/anime.ts`, add to the appropriate Anime or PlayableEpisodesResponse:

```ts
sync_disabled?: number;               // 0 | 1
watch_status_override?: string;       // '' when empty
```

- [ ] **Step 4: Build + typecheck**

```bash
cd api && go build ./...
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -20
```

No new errors.

- [ ] **Step 5: Commit**

```bash
git add api/internal/api/sync_handler.go api/internal/api/routes.go web/src/lib/api/
git commit -m "feat(api): add sync status endpoint and frontend types"
```

---

## Task 16: Settings IntegrationsPage

**Files:**
- Create (or extend): `web/src/pages/settings/IntegrationsPage.tsx`

- [ ] **Step 1: Identify where the existing Bangumi/AniList connect buttons live.**

Look for any current OAuth UI. If it's in a legacy settings page, you may extend that file instead of creating a new one. Find by:

```bash
grep -rln "bangumi/auth-url\|anilist/auth-url" web/src
```

- [ ] **Step 2: Implement connection cards**

Use existing UI primitives (Card, Button, Skeleton). Follow project memory: no primary/accent for borders, use white/opacity. Show a skeleton while loading per the project skeleton-loader rule.

Sketch (adapt to existing components — do not invent new ones):

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { syncApi } from "@/lib/api/sync";

export function IntegrationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["sync-status"], queryFn: syncApi.status, refetchInterval: 15000 });
  const flush = useMutation({
    mutationFn: (p: "anilist" | "bangumi") => syncApi.flush(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sync-status"] }),
  });

  if (isLoading || !data) return <SkeletonCards />;
  return (
    <div className="grid gap-4">
      {data.map((s) => (
        <ProviderCard
          key={s.provider}
          status={s}
          onFlush={() => flush.mutate(s.provider)}
        />
      ))}
    </div>
  );
}
```

`ProviderCard` renders: provider name, connected badge, last-sync time, pending count, recent-errors list (up to 5), Connect/Disconnect button (delegates to existing OAuth URLs), Sync Now button. Disable Sync Now when `!connected`.

- [ ] **Step 3: Verify in browser**

Start dev server. Navigate to Settings → Integrations. With a connected account, confirm:

- Status card renders without flash of unstyled content.
- Pending count updates after triggering a sync (check every 15s).
- Last-sync timestamp is i18n-formatted (use existing locale helper).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/settings/
git commit -m "feat(web): add integrations settings page with sync status"
```

---

## Task 17: Anime detail sync toggle

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`
- Modify: `api/internal/api/anime_handler.go` (add PATCH endpoint if missing)

- [ ] **Step 1: Backend endpoint to toggle**

Add to `anime_handler.go`:

```go
func (h *handler) handleUpdateAnimeSyncFlags(c echo.Context) error {
    animeID := c.Param("id")
    var req struct {
        SyncDisabled        *int    `json:"sync_disabled"`
        WatchStatusOverride *string `json:"watch_status_override"`
    }
    if err := c.Bind(&req); err != nil {
        return echo.ErrBadRequest
    }
    current, err := h.queries.GetAnime(c.Request().Context(), animeID)
    if err != nil { return echo.ErrNotFound }
    params := store.UpdateAnimeSyncFlagsParams{
        ID: animeID,
        SyncDisabled: current.SyncDisabled,
        WatchStatusOverride: current.WatchStatusOverride,
    }
    if req.SyncDisabled != nil { params.SyncDisabled = int64(*req.SyncDisabled) }
    if req.WatchStatusOverride != nil { params.WatchStatusOverride = *req.WatchStatusOverride }
    if err := h.queries.UpdateAnimeSyncFlags(c.Request().Context(), params); err != nil {
        return echo.ErrInternalServerError
    }
    return c.NoContent(http.StatusNoContent)
}
```

Register `PATCH /api/v1/anime/:id/sync-flags`.

- [ ] **Step 2: Frontend toggle**

In `AnimeDetailPage.tsx`, add an overflow menu item or settings-gear section:

```tsx
<button onClick={() => toggleSync(!anime.sync_disabled)}>
  {anime.sync_disabled ? "Enable tracker sync" : "Exclude from tracker sync"}
</button>
```

`toggleSync` is a mutation that PATCHes the new endpoint and invalidates the anime query.

- [ ] **Step 3: Typecheck + browser sanity**

Click the toggle; refresh; verify the setting persists. Verify the sync queue does not produce new rows for disabled animes (query `sync_outbox` directly).

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/anime_handler.go web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(anime): add per-anime sync opt-out toggle"
```

---

## Task 18: End-to-end validation + PR

- [ ] **Step 1: Full build + test**

```bash
cd api && go build ./... && go vet ./... && go test ./internal/sync/... ./internal/api/... ./internal/worker/...
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

All sync-related tests green. Pre-existing baseline failures (resolver/rss/storage) unchanged.

- [ ] **Step 2: Manual validation**

1. Connect an AniList test account.
2. Confirm `sync_outbox` has an `import` row; watch queue drain.
3. After import, a few completed animes should show progress matching remote.
4. Watch a new episode → `sync_outbox` gets a `progress` row → within 10s row marked complete.
5. Verify on AniList web that progress increased.
6. Disconnect → pending rows clear; reconnect → status resets.
7. Toggle a single anime's "Exclude from tracker sync" → no new outbox row on next progress.
8. Force an error (revoke token on AniList) → row goes dead-letter after 30 attempts; UI shows error.

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "feat: watch state sync (Bangumi + AniList) Phase A" --body-file ...
```

Reference the spec and plan files.

---

---

## Plan revisions (applied during eng review)

Apply these deltas inline when executing each task. Original tasks stay numbered as-is; revisions add new tasks (0.5, 10.5) and replace specific steps.

### Δ Task 0.5 — Test harness inventory (NEW, do FIRST)

Before any sync test is written, document the existing in-memory sqlite harness so every later task reuses it instead of reinventing.

- [ ] **Step 1: Inventory the harness**

Read these files end-to-end and note helpers + fixtures:

- `api/internal/resolver/resolver_test.go` — already sets up in-memory sqlite + runs migrations.
- `api/internal/matcher/matcher_test.go` — similar pattern; has `mockBangumi` stub.

Document in a new file `api/internal/sync/testing_shared_test.go`:

```go
//go:build test
// Package-local test helpers. Copy-paste the in-memory sqlite bootstrap from
// resolver_test.go verbatim and expose it as newTestQueries(t) → (*store.Queries, func()).
// Also expose mustInsertAnime(t, q, id, totalEps, anilistID, bangumiID),
// mustInsertEpisodes(t, q, animeID, count, bangumiEpisodeIDStart),
// mustMarkWatched(t, q, userID, animeID, n).
```

If the harness already lives somewhere importable, skip creating a new file — just document the import path and helper names the sync tests should use. If not, extract them once here.

- [ ] **Step 2: Verify harness runs clean**

```bash
cd api && go test -run xxx ./internal/sync/ -v  # compile-only smoke
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/sync/testing_shared_test.go
git commit -m "test(sync): document shared in-memory test harness"
```

### Δ Task 4 Step 2 — `Queue.Enqueue` must use a transaction (A2 fix)

Replace the body of `Enqueue`:

```go
func (qu *Queue) Enqueue(ctx context.Context, userID string, provider ProviderName, animeID string, op SyncOp) error {
    payload, err := json.Marshal(op)
    if err != nil {
        return fmt.Errorf("sync: marshal op: %w", err)
    }
    return qu.inTx(ctx, func(tx *store.Queries) error {
        if op.Kind == KindProgress {
            if err := tx.SupersedeProgressOps(ctx, store.SupersedeProgressOpsParams{
                UserID: userID, Provider: string(provider), AnimeID: animeID,
            }); err != nil {
                return fmt.Errorf("supersede: %w", err)
            }
        }
        return tx.EnqueueSyncOp(ctx, store.EnqueueSyncOpParams{
            ID:       uuid.NewString(),
            UserID:   userID,
            Provider: string(provider),
            AnimeID:  animeID,
            Kind:     string(op.Kind),
            Payload:  string(payload),
        })
    })
}
```

`inTx` is a helper on `Queue` that acquires a SQL transaction and calls `q.WithTx(tx)` (sqlc-generated). If the repo has an existing `withTx` helper, reuse it; if not, write it once here:

```go
// Requires the raw *sql.DB, not just *store.Queries. Extend NewQueue to accept it:
type Queue struct {
    q  *store.Queries
    db *sql.DB
}

func NewQueue(q *store.Queries, db *sql.DB) *Queue { return &Queue{q: q, db: db} }

func (qu *Queue) inTx(ctx context.Context, fn func(*store.Queries) error) error {
    tx, err := qu.db.BeginTx(ctx, &sql.TxOptions{})
    if err != nil { return err }
    defer tx.Rollback()
    if err := fn(qu.q.WithTx(tx)); err != nil { return err }
    return tx.Commit()
}
```

Update `NewService` signature and `main.go` wiring to pass `*sql.DB`.

**Add this test** to `queue_test.go`:

```go
func TestEnqueueConcurrentSupersedeRace(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    ctx := context.Background()
    qu := NewQueue(q, db)

    const N = 20
    var wg sync.WaitGroup
    for i := 0; i < N; i++ {
        wg.Add(1)
        go func(i int) {
            defer wg.Done()
            _ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: i})
        }(i)
    }
    wg.Wait()

    rows, _ := q.ListReadySyncOps(ctx, 100)
    if len(rows) != 1 {
        t.Errorf("expected exactly 1 active row after concurrent enqueues, got %d", len(rows))
    }
}
```

`newTestQueriesWithDB` returns the `*sql.DB` alongside `*store.Queries` — extend the harness from Task 0.5 accordingly.

### Δ Task 9 Step 1 — Worker groups by (user, provider), uses mutex, batch=10 (A3 + A6)

Replace `Drain`:

```go
var drainMu sync.Mutex // prevents overlapping ticks

func (s *Service) Drain(ctx context.Context, batchSize int32) {
    if !drainMu.TryLock() {
        slog.Info("sync: drain already running, skipping tick")
        return
    }
    defer drainMu.Unlock()

    if batchSize <= 0 { batchSize = 10 }
    rows, err := s.q.ListReadySyncOps(ctx, batchSize)
    if err != nil {
        slog.Warn("sync: list ready ops", "err", err)
        return
    }

    // Group by (user_id, provider). When a row in a group returns a
    // TransientError with RetryAfter, apply the same next_attempt_at to all
    // remaining rows in that group in one UPDATE.
    groups := make(map[string][]store.SyncOutbox)
    for _, r := range rows {
        key := r.UserID + "|" + r.Provider
        groups[key] = append(groups[key], r)
    }

    for _, group := range groups {
        var pausedUntil time.Time
        for _, row := range group {
            if !pausedUntil.IsZero() {
                // Rest of the group deferred to the same Retry-After window.
                _ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
                    Attempts:      row.Attempts, // don't penalize unprocessed rows
                    NextAttemptAt: pausedUntil.UTC().Format("2006-01-02T15:04:05Z"),
                    LastError:     sqlNull("rate-limited group"),
                    ID:            row.ID,
                })
                continue
            }
            pausedUntil = s.processRow(ctx, row)
        }
    }
}

// processRow returns a non-zero time when the provider signaled rate-limiting;
// the caller defers the rest of the group's rows to that time.
func (s *Service) processRow(ctx context.Context, row store.SyncOutbox) time.Time {
    // ...same logic as before but on TransientError with RetryAfter, return
    // time.Now().Add(te.RetryAfter) instead of just rescheduling this one row.
}
```

Wire `SyncDrainWorker` to call with `batchSize=10`:

```go
func (w *SyncDrainWorker) Run(ctx context.Context) {
    if w.svc == nil { return }
    w.svc.Drain(ctx, 10)
}
```

### Δ Task 8 — `FlushUser` filters to animes with completed progress (A5)

Update the query in Task 8 Step 2 to require a completed episode:

```sql
-- name: ListAnimeForUserWithProviderID :many
SELECT DISTINCT a.* FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE wp.user_id = sqlc.arg('user_id')
  AND wp.completed = 1
  AND ( (sqlc.arg('provider') = 'anilist' AND a.anilist_id IS NOT NULL)
     OR (sqlc.arg('provider') = 'bangumi' AND a.bangumi_id IS NOT NULL) )
  AND a.sync_disabled = 0;
```

The `wp.completed = 1` clause is the only addition. No Go change needed; FlushUser naturally skips untouched animes now.

### Δ Task 9 Step 1 — Fix `ListBangumiEpisodeIDsForAnimeWatchedByUser` SQL (C4)

Replace the broken query:

```sql
-- name: ListBangumiEpisodeIDsForAnimeWatchedByUser :many
SELECT e.bangumi_episode_id
FROM episodes e
JOIN watch_progress wp ON wp.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
  AND wp.user_id = sqlc.arg('user_id')
  AND wp.completed = 1
  AND e.bangumi_episode_id IS NOT NULL;
```

sqlc emits `[]sql.NullInt64`. In `worker.go`:

```go
rawEpIDs, _ := s.q.ListBangumiEpisodeIDsForAnimeWatchedByUser(ctx, store.ListBangumiEpisodeIDsForAnimeWatchedByUserParams{
    AnimeID: row.AnimeID, UserID: row.UserID,
})
epIDs := make([]int64, 0, len(rawEpIDs))
for _, n := range rawEpIDs {
    if n.Valid { epIDs = append(epIDs, n.Int64) }
}
```

### Δ Task 9 `failRow` — remove redundant reschedule (C3)

```go
func (s *Service) failRow(ctx context.Context, row store.SyncOutbox, reason string, deadLetter bool) {
    if deadLetter {
        slog.Warn("sync: dead letter", "provider", row.Provider, "anime", row.AnimeID, "err", reason)
        _ = s.q.MarkSyncOpCompleted(ctx, row.ID)
        return
    }
    _ = s.q.RescheduleSyncOp(ctx, store.RescheduleSyncOpParams{
        Attempts:      row.Attempts + 1,
        NextAttemptAt: time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02T15:04:05Z"),
        LastError:     sqlNull(reason),
        ID:            row.ID,
    })
}
```

### Δ Task 10.5 — Integration test (NEW)

After Task 10 (import), before Task 11 (scheduler).

**Files:**
- Create: `api/internal/sync/integration_test.go`

- [ ] **Step 1: End-to-end flow**

```go
package sync_test  // external test package so we exercise the public API

import (
    "compress/gzip"
    "context"
    "encoding/json"
    "io"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"

    milmilsync "github.com/milmil/api/internal/sync"
    "github.com/milmil/api/internal/sync/providers"
)

func TestEndToEndProgressPushReachesProvider(t *testing.T) {
    var received []string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        b, _ := io.ReadAll(r.Body)
        received = append(received, string(b))
        w.Header().Set("Content-Type", "application/json")
        _, _ = io.WriteString(w, `{"data":{"SaveMediaListEntry":{"id":1,"progress":5}}}`)
    }))
    defer srv.Close()

    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12 /*total*/, 42 /*anilistID*/, 0 /*bangumiID*/)
    mustInsertEpisodes(t, q, "a1", 12, 0 /*no bangumi ep ids*/)

    al := providers.NewAniList(srv.Client(), srv.URL)
    tokenLoader := func(_ context.Context, _ string, _ milmilsync.ProviderName) (string, error) {
        return "fake-token", nil
    }
    svc := milmilsync.NewService(q, db, []milmilsync.Provider{al}, tokenLoader)

    // User "u" marks 5 episodes as watched (simulating the PUT /watch-progress side effect).
    mustMarkWatched(t, q, "u", "a1", 5)
    start := time.Now()
    svc.OnProgressUpdate(context.Background(), "u", "a1")
    enqueueLatency := time.Since(start)
    if enqueueLatency > 20*time.Millisecond {
        t.Errorf("enqueue too slow: %v (must be <20ms to keep handler latency bounded)", enqueueLatency)
    }

    // Drain the queue — worker calls the httptest server.
    svc.Drain(context.Background(), 10)

    if len(received) != 1 {
        t.Fatalf("expected 1 HTTP call, got %d", len(received))
    }
    var gql map[string]any
    _ = json.Unmarshal([]byte(received[0]), &gql)
    vars := gql["variables"].(map[string]any)
    if int(vars["progress"].(float64)) != 5 {
        t.Errorf("progress mismatch: %v", vars)
    }
    if vars["status"].(string) != "CURRENT" {
        t.Errorf("status mismatch: %v", vars)
    }

    // No pending rows after successful drain.
    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 {
        t.Errorf("expected 0 pending rows, got %d", len(rows))
    }
}

func TestEndToEndRateLimitGroupingHonored(t *testing.T) {
    var callCount int
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        callCount++
        w.Header().Set("Retry-After", "30")
        w.WriteHeader(http.StatusTooManyRequests)
    }))
    defer srv.Close()

    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    for i := 0; i < 5; i++ {
        id := "a" + string(rune('1'+i))
        mustInsertAnime(t, q, id, 12, int64(100+i), 0)
        mustInsertEpisodes(t, q, id, 12, 0)
        mustMarkWatched(t, q, "u", id, 1)
    }

    al := providers.NewAniList(srv.Client(), srv.URL)
    svc := milmilsync.NewService(q, db, []milmilsync.Provider{al}, func(_ context.Context, _ string, _ milmilsync.ProviderName) (string, error) { return "tok", nil })
    for i := 0; i < 5; i++ {
        id := "a" + string(rune('1'+i))
        svc.OnProgressUpdate(context.Background(), "u", id)
    }

    svc.Drain(context.Background(), 10)

    if callCount != 1 {
        t.Errorf("expected exactly 1 upstream call before rate-limit grouping kicks in, got %d", callCount)
    }
}

// newTestQueriesWithDB / mustInsertAnime etc come from Task 0.5's shared harness.
```

- [ ] **Step 2: Unused gzip import guard (delete the import if Goimports flags it)**

```go
var _ = gzip.BestCompression
```

- [ ] **Step 3: Run**

```bash
cd api && go test ./internal/sync/ -v -run TestEndToEnd
```

Both tests must pass. The rate-limit test specifically verifies A3 (grouping).

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/integration_test.go
git commit -m "test(sync): add end-to-end integration + rate-limit grouping tests"
```

### Δ Task 13 — Enqueue synchronously, NOT in a goroutine (A1 fix)

Replace:

```go
go h.syncSvc.OnProgressUpdate(context.Background(), userID, episode.AnimeID)
```

with:

```go
// Synchronous: the enqueue is ~1ms and must complete before we return 200,
// otherwise a crash between DB write and enqueue drops the sync op silently.
h.syncSvc.OnProgressUpdate(c.Request().Context(), userID, episode.AnimeID)
```

Use `c.Request().Context()` so the enqueue honors request cancellation. Rationale: SQLite INSERT + 2-3 point reads is ~1ms, well under any handler latency budget.

Add a regression test asserting the handler latency budget:

```go
// api/internal/api/progress_handler_test.go (extend existing)
func TestWatchProgressHandlerLatencyWithSyncEnqueue(t *testing.T) {
    // Build handler with a service whose Enqueue does the real DB write.
    // Fire 100 PUT requests; assert p99 < 50ms.
    // (Use existing test harness; see resolver_test.go.)
}
```

### Δ Spec update — document Phase A token-refresh deferral (A4)

In `docs/superpowers/specs/2026-04-14-watch-sync-phase-a-design.md` under "Out of scope (deferred to Phase B)," add:

```markdown
- **OAuth token refresh.** AniList tokens last 1 year; Bangumi likewise. Phase A treats 401/403 as fatal — worker marks the row dead-letter and emits a `sync:needs_reauth` ws event. User reconnects via the existing OAuth flow. Automatic refresh using the stored `refresh_token` ships in Phase B.
```

No Go code changes for A4; the 401 handling is already fatal per Task 6/7 error paths.

---

## Self-review notes

- **Spec coverage:** outbox ✓, worker ✓, status derivation ✓, import ✓, per-anime opt-out ✓, rate-limit + retry ✓, UI cards + toggle ✓, disconnect cleanup ✓.
- **Scope:** Phase A only. Trakt/MAL, bidirectional pull, conflict UI explicitly deferred.
- **Known follow-ups not in scope:** manual "retry now" button on dead-letter rows; sync status websocket push (today polls every 15s); pruning watch_progress imported rows if user changes their mind.
- **Test harness dependency:** Several tests reference `newTestQueries` / `mustInsertAnime` / `mustInsertEpisodes` / `mustMarkWatched`. Implementers must find and reuse the repo's existing in-memory sqlite helper (see `resolver_test.go` or `matcher_test.go`). Do NOT write a new harness — reuse the pattern already in place.
