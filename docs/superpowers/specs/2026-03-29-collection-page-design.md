# Collection Page Design Spec

## Overview

Add a `/collection` route as the user's anime collection hub. Displays all matched anime from media libraries as a poster card grid with watch status tracking. LibrariesPage gets a lightweight "recently matched" preview area. Future-extensible for Bangumi account sync.

## Decisions

- **Display unit**: Anime work (aggregated from matched files across all libraries)
- **Placement**: Dedicated `/collection` page as primary view; LibrariesPage top gets preview
- **Watch status**: Local `watch_status` field on `anime` table, manual user control, future Bangumi bidirectional sync
- **Libraries preview**: Recently matched anime (by match time), horizontal scroll, max 10 items
- **Naming**: "Collection" / 收藏

## 1. Data Layer

### Schema Changes

Add to `anime` table:

```sql
ALTER TABLE anime ADD COLUMN watch_status TEXT NOT NULL DEFAULT 'watching'
  CHECK (watch_status IN ('watching', 'planning', 'completed', 'paused', 'dropped'));
ALTER TABLE anime ADD COLUMN watch_status_updated_at TIMESTAMP;
```

- Default `watching` — when a file is matched to an anime, the anime starts as "watching"
- `watch_status_updated_at` — tracks when status was last changed manually

### New SQL Queries

**ListCollectionAnime** — Returns anime with matched files, aggregated:

```sql
SELECT
  a.id, a.bangumi_id, a.title, a.title_original, a.cover_image, a.banner_image,
  a.score, a.episode_count, a.watch_status, a.watch_status_updated_at,
  COUNT(DISTINCT mf.id) AS local_file_count,
  COUNT(DISTINCT e.id) AS local_episode_count
FROM anime a
JOIN episodes e ON e.anime_id = a.id
JOIN media_files mf ON mf.dandanplay_episode_id = e.dandanplay_episode_id
  OR (mf.matched_bangumi_id = a.bangumi_id AND mf.match_status != 'unmatched')
WHERE mf.match_status != 'unmatched'
GROUP BY a.id
ORDER BY a.watch_status_updated_at DESC NULLS LAST, a.created_at DESC;
```

- Filter by `watch_status` param (optional)
- Search by title (optional, ILIKE on title + title_original)
- Sort options: match_time (default), name, score

**ListRecentlyMatchedAnime** — For Libraries preview:

```sql
-- Same base query, ordered by most recent file match, LIMIT 10
```

**UpdateWatchStatus**:

```sql
UPDATE anime SET watch_status = $2, watch_status_updated_at = NOW() WHERE bangumi_id = $1;
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/collection` | List collection anime. Query params: `status`, `search`, `sort` |
| `PATCH` | `/api/collection/:bangumi_id/status` | Update watch status. Body: `{ "status": "completed" }` |
| `GET` | `/api/collection/recent` | Recently matched anime, limit 10 |

## 2. Collection Page (`/collection`)

### Route

- File: `web/src/routes/collection.tsx`
- Page: `web/src/pages/CollectionPage.tsx`

### Layout (top to bottom)

1. **Page header**: 「收藏」title
2. **Status tabs**: 全部 | 在看 | 想看 | 已看 | 擱置 | 棄番
   - Each tab shows count badge
   - Style: same as SchedulePage weekday tabs
3. **Search + sort row**:
   - Text search input (debounced 300ms)
   - Sort dropdown: 最近匹配 / 名稱 / 評分
4. **Anime card grid**: Responsive grid (2-6 columns)
5. **Empty state**: Per-status empty message, overall empty → link to Libraries

### Anime Card

Each card displays:

- **Poster image** (cover_image, with procedural gradient fallback)
- **Title** (title + title_original below in smaller text)
- **Episode progress badge**: 「5/12 集」format (local_file_count / episode_count)
- **Watch status badge**: Color-coded pill (watching=blue, completed=green, planning=amber, paused=zinc, dropped=red)
- **Click** → navigate to `/anime/:bangumi_id`
- **Status dropdown** on hover/long-press → quick status change without leaving page

### Card Grid Style

- Follow SchedulePage animation patterns: staggered entrance (motion), hover scale
- Responsive breakpoints: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`
- Gap: `1rem`
- Skeleton loading: card-shaped placeholders matching grid

### Status Tab Mapping

| Tab label | Status value | Chinese |
|-----------|-------------|---------|
| 全部 | (all) | All |
| 在看 | `watching` | Watching |
| 想看 | `planning` | Planning |
| 已看 | `completed` | Completed |
| 擱置 | `paused` | On Hold |
| 棄番 | `dropped` | Dropped |

## 3. Libraries Preview Area

### Location

Top of LibrariesPage, above the library cards grid.

### Layout

- **Section header**: 「最近匹配」+ 「查看全部 →」link (navigates to `/collection`)
- **Horizontal scroll container**: Anime poster cards, simplified version
  - Poster + title + episode count only (no status badge)
  - Max 10 items
  - Scroll with snap points
- **Conditional**: Hidden when no matched anime exist

### Data Source

`GET /api/collection/recent` — fetches at page load alongside library list.

## 4. Sidebar Navigation

Add Collection icon entry to sidebar:

- **Position**: Between Libraries and Schedule
- **Icon**: Bookmark or collection icon (lucide `Bookmark` or `Library`)
- **Label**: 收藏 / Collection
- **Route**: `/collection`

## 5. i18n Keys

New translation keys needed:

```
collection.title = 收藏 / Collection
collection.all = 全部 / All
collection.watching = 在看 / Watching
collection.planning = 想看 / Planning
collection.completed = 已看 / Completed
collection.paused = 擱置 / On Hold
collection.dropped = 棄番 / Dropped
collection.episodes = {count}/{total} 集
collection.empty = 還沒有收藏的動畫
collection.empty.watching = 沒有在看的動畫
collection.recentlyMatched = 最近匹配
collection.viewAll = 查看全部
collection.changeStatus = 更改狀態
collection.sortBy.matchTime = 最近匹配
collection.sortBy.name = 名稱
collection.sortBy.score = 評分
```

## 6. Future Extension Points

- **Bangumi account binding**: After OAuth integration, `watch_status` syncs bidirectionally with Bangumi's collection API
- **External-only entries**: Anime tracked on Bangumi but without local files can appear in Collection with a "no local files" indicator
- **Watch history**: Track which episodes have been watched (from the video player), enabling accurate progress tracking beyond file count
- **Smart status**: Auto-suggest status change when all episodes are available locally
