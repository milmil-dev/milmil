# Trending Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/trending` from a plain poster grid into a cinematic discovery page with compact hero banner, tabbed navigation (Trending / Top Rated / Popular), media type filter chips, and ranked poster grid.

**Architecture:** Single-page rewrite of `TrendingPage.tsx`. Uses existing `discoverApi.trending()` for the Trending tab and `discoverApi.browse({ sort })` for Top Rated / Popular tabs. No new API endpoints. Client-side media type filtering. Atmospheric background via `useBgStore`.

**Tech Stack:** React 19, TanStack Query v5, TanStack Router, Motion, Lingui v5, Tailwind CSS v4, Zustand

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `web/src/pages/TrendingPage.tsx` | Full page: hero, tabs, filters, grid, load-more, skeletons |
| Extract/Compile | `web/src/locales/*/messages.po` | New i18n keys for tabs and filters |

No new files created — this is a single-page rewrite reusing existing components (`AnimeCard`, `PageTransition`, `Skeleton`, `Button`).

---

### Task 1: Add i18n Keys

**Files:**
- Modify: `web/src/pages/TrendingPage.tsx` (keys will be used here, but extraction happens from source)
- Auto-generated: `web/src/locales/*/messages.po`

- [ ] **Step 1: Add msg references to TrendingPage source**

These keys will be used in the rewritten page. For now, just ensure they exist so extraction picks them up. Open `web/src/pages/TrendingPage.tsx` and add a temporary block at the top of the component (will be properly integrated in Task 2):

```tsx
// Temporary — ensures i18n extraction picks up new keys
const _i18nKeys = [
  msg`trending.tab.trending`,
  msg`trending.tab.topRated`,
  msg`trending.tab.popular`,
  msg`trending.filter.all`,
];
```

- [ ] **Step 2: Extract and compile translations**

Run:
```bash
cd web && bun run i18n:extract && bun run i18n:compile
```

Expected: New keys appear in `web/src/locales/*/messages.po` files with empty translations.

- [ ] **Step 3: Add Chinese translations**

Edit `web/src/locales/zh-TW/messages.po` — find the new keys and add translations:

```po
msgid "trending.tab.trending"
msgstr "熱門"

msgid "trending.tab.topRated"
msgstr "最高評分"

msgid "trending.tab.popular"
msgstr "最受歡迎"

msgid "trending.filter.all"
msgstr "全部"
```

Do the same for `zh-HK/messages.po` with the same values.

For `en/messages.po`:
```po
msgid "trending.tab.trending"
msgstr "Trending"

msgid "trending.tab.topRated"
msgstr "Top Rated"

msgid "trending.tab.popular"
msgstr "Popular"

msgid "trending.filter.all"
msgstr "All"
```

For `ko/messages.po`:
```po
msgid "trending.tab.trending"
msgstr "인기"

msgid "trending.tab.topRated"
msgstr "최고 평점"

msgid "trending.tab.popular"
msgstr "인기순"

msgid "trending.filter.all"
msgstr "전체"
```

- [ ] **Step 4: Recompile translations**

Run:
```bash
cd web && bun run i18n:compile
```

Expected: No errors, compiled message catalogs updated.

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/ web/src/pages/TrendingPage.tsx
git commit -m "feat(i18n): add trending page tab and filter translation keys"
```

---

### Task 2: Rewrite TrendingPage — Skeleton + State + Tabs

**Files:**
- Rewrite: `web/src/pages/TrendingPage.tsx`

This task rewrites the page with the full structure: skeleton loading state, tab bar, data fetching, and the overall page shell. The hero and grid rendering come in Task 3.

- [ ] **Step 1: Rewrite TrendingPage.tsx with state, tabs, and skeleton**

Replace the entire content of `web/src/pages/TrendingPage.tsx` with:

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { cn } from '../lib/utils';
import { useBgStore } from '../store/bg-store';

type Tab = 'trending' | 'top_rated' | 'popular';

const MEDIA_TYPES = ['all', 'TV', 'MOVIE', 'OVA', 'ONA'] as const;

const TAB_CONFIG: Record<Tab, { labelKey: ReturnType<typeof msg>; sort?: string }> = {
  trending: { labelKey: msg`trending.tab.trending` },
  top_rated: { labelKey: msg`trending.tab.topRated`, sort: 'SCORE_DESC' },
  popular: { labelKey: msg`trending.tab.popular`, sort: 'POPULARITY_DESC' },
};

export function TrendingPage() {
  const { i18n } = useLingui();
  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [mediaType, setMediaType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<AnimeSummary[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => () => setImage(null), [setImage]);

  // Fetch data based on active tab
  const tabConfig = TAB_CONFIG[activeTab];
  const queryKey =
    activeTab === 'trending'
      ? discoverKeys.trending(page)
      : (['discover', 'browse', activeTab, page] as const);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      activeTab === 'trending'
        ? discoverApi.trending(page)
        : discoverApi.browse({ sort: tabConfig.sort, page }),
  });

  // Accumulate results across pages
  useEffect(() => {
    if (data) {
      if (data.length === 0) {
        setHasMore(false);
      } else {
        setAllItems((prev) => (page === 1 ? data : [...prev, ...data]));
      }
    }
  }, [data, page]);

  // Reset when tab or filter changes
  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setPage(1);
    setAllItems([]);
    setHasMore(true);
  };

  const switchMediaType = (type: string) => {
    setMediaType(type);
  };

  // Client-side media type filtering
  const filteredItems =
    mediaType === 'all'
      ? allItems
      : allItems.filter((a) => a.media_type?.toUpperCase() === mediaType);

  // Hero item is #1, grid starts at #2
  const heroItem = filteredItems[0] ?? null;
  const gridItems = filteredItems.slice(1);

  // Set atmospheric background from hero
  useEffect(() => {
    if (heroItem) {
      const img = heroItem.banner_image || heroItem.cover_image;
      if (img?.startsWith('http')) setImage(img);
    }
  }, [heroItem, setImage]);

  const showSkeleton = isLoading && allItems.length === 0;

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Skeleton ────────────────────────────────── */}
        {showSkeleton && <TrendingPageSkeleton />}

        {/* ── Error ───────────────────────────────────── */}
        {isError && allItems.length === 0 && (
          <div className="text-center py-16 px-8">
            <p className="text-sm mb-3 text-mm-text-secondary">載入失敗</p>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              重試
            </Button>
          </div>
        )}

        {/* ── Main content ────────────────────────────── */}
        {!showSkeleton && allItems.length > 0 && (
          <>
            {/* Hero banner for #1 */}
            {heroItem && <TrendingHero anime={heroItem} />}

            <div className="px-4 md:px-6">
              {/* Tab bar */}
              <div className="flex items-center gap-6 border-b border-white/[0.06] mt-2">
                {(Object.keys(TAB_CONFIG) as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => switchTab(tab)}
                    className={cn(
                      'pb-2.5 text-sm font-semibold transition-colors relative cursor-pointer',
                      activeTab === tab
                        ? 'text-white'
                        : 'text-white/40 hover:text-white/60'
                    )}
                  >
                    {i18n._(TAB_CONFIG[tab].labelKey)}
                    {activeTab === tab && (
                      <motion.div
                        layoutId="trending-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/50"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Media type filter chips */}
              <div className="flex items-center gap-2 mt-4">
                {MEDIA_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => switchMediaType(type)}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors cursor-pointer',
                      mediaType === type
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                    )}
                  >
                    {type === 'all' ? i18n._(msg`trending.filter.all`) : type}
                  </button>
                ))}
              </div>

              {/* Ranked poster grid (#2 onward) */}
              <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4 mt-6">
                {gridItems.map((anime, i) => (
                  <div key={`${anime.bangumi_id}-${i}`} className="relative">
                    <AnimeCard anime={anime} />
                    {/* Rank overlay */}
                    <span className="absolute -bottom-1 -left-1 text-[42px] font-black leading-none text-white/[0.08] pointer-events-none select-none tabular-nums">
                      {i + 2}
                    </span>
                  </div>
                ))}
              </div>

              {/* Load more */}
              {hasMore && filteredItems.length > 0 && (
                <div className="flex justify-center mt-8 pb-16">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={isLoading}
                  >
                    {isLoading ? '載入中...' : '載入更多'}
                  </Button>
                </div>
              )}

              {/* No results after filtering */}
              {!hasMore && filteredItems.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-sm text-mm-text-secondary">沒有符合的結果</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 2: Verify the file compiles (no runtime yet)**

Run:
```bash
cd web && bun run typecheck
```

Expected: May show errors for `TrendingHero` and `TrendingPageSkeleton` which we define in the next steps. That's expected — we'll add them next.

- [ ] **Step 3: Commit work-in-progress**

```bash
git add web/src/pages/TrendingPage.tsx
git commit -m "feat(trending): rewrite page shell with tabs, filters, and state management (WIP)"
```

---

### Task 3: Add TrendingHero and TrendingPageSkeleton

**Files:**
- Modify: `web/src/pages/TrendingPage.tsx` (append components at bottom)

- [ ] **Step 1: Add TrendingHero component**

Append the following to the bottom of `web/src/pages/TrendingPage.tsx`:

First, add these imports to the **top of the file** alongside the existing imports:

```tsx
import { Link } from '@tanstack/react-router';
import { animeGradient } from '../lib/gradient';
import { translateGenre } from '../lib/genre-i18n';
```

Then append this component at the bottom of the file:

```tsx
/* ── Compact hero banner for #1 trending ──────────────────── */

function TrendingHero({ anime }: { anime: AnimeSummary }) {
  const { i18n } = useLingui();
  const bannerSrc = anime.banner_image || anime.cover_image;
  const hasBanner = !!anime.banner_image;

  return (
    <Link
      to={`/anime/${anime.bangumi_id}` as string}
      className="block relative w-full overflow-hidden group"
      style={{ height: 'clamp(180px, 22vh, 240px)' }}
    >
      {/* Background image */}
      {bannerSrc?.startsWith('http') ? (
        <img
          src={bannerSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          style={
            !hasBanner
              ? { filter: 'blur(24px) saturate(1.2) brightness(0.3)', transform: 'scale(1.4)' }
              : { filter: 'brightness(0.4)' }
          }
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: animeGradient(anime.title) }}
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--mm-bg)] via-transparent to-[var(--mm-bg)]/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--mm-bg)]/80 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-6 pb-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* Rank badge */}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/70 bg-white/[0.08] backdrop-blur-sm rounded px-2 py-0.5 mb-2">
            #1 {i18n._(msg`trending.tab.trending`)}
          </span>

          {/* Title */}
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight line-clamp-1 mb-1.5">
            {anime.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {anime.media_type && (
              <span className="text-[10px] font-bold text-white/60 bg-white/[0.08] rounded px-1.5 py-0.5">
                {anime.media_type}
              </span>
            )}
            {anime.score > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-400/90 tabular-nums">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-[10px] h-[10px]">
                  <path d="M6 0.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L6 9.52 2.48 11.35l.67-3.93L.3 4.64l3.94-.57z" />
                </svg>
                {anime.score.toFixed(1)}
              </span>
            )}
            {anime.episode_count > 0 && (
              <span className="text-[10px] text-white/40 tabular-nums">
                {anime.episode_count} {i18n._(msg`common.ep`)}
              </span>
            )}
            {anime.genres?.slice(0, 3).map((g) => (
              <span key={g} className="text-[10px] text-white/35">
                {translateGenre(g, i18n.locale)}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </Link>
  );
}
```


- [ ] **Step 2: Add TrendingPageSkeleton component**

Append to the bottom of `web/src/pages/TrendingPage.tsx`:

```tsx
/* ── Skeleton loading state ───────────────────────────────── */

function TrendingPageSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      <Skeleton className="w-full" style={{ height: 'clamp(180px, 22vh, 240px)' }} />

      <div className="px-4 md:px-6">
        {/* Tab skeleton */}
        <div className="flex items-center gap-6 mt-2 border-b border-white/[0.06] pb-2.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Filter chips skeleton */}
        <div className="flex items-center gap-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-14 rounded-md" />
          ))}
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4 mt-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[6/8] rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run:
```bash
cd web && bun run typecheck
```

Expected: PASS — no type errors.

- [ ] **Step 4: Verify lint passes**

Run:
```bash
cd web && bun run lint
```

Expected: PASS — no lint errors. Fix any issues Biome reports.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TrendingPage.tsx
git commit -m "feat(trending): add compact hero banner, skeleton loader, and rank overlay grid"
```

---

### Task 4: Extract, Translate, and Compile i18n

This task ensures all new `msg` template literals in the rewritten page get properly extracted and compiled.

**Files:**
- Auto-generated: `web/src/locales/*/messages.po` and compiled `.ts` catalogs

- [ ] **Step 1: Extract new translation keys**

Run:
```bash
cd web && bun run i18n:extract
```

Expected: Output shows new keys extracted from `TrendingPage.tsx`.

- [ ] **Step 2: Fill in any missing translations**

Check each locale file for empty `msgstr` values for the new keys. Fill in translations from Task 1 if they didn't persist, or if new keys appeared (e.g., `common.ep` may already exist).

- [ ] **Step 3: Compile translations**

Run:
```bash
cd web && bun run i18n:compile
```

Expected: No errors.

- [ ] **Step 4: Full quality check**

Run:
```bash
cd web && bun run check:all
```

Expected: PASS — typecheck, lint, format, and tests all green.

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): compile trending page translations for all locales"
```

---

### Task 5: Visual QA and Polish

**Files:**
- Modify: `web/src/pages/TrendingPage.tsx` (if adjustments needed)

- [ ] **Step 1: Ask user to start dev server and review**

Ask the user to run `cd web && bun run dev` and navigate to `/trending`. Review:

1. Hero banner displays #1 trending with banner image, title, score, genres
2. Three tabs (Trending / Top Rated / Popular) switch correctly
3. Tab indicator animates smoothly between tabs
4. Media type chips filter the grid client-side
5. Rank numbers appear on grid cards (#2, #3, #4...)
6. Skeleton loaders show during initial load
7. Load more button works and appends results
8. Background glow updates from hero image
9. Hover detail cards still work on grid items

- [ ] **Step 2: Fix any visual issues found**

Adjust spacing, font sizes, opacity values, or layout as needed based on review.

- [ ] **Step 3: Final quality check**

Run:
```bash
cd web && bun run check:all
```

Expected: PASS.

- [ ] **Step 4: Commit final polish**

```bash
git add web/src/pages/TrendingPage.tsx
git commit -m "feat(trending): redesign trending page with hero, tabs, filters, and ranked grid"
```
