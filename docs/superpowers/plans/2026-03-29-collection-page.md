# Collection Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/collection` route displaying matched anime as a poster card grid with watch status tracking, plus a "recently matched" preview on LibrariesPage.

**Architecture:** New migration adds `watch_status` + `watch_status_updated_at` to `anime` table. New sqlc queries aggregate matched anime with file counts. New Echo handler serves 3 endpoints. Frontend adds route, page component, API client, sidebar entry, and settings toggle.

**Tech Stack:** Go (Echo, sqlc, SQLite), TypeScript (TanStack Router/Query, Lingui, Motion, Tailwind)

**Spec:** `docs/superpowers/specs/2026-03-29-collection-page-design.md`

---

## File Structure

### Backend (create)
- `api/migrations/000019_add_watch_status_to_anime.up.sql` — schema migration
- `api/migrations/000019_add_watch_status_to_anime.down.sql` — rollback migration
- `api/internal/store/queries/collection.sql` — sqlc queries for collection
- `api/internal/api/collection_handler.go` — HTTP handler for collection endpoints

### Backend (modify)
- `api/internal/api/router.go` — register collection routes
- `api/internal/api/settings_handler.go` — add `collection` to settingsKeys

### Frontend (create)
- `web/src/routes/collection.tsx` — TanStack Router route file
- `web/src/pages/CollectionPage.tsx` — collection page component
- `web/src/lib/api/collection.ts` — API client + query keys

### Frontend (modify)
- `web/src/routes/__root.tsx` — add sidebar + topnav entry
- `web/src/pages/LibrariesPage.tsx` — add recently matched preview section
- `web/src/pages/SettingsPage.tsx` — add collection settings section
- `web/src/locales/en/messages.po` — English translations
- `web/src/locales/zh-Hant/messages.po` — Traditional Chinese translations
- `web/src/locales/zh-Hans/messages.po` — Simplified Chinese translations

---

## Task 1: Database Migration

**Files:**
- Create: `api/migrations/000019_add_watch_status_to_anime.up.sql`
- Create: `api/migrations/000019_add_watch_status_to_anime.down.sql`

- [ ] **Step 1: Create up migration**

```sql
ALTER TABLE anime ADD COLUMN watch_status TEXT NOT NULL DEFAULT 'watching'
  CHECK (watch_status IN ('watching', 'planning', 'completed', 'paused', 'dropped'));
ALTER TABLE anime ADD COLUMN watch_status_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_anime_watch_status ON anime(watch_status);
```

- [ ] **Step 2: Create down migration**

```sql
DROP INDEX IF EXISTS idx_anime_watch_status;
ALTER TABLE anime DROP COLUMN watch_status_updated_at;
ALTER TABLE anime DROP COLUMN watch_status;
```

- [ ] **Step 3: Verify migration applies**

Run: `cd api && go run cmd/server/main.go` (briefly, to trigger auto-migrate if the app does so) or check how migrations are applied in the project.

Look at how the app runs migrations — search for `migrate` in `cmd/server/main.go` or `main.go`. The migration should apply on next server start.

- [ ] **Step 4: Commit**

```bash
git add api/migrations/000019_add_watch_status_to_anime.up.sql api/migrations/000019_add_watch_status_to_anime.down.sql
git commit -m "feat(db): add watch_status columns to anime table"
```

---

## Task 2: sqlc Queries for Collection

**Files:**
- Create: `api/internal/store/queries/collection.sql`

- [ ] **Step 1: Write collection queries**

```sql
-- name: ListCollectionAnime :many
SELECT
  a.id,
  a.bangumi_id,
  a.title,
  a.title_zh,
  a.title_en,
  a.cover_image_url,
  a.total_episodes,
  a.status,
  a.score,
  a.watch_status,
  a.watch_status_updated_at,
  a.genres,
  a.year,
  a.season,
  a.air_date,
  a.created_at,
  COUNT(DISTINCT mf.id) AS local_file_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.episode_id = e.id
WHERE mf.match_status != 'unmatched'
  AND (? = '' OR a.watch_status = ?)
  AND (? = '' OR a.title LIKE '%' || ? || '%' OR COALESCE(a.title_zh, '') LIKE '%' || ? || '%')
GROUP BY a.id
ORDER BY
  CASE WHEN ? = 'name' THEN a.title END ASC,
  CASE WHEN ? = 'score' THEN a.score END DESC,
  CASE WHEN ? NOT IN ('name', 'score') THEN a.watch_status_updated_at END DESC,
  a.created_at DESC;

-- name: ListRecentlyMatchedAnime :many
SELECT
  a.id,
  a.bangumi_id,
  a.title,
  a.title_zh,
  a.cover_image_url,
  a.total_episodes,
  a.watch_status,
  COUNT(DISTINCT mf.id) AS local_file_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.episode_id = e.id
WHERE mf.match_status != 'unmatched'
GROUP BY a.id
ORDER BY MAX(mf.created_at) DESC
LIMIT 10;

-- name: UpdateAnimeWatchStatus :exec
UPDATE anime
SET watch_status = ?,
    watch_status_updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE bangumi_id = ?;

-- name: CountCollectionByStatus :many
SELECT watch_status, COUNT(*) AS count
FROM anime a
WHERE EXISTS (
  SELECT 1 FROM episodes e
  JOIN media_files mf ON mf.episode_id = e.id
  WHERE e.anime_id = a.id AND mf.match_status != 'unmatched'
)
GROUP BY watch_status;
```

Note: The `score` column may not exist on the `anime` table yet. Check `api/migrations/000004_create_anime.up.sql` — if `score` is not present, remove the `a.score` reference from the query and the sort case. The schema shows no `score` column, so **remove all `a.score` references** from the queries above. The sort option `score` should be dropped for now (can be added when Bangumi enrichment provides scores).

**Corrected ListCollectionAnime** (without score):

```sql
-- name: ListCollectionAnime :many
SELECT
  a.id,
  a.bangumi_id,
  a.title,
  a.title_zh,
  a.title_en,
  a.cover_image_url,
  a.total_episodes,
  a.status,
  a.watch_status,
  a.watch_status_updated_at,
  a.genres,
  a.year,
  a.season,
  a.air_date,
  a.created_at,
  COUNT(DISTINCT mf.id) AS local_file_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.episode_id = e.id
WHERE mf.match_status != 'unmatched'
  AND (? = '' OR a.watch_status = ?)
  AND (? = '' OR a.title LIKE '%' || ? || '%' OR COALESCE(a.title_zh, '') LIKE '%' || ? || '%')
GROUP BY a.id
ORDER BY
  CASE WHEN ? = 'name' THEN a.title END ASC,
  CASE WHEN ? NOT IN ('name') THEN a.watch_status_updated_at END DESC,
  a.created_at DESC;
```

- [ ] **Step 2: Run sqlc generate**

Run: `cd api && sqlc generate`
Expected: No errors. New types and methods generated in `api/internal/store/collection.sql.go`.

- [ ] **Step 3: Verify generated code compiles**

Run: `cd api && go build ./...`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/collection.sql api/internal/store/collection.sql.go api/internal/store/models.go
git commit -m "feat(db): add sqlc queries for collection"
```

---

## Task 3: Collection API Handler

**Files:**
- Create: `api/internal/api/collection_handler.go`
- Modify: `api/internal/api/router.go`
- Modify: `api/internal/api/settings_handler.go`

- [ ] **Step 1: Create collection handler**

```go
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleListCollection(c echo.Context) error {
	status := c.QueryParam("status")
	search := c.QueryParam("search")
	sort := c.QueryParam("sort")
	if sort == "" {
		sort = "recent"
	}

	items, err := h.queries.ListCollectionAnime(c.Request().Context(), store.ListCollectionAnimeParams{
		Column1: status,
		Column2: status,
		Column3: search,
		Column4: search,
		Column5: search,
		Column6: sort,
		Column7: sort,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, items)
}

func (h *handler) handleListRecentCollection(c echo.Context) error {
	items, err := h.queries.ListRecentlyMatchedAnime(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, items)
}

type updateWatchStatusRequest struct {
	Status string `json:"status"`
}

func (h *handler) handleUpdateWatchStatus(c echo.Context) error {
	bangumiID := c.Param("bangumiId")

	var req updateWatchStatusRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	validStatuses := map[string]bool{
		"watching": true, "planning": true, "completed": true,
		"paused": true, "dropped": true,
	}
	if !validStatuses[req.Status] {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid status")
	}

	// Parse bangumiID as int64
	var id int64
	if _, err := fmt.Sscanf(bangumiID, "%d", &id); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumi_id")
	}

	err := h.queries.UpdateAnimeWatchStatus(c.Request().Context(), store.UpdateAnimeWatchStatusParams{
		WatchStatus: req.Status,
		BangumiID:   sql.NullInt64{Int64: id, Valid: true},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleCollectionStatusCounts(c echo.Context) error {
	counts, err := h.queries.CountCollectionByStatus(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, counts)
}
```

Note: The `Column1`, `Column2` etc. parameter names are generated by sqlc for unnamed parameters. After running `sqlc generate` in Task 2, check the actual generated param struct field names in `api/internal/store/collection.sql.go` and update this handler accordingly. The pattern will match — sqlc uses `Column1`, `Column2`, etc. for `?` params, or named params if you use `sqlc.arg()` syntax.

**Alternative**: Use `sqlc.arg()` syntax in the queries for clearer param names. Update the queries in Task 2 Step 1 to use named args:

```sql
WHERE mf.match_status != 'unmatched'
  AND (sqlc.arg(status_filter) = '' OR a.watch_status = sqlc.arg(status_filter))
  AND (sqlc.arg(search_query) = '' OR a.title LIKE '%' || sqlc.arg(search_query) || '%' OR COALESCE(a.title_zh, '') LIKE '%' || sqlc.arg(search_query) || '%')
GROUP BY a.id
ORDER BY
  CASE WHEN sqlc.arg(sort_by) = 'name' THEN a.title END ASC,
  CASE WHEN sqlc.arg(sort_by) NOT IN ('name') THEN a.watch_status_updated_at END DESC,
  a.created_at DESC;
```

This gives cleaner generated code:
```go
type ListCollectionAnimeParams struct {
	StatusFilter string
	SearchQuery  string
	SortBy       string
}
```

Choose whichever works after checking sqlc's behavior with the project's `sqlc.yaml` config.

- [ ] **Step 2: Add imports to handler**

The handler needs `fmt`, `database/sql` imports. Add them:

```go
import (
	"database/sql"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)
```

- [ ] **Step 3: Register routes in router.go**

Add after the existing settings group (around line 140 in `router.go`):

```go
	// Collection — protected
	collectionGroup := v1.Group("/collection", jwtMiddleware(cfg.JWTSecret))
	collectionGroup.GET("", h.handleListCollection)
	collectionGroup.GET("/recent", h.handleListRecentCollection)
	collectionGroup.GET("/status-counts", h.handleCollectionStatusCounts)
	collectionGroup.PATCH("/:bangumiId/status", h.handleUpdateWatchStatus)
```

- [ ] **Step 4: Add "collection" to settingsKeys**

In `api/internal/api/settings_handler.go`, add `"collection"` to the `settingsKeys` slice:

```go
var settingsKeys = []string{"dandanplay", "player", "appearance", "bangumi_oauth", "bangumi_token", "anilist_oauth", "anilist_token", "collection"}
```

- [ ] **Step 5: Build and verify**

Run: `cd api && go build ./...`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/collection_handler.go api/internal/api/router.go api/internal/api/settings_handler.go
git commit -m "feat(api): add collection endpoints and settings key"
```

---

## Task 4: Frontend API Client

**Files:**
- Create: `web/src/lib/api/collection.ts`

- [ ] **Step 1: Create collection API client**

```typescript
import { apiClient } from './client';

export interface CollectionAnime {
  id: string;
  bangumi_id: number | null;
  title: string;
  title_zh: string | null;
  title_en: string | null;
  cover_image_url: string | null;
  total_episodes: number | null;
  status: string;
  watch_status: string;
  watch_status_updated_at: string | null;
  genres: string;
  year: number | null;
  season: string | null;
  air_date: string | null;
  created_at: string;
  local_file_count: number;
}

export interface RecentCollectionAnime {
  id: string;
  bangumi_id: number | null;
  title: string;
  title_zh: string | null;
  cover_image_url: string | null;
  total_episodes: number | null;
  watch_status: string;
  local_file_count: number;
}

export interface StatusCount {
  watch_status: string;
  count: number;
}

export const collectionApi = {
  list: (params?: { status?: string; search?: string; sort?: string }) =>
    apiClient.get<CollectionAnime[]>('/api/v1/collection', { params }).then((r) => r.data),

  recent: () =>
    apiClient.get<RecentCollectionAnime[]>('/api/v1/collection/recent').then((r) => r.data),

  statusCounts: () =>
    apiClient.get<StatusCount[]>('/api/v1/collection/status-counts').then((r) => r.data),

  updateStatus: (bangumiId: number, status: string) =>
    apiClient.patch(`/api/v1/collection/${bangumiId}/status`, { status }),
};

export const collectionKeys = {
  all: ['collection'] as const,
  list: (params?: { status?: string; search?: string; sort?: string }) =>
    [...collectionKeys.all, 'list', params] as const,
  recent: () => [...collectionKeys.all, 'recent'] as const,
  statusCounts: () => [...collectionKeys.all, 'status-counts'] as const,
};
```

Note: Check `web/src/lib/api/client.ts` to confirm the `apiClient` import path and that it uses axios or a similar pattern. The other API files (`library.ts`, `discover.ts`) show the exact import style — follow it.

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api/collection.ts
git commit -m "feat(web): add collection API client and query keys"
```

---

## Task 5: Collection Route and Page Component

**Files:**
- Create: `web/src/routes/collection.tsx`
- Create: `web/src/pages/CollectionPage.tsx`

- [ ] **Step 1: Create route file**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { CollectionPage } from '../pages/CollectionPage';

export const Route = createFileRoute('/collection')({
  component: CollectionPage,
});
```

- [ ] **Step 2: Create CollectionPage component**

Build the page following SchedulePage patterns. Key sections:

```typescript
import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import * as motion from 'motion/react-client';
import { Bookmark } from 'lucide-react';

import { collectionApi, collectionKeys } from '../lib/api/collection';
import type { CollectionAnime } from '../lib/api/collection';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/ui/skeleton';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
```

**Component structure:**

1. **Status tabs** — array of `{ key: '', label: msg'collection.all' }` etc., render as horizontal pills with motion underline (same pattern as SchedulePage weekday tabs). Each tab shows count from `statusCounts` query.

2. **Search + sort row** — text input (debounced 300ms via `useState` + `useEffect`) + sort select (最近匹配 / 名稱).

3. **Card grid** — responsive grid `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4`. Each card:
   - Poster image with `animeGradient(anime.title)` fallback
   - Title (line-clamp-2) + title_zh below in smaller text
   - Episode badge: `${local_file_count}/${total_episodes ?? '?'} 集`
   - Watch status badge (color-coded pill)
   - Click → `navigate({ to: '/anime/$id', params: { id: String(anime.bangumi_id) } })`
   - Status dropdown on hover (use a simple select or popover)

4. **Empty state** — per-tab empty message, overall empty links to `/libraries`

5. **Skeleton loading** — grid of card-shaped skeletons (8-12 items)

The page should be ~300-400 lines. Follow the exact animation patterns from SchedulePage:
- `motion.div` with `initial={{ opacity: 0, y: 8 }}` `animate={{ opacity: 1, y: 0 }}`
- Staggered card delays: `transition={{ delay: index * 0.025 }}`

**Status badge colors** (Tailwind classes):
- `watching`: `bg-blue-500/20 text-blue-400`
- `planning`: `bg-amber-500/20 text-amber-400`
- `completed`: `bg-green-500/20 text-green-400`
- `paused`: `bg-zinc-500/20 text-zinc-400`
- `dropped`: `bg-red-500/20 text-red-400`

**Watch status dropdown**: When user hovers a card, show a small dropdown trigger (ellipsis or chevron). On click, show options to change status. Use `useMutation` to call `collectionApi.updateStatus()`, then invalidate `collectionKeys.all` on success.

- [ ] **Step 3: Verify page renders**

Run: `cd web && bun run dev`
Navigate to `http://localhost:5173/collection`
Expected: Page renders (may show empty state if no matched anime exist).

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/collection.tsx web/src/pages/CollectionPage.tsx
git commit -m "feat(web): add Collection page with status tabs and card grid"
```

---

## Task 6: Sidebar and Top Nav Entry

**Files:**
- Modify: `web/src/routes/__root.tsx`

- [ ] **Step 1: Add Collection to sidebar navigation**

In `__root.tsx`, find the sidebar navigation items array. Add a Collection entry between Libraries and Schedule:

```typescript
{ to: '/collection', icon: Bookmark, label: msg`collection.title` }
```

Import `Bookmark` from `lucide-react`.

Also add to `TopNavLinks` array in the same position.

- [ ] **Step 2: Add /collection to public routes if desired**

Check the public routes list in `__root.tsx`. Collection requires auth (has watch status mutations), so do NOT add it to public routes.

- [ ] **Step 3: Verify sidebar entry appears**

Run: `cd web && bun run dev`
Expected: Bookmark icon appears in sidebar between Libraries and Schedule. Clicking navigates to `/collection`.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/__root.tsx
git commit -m "feat(web): add Collection entry to sidebar and top nav"
```

---

## Task 7: Libraries Page — Recently Matched Preview

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx`

- [ ] **Step 1: Add recently matched section**

At the top of LibrariesPage (after the header, before the library cards grid), add a "Recently Matched" section:

```typescript
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { collectionApi, collectionKeys } from '../lib/api/collection';
```

Add the component (inside LibrariesPage, before the library grid):

```tsx
function RecentlyMatchedPreview() {
  const { _ } = useLingui();
  const navigate = useNavigate();
  const { data: recentAnime } = useQuery({
    queryKey: collectionKeys.recent(),
    queryFn: collectionApi.recent,
  });

  if (!recentAnime?.length) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          {_(msg`collection.recentlyMatched`)}
        </h2>
        <button
          onClick={() => navigate({ to: '/collection' })}
          className="text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
        >
          {_(msg`collection.viewAll`)} →
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {recentAnime.map((anime, index) => (
          <motion.div
            key={anime.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex-shrink-0 w-[120px] cursor-pointer group"
            onClick={() => navigate({ to: '/anime/$id', params: { id: String(anime.bangumi_id) } })}
          >
            <div className="aspect-[3/4] rounded-md overflow-hidden mb-1.5">
              {anime.cover_image_url?.startsWith('http') ? (
                <img src={anime.cover_image_url} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className={cn('w-full h-full', animeGradient(anime.title))} />
              )}
            </div>
            <p className="text-xs text-white/80 line-clamp-2 leading-tight">{anime.title}</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              {anime.local_file_count}/{anime.total_episodes ?? '?'} 集
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

Place `<RecentlyMatchedPreview />` at the top of the main content area, after the page header but before the library cards grid.

- [ ] **Step 2: Verify preview renders**

Run: `cd web && bun run dev`
Navigate to `/libraries`
Expected: If matched anime exist, horizontal scroll section appears at top. If none, section is hidden.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(web): add recently matched anime preview to Libraries page"
```

---

## Task 8: Settings — Collection Toggle

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add Collection settings section**

In SettingsPage, add a new section after the existing sections (Appearance, Player, etc.):

```tsx
{/* Collection Section */}
<Section title={_(msg`settings.collection`)} delay={0.4}>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-white/80">{_(msg`settings.autoAddToCollection`)}</p>
      <p className="text-xs text-white/40 mt-0.5">{_(msg`settings.autoAddToCollectionDesc`)}</p>
    </div>
    <Switch
      checked={autoAdd}
      onCheckedChange={(checked) => {
        setAutoAdd(checked);
        updateCollectionSettings.mutate({ auto_add_to_collection: checked });
      }}
    />
  </div>
</Section>
```

Add state and mutation:

```typescript
const [autoAdd, setAutoAdd] = useState(true);

// Load from settings query
useEffect(() => {
  if (settings?.collection) {
    const col = JSON.parse(settings.collection || '{}');
    if (col.auto_add_to_collection !== undefined) {
      setAutoAdd(col.auto_add_to_collection);
    }
  }
}, [settings]);

const updateCollectionSettings = useMutation({
  mutationFn: (value: { auto_add_to_collection: boolean }) =>
    apiClient.put('/api/v1/settings/collection', value),
  onSuccess: () => toast.success(_(msg`settings.saved`)),
});
```

- [ ] **Step 2: Verify toggle works**

Run: `cd web && bun run dev`
Navigate to `/settings`
Expected: Collection section appears with auto-add toggle. Toggle persists after page refresh.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/SettingsPage.tsx
git commit -m "feat(web): add auto-add collection toggle to Settings page"
```

---

## Task 9: i18n Translations

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add English translations**

Append to `web/src/locales/en/messages.po`:

```po
msgid "collection.title"
msgstr "Collection"

msgid "collection.all"
msgstr "All"

msgid "collection.watching"
msgstr "Watching"

msgid "collection.planning"
msgstr "Planning"

msgid "collection.completed"
msgstr "Completed"

msgid "collection.paused"
msgstr "On Hold"

msgid "collection.dropped"
msgstr "Dropped"

msgid "collection.episodes"
msgstr "episodes"

msgid "collection.empty"
msgstr "No anime in your collection yet"

msgid "collection.emptyDesc"
msgstr "Scan a library and match anime to start building your collection"

msgid "collection.recentlyMatched"
msgstr "Recently Matched"

msgid "collection.viewAll"
msgstr "View All"

msgid "collection.changeStatus"
msgstr "Change Status"

msgid "collection.sortByRecent"
msgstr "Recently Matched"

msgid "collection.sortByName"
msgstr "Name"

msgid "settings.collection"
msgstr "Collection"

msgid "settings.autoAddToCollection"
msgstr "Auto-add matched anime"

msgid "settings.autoAddToCollectionDesc"
msgstr "Automatically add newly matched anime to your collection"
```

- [ ] **Step 2: Add Traditional Chinese translations**

Append to `web/src/locales/zh-Hant/messages.po`:

```po
msgid "collection.title"
msgstr "收藏"

msgid "collection.all"
msgstr "全部"

msgid "collection.watching"
msgstr "在看"

msgid "collection.planning"
msgstr "想看"

msgid "collection.completed"
msgstr "已看"

msgid "collection.paused"
msgstr "擱置"

msgid "collection.dropped"
msgstr "棄番"

msgid "collection.episodes"
msgstr "集"

msgid "collection.empty"
msgstr "收藏裡還沒有動畫"

msgid "collection.emptyDesc"
msgstr "掃描媒體庫並匹配動畫來開始建立收藏"

msgid "collection.recentlyMatched"
msgstr "最近匹配"

msgid "collection.viewAll"
msgstr "查看全部"

msgid "collection.changeStatus"
msgstr "更改狀態"

msgid "collection.sortByRecent"
msgstr "最近匹配"

msgid "collection.sortByName"
msgstr "名稱"

msgid "settings.collection"
msgstr "收藏"

msgid "settings.autoAddToCollection"
msgstr "自動加入收藏"

msgid "settings.autoAddToCollectionDesc"
msgstr "新匹配的動畫自動加入收藏"
```

- [ ] **Step 3: Add Simplified Chinese translations**

Append to `web/src/locales/zh-Hans/messages.po` (same structure, Simplified Chinese):

```po
msgid "collection.title"
msgstr "收藏"

msgid "collection.all"
msgstr "全部"

msgid "collection.watching"
msgstr "在看"

msgid "collection.planning"
msgstr "想看"

msgid "collection.completed"
msgstr "已看"

msgid "collection.paused"
msgstr "搁置"

msgid "collection.dropped"
msgstr "弃番"

msgid "collection.episodes"
msgstr "集"

msgid "collection.empty"
msgstr "收藏里还没有动画"

msgid "collection.emptyDesc"
msgstr "扫描媒体库并匹配动画来开始建立收藏"

msgid "collection.recentlyMatched"
msgstr "最近匹配"

msgid "collection.viewAll"
msgstr "查看全部"

msgid "collection.changeStatus"
msgstr "更改状态"

msgid "collection.sortByRecent"
msgstr "最近匹配"

msgid "collection.sortByName"
msgstr "名称"

msgid "settings.collection"
msgstr "收藏"

msgid "settings.autoAddToCollection"
msgstr "自动加入收藏"

msgid "settings.autoAddToCollectionDesc"
msgstr "新匹配的动画自动加入收藏"
```

- [ ] **Step 4: Compile translations**

Run: `cd web && bun run lingui:extract && bun run lingui:compile`

Check `package.json` for the exact script names — they may be `extract` and `compile` under a `lingui` prefix, or direct `npx lingui extract` / `npx lingui compile` commands.

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add Collection page translations (en, zh-Hant, zh-Hans)"
```

---

## Task 10: Backend — Auto-Add Setting Check in Resolver

**Files:**
- Modify: `api/internal/resolver/resolver.go`

- [ ] **Step 1: Check auto_add_to_collection setting in resolver**

In the resolver's `Resolve` and `ResolveBangumiMatched` methods, after creating an anime record, check the `collection` setting to decide whether to set `watch_status = 'watching'` or leave it unset.

Find where `CreateAnime` is called in `resolver.go`. The migration already defaults `watch_status` to `'watching'`, so by default all new anime get `watching` status.

When auto-add is disabled, after creating the anime, immediately update its status to empty/null. However, since the column has a NOT NULL constraint with a CHECK, the simplest approach is:

**Option A (recommended):** Keep the default as `'watching'`. When auto-add is OFF, the Collection page query simply excludes anime that don't have a specific flag. Add an `in_collection` boolean column instead.

**Option B (simpler, no schema change):** The Collection query already filters by "has matched files". The auto-add toggle only affects whether newly matched anime start as `'watching'` vs `'planning'` (or a new `'none'` status).

**Simplest approach:** Add `'none'` to the CHECK constraint in Task 1's migration. When auto-add is OFF, new anime get `watch_status = 'none'`. The Collection page filters out `'none'` status (not shown in any tab). Users can manually add from anime detail page.

Update Task 1 migration to:
```sql
CHECK (watch_status IN ('none', 'watching', 'planning', 'completed', 'paused', 'dropped'))
```
Default remains `'watching'`.

In resolver, before creating anime, check the setting:

```go
// Check auto-add setting
autoAdd := true
setting, err := r.queries.GetSetting(ctx, "collection")
if err == nil {
    var col struct {
        AutoAdd *bool `json:"auto_add_to_collection"`
    }
    if json.Unmarshal([]byte(setting.Value), &col) == nil && col.AutoAdd != nil {
        autoAdd = *col.AutoAdd
    }
}

watchStatus := "watching"
if !autoAdd {
    watchStatus = "none"
}
```

Then pass `watchStatus` to the CreateAnime call. Since CreateAnime uses sqlc-generated params, you'll need to add `watch_status` to the INSERT query in `queries/anime.sql`:

Update `CreateAnime` in `queries/anime.sql`:
```sql
-- name: CreateAnime :one
INSERT INTO anime (id, library_id, title, title_zh, title_en, synopsis, cover_image_url,
    total_episodes, status, air_date, year, season, genres, bangumi_id, dandanplay_bangumi_id,
    watch_status,
    created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;
```

Then run `sqlc generate` again, update resolver to pass `WatchStatus` param.

Also update ListCollectionAnime query to exclude `'none'`:
```sql
WHERE mf.match_status != 'unmatched'
  AND a.watch_status != 'none'
  AND (sqlc.arg(status_filter) = '' OR a.watch_status = sqlc.arg(status_filter))
```

- [ ] **Step 2: Regenerate sqlc**

Run: `cd api && sqlc generate`

- [ ] **Step 3: Update resolver to pass watch_status**

In `resolver.go`, find both `CreateAnime` calls (one for DandanPlay matches, one for Bangumi matches) and add the `WatchStatus` field to the params.

- [ ] **Step 4: Build and verify**

Run: `cd api && go build ./...`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add api/internal/store/queries/anime.sql api/internal/store/queries/collection.sql api/internal/store/anime.sql.go api/internal/store/collection.sql.go api/internal/store/models.go api/internal/resolver/resolver.go api/migrations/000019_add_watch_status_to_anime.up.sql
git commit -m "feat: integrate auto-add collection setting into resolver"
```

---

## Task 11: End-to-End Verification

- [ ] **Step 1: Start backend**

Run: `cd api && go run cmd/server/main.go`
Expected: Server starts, migration 000019 applies.

- [ ] **Step 2: Start frontend**

Run: `cd web && bun run dev`

- [ ] **Step 3: Verify Collection page**

1. Navigate to `/collection`
2. If matched anime exist: verify card grid renders with posters, titles, episode counts
3. Click status tabs — verify filtering works
4. Search — verify debounced search filters results
5. Click a card — verify navigation to `/anime/:id`
6. Change watch status via dropdown — verify it persists after page refresh

- [ ] **Step 4: Verify Libraries preview**

1. Navigate to `/libraries`
2. If matched anime exist: verify "Recently Matched" horizontal scroll appears at top
3. Click "View All →" — verify navigation to `/collection`
4. Click an anime card — verify navigation to `/anime/:id`

- [ ] **Step 5: Verify Settings toggle**

1. Navigate to `/settings`
2. Find "Collection" section
3. Toggle auto-add off
4. Scan/match a new library
5. Verify new anime does NOT appear in Collection (has `'none'` status)
6. Toggle auto-add back on — verify new matches appear again

- [ ] **Step 6: Verify sidebar**

1. Check Bookmark icon appears in sidebar between Libraries and Schedule
2. Check active state highlights when on `/collection`
3. Check top nav link appears on wider screens
