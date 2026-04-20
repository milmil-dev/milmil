# Watch History Page — Design Spec

**Date:** 2026-04-20
**Status:** Approved (brainstorm complete, ready for implementation planning)

## Overview

A new dedicated `/history` page that shows the user's full per-episode watch history. Inspired by Bilibili's 歷史記錄 page, adapted for milmil's anime-only domain and dark theme. Replaces the limited "see all" affordance behind the Home page's Continue Watching rail.

## Goals

- Give users a complete, paginated view of every episode they've watched.
- Support filtering by completion state, free-text search by anime title, and per-entry or bulk deletion.
- Scale to users with thousands of history rows without client-side performance issues.

## Non-goals (v1)

- Un-syncing deletions from external trackers (Bangumi / MAL / AniList).
- Soft-hide / "show hidden" modes.
- Per-user "record history" privacy toggle.
- Date-range picker, library filter, genre filter.
- Export.
- A dedicated mobile bottom-nav slot for History.

## UX

Route: `/history`. Title: "Watch History" (i18n: `nav.history`).

### Layout

- **Header** — title + clock icon.
- **Filter bar** — tabs (`All / In Progress / Completed`), right-aligned search input (matches `title` or `title_zh`), `Clear` button, `Batch` toggle.
- **Timeline rail** — left-side vertical rail with date-group anchor labels (Today, Yesterday, This Week, Last Week, Earlier). Non-interactive. Hidden on `<768px`.
- **Grid** — 16:9 episode cards. 4 cols ≥1320px, 3 cols ≥1080px, 2 cols otherwise. Cards grouped by date bucket with full-row date labels.
- **Card** — anime cover as thumbnail background, `animeGradient(title)` fallback, `EP <n>` badge top-left, `mm:ss / mm:ss` or `Finished` label bottom-right, pink progress bar bottom, trash icon on hover, batch-mode checkbox. Click resumes at saved position.
- **Empty state** — clock icon + "No watch history yet. Start watching an anime to build your history." with a link to Home.
- **Skeleton loading state** — matches grid layout (project rule: always use skeletons).

### Interactions

- **Tab switch** — URL param `filter` updates; list refetches from first page.
- **Search** — URL param `q` updates, debounced 300 ms. Matches anime title or `title_zh` server-side.
- **Infinite scroll** — page size 40; `IntersectionObserver` on a bottom sentinel triggers next page.
- **Per-card delete** — trash icon → confirm dialog → hard-delete. Dialog text notes that external tracker status won't be reverted.
- **Clear all** — confirm dialog → deletes every `watch_progress` row for the user.
- **Batch mode** — toggle shows checkboxes on each card and a sticky footer with count + `Delete selected` + `Cancel`. Selection is ephemeral (component state only).
- **Card click** — navigates to `/watch/<bangumi_id>?ep=<episode_number>`, falling back to `/anime/<anime_id>?ep=<episode_number>` when `bangumi_id` is null.

### Grain

Per-episode. Each watched episode is its own card. (Distinct from Continue Watching on Home, which dedupes per anime.)

### Responsive

- `<768px`: 2-column grid, timeline rail hidden, date labels full-width, batch footer becomes a full-width bottom sheet.
- `≥768px`: 3-col grid.
- `≥1080px`: 3-col.
- `≥1320px`: 4-col.

### Navigation

New entry `History` in the sidebar's bottom group, between `Libraries` and `Collection`. Clock icon (Hugeicons `Clock01Icon`). Mobile bottom nav unchanged; History is reached via the sidebar (tablet/desktop) or the Home page "see all" link.

## Backend API

All new routes under `/api/v1/progress`, using the existing auth middleware. Handlers added to `api/internal/api/progress_handler.go`.

### `GET /api/v1/progress/history`

Paginated, filterable list.

```
Query:
  before  (optional ISO8601) — cursor: return rows with last_watched_at < before
  limit   (default 40, max 100)
  filter  (default "all") — "all" | "in_progress" | "completed"
  q       (optional) — LIKE match against anime.title OR anime.title_zh (case-insensitive)

Response:
  {
    "items": EnrichedProgressResponse[],   // reuses existing enrichedProgressResponse shape
    "next_before": string | null           // null when no more pages
  }
```

Sort: `last_watched_at DESC, id DESC` (stable tiebreak so pagination cursors don't duplicate or skip rows).

`filter=in_progress` → `WHERE completed = 0`. `filter=completed` → `WHERE completed = 1`. `filter=all` → no completion filter.

### `DELETE /api/v1/progress/:id`

Hard-delete a single `watch_progress` row. Scoped to the caller's `user_id`. Returns 404 if not found or not owned.

### `POST /api/v1/progress/batch-delete`

Body: `{ "ids": string[] }`. Deletes rows scoped to `user_id`. Silently ignores ids owned by other users. Returns `{ "deleted": number }`. Server caps `len(ids) <= 200`; clients chunk beyond that.

### `DELETE /api/v1/progress`

Clears every `watch_progress` row for the caller. Returns `{ "deleted": number }`.

### SQLC queries (new)

Added to `api/internal/store/watch_progress.sql`:

- `ListHistoryWithAnime` — cursor-paginated list with filter + search, joining `episodes` and `anime` like existing `ListRecentProgressWithAnime` but without per-anime dedup.
- `DeleteWatchProgress` — `DELETE FROM watch_progress WHERE id = ? AND user_id = ?`
- `BatchDeleteWatchProgress` — uses `sqlc.slice('ids')`; `WHERE user_id = ? AND id IN (sqlc.slice('ids'))`.
- `DeleteAllWatchProgressByUser` — `DELETE FROM watch_progress WHERE user_id = ?`

### Sync behavior

Deletion of a completed row does **not** push an "unwatched" update to Bangumi / MAL / AniList in v1 — their APIs for reverting a completed episode are inconsistent/unreliable. The confirm dialog surfaces this: *"External tracker status (Bangumi / MAL / AniList) won't be reverted."*

### OpenAPI

Add the four new routes to `api/internal/api/openapi.json`. (Separate pre-existing gap where most routes aren't documented is out of scope; this change only adds.)

## Frontend architecture

### Routing

- `web/src/routes/history.tsx` — `createFileRoute('/history')`. Typed search schema with `filter?: 'all' | 'in_progress' | 'completed'` and `q?: string` so URL state is type-safe and shareable.

### Page

- `web/src/pages/HistoryPage.tsx` — composes the filter bar, timeline rail, grid, empty state, and batch footer. Sets document title via `useDocumentTitle`.

### Data layer

- `web/src/lib/api/history.ts`
  - `historyApi.list({ before, limit, filter, q })`
  - `historyApi.delete(id)`
  - `historyApi.batchDelete(ids)`
  - `historyApi.clearAll()`
  - `historyKeys.list({ filter, q })` — query key factory
- `useInfiniteQuery` keyed on `(filter, q)`, `getNextPageParam` reads `next_before`.
- Bottom sentinel with `IntersectionObserver` calls `fetchNextPage`.
- Mutations via `useMutation`. On success, all three mutations invalidate both `historyKeys.list` and `progressKeys.recent` (so Home's Continue Watching rail stays consistent):
  - Single delete: optimistic `setQueryData` removal for snappy UI, then invalidate both keys in `onSettled`. On error, invalidate to roll back.
  - Batch delete: invalidate both keys.
  - Clear all: invalidate both keys.

### Components

All new under `web/src/components/history/`:

- `HistoryTimelineRail.tsx`
- `HistoryFilterBar.tsx` (tabs + debounced search + Clear + Batch toggle)
- `HistoryGrid.tsx` (groups items by bucket, renders date-label rows + grid)
- `HistoryCard.tsx` (reuses `animeGradient` and link pattern from `ContinueWatchingCard`)
- `HistoryEmptyState.tsx`
- `HistorySkeleton.tsx`
- `HistoryBatchBar.tsx` (sticky footer)

Confirm dialogs reuse an existing `components/ui/` dialog primitive where present; otherwise add a small local dialog component at the same level.

### Local state

- `filter` and `q` live in URL search params (TanStack Router typed search).
- `batchMode: boolean` and `selectedIds: Set<string>` are component-local `useState` in `HistoryPage`. No Zustand slice — this state is page-scoped and ephemeral.

### Date bucketing

Pure helper `web/src/lib/history-date-buckets.ts`:

```ts
bucketByDate(items: EnrichedProgressResponse[], now: Date):
  { today, yesterday, thisWeek, lastWeek, earlier }
```

Uses local timezone. "This Week" = items from the current Monday 00:00 up to but not including Yesterday 00:00. "Last Week" = items from the prior Monday 00:00 up to but not including the current Monday. Shared between `HistoryGrid` and `HistoryTimelineRail`.

### i18n keys (new, added to `src/locales/*/messages.po`)

- `nav.history`
- `history.title`
- `history.tab.all`, `history.tab.inProgress`, `history.tab.completed`
- `history.searchPlaceholder`
- `history.clearAll`, `history.clearAll.confirm`, `history.clearAll.description`
- `history.batch`, `history.batch.deleteSelected`, `history.batch.cancel`
- `history.delete.confirm`, `history.delete.description`
- `history.finished`
- `history.empty.title`, `history.empty.description`
- `history.group.today`, `history.group.yesterday`, `history.group.thisWeek`, `history.group.lastWeek`, `history.group.earlier`
- `history.loadFailed`

Extract + compile via `bun run i18n:extract && bun run i18n:compile`.

### Sidebar + HomePage wiring

- `web/src/components/AppSidebar.tsx`: import `Clock01Icon`, insert `{ to: '/history', msgKey: msg\`nav.history\`, icon: Clock01Icon }` into `bottomNav` between `libraries` and `collection`.
- `web/src/pages/HomePage.tsx`: change the Continue Watching `SectionHeader`'s `to="/"` to `to="/history"`.

## Edge cases

- **Orphaned progress rows** (episode/anime deleted): inner joins on `episodes` and `anime` exclude them — same as the existing `/recent` query.
- **Missing `anime_cover_image`**: card falls back to `animeGradient(title)`.
- **Null `duration_seconds`** (legacy rows): time badge shows `mm:ss` of position only, progress bar hidden.
- **Null `anime_bangumi_id`**: card links to `/anime/<anime_id>?ep=<n>` instead of `/watch/<bangumi_id>?ep=<n>`.
- **Filter + search**: both applied server-side, ANDed. Empty `q` is treated as no search.
- **Cursor drift** when new rows are written mid-pagination: because we sort `(last_watched_at DESC, id DESC)` and cursor on `last_watched_at < before`, existing pages remain stable; new rows surface at the top on next invalidation.
- **Batch > 200 ids**: client chunks into 200-id POSTs.
- **Search with LIKE wildcards**: escape `%`, `_`, `\` before binding.
- **Very long titles**: CSS `line-clamp: 2` with ellipsis.
- **Player heartbeat after delete**: player continues sending `POST /progress`; server UPSERT recreates the row. Acceptable — matches Bilibili.

## Error handling

- **List fetch fails**: keep loaded pages; inline retry banner inside `HistoryGrid`. Don't wipe.
- **Delete fails**: `sonner` toast; roll back optimistic removal by re-invalidating.
- **Clear all fails**: `sonner` toast; nothing was deleted.
- **Network offline**: root-level error UI handles the full-page case.

## Testing

### Backend (Go)

Additions to `api/internal/api/progress_handler_test.go`:

- `ListHistory` — `filter=all|in_progress|completed`, search match/no-match (including title_zh), cursor pagination across multiple pages, empty result, 100-row limit cap.
- `DeleteProgress` — success, 404 on wrong user, 404 on already-deleted.
- `BatchDelete` — scoped to user, silently ignores other users' ids, returns accurate count, rejects `len(ids) > 200`.
- `ClearAll` — returns count, leaves other users' rows intact.

### Frontend (Vitest + Testing Library)

- `HistoryPage.test.tsx` — renders items, tab switch triggers refetch, search input debounces, empty state renders, skeleton on initial load, infinite-scroll sentinel triggers next page.
- `history-date-buckets.test.ts` — boundaries: midnight between "today/yesterday", Monday 00:00 between "this week / last week", daylight-saving edge.
- `HistoryCard.test.tsx` — finished badge vs in-progress badge, missing cover fallback, delete button shows confirm dialog.

### E2E (Playwright, per project rule)

`e2e/history.spec.ts`:

1. Navigate to `/history` from the sidebar.
2. Verify history items render.
3. Switch to `Completed` tab; verify only completed items remain.
4. Enter a search query; verify list filters.
5. Delete one item (confirm dialog); verify it's removed.
6. Open the Clear-all dialog; cancel once; then confirm; verify list is empty + empty state shows.

## Verification before completion (project rule)

- `bun run check:all` passes (typecheck + lint + format + unit tests).
- `go test ./...` passes for the API.
- E2E run is green.
- Manual test in the running app: sidebar entry appears, page loads, all interactions work, skeletons show on slow network throttle, Continue Watching on Home still works and its "see all" lands on `/history`.
