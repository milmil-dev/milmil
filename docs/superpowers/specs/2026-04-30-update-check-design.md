# Auto Update-Check (Notification-Only) — Design

**Status:** Approved (brainstormed 2026-04-30)
**Owner:** TBD
**Related:** [version-injection PR #50](https://github.com/milmil-dev/milmil/pull/50)

## Problem

Users running self-hosted milmil have no way to know when a new release is published. They have to remember to check Docker Hub or the GitHub releases page. Most reference media servers (Plex, Jellyfin, Seanime) surface "Update available" notifications inside the UI.

## Goal

Add a **notification-only** in-app surface that tells the user when a newer release of milmil is available on GitHub. Auto-pull/auto-restart is explicitly **out of scope** (Watchtower-style sidecar handles that).

## Decisions (from brainstorm)

| # | Question | Choice |
|---|----------|--------|
| 1 | Cache strategy | In-memory only, 24h TTL |
| 2 | Pre-release / draft handling | `/releases/latest` only (stable, non-prerelease, non-draft) |
| 3 | Dismissibility | Per-version dismiss in localStorage |
| 4 | Fallback when GitHub unreachable | Serve stale cache; silent on never-cached |
| 5 | UI surfaces | AboutPanel row + Settings sidebar dot (no toast) |
| 6 | Delivery mechanism | Hybrid: HTTP `/update-check` for cold-start + WS `system:update-available` for live updates |

## Out of Scope

- Auto-pull / auto-restart of containers (Watchtower territory)
- Pre-release notifications (would require Q2 toggle; future feature)
- User-facing "disable update check" preference (would require a settings field; YAGNI for v1)
- Multiple-source repos (hardcoded `milmil-dev/milmil`)
- Per-user gating (notification is global — every connected session sees it)

## Architecture

### Backend

```
api/internal/updatecheck/
├── checker.go        # Checker struct + Check() + Run() + GitHub fetch
└── checker_test.go   # table-driven tests against httptest.Server
```

```
api/internal/api/
├── system_handler.go     # adds handleUpdateCheck (sibling to handleSystemInfo)
└── system_handler_test.go # adds 4 subtests for the new handler
```

```
api/cmd/server/main.go    # constructs Checker, starts Run goroutine
api/internal/api/router.go # registers GET /api/v1/system/update-check inside systemGroup
api/internal/ws/events.go (or equiv) # adds "system:update-available" event constant
```

### Frontend

```
web/src/lib/api/system.ts          # NEW: systemApi.updateCheck()
web/src/store/update-store.ts      # NEW: Zustand store with persisted dismissedVersion
web/src/hooks/use-update-check.ts  # NEW: composes current/version + store + cold-start query
web/src/routes/__root.tsx          # MODIFY: useWSEvent → handle "system:update-available"
web/src/components/AppSidebar.tsx  # MODIFY: dot on Settings icon when showBadge
web/src/pages/settings/AboutPanel.tsx # MODIFY: add Update row + Dismiss button
```

Tests:
```
web/src/hooks/use-update-check.test.ts
web/src/pages/settings/AboutPanel.test.tsx (extend existing if any, else new)
web/src/store/update-store.test.ts
```

## Backend — Detailed Design

### `updatecheck.Checker`

```go
type Result struct {
    Latest      string
    ReleaseURL  string
    PublishedAt time.Time
}

type Notifier func(r Result)

type Config struct {
    Repo       string         // "milmil-dev/milmil"
    HTTPClient *http.Client   // 5s timeout
    Interval   time.Duration  // 1h
    TTL        time.Duration  // 24h
    Notify     Notifier       // called when latest changes vs prior cached value
}

type Checker struct {
    cfg       Config
    mu        sync.Mutex
    cached    *Result
    fetchedAt time.Time
}

func NewChecker(cfg Config) *Checker

// Check returns the cached value if fresh, otherwise fetches from GitHub.
// On fetch failure with a cached value, returns the stale value with stale=true.
// On fetch failure with no cached value, returns (nil, false, err).
func (c *Checker) Check(ctx context.Context) (*Result, bool, error)

// Run starts the background ticker that calls Check every Interval and
// invokes Notify when the latest version differs from the previous cached
// value. Blocks until ctx is cancelled.
func (c *Checker) Run(ctx context.Context)
```

### GitHub fetch contract

- URL: `https://api.github.com/repos/<repo>/releases/latest`
- Header: `Accept: application/vnd.github+json`
- Timeout: 5s
- Skip if response has `prerelease: true` or `draft: true` (defense — `/releases/latest` already filters these)
- Parse: `tag_name` (strip leading `v` if present), `html_url`, `published_at`
- On non-2xx or network error: return error to caller; cache untouched

### HTTP handler

```go
type updateCheckResponse struct {
    Current     string  `json:"current"`
    Latest      *string `json:"latest"`           // null when never-cached + offline
    HasUpdate   bool    `json:"has_update"`
    ReleaseURL  *string `json:"release_url,omitempty"`
    PublishedAt *string `json:"published_at,omitempty"`
    Stale       bool    `json:"stale"`
}

func (h *handler) handleUpdateCheck(c echo.Context) error {
    res, stale, err := h.updateChecker.Check(c.Request().Context())
    current := version.Version
    if err != nil {
        return c.JSON(http.StatusOK, updateCheckResponse{Current: current})
    }
    hasUpdate := semver.Compare("v"+current, "v"+res.Latest) < 0
    publishedAt := res.PublishedAt.UTC().Format(time.RFC3339)
    return c.JSON(http.StatusOK, updateCheckResponse{
        Current: current, Latest: &res.Latest, HasUpdate: hasUpdate,
        ReleaseURL: &res.ReleaseURL, PublishedAt: &publishedAt, Stale: stale,
    })
}
```

Route: `systemGroup.GET("/update-check", h.handleUpdateCheck)` — same auth + audit middleware as the rest of `/system/*`.

### WS event

```
type: "system:update-available"
data: { "latest": string, "release_url": string, "published_at": string (RFC3339) }
```

Broadcast inside `Notify` callback. Sent to all connected sessions; no per-user filtering.

### Lifecycle wiring

In `app.New()` (or wherever `*handler` is constructed):
```go
checker := updatecheck.NewChecker(updatecheck.Config{
    Repo:       "milmil-dev/milmil",
    HTTPClient: &http.Client{Timeout: 5 * time.Second},
    Interval:   1 * time.Hour,
    TTL:        24 * time.Hour,
    Notify: func(r updatecheck.Result) {
        wsHub.Broadcast(ws.Event{
            Type: "system:update-available",
            Data: map[string]any{
                "latest":       r.Latest,
                "release_url":  r.ReleaseURL,
                "published_at": r.PublishedAt.UTC().Format(time.RFC3339),
            },
        })
    },
})
go checker.Run(ctx)  // ctx cancelled on graceful shutdown
```

### Tests

`checker_test.go` — table-driven against `httptest.Server`:
- Fresh fetch returns parsed Result
- Cache hit within TTL skips network
- Cache expired with successful refetch updates cache
- Cache expired with failed refetch returns stale (stale=true)
- Never cached + failed fetch returns (nil, false, err)
- `prerelease: true` response → return error (or skip)
- Run() ticker fires Notify only when latest changes

`system_handler_test.go` adds:
- `update_check has_update true`
- `update_check has_update false` (current >= latest)
- `update_check stale=true`
- `update_check never-cached + offline → latest=null, has_update=false`

## Frontend — Detailed Design

### Zustand store

```ts
// web/src/store/update-store.ts
interface UpdateState {
  latest: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  dismissedVersion: string | null;
  setLatest: (info: { latest: string; releaseUrl: string; publishedAt: string }) => void;
  dismiss: (version: string) => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set) => ({
      latest: null,
      releaseUrl: null,
      publishedAt: null,
      dismissedVersion: null,
      setLatest: (info) => set({ latest: info.latest, releaseUrl: info.releaseUrl, publishedAt: info.publishedAt }),
      dismiss: (version) => set({ dismissedVersion: version }),
    }),
    {
      name: 'milmil-update',
      partialize: (s) => ({ dismissedVersion: s.dismissedVersion }), // only persist dismiss
    }
  )
);
```

### API client

```ts
// web/src/lib/api/system.ts
export interface UpdateCheck {
  current: string;
  latest: string | null;
  has_update: boolean;
  release_url?: string;
  published_at?: string;
  stale: boolean;
}
export const systemApi = {
  updateCheck: () => api.get<UpdateCheck>('/api/v1/system/update-check'),
};
```

### Hook

```ts
// web/src/hooks/use-update-check.ts
export function useUpdateCheck() {
  const { latest, releaseUrl, publishedAt, dismissedVersion, setLatest, dismiss } = useUpdateStore();
  const { data: info } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<{ version: string }>('/api/v1/system/info'),
    staleTime: Infinity,
  });
  useQuery({
    queryKey: ['system', 'update-check'],
    queryFn: async () => {
      const res = await systemApi.updateCheck();
      if (res.latest) {
        setLatest({
          latest: res.latest,
          releaseUrl: res.release_url ?? '',
          publishedAt: res.published_at ?? '',
        });
      }
      return res;
    },
    staleTime: Infinity, // WS handles refresh; this is cold-start only
  });
  const current = info?.version ?? null;
  const hasUpdate = !!latest && !!current && semverGt(latest, current);
  const showBadge = hasUpdate && latest !== dismissedVersion;
  return { current, latest, releaseUrl, publishedAt, hasUpdate, showBadge, dismiss };
}
```

`semverGt` is a small utility — either import a tiny lib (`compare-versions` is ~1KB) or inline a 10-line function. Prefer inline to keep deps minimal.

### WS subscriber

In `web/src/routes/__root.tsx` `useWSEvent` block (alongside `scan:completed`, `match:completed`):
```ts
if (event.type === 'system:update-available') {
  useUpdateStore.getState().setLatest({
    latest: event.data.latest as string,
    releaseUrl: event.data.release_url as string,
    publishedAt: event.data.published_at as string,
  });
}
```

### Sidebar dot

`AppSidebar.tsx`'s Settings icon link gets a positioned dot when `useUpdateCheck().showBadge` is true. Implementation mirrors `NotificationBell.tsx:98-105`:
```tsx
{showBadge && (
  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-mm-accent" />
)}
```

### AboutPanel row

`AboutPanel.tsx` rows array gains an "Update" entry. Renders one of:

| State | Content |
|-------|---------|
| `hasUpdate && !dismissed` | `v{latest} available · `[release notes →]` link + `[Dismiss]` button` |
| `hasUpdate && dismissed` | `v{latest} available · `[release notes →]` link (no dismiss) |
| `!hasUpdate && latest` | `You're up to date` (subtle text) |
| `!latest` | row hidden (silent on never-cached / offline) |

Dismiss button calls `dismiss(latest)`.

### Tests

- `use-update-check.test.ts` — mocks store + systemApi + version. Asserts `hasUpdate` and `showBadge` across permutations:
  - latest > current, not dismissed → showBadge true
  - latest > current, dismissed === latest → showBadge false
  - latest === current → hasUpdate false, showBadge false
  - latest === null → hasUpdate false
- `update-store.test.ts` — dismiss sets dismissedVersion; persist key is correct.
- `AboutPanel.test.tsx` (new or extend) — renders correct row across the 4 states.

## Error Handling

| Failure | Behavior |
|---------|----------|
| GitHub network error, cache exists | Serve stale, set `stale: true` |
| GitHub network error, no cache | Return `latest: null` (silent on UI) |
| GitHub returns malformed JSON | Same as network error |
| GitHub returns prerelease/draft | Return error to caller; do not cache |
| WS disconnects | Frontend keeps last known state; reconnects via existing WS infra |
| Background ticker panics | Recover and log; the next tick continues |

## Implementation Order

1. Backend: `internal/updatecheck` package + table-driven test
2. Backend: extend `system_handler.go` + handler test
3. Backend: register route in `router.go`
4. Backend: wire `Run()` goroutine in `app.New()` / `main.go` + WS broadcast
5. Backend: add `system:update-available` to WS event registry
6. Frontend: `lib/api/system.ts`
7. Frontend: `store/update-store.ts` + test
8. Frontend: `hooks/use-update-check.ts` + test
9. Frontend: WS handler in `__root.tsx`
10. Frontend: AppSidebar Settings dot
11. Frontend: AboutPanel Update row + test
12. i18n extract for new strings (Update, Available, Dismiss, You're up to date, etc.)
13. Final `bun run check:all` + `go test ./...`

## Risks

- **GitHub rate limit (60/hr unauth).** A single home-server hitting once per hour uses 1/60 of the budget — fine. Multiple instances on the same NAT'd IP could compound, but that's an unusual deployment.
- **WS broadcast on first cold start.** When the server boots and the ticker first fires, `notify` will compare against an empty cached value; it should NOT broadcast on the very first observation (only on subsequent changes). Guard logic: skip notify if `previous == nil`.
- **Stale check is global.** All sessions share the same notification — a user on browser A who dismisses doesn't dismiss for browser B (per-browser localStorage). This is correct per Q3 (per-version dismiss). Note in PR description.
- **`current` is the literal string `"dev"` for unbuilt/local runs**, not `X.Y.Z-dev` (per `api/internal/version/version.go`). Docker builds stamp a clean semver via `-ldflags`. Both the frontend `semverGt` (where `parseInt('dev', 10) || 0 = 0`) and backend `semver.Compare("vdev", "vX.Y.Z")` (where invalid `<` valid in `golang.org/x/mod/semver`) treat `dev` as less than any released version, so dev builds correctly see updates — but via numeric/invalid-version ordering, not semver prerelease ordering.
