# Codebase Hygiene — Fix Review Issues

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the top 7 issues from the codebase review: silent error drops, torrent registry race condition, WebSocket CORS, danmaku state duplication, notification retry backoff, test file cleanup, and OpenAPI sync.

**Architecture:** Each task is independent — fixes one isolated issue. No cross-task dependencies. All Go changes follow existing slog patterns. Frontend change consolidates two Zustand stores into one.

**Tech Stack:** Go (slog, sync.RWMutex), React (Zustand), OpenAPI JSON

---

## File Map

| Task | Files | Action |
|------|-------|--------|
| 1 | `api/internal/matcher/matcher.go`, `api/internal/matcher/enrichment.go` | Replace `_ =` with `slog.Warn` |
| 2 | `api/internal/notification/service.go` | Replace `_ =` with `slog.Warn` |
| 3 | `api/internal/api/subscribe_handler.go`, `rule_handler.go`, `download_handler.go`, `library_handler.go`, `danmaku_handler.go`, `transcode_handler.go`, `backup_handler.go`, `collection_handler.go`, `settings_handler.go` | Replace `_ =` with `slog.Warn` |
| 4 | `api/internal/torrent/provider.go` | Add `sync.RWMutex` to Registry |
| 5 | `api/internal/api/ws_handler.go` | Restrict `CheckOrigin` to localhost |
| 6 | `web/src/store/player-store.ts` (delete), `web/src/components/DanmakuSettings.tsx`, `web/src/components/DanmakuOverlay.tsx`, `web/src/pages/settings/PlayerPanel.tsx`, `web/src/pages/WatchPage.tsx`, `web/src/pages/WatchPage.test.tsx` | Consolidate danmaku state to preferences-store |
| 7 | 27 `web/test-*.tsx` files | Delete |

---

### Task 1: Fix silent error drops in matcher package

**Files:**
- Modify: `api/internal/matcher/matcher.go`
- Modify: `api/internal/matcher/enrichment.go`

The matcher has `_ =` on DB update calls that silently swallow failures. Cache set/get failures are acceptable to ignore (cache is best-effort), but DB writes and JSON unmarshal from cache should log warnings.

- [ ] **Step 1: Add slog import and replace DB write drops in matcher.go**

In `matcher.go`, the following lines silently discard DB errors and must log instead:

**Line 124** — `_ = m.queries.UpdateMediaFileBangumiIDs(...)` → log on error
**Line 159** — `_ = m.queries.UpdateMediaFileDandanplayIDs(...)` → log on error  
**Line 197** — `_ = m.queries.UpdateMediaFileBangumiIDs(...)` → log on error
**Line 236** — `_ = m.queries.UpdateMediaFileBangumiIDs(...)` → log on error

For each, replace:
```go
// Before
_ = m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{...})

// After
if err := m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{...}); err != nil {
    slog.Warn("matcher: update media file failed", "file", f.ID, "err", err)
}
```

Also add `"log/slog"` to the import block if not already present.

Leave cache operations (`m.cache.Set`, `m.cache.Get`, `json.Unmarshal` from cache) as `_ =` — cache is best-effort and these are noisy.

- [ ] **Step 2: Fix enrichment.go silent drops**

In `enrichment.go`:

**Line 43** — `_ = q.UpdateAnimeTMDBID(...)` → log on error:
```go
if err := q.UpdateAnimeTMDBID(ctx, store.UpdateAnimeTMDBIDParams{...}); err != nil {
    slog.Warn("enrichment: update anime TMDB ID failed", "err", err)
}
```

Leave `_ = c.Set(...)` on line 67 as-is (cache best-effort).

- [ ] **Step 3: Verify build**

```bash
cd api && go build ./...
```

Expected: Clean build, no errors.

- [ ] **Step 4: Run existing tests**

```bash
cd api && go test ./internal/matcher/... -v
```

Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/matcher/matcher.go api/internal/matcher/enrichment.go
git commit -m "fix(matcher): log DB write errors instead of silently dropping them"
```

---

### Task 2: Fix silent error drops in notification service

**Files:**
- Modify: `api/internal/notification/service.go`

- [ ] **Step 1: Replace silent drops with slog.Warn**

**Line 192** — `_ = s.queries.UpdateDeliveryFailure(...)`:
```go
// Before
_ = s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{...})

// After
if dbErr := s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
    LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
    NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
    ID:          deliveryID,
}); dbErr != nil {
    slog.Error("notification: record delivery failure failed", "provider", name, "deliveryID", deliveryID, "err", dbErr)
}
```

**Line 199** — `_ = s.queries.UpdateDeliverySuccess(...)`:
```go
// Before
_ = s.queries.UpdateDeliverySuccess(ctx, deliveryID)

// After
if dbErr := s.queries.UpdateDeliverySuccess(ctx, deliveryID); dbErr != nil {
    slog.Error("notification: record delivery success failed", "provider", name, "deliveryID", deliveryID, "err", dbErr)
}
```

- [ ] **Step 2: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 3: Run notification tests**

```bash
cd api && go test ./internal/notification/... -v
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/notification/service.go
git commit -m "fix(notification): log delivery status update errors"
```

---

### Task 3: Fix silent error drops in API handlers

**Files:**
- Modify: `api/internal/api/subscribe_handler.go` (lines 177, 271)
- Modify: `api/internal/api/rule_handler.go` (line 196)
- Modify: `api/internal/api/download_handler.go` (lines 103, 133)
- Modify: `api/internal/api/library_handler.go` (lines 368, 372, 377, 382)
- Modify: `api/internal/api/danmaku_handler.go` (lines 53, 90)
- Modify: `api/internal/api/transcode_handler.go` (lines 74, 96, 111, 128)
- Modify: `api/internal/api/backup_handler.go` (line 239)
- Modify: `api/internal/api/collection_handler.go` (line 203)
- Modify: `api/internal/api/settings_handler.go` (line 109)

- [ ] **Step 1: Fix subscribe_handler.go**

**Line 177** — `_ = h.queries.DeleteRSSFeed(ctx, feed.ID)`:
```go
if err := h.queries.DeleteRSSFeed(ctx, feed.ID); err != nil {
    slog.Warn("subscribe: delete orphan RSS feed failed", "feedID", feed.ID, "err", err)
}
```

**Line 271** — `_ = h.queries.UpdateDownloadRuleTriggered(ctx, rule.ID)`:
```go
if err := h.queries.UpdateDownloadRuleTriggered(ctx, rule.ID); err != nil {
    slog.Warn("subscribe: mark rule triggered failed", "ruleID", rule.ID, "err", err)
}
```

- [ ] **Step 2: Fix rule_handler.go**

**Line 196** — `_ = h.queries.UnlinkDownloadsByRuleID(...)`:
```go
if err := h.queries.UnlinkDownloadsByRuleID(ctx, sql.NullString{String: ruleID, Valid: true}); err != nil {
    slog.Warn("rule: unlink downloads failed", "ruleID", ruleID, "err", err)
}
```

- [ ] **Step 3: Fix download_handler.go**

**Line 103** — `_ = h.downloader.Remove(ctx, gid, deleteFiles)`:
```go
if err := h.downloader.Remove(ctx, gid, deleteFiles); err != nil {
    slog.Warn("download: remove from engine failed", "gid", gid, "err", err)
}
```

**Line 133** — `_ = h.downloader.Remove(ctx, dl.Gid, deleteFiles)`:
```go
if err := h.downloader.Remove(ctx, dl.Gid, deleteFiles); err != nil {
    slog.Warn("download: remove from engine failed", "gid", dl.Gid, "err", err)
}
```

- [ ] **Step 4: Fix library_handler.go**

Lines 368-382 are fire-and-forget goroutine results. These should log:
```go
// Line 368
if _, matchErr := h.matcher.MatchLibrary(context.Background(), lib.ID, onProgress); matchErr != nil {
    slog.Warn("library: background match failed", "libraryID", lib.ID, "err", matchErr)
}
// Line 372
if _, resolveErr := h.resolver.ResolveLibrary(context.Background(), lib.ID); resolveErr != nil {
    slog.Warn("library: background resolve failed", "libraryID", lib.ID, "err", resolveErr)
}
// Line 377
if _, resolveErr := h.resolver.ResolveBangumiMatched(context.Background(), lib.ID); resolveErr != nil {
    slog.Warn("library: background bangumi resolve failed", "libraryID", lib.ID, "err", resolveErr)
}
// Line 382
if _, enrichErr := matcher.EnrichEpisodesFromTMDB(context.Background(), h.queries, h.tmdb, h.cache, lib.ID); enrichErr != nil {
    slog.Warn("library: background TMDB enrichment failed", "libraryID", lib.ID, "err", enrichErr)
}
```

- [ ] **Step 5: Fix remaining handler files**

**danmaku_handler.go** — cache ops (lines 53, 90): leave as `_ =` (cache best-effort).

**transcode_handler.go**:
- Line 74: `_ = h.queries.UpdateTranscodeSessionStatus(...)` → log error
- Line 128: `_ = h.queries.UpdateTranscodeSessionStatus(...)` → log error
- Lines 96, 111: `_ = os.MkdirAll(...)`, `_ = os.Remove(...)` → log error

**backup_handler.go** — line 239: `_ = h.queries.UpdateBackupSyncTime(...)` → log error

**collection_handler.go** — line 203: `_, _ = h.queries.CreateAnime(...)` → log error

**settings_handler.go** — line 109: `_, _ = h.queries.UpsertSetting(...)` → log error

Pattern for all: replace `_ =` with `if err := ...; err != nil { slog.Warn("context: description", "err", err) }`.

- [ ] **Step 6: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 7: Run handler tests**

```bash
cd api && go test ./internal/api/... -v
```

- [ ] **Step 8: Commit**

```bash
git add api/internal/api/
git commit -m "fix(api): log errors instead of silently dropping them in handlers"
```

---

### Task 4: Add mutex to torrent provider registry

**Files:**
- Modify: `api/internal/torrent/provider.go`

The `Registry` struct uses a bare `map[string]Provider`. `Register()` writes to it and `SearchAll()` iterates it concurrently. While in practice providers are registered at startup before `SearchAll` is called, this is a latent race condition.

- [ ] **Step 1: Add RWMutex to Registry**

Replace the full `Registry` implementation:

```go
type Registry struct {
	mu        sync.RWMutex
	providers map[string]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

func (r *Registry) Register(p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Name()] = p
}

func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

func (r *Registry) Search(ctx context.Context, source, query string) ([]SearchResult, error) {
	r.mu.RLock()
	p, ok := r.providers[source]
	r.mu.RUnlock()
	if !ok {
		return nil, nil
	}
	return p.Search(ctx, query)
}

func (r *Registry) SearchAll(ctx context.Context, query string) []SearchResult {
	r.mu.RLock()
	snapshot := make([]Provider, 0, len(r.providers))
	for _, p := range r.providers {
		snapshot = append(snapshot, p)
	}
	r.mu.RUnlock()

	var (
		mu      sync.Mutex
		results []SearchResult
		wg      sync.WaitGroup
	)
	for _, p := range snapshot {
		wg.Add(1)
		go func(p Provider) {
			defer wg.Done()
			res, err := p.Search(ctx, query)
			if err != nil || len(res) == 0 {
				return
			}
			mu.Lock()
			results = append(results, res...)
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	return results
}
```

Key change in `SearchAll`: take a snapshot of providers under RLock, then iterate the snapshot without holding the lock. This avoids holding RLock during potentially slow Search calls.

- [ ] **Step 2: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/torrent/provider.go
git commit -m "fix(torrent): add RWMutex to provider registry to prevent data race"
```

---

### Task 5: Secure WebSocket CheckOrigin

**Files:**
- Modify: `api/internal/api/ws_handler.go`

The current `CheckOrigin: func(r *http.Request) bool { return true }` accepts connections from any origin. Align with the HTTP CORS policy (localhost only), but also allow same-origin (no Origin header) for non-browser clients.

- [ ] **Step 1: Replace CheckOrigin**

```go
package api

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	ws2 "github.com/milmil/api/internal/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // non-browser clients (curl, etc.)
		}
		return strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "http://127.0.0.1")
	},
}

func (h *handler) handleWebSocket(c echo.Context) error {
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	client := ws2.NewClient(h.wsHub, conn)
	h.wsHub.Register(client)

	go client.WritePump()
	go client.ReadPump()

	return nil
}
```

- [ ] **Step 2: Verify build**

```bash
cd api && go build ./...
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/api/ws_handler.go
git commit -m "fix(ws): restrict WebSocket CheckOrigin to localhost (align with CORS)"
```

---

### Task 6: Consolidate danmaku state — delete player-store

**Files:**
- Delete: `web/src/store/player-store.ts`
- Modify: `web/src/components/DanmakuSettings.tsx` — import from preferences-store
- Modify: `web/src/components/DanmakuOverlay.tsx` — import from preferences-store
- Modify: `web/src/pages/settings/PlayerPanel.tsx` — import from preferences-store
- Modify: `web/src/pages/WatchPage.tsx` — import from preferences-store
- Modify: `web/src/pages/WatchPage.test.tsx` — update mock

**Problem:** `player-store.ts` duplicates danmaku state (enabled, opacity, fontSize, speed) that already exists in `preferences-store.ts` with localStorage persistence. Components use `usePlayerStore`, so settings reset on page refresh.

**Solution:** Delete `player-store.ts`. Add `toggleDanmaku`, `setDanmakuOpacity`, `setDanmakuFontSize`, `setDanmakuSpeed` actions to `preferences-store.ts`. Update all consumers.

- [ ] **Step 1: Add action methods to preferences-store.ts**

Add these actions to the `PreferencesState` interface and implementation:

```typescript
// Add to PreferencesState interface
toggleDanmaku: () => void;
setDanmakuOpacity: (v: number) => void;
setDanmakuFontSize: (v: number) => void;
setDanmakuSpeed: (v: number) => void;
```

```typescript
// Add to store implementation (inside create())
toggleDanmaku: () => {
  set((s) => ({ danmakuEnabled: !s.danmakuEnabled }));
  debouncedSync(extractPrefs(get()));
},
setDanmakuOpacity: (v) => {
  set({ danmakuOpacity: v });
  debouncedSync(extractPrefs(get()));
},
setDanmakuFontSize: (v) => {
  set({ danmakuFontSize: v });
  debouncedSync(extractPrefs(get()));
},
setDanmakuSpeed: (v) => {
  set({ danmakuSpeed: v });
  debouncedSync(extractPrefs(get()));
},
```

- [ ] **Step 2: Update DanmakuSettings.tsx**

Replace all `import { usePlayerStore } from '@/store/player-store'` with `import { usePreferencesStore } from '@/store/preferences-store'`.

Replace all `usePlayerStore((s) => s.xxx)` with `usePreferencesStore((s) => s.xxx)`.

Both the `DanmakuQuickSettings` and `DanmakuSettingsPanel` components use the same selectors — update both.

- [ ] **Step 3: Update DanmakuOverlay.tsx**

Same replacement: `usePlayerStore` → `usePreferencesStore`.

- [ ] **Step 4: Update PlayerPanel.tsx**

Replace `import { usePlayerStore } from '@/store/player-store'` with `import { usePreferencesStore } from '@/store/preferences-store'`.

Replace `usePlayerStore((s) => s.xxx)` → `usePreferencesStore((s) => s.xxx)`.
Replace `usePlayerStore.getState()` → `usePreferencesStore.getState()`.

- [ ] **Step 5: Update WatchPage.tsx**

Replace `import { usePlayerStore } from '@/store/player-store'` with `import { usePreferencesStore } from '@/store/preferences-store'`.

Replace all `usePlayerStore` references.

- [ ] **Step 6: Update WatchPage.test.tsx**

Replace mock:
```typescript
// Before
usePlayerStore: (selector: (s: Record<string, unknown>) => unknown) => ...

// After — mock usePreferencesStore instead, or update the mock import path
```

- [ ] **Step 7: Delete player-store.ts**

```bash
rm web/src/store/player-store.ts
```

- [ ] **Step 8: Verify build**

```bash
cd web && bun run typecheck
```

Expected: No errors. If any file still imports `player-store`, typecheck will catch it.

- [ ] **Step 9: Run tests**

```bash
cd web && bun run test:run
```

- [ ] **Step 10: Commit**

```bash
git add web/src/store/ web/src/components/DanmakuSettings.tsx web/src/components/DanmakuOverlay.tsx web/src/pages/settings/PlayerPanel.tsx web/src/pages/WatchPage.tsx web/src/pages/WatchPage.test.tsx
git rm web/src/store/player-store.ts
git commit -m "refactor(web): consolidate danmaku state into preferences-store with persistence"
```

---

### Task 7: Delete test scratch files from web root

**Files:**
- Delete: all 27 `web/test-*.tsx` files

These are scratch/debug files from motion animation testing. They are not referenced by any import, route, or test config.

- [ ] **Step 1: Delete all test-*.tsx files**

```bash
cd web && rm test-*.tsx
```

- [ ] **Step 2: Verify no imports reference them**

```bash
grep -r "test-animate\|test-motion\|test-query\|test-debounced\|test-delay\|test-isloading\|test-pop\|test-react-table\|test-animp" web/src/ --include="*.ts" --include="*.tsx"
```

Expected: No output.

- [ ] **Step 3: Verify build**

```bash
cd web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd web && git add -A test-*.tsx
git commit -m "chore(web): remove scratch test files from project root"
```
