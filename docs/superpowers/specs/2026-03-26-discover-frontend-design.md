# Discover Frontend — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Plan 4 (Metadata Integration) — completed

---

## 1. Overview

Build the frontend discover pages that consume the metadata API endpoints (calendar, trending, search, anime detail). Includes a Seanime-style icon-only sidebar, command palette (⌘K), and five pages with Motion animations.

### Goals
- Seanime-style icon-only sidebar (~60px) replacing current 240px text sidebar
- Integrated home page with today's airing anime + trending row + library tiles
- Full schedule, trending, search pages
- Seanime-style anime detail page with hero banner
- Command palette (⌘K) for quick search anywhere
- Poster cards for trending/search, horizontal rows for calendar — context-dependent card styles

### Non-goals
- Video playback (later plan)
- Watch progress tracking (later plan)
- OAuth integration pages (later plan)

---

## 2. Pages & Routes

| Route | Page | Data Source |
|-------|------|-------------|
| `/` | HomePage | `GET /discover/calendar` (today only) + `GET /discover/trending?page=1` + `GET /libraries` |
| `/schedule` | SchedulePage | `GET /discover/calendar` (all 7 days) |
| `/trending` | TrendingPage | `GET /discover/trending?page=N` |
| `/search` | SearchPage | `GET /discover/search?q=...` |
| `/anime/:id` | AnimeDetailPage | `GET /discover/anime/:id` + `GET /discover/anime/:id/episodes` |

All discover endpoints are public (no auth). Library endpoint requires auth (existing).

---

## 3. Sidebar Redesign

Replace current 240px text sidebar (`AppSidebar.tsx`) with Seanime-style icon-only sidebar.

### Layout
- Width: ~60px fixed
- Top: milmil logo icon (small, amber accent)
- Main nav group: Home, Schedule, Search, Trending — icon only
- Separator line
- Bottom nav group: Libraries, Settings — icon only
- Hover: tooltip with page name
- Active state: left amber bar + icon highlight (keep existing `layoutId` animation)

### Icons (Hugeicons)
- Home: `HouseIcon`
- Schedule: `Calendar03Icon`
- Search: `Search01Icon`
- Trending: `FireIcon`
- Libraries: `FolderLibraryIcon`
- Settings: `Setting07Icon`

### Impact
- `__root.tsx`: change `ml-[240px]` to `ml-[60px]`
- `__root.tsx`: add discover routes to `PUBLIC_ROUTES` — `/schedule`, `/trending`, `/search`, and paths starting with `/anime/` should bypass auth (discover data is public)
- All pages get more horizontal space

---

## 4. Component Architecture

### New Components

**`AnimeCard.tsx`** — Poster-style card for trending/search
- Tall rectangle with cover image (from `cover_image` field)
- Fallback: procedural gradient from title (extracted `hashName`/`animeGradient` from `web/src/lib/gradient.ts`)
- Score badge overlaid on bottom of image
- Title + episode count below
- Hover: scale up slightly (whileHover)
- Click: navigate to `/anime/:id` (using `bangumi_id`)

**`AnimeRow.tsx`** — Horizontal row for calendar
- Small cover thumbnail (left) + title, original title, score, episode count (right)
- Compact, showing many items per day
- Click: navigate to `/anime/:id`

**`CommandPalette.tsx`** — ⌘K quick search
- Overlay panel centered on screen with backdrop
- Search input at top, auto-focused
- Results list below (max 6 items)
- Each result: cover thumbnail + title + score
- Click result → navigate to `/anime/:id`, close palette
- ESC or click backdrop → close
- Zustand store: `useCommandPaletteStore` with `isOpen`, `open()`, `close()`, `toggle()`
- Global `useEffect` keyboard listener for ⌘K / Ctrl+K lives inside `CommandPalette.tsx` (not in `__root.tsx`)

### New API Client

**`web/src/lib/api/discover.ts`**
```typescript
interface AnimeSummary {
  bangumi_id: number;
  anilist_id?: number;
  title: string;
  title_original: string;
  title_en?: string;
  cover_image: string;
  air_date?: string;
  episode_count: number;
  score: number;
}

interface AnimeDetail extends AnimeSummary {
  synopsis: string;
  banner_image?: string;
  tags: string[];
  popularity?: number;
  rating: { score: number; total: number };
}

interface CalendarDay {
  weekday: string;
  weekday_en: string;
  items: AnimeSummary[];
}

interface Episode {
  bangumi_episode_id: number;
  sort: number;
  title: string;
  title_original: string;
  air_date?: string;
  synopsis?: string;
}

const discoverApi = {
  calendar: () => api.get<CalendarDay[]>('/api/v1/discover/calendar'),
  trending: (page: number) => api.get<AnimeSummary[]>(`/api/v1/discover/trending?page=${page}`),
  search: (q: string) => api.get<AnimeSummary[]>(`/api/v1/discover/search?q=${encodeURIComponent(q)}`),
  detail: (id: number) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
  episodes: (id: number) => api.get<Episode[]>(`/api/v1/discover/anime/${id}/episodes`),
};

const discoverKeys = {
  calendar: () => ['discover', 'calendar'] as const,
  trending: (page: number) => ['discover', 'trending', page] as const,
  search: (q: string) => ['discover', 'search', q] as const,
  detail: (id: number) => ['discover', 'detail', id] as const,
  episodes: (id: number) => ['discover', 'episodes', id] as const,
};
```

---

## 5. Page Designs

### HomePage (rewrite)

Three sections with staggered entrance animations:

1. **今日新番** — Filter calendar for today's weekday. Show as horizontal rows (`AnimeRow`). "查看全部 →" links to `/schedule`.
2. **熱門動畫** — First 10 trending results. Horizontal scrolling row of poster cards (`AnimeCard`). "查看全部 →" links to `/trending`.
3. **我的媒體庫** — Existing library tiles (keep current design).

Each section has a small uppercase label header (existing pattern from current HomePage).

Loading: skeleton rows/cards per section. Error: section shows inline "載入失敗" with retry link — other sections still render.

### SchedulePage

- Tab bar or weekday selector at top (星期一 through 星期日)
- Today's tab highlighted by default
- Each day shows its anime as `AnimeRow` list
- Staggered entrance animation per row
- Loading: skeleton horizontal rows. Error: "載入日曆失敗" with retry button.

### TrendingPage

- Grid of `AnimeCard` poster cards
- `gridTemplateColumns: repeat(auto-fill, minmax(150px, 1fr))`
- "載入更多" button at bottom for pagination — hidden when API returns empty array (no more pages)
- Staggered card entrance (delay: i * 0.03)
- Loading: skeleton poster cards. Error: "載入失敗" with retry.

### SearchPage

- Large search input at top
- Debounce 300ms before query fires
- Results as `AnimeCard` grid (same as trending)
- Empty state: "搜索你喜歡的動畫" with search icon
- Loading state: skeleton cards
- `useQuery` with `enabled: !!debouncedQuery`

### AnimeDetailPage

Seanime-style layout:

1. **Hero banner** — Full-width `banner_image` from AniList. Gradient overlay (bottom → dark). If no banner, use a tall gradient generated from title.
2. **Cover + info overlay** — Cover poster positioned at bottom-left of hero, overlapping. Title, original title, English title, score, episode count, tags.
3. **Content below hero** — Synopsis section + episode list.
4. **Episode list** — Numbered rows with title (Chinese preferred), air date. Click navigates nowhere yet (no playback in this plan).

Loading: skeleton hero + skeleton rows. Error (404): "找不到此動畫" message. Error (network): "載入失敗" with retry.

### CommandPalette

- Triggered by ⌘K / Ctrl+K globally
- Fixed overlay with semi-transparent backdrop
- Centered panel (~500px wide, max 60vh)
- Input at top with search icon
- Results below: each item is cover thumbnail + title + score + "Enter to open"
- Keyboard navigation: up/down arrows to select, Enter to navigate
- AnimatePresence for open/close animation

---

## 6. File Map

### Created
- `web/src/lib/gradient.ts` — shared `hashName`, `animeGradient`, `libraryGradient` functions (extracted from existing code)
- `web/src/lib/api/discover.ts` — API client + query keys
- `web/src/store/command-palette-store.ts` — Zustand store for ⌘K state
- `web/src/components/AnimeCard.tsx` — Poster card component
- `web/src/components/AnimeRow.tsx` — Horizontal row component
- `web/src/components/CommandPalette.tsx` — ⌘K search overlay
- `web/src/pages/SchedulePage.tsx`
- `web/src/pages/TrendingPage.tsx`
- `web/src/pages/SearchPage.tsx`
- `web/src/pages/AnimeDetailPage.tsx`
- `web/src/routes/schedule.tsx`
- `web/src/routes/trending.tsx`
- `web/src/routes/search.tsx`
- `web/src/routes/anime.$id.tsx` — dynamic route

### Modified
- `web/src/components/AppSidebar.tsx` — rewrite to icon-only 60px
- `web/src/routes/__root.tsx` — change `ml-[240px]` to `ml-[60px]`, add CommandPalette, add ⌘K listener
- `web/src/pages/HomePage.tsx` — rewrite with calendar + trending + libraries sections
- `web/src/pages/LibrariesPage.tsx` — import gradient functions from `gradient.ts` instead of local definitions
- `web/src/routeTree.gen.ts` — regenerated after new routes

---

## 7. Design Direction

Consistent with existing dark theme:
- Background: `oklch(7% 0.01 280)`
- Card/surface: `oklch(10-11% 0.01 280)`
- Accent: `oklch(65% 0.2 35)` (warm amber)
- Text: white for primary, `oklch(45-50%)` for secondary
- Motion: staggered entrances, spring hover, page transitions via `PageTransition` wrapper
- Font: Figtree (existing project font)
- No external images in fallback — procedural gradients from anime title hash
