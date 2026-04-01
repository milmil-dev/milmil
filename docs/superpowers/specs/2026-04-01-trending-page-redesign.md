# Trending Page Redesign

## Goal

Redesign `/trending` from a plain poster grid into a cinematic discovery page inspired by Seanime (atmosphere, hero banner) and AniList (structured browsing, clean card grids). The page should feel like a curated ranking experience, clearly distinct from the search page's filter-heavy approach.

## Architecture

Single page component (`TrendingPage.tsx`) with internal state for active tab and media type filter. No new API endpoints needed — uses existing `discoverApi.trending()` and `discoverApi.browse()`.

## Sections (top to bottom)

### 1. Compact Hero Banner (~200px)

- Displays the **#1 trending anime** using its `banner_image` (falls back to blurred `cover_image`)
- Overlaid content: rank badge (#1), title, score, genres, episode count, media type
- Bottom gradient fade into page background
- Clicking navigates to `/anime/:id`
- Updates `useBgStore` with the banner image for atmospheric background glow (same pattern as HomePage)

### 2. Tab Bar

Three tabs, each backed by a different API call:

| Tab | API | Sort |
|-----|-----|------|
| Trending | `discoverApi.trending(page)` | Server-determined (TRENDING_DESC) |
| Top Rated | `discoverApi.browse({ sort: 'SCORE_DESC', page })` | SCORE_DESC |
| Popular | `discoverApi.browse({ sort: 'POPULARITY_DESC', page })` | POPULARITY_DESC |

- Active tab has a bottom border indicator (white/opacity, not accent color per project convention)
- Switching tabs resets pagination to page 1 and clears accumulated items
- Each tab caches independently via TanStack Query (query keys include tab identifier)

### 3. Media Type Filter Chips

Horizontal row: **All** | **TV** | **Movie** | **OVA** | **ONA**

- "All" is the default active state
- All filtering is **client-side** — neither the `trending` nor `browse` APIs accept a media type param
- Filters the accumulated `allItems` array by `anime.media_type` before rendering
- Minimal — no genre, year, season, or sort dropdown. This is NOT the search page.

### 4. Ranked Poster Grid

- Uses existing `AnimeCard` component
- Responsive grid matching HomePage pattern: `grid-cols-2 md:3 lg:4 xl:5 2xl:6`
- Each card gets a **rank number overlay** — large, semi-transparent number positioned at bottom-left of the poster (e.g., bold "#2" in white/15 opacity, large font)
- #1 is shown in the hero, so grid starts at #2
- Grid items enter with staggered fade-in animation (motion)

### 5. Load More

- "Load more" button at bottom (same pattern as current)
- Appends next page results to accumulated items
- Disabled while loading, shows loading text

### 6. Skeleton Loading States

Per project convention, all async states use skeleton loaders:

- **Hero skeleton**: 200px tall pulsing block with gradient
- **Tab skeleton**: 3 pulsing rectangles in a row
- **Grid skeleton**: 12 poster-shaped pulsing blocks in the responsive grid

## Data Flow

```
Tab state (trending | top_rated | popular)
  + Media type filter (all | TV | MOVIE | OVA | ONA)
  + Page number
  → TanStack Query (queryKey includes all three)
  → API call
  → Accumulate results in useState
  → Render hero (#1) + grid (#2+)
```

## State Management

- `activeTab`: `useState<'trending' | 'top_rated' | 'popular'>('trending')`
- `mediaType`: `useState<string>('all')`
- `page`: `useState<number>(1)`
- `allItems`: `useState<AnimeSummary[]>([])` — accumulated across pages
- `hasMore`: `useState<boolean>(true)`

Switching tab or media type resets `page` to 1 and clears `allItems`.

## Components

No new shared components needed. Everything is built within `TrendingPage.tsx` using:

- `AnimeCard` — existing poster card with hover detail
- `PageTransition` — existing page wrapper
- `Button` — existing shadcn button for load more
- `motion` — existing animation library for entrance animations

The hero banner is page-specific (not a reusable component) since it's simpler than HomePage's carousel `HeroBanner`.

## Styling

- Borders and focus states use white/opacity (not primary/accent colors)
- Active tab indicator: `border-b-2 border-white/50`
- Active filter chip: `bg-white/10 text-white`
- Inactive: `text-white/40 hover:text-white/60`
- Rank overlay: large bold number, `text-white/15`, positioned absolute bottom-left of card poster
- Dark theme throughout, consistent with rest of app

## i18n

New translation keys needed:

- `trending.title` — "熱門動畫" (page title, already exists)
- `trending.tab.trending` — "熱門" / "Trending"
- `trending.tab.topRated` — "最高評分" / "Top Rated"
- `trending.tab.popular` — "最受歡迎" / "Popular"
- `trending.filter.all` — "全部" / "All"

Media type labels (TV, Movie, OVA, ONA) can use the raw English values as they're industry-standard.

## Out of Scope

- Genre filtering (belongs on search page)
- Year/season filtering (belongs on search page)
- Sort dropdown within tabs (each tab IS a sort)
- Infinite scroll (keep load-more button for simplicity)
- New API endpoints
