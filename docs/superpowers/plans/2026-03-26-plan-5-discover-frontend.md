# Discover Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build frontend discover pages (schedule, trending, search, anime detail) with Seanime-style icon-only sidebar, command palette (⌘K), and Motion animations.

**Architecture:** Extract gradient utilities, create API client and Zustand store, build reusable AnimeCard/AnimeRow components, rewrite sidebar to icon-only, then build 5 pages consuming the discover API endpoints.

**Tech Stack:** React 19, TanStack Router, TanStack Query v5, Zustand v5, Motion, Tailwind CSS v4, Base UI, Hugeicons, Biome

**Important:** Use `bun` for all commands. Use `bunx @tanstack/router-cli generate` after creating route files. Use `bun run typecheck` to verify. Use `bun run lint:fix` before committing.

---

## File Map

### Created
- `web/src/lib/gradient.ts` — shared gradient utilities
- `web/src/lib/api/discover.ts` — discover API client + query keys
- `web/src/store/command-palette-store.ts` — Zustand store for ⌘K
- `web/src/components/AnimeCard.tsx` — poster card for trending/search
- `web/src/components/AnimeRow.tsx` — horizontal row for calendar
- `web/src/components/CommandPalette.tsx` — ⌘K search overlay
- `web/src/pages/SchedulePage.tsx`
- `web/src/pages/TrendingPage.tsx`
- `web/src/pages/SearchPage.tsx`
- `web/src/pages/AnimeDetailPage.tsx`
- `web/src/routes/schedule.tsx`
- `web/src/routes/trending.tsx`
- `web/src/routes/search.tsx`
- `web/src/routes/anime.$id.tsx`

### Modified
- `web/src/components/AppSidebar.tsx` — rewrite to icon-only 60px
- `web/src/routes/__root.tsx` — ml-[60px], PUBLIC_ROUTES, CommandPalette
- `web/src/pages/HomePage.tsx` — rewrite with calendar + trending + libraries
- `web/src/pages/LibrariesPage.tsx` — import from gradient.ts
- `web/src/routeTree.gen.ts` — regenerated

---

## Task 1: Extract Gradient Utilities + Discover API Client

**Files:**
- Create: `web/src/lib/gradient.ts`
- Create: `web/src/lib/api/discover.ts`
- Modify: `web/src/pages/LibrariesPage.tsx` (remove local hashName/cardGradient, import from gradient.ts)
- Modify: `web/src/pages/HomePage.tsx` (remove local hashName/libraryGradient, import from gradient.ts)

- [ ] **Step 1: Create gradient.ts**

```typescript
// web/src/lib/gradient.ts
export function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h) ^ name.charCodeAt(i);
  }
  return Math.abs(h);
}

export function libraryGradient(name: string): string {
  const h = hashName(name);
  const h1 = h % 360;
  const h2 = (h1 + 55 + ((h >> 8) % 50)) % 360;
  return `linear-gradient(135deg, oklch(32% 0.18 ${h1}), oklch(16% 0.12 ${h2}))`;
}

export function animeGradient(name: string): string {
  const h = hashName(name);
  const h1 = h % 360;
  const h2 = (h1 + 55 + ((h >> 8) % 50)) % 360;
  const h3 = (h2 + 45 + ((h >> 16) % 40)) % 360;
  return `linear-gradient(150deg, oklch(40% 0.22 ${h1}) 0%, oklch(28% 0.26 ${h2}) 55%, oklch(18% 0.16 ${h3}) 100%)`;
}
```

- [ ] **Step 2: Create discover.ts API client**

```typescript
// web/src/lib/api/discover.ts
import { api } from '../api-client';

export interface AnimeSummary {
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

export interface AnimeDetail extends AnimeSummary {
  synopsis: string;
  banner_image?: string;
  tags: string[];
  popularity?: number;
  rating: { score: number; total: number };
}

export interface CalendarDay {
  weekday: string;
  weekday_en: string;
  items: AnimeSummary[];
}

export interface Episode {
  bangumi_episode_id: number;
  sort: number;
  title: string;
  title_original: string;
  air_date?: string;
  synopsis?: string;
}

export const discoverApi = {
  calendar: () => api.get<CalendarDay[]>('/api/v1/discover/calendar'),
  trending: (page: number) => api.get<AnimeSummary[]>(`/api/v1/discover/trending?page=${page}`),
  search: (q: string) => api.get<AnimeSummary[]>(`/api/v1/discover/search?q=${encodeURIComponent(q)}`),
  detail: (id: number) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
  episodes: (id: number) => api.get<Episode[]>(`/api/v1/discover/anime/${id}/episodes`),
};

export const discoverKeys = {
  calendar: () => ['discover', 'calendar'] as const,
  trending: (page: number) => ['discover', 'trending', page] as const,
  search: (q: string) => ['discover', 'search', q] as const,
  detail: (id: number) => ['discover', 'detail', id] as const,
  episodes: (id: number) => ['discover', 'episodes', id] as const,
};
```

- [ ] **Step 3: Update LibrariesPage.tsx and HomePage.tsx**

In `LibrariesPage.tsx`: remove local `hashName` and `cardGradient` functions. Add import:
```typescript
import { animeGradient as cardGradient } from '../lib/gradient';
```
Note: `cardGradient` in LibrariesPage uses the same 3-stop gradient as `animeGradient`. Replace the import alias to keep the existing function name used in the component.

In `HomePage.tsx`: remove local `hashName` and `libraryGradient` functions. Add import:
```typescript
import { libraryGradient } from '../lib/gradient';
```

- [ ] **Step 4: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd web && bun run lint:fix
git add web/src/lib/gradient.ts web/src/lib/api/discover.ts web/src/pages/LibrariesPage.tsx web/src/pages/HomePage.tsx
git commit -m "refactor: extract gradient utilities and add discover API client"
```

---

## Task 2: Command Palette Store + AnimeCard + AnimeRow Components

**Files:**
- Create: `web/src/store/command-palette-store.ts`
- Create: `web/src/components/AnimeCard.tsx`
- Create: `web/src/components/AnimeRow.tsx`

- [ ] **Step 1: Create command palette Zustand store**

```typescript
// web/src/store/command-palette-store.ts
import { create } from 'zustand';

interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
```

- [ ] **Step 2: Create AnimeCard (poster card)**

```typescript
// web/src/components/AnimeCard.tsx
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { animeGradient } from '../lib/gradient';
import type { AnimeSummary } from '../lib/api/discover';

export function AnimeCard({ anime, index = 0 }: { anime: AnimeSummary; index?: number }) {
  const hasCover = anime.cover_image && anime.cover_image.startsWith('http');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ scale: 1.04 }}
    >
      <Link
        to="/anime/$id"
        params={{ id: String(anime.bangumi_id) }}
        className="block rounded overflow-hidden group"
      >
        {/* Cover */}
        <div className="relative aspect-[3/4] overflow-hidden" style={hasCover ? undefined : { background: animeGradient(anime.title) }}>
          {hasCover && (
            <img
              src={anime.cover_image}
              alt={anime.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          {/* Score badge */}
          <div className="absolute bottom-0 left-0 right-0 p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
            {anime.score > 0 && (
              <span className="text-[10px] font-bold" style={{ color: 'oklch(65% 0.2 35)' }}>
                {anime.score.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        {/* Info */}
        <div className="p-2" style={{ backgroundColor: 'oklch(10% 0.01 280)' }}>
          <p className="text-[12px] font-semibold text-white truncate leading-snug">{anime.title}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'oklch(38% 0.01 280)' }}>
            {anime.episode_count > 0 ? `${anime.episode_count} 集` : ''}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 3: Create AnimeRow (horizontal row for calendar)**

```typescript
// web/src/components/AnimeRow.tsx
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { animeGradient } from '../lib/gradient';
import type { AnimeSummary } from '../lib/api/discover';

export function AnimeRow({ anime, index = 0 }: { anime: AnimeSummary; index?: number }) {
  const hasCover = anime.cover_image && anime.cover_image.startsWith('http');

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link
        to="/anime/$id"
        params={{ id: String(anime.bangumi_id) }}
        className="group flex items-center gap-3 py-2.5 px-3 rounded transition-colors hover:bg-[oklch(11%_0.01_280)]"
      >
        {/* Thumbnail */}
        <div
          className="shrink-0 w-10 h-14 rounded overflow-hidden"
          style={hasCover ? undefined : { background: animeGradient(anime.title) }}
        >
          {hasCover && (
            <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white truncate">{anime.title}</p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'oklch(38% 0.01 280)' }}>
            {anime.title_original}
          </p>
        </div>
        {/* Score + eps */}
        <div className="shrink-0 text-right">
          {anime.score > 0 && (
            <p className="text-[11px] font-medium" style={{ color: 'oklch(65% 0.2 35)' }}>
              {anime.score.toFixed(1)}
            </p>
          )}
          <p className="text-[10px]" style={{ color: 'oklch(32% 0.01 280)' }}>
            {anime.episode_count > 0 ? `${anime.episode_count} 集` : ''}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd web && bun run typecheck
```

Note: The `Link to="/anime/$id"` may require the route to exist for TanStack Router type safety. If typecheck fails on this, use `to={`/anime/${anime.bangumi_id}`}` as a temporary workaround (untyped) — the route is created in Task 5.

- [ ] **Step 5: Commit**

```bash
cd web && bun run lint:fix
git add web/src/store/command-palette-store.ts web/src/components/AnimeCard.tsx web/src/components/AnimeRow.tsx
git commit -m "feat: add AnimeCard, AnimeRow components and command palette store"
```

---

## Task 3: Rewrite AppSidebar to Icon-Only (60px)

**Files:**
- Modify: `web/src/components/AppSidebar.tsx` — full rewrite
- Modify: `web/src/routes/__root.tsx` — change ml-[240px] to ml-[60px], update PUBLIC_ROUTES

- [ ] **Step 1: Rewrite AppSidebar.tsx**

Replace the entire file content with:

```typescript
// web/src/components/AppSidebar.tsx
import {
  Calendar03Icon,
  FireIcon,
  FolderLibraryIcon,
  HouseIcon,
  Search01Icon,
  Setting07Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const mainNav = [
  { to: '/', label: 'Home', icon: HouseIcon },
  { to: '/schedule', label: 'Schedule', icon: Calendar03Icon },
  { to: '/search', label: 'Search', icon: Search01Icon },
  { to: '/trending', label: 'Trending', icon: FireIcon },
] as const;

const bottomNav = [
  { to: '/libraries', label: 'Libraries', icon: FolderLibraryIcon },
  { to: '/settings', label: 'Settings', icon: Setting07Icon },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 30 } },
};

function NavItem({ to, label, icon, isActive }: { to: string; label: string; icon: typeof HouseIcon; isActive: boolean }) {
  return (
    <motion.div variants={itemVariants}>
      <Link
        to={to}
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded transition-colors group',
          isActive ? 'text-white' : 'text-[oklch(42%_0.01_280)] hover:text-[oklch(70%_0.01_280)]',
        )}
        title={label}
      >
        {isActive && (
          <motion.div
            layoutId="activeBar"
            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
            style={{ backgroundColor: 'oklch(65% 0.2 35)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        {isActive && (
          <motion.div
            layoutId="activeBg"
            className="absolute inset-0 rounded"
            style={{ backgroundColor: 'oklch(14% 0.02 280)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        <span className="relative z-10">
          <HugeiconsIcon icon={icon} size={20} />
        </span>
      </Link>
    </motion.div>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) => to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <motion.aside
      initial={{ x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="fixed left-0 top-0 bottom-0 w-[60px] z-40 flex flex-col items-center border-r"
      style={{
        backgroundColor: 'oklch(9% 0.01 280)',
        borderColor: 'oklch(14% 0.01 280)',
      }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="py-5"
      >
        <p className="text-base font-bold tracking-tight" style={{ color: 'oklch(65% 0.2 35)' }}>
          m
        </p>
      </motion.div>

      {/* Main nav */}
      <motion.nav
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col items-center gap-1 pt-2"
      >
        {mainNav.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
        ))}
      </motion.nav>

      {/* Separator */}
      <div className="w-6 h-px my-2" style={{ backgroundColor: 'oklch(16% 0.01 280)' }} />

      {/* Bottom nav */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-1 pb-4"
      >
        {bottomNav.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} label={label} icon={icon} isActive={isActive(to)} />
        ))}
      </motion.div>
    </motion.aside>
  );
}
```

**Note on Hugeicons:** `Calendar03Icon`, `Search01Icon`, `FireIcon` must exist in `@hugeicons/core-free-icons`. If any are missing, find alternatives:
```bash
node -e "const i = require('@hugeicons/core-free-icons'); console.log(Object.keys(i).filter(k=>k.includes('Calendar')).slice(0,5))"
```

- [ ] **Step 2: Update __root.tsx**

Changes needed:
1. Change `ml-[240px]` to `ml-[60px]`
2. Update `PUBLIC_ROUTES` to include discover routes
3. Change `PUBLIC_ROUTES.includes()` to a function that handles prefix matching (for `/anime/...`)

Replace the full `__root.tsx` content:

```typescript
import { createRootRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import { AppSidebar } from '../components/AppSidebar';
import { CommandPalette } from '../components/CommandPalette';
import { api } from '../lib/api-client';
import { useAuthStore } from '../store/auth-store';

interface StatusResponse { initialized: boolean; }
interface UserResponse { id: string; username: string; }

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

function isPublicRoute(pathname: string): boolean {
  const publicExact = ['/login', '/setup', '/schedule', '/trending', '/search'];
  if (publicExact.includes(pathname)) return true;
  if (pathname.startsWith('/anime/')) return true;
  return false;
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === '/login' || pathname === '/setup') {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'oklch(7% 0.01 280)' }}>
      <AppSidebar />
      <main className="flex-1 ml-[60px] min-h-screen overflow-y-auto">
        <AnimatePresence mode="wait">
          <Outlet key={pathname} />
        </AnimatePresence>
      </main>
      <CommandPalette />
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (AUTH_BYPASS) return;
    if (isPublicRoute(location.pathname)) return;

    const { token, user, initialized, setInitialized } = useAuthStore.getState();

    if (!token) {
      let isInitialized = initialized;
      if (isInitialized === null) {
        const status = await api.get<StatusResponse>('/api/v1/auth/status');
        isInitialized = status.initialized;
        setInitialized(isInitialized);
      }
      if (!isInitialized) throw redirect({ to: '/setup' });
      throw redirect({ to: '/login' });
    }

    if (!user) {
      try {
        const me = await api.get<UserResponse>('/api/v1/auth/me');
        useAuthStore.getState().login(token, me);
      } catch {
        useAuthStore.getState().logout();
        throw redirect({ to: '/login' });
      }
    }
  },
  component: RootLayout,
});
```

**Note:** This imports `CommandPalette` which doesn't exist yet — it's created in Task 4. If typecheck is run at this step, it will fail on that import. Create a placeholder `CommandPalette.tsx` that exports an empty component, or defer typecheck to after Task 4.

Create a placeholder:
```typescript
// web/src/components/CommandPalette.tsx (placeholder)
export function CommandPalette() {
  return null;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd web && bun run lint:fix
git add web/src/components/AppSidebar.tsx web/src/routes/__root.tsx web/src/components/CommandPalette.tsx
git commit -m "feat: rewrite sidebar to Seanime-style icon-only (60px)"
```

---

## Task 4: CommandPalette (⌘K Search)

**Files:**
- Modify: `web/src/components/CommandPalette.tsx` — replace placeholder

- [ ] **Step 1: Implement CommandPalette**

Replace the placeholder with the full implementation:

```typescript
// web/src/components/CommandPalette.tsx
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCommandPaletteStore } from '../store/command-palette-store';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Global ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, toggle, close]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: discoverKeys.search(debouncedQuery),
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const visibleResults = results.slice(0, 6);

  const handleSelect = (bangumiId: number) => {
    close();
    navigate({ to: '/anime/$id', params: { id: String(bangumiId) } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && visibleResults[selectedIndex]) {
      handleSelect(visibleResults[selectedIndex].bangumi_id);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={close}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 top-[20%] left-1/2 -translate-x-1/2 w-full max-w-[500px] rounded-lg border overflow-hidden"
            style={{
              backgroundColor: 'oklch(10% 0.01 280)',
              borderColor: 'oklch(18% 0.01 280)',
            }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'oklch(15% 0.01 280)' }}>
              <HugeiconsIcon icon={Search01Icon} size={16} style={{ color: 'oklch(40% 0.01 280)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="搜索動畫..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-[oklch(35%_0.01_280)] outline-none"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'oklch(15% 0.01 280)', color: 'oklch(40% 0.01 280)' }}>
                ESC
              </kbd>
            </div>

            {/* Results */}
            {visibleResults.length > 0 && (
              <div className="max-h-[50vh] overflow-y-auto py-1">
                {visibleResults.map((anime, i) => {
                  const hasCover = anime.cover_image?.startsWith('http');
                  return (
                    <button
                      type="button"
                      key={anime.bangumi_id}
                      onClick={() => handleSelect(anime.bangumi_id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ backgroundColor: i === selectedIndex ? 'oklch(14% 0.01 280)' : 'transparent' }}
                    >
                      <div
                        className="shrink-0 w-8 h-11 rounded overflow-hidden"
                        style={hasCover ? undefined : { background: animeGradient(anime.title) }}
                      >
                        {hasCover && <img src={anime.cover_image} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate">{anime.title}</p>
                        <p className="text-[11px] truncate" style={{ color: 'oklch(40% 0.01 280)' }}>
                          {anime.title_original}
                        </p>
                      </div>
                      {anime.score > 0 && (
                        <span className="text-[11px] font-medium shrink-0" style={{ color: 'oklch(65% 0.2 35)' }}>
                          {anime.score.toFixed(1)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {debouncedQuery && visibleResults.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm" style={{ color: 'oklch(38% 0.01 280)' }}>找不到結果</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd web && bun run lint:fix
git add web/src/components/CommandPalette.tsx
git commit -m "feat: add command palette (⌘K) for quick anime search"
```

---

## Task 5: Route Files + SchedulePage + TrendingPage

**Files:**
- Create: `web/src/routes/schedule.tsx`
- Create: `web/src/routes/trending.tsx`
- Create: `web/src/routes/search.tsx`
- Create: `web/src/routes/anime.$id.tsx`
- Create: `web/src/pages/SchedulePage.tsx`
- Create: `web/src/pages/TrendingPage.tsx`

- [ ] **Step 1: Create all route files**

```typescript
// web/src/routes/schedule.tsx
import { createFileRoute } from '@tanstack/react-router';
import { SchedulePage } from '../pages/SchedulePage';
export const Route = createFileRoute('/schedule')({ component: SchedulePage });
```

```typescript
// web/src/routes/trending.tsx
import { createFileRoute } from '@tanstack/react-router';
import { TrendingPage } from '../pages/TrendingPage';
export const Route = createFileRoute('/trending')({ component: TrendingPage });
```

```typescript
// web/src/routes/search.tsx
import { createFileRoute } from '@tanstack/react-router';
import { SearchPage } from '../pages/SearchPage';
export const Route = createFileRoute('/search')({ component: SearchPage });
```

```typescript
// web/src/routes/anime.$id.tsx
import { createFileRoute } from '@tanstack/react-router';
import { AnimeDetailPage } from '../pages/AnimeDetailPage';
export const Route = createFileRoute('/anime/$id')({ component: AnimeDetailPage });
```

- [ ] **Step 2: Create SchedulePage**

```typescript
// web/src/pages/SchedulePage.tsx
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { PageTransition } from '../components/PageTransition';
import { AnimeRow } from '../components/AnimeRow';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { cn } from '../lib/utils';

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function todayWeekdayCN(): string {
  const day = new Date().getDay();
  // JS: 0=Sun, Bangumi: 星期一=Mon...星期日=Sun
  return WEEKDAYS[day === 0 ? 6 : day - 1];
}

export function SchedulePage() {
  const [activeDay, setActiveDay] = useState(todayWeekdayCN);

  const { data: calendar, isLoading, isError, refetch } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });

  const activeItems = calendar?.find((d) => d.weekday === activeDay)?.items ?? [];

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          新番日曆
        </motion.h1>

        {/* Weekday tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day}
              onClick={() => setActiveDay(day)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-medium rounded transition-colors shrink-0',
                activeDay === day
                  ? 'text-black'
                  : 'text-[oklch(50%_0.01_280)] hover:text-white hover:bg-[oklch(13%_0.01_280)]',
              )}
              style={activeDay === day ? { backgroundColor: 'oklch(65% 0.2 35)' } : undefined}
            >
              {day}
              {day === todayWeekdayCN() && activeDay !== day && (
                <span className="ml-1 text-[9px]" style={{ color: 'oklch(65% 0.2 35)' }}>today</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-3 animate-pulse">
                <div className="w-10 h-14 rounded" style={{ backgroundColor: 'oklch(14% 0.01 280)' }} />
                <div className="flex-1">
                  <div className="h-3 rounded mb-2" style={{ backgroundColor: 'oklch(14% 0.01 280)', width: '40%' }} />
                  <div className="h-2 rounded" style={{ backgroundColor: 'oklch(12% 0.01 280)', width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-16">
            <p className="text-sm mb-3" style={{ color: 'oklch(45% 0.01 280)' }}>載入日曆失敗</p>
            <button type="button" onClick={() => refetch()} className="text-sm font-medium" style={{ color: 'oklch(65% 0.2 35)' }}>重試</button>
          </div>
        )}

        {!isLoading && !isError && activeItems.length === 0 && (
          <p className="text-sm py-8" style={{ color: 'oklch(35% 0.01 280)' }}>今天沒有新番放送</p>
        )}

        {!isLoading && !isError && activeItems.length > 0 && (
          <div>
            {activeItems.map((anime, i) => (
              <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 3: Create TrendingPage**

```typescript
// web/src/pages/TrendingPage.tsx
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { PageTransition } from '../components/PageTransition';
import { AnimeCard } from '../components/AnimeCard';
import { discoverApi, discoverKeys, type AnimeSummary } from '../lib/api/discover';

export function TrendingPage() {
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<AnimeSummary[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: discoverKeys.trending(page),
    queryFn: () => discoverApi.trending(page),
  });

  // TanStack Query v5: use useEffect instead of onSuccess
  useEffect(() => {
    if (data) {
      if (data.length === 0) {
        setHasMore(false);
      } else {
        setAllItems((prev) => (page === 1 ? data : [...prev, ...data]));
      }
    }
  }, [data, page]);

  const showSkeleton = isLoading && allItems.length === 0;

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          熱門動畫
        </motion.h1>

        {showSkeleton && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded overflow-hidden">
                <div className="aspect-[3/4]" style={{ backgroundColor: 'oklch(14% 0.01 280)' }} />
                <div className="p-2" style={{ backgroundColor: 'oklch(10% 0.01 280)' }}>
                  <div className="h-3 rounded mb-1" style={{ backgroundColor: 'oklch(16% 0.01 280)', width: '70%' }} />
                  <div className="h-2 rounded" style={{ backgroundColor: 'oklch(13% 0.01 280)', width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && allItems.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm mb-3" style={{ color: 'oklch(45% 0.01 280)' }}>載入失敗</p>
            <button type="button" onClick={() => refetch()} className="text-sm font-medium" style={{ color: 'oklch(65% 0.2 35)' }}>重試</button>
          </div>
        )}

        {allItems.length > 0 && (
          <>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {allItems.map((anime, i) => (
                <AnimeCard key={`${anime.bangumi_id}-${i}`} anime={anime} index={i} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isLoading}
                  className="px-5 py-2 text-sm font-medium rounded transition-colors disabled:opacity-40"
                  style={{ backgroundColor: 'oklch(14% 0.01 280)', color: 'oklch(65% 0.01 280)' }}
                >
                  {isLoading ? '載入中...' : '載入更多'}
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 4: Regenerate route tree**

```bash
cd web && bunx @tanstack/router-cli generate
```

- [ ] **Step 5: Typecheck**

```bash
cd web && bun run typecheck
```

Fix any issues. Common: TanStack Router may need the route params type for `/anime/$id`.

- [ ] **Step 6: Commit**

```bash
cd web && bun run lint:fix
git add web/src/routes/ web/src/pages/SchedulePage.tsx web/src/pages/TrendingPage.tsx web/src/routeTree.gen.ts
git commit -m "feat: add schedule and trending pages with routes"
```

---

## Task 6: SearchPage + AnimeDetailPage

**Files:**
- Create: `web/src/pages/SearchPage.tsx`
- Create: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Create SearchPage**

```typescript
// web/src/pages/SearchPage.tsx
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { PageTransition } from '../components/PageTransition';
import { AnimeCard } from '../components/AnimeCard';
import { discoverApi, discoverKeys } from '../lib/api/discover';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: discoverKeys.search(debouncedQuery),
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          搜索
        </motion.h1>

        {/* Search input */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative mb-8"
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'oklch(35% 0.01 280)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索你喜歡的動畫..."
            className="w-full pl-10 pr-4 py-3 rounded-lg text-sm text-white bg-transparent border outline-none transition-colors focus:border-[oklch(65%_0.2_35)] placeholder:text-[oklch(30%_0.01_280)]"
            style={{ borderColor: 'oklch(18% 0.01 280)', backgroundColor: 'oklch(9% 0.01 280)' }}
          />
        </motion.div>

        {/* Empty state (no query) */}
        {!debouncedQuery && (
          <div className="text-center py-20">
            <HugeiconsIcon icon={Search01Icon} size={32} style={{ color: 'oklch(22% 0.01 280)' }} className="mx-auto mb-4" />
            <p className="text-sm" style={{ color: 'oklch(32% 0.01 280)' }}>搜索你喜歡的動畫</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && debouncedQuery && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded overflow-hidden">
                <div className="aspect-[3/4]" style={{ backgroundColor: 'oklch(14% 0.01 280)' }} />
                <div className="p-2" style={{ backgroundColor: 'oklch(10% 0.01 280)' }}>
                  <div className="h-3 rounded" style={{ backgroundColor: 'oklch(16% 0.01 280)', width: '60%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!isLoading && debouncedQuery && results.length > 0 && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {results.map((anime, i) => (
              <AnimeCard key={anime.bangumi_id} anime={anime} index={i} />
            ))}
          </div>
        )}

        {/* No results */}
        {!isLoading && debouncedQuery && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'oklch(38% 0.01 280)' }}>找不到「{debouncedQuery}」的結果</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 2: Create AnimeDetailPage**

```typescript
// web/src/pages/AnimeDetailPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function AnimeDetailPage() {
  const { id } = useParams({ strict: false });
  const numericId = Number(id);

  const { data: anime, isLoading, isError } = useQuery({
    queryKey: discoverKeys.detail(numericId),
    queryFn: () => discoverApi.detail(numericId),
    enabled: !Number.isNaN(numericId),
  });

  const { data: episodes = [] } = useQuery({
    queryKey: discoverKeys.episodes(numericId),
    queryFn: () => discoverApi.episodes(numericId),
    enabled: !Number.isNaN(numericId),
  });

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          {/* Skeleton hero */}
          <div className="h-[280px] animate-pulse" style={{ backgroundColor: 'oklch(12% 0.01 280)' }} />
          <div className="px-8 py-6 space-y-4">
            <div className="h-6 rounded" style={{ backgroundColor: 'oklch(14% 0.01 280)', width: '30%' }} />
            <div className="h-4 rounded" style={{ backgroundColor: 'oklch(12% 0.01 280)', width: '60%' }} />
            <div className="h-4 rounded" style={{ backgroundColor: 'oklch(11% 0.01 280)', width: '80%' }} />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (isError || !anime) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm" style={{ color: 'oklch(45% 0.01 280)' }}>
            {isError ? '載入失敗' : '找不到此動畫'}
          </p>
        </div>
      </PageTransition>
    );
  }

  const hasBanner = anime.banner_image?.startsWith('http');
  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero banner */}
        <div className="relative h-[280px] overflow-hidden">
          {hasBanner ? (
            <img src={anime.banner_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: animeGradient(anime.title) }} />
          )}
          {/* Gradient overlay */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, oklch(7% 0.01 280) 0%, transparent 60%)' }}
          />

          {/* Cover + info overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-6 flex items-end gap-5">
            {/* Cover poster */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="shrink-0 w-[120px] h-[170px] rounded overflow-hidden shadow-lg"
              style={hasCover ? undefined : { background: animeGradient(anime.title) }}
            >
              {hasCover && <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />}
            </motion.div>

            {/* Title block */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="min-w-0 flex-1 pb-1"
            >
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">{anime.title}</h1>
              {anime.title_original && anime.title_original !== anime.title && (
                <p className="text-[13px] mt-1 truncate" style={{ color: 'oklch(50% 0.01 280)' }}>
                  {anime.title_original}
                </p>
              )}
              {anime.title_en && (
                <p className="text-[12px] mt-0.5 truncate" style={{ color: 'oklch(40% 0.01 280)' }}>
                  {anime.title_en}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {anime.score > 0 && (
                  <span className="text-[13px] font-bold" style={{ color: 'oklch(65% 0.2 35)' }}>
                    {anime.score.toFixed(1)} 分
                  </span>
                )}
                {anime.episode_count > 0 && (
                  <span className="text-[12px]" style={{ color: 'oklch(45% 0.01 280)' }}>
                    {anime.episode_count} 集
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Tags */}
          {anime.tags?.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap gap-1.5 mb-5"
            >
              {anime.tags.slice(0, 10).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'oklch(14% 0.01 280)', color: 'oklch(55% 0.01 280)' }}
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          )}

          {/* Synopsis */}
          {anime.synopsis && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="mb-8"
            >
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                簡介
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: 'oklch(55% 0.01 280)' }}>
                {anime.synopsis}
              </p>
            </motion.div>
          )}

          {/* Episodes */}
          {episodes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
            >
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                劇集 ({episodes.length})
              </h2>
              <div className="space-y-0.5">
                {episodes.map((ep, i) => (
                  <motion.div
                    key={ep.bangumi_episode_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.02 }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded transition-colors hover:bg-[oklch(11%_0.01_280)]"
                  >
                    <span
                      className="shrink-0 w-7 text-[12px] font-mono text-right"
                      style={{ color: 'oklch(35% 0.01 280)' }}
                    >
                      {ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white truncate">{ep.title}</p>
                    </div>
                    {ep.air_date && (
                      <span className="shrink-0 text-[10px]" style={{ color: 'oklch(30% 0.01 280)' }}>
                        {ep.air_date}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd web && bun run lint:fix
git add web/src/pages/SearchPage.tsx web/src/pages/AnimeDetailPage.tsx
git commit -m "feat: add search and anime detail pages"
```

---

## Task 7: Rewrite HomePage + Final Verification

**Files:**
- Modify: `web/src/pages/HomePage.tsx` — full rewrite

- [ ] **Step 1: Rewrite HomePage with calendar + trending + libraries**

Replace the entire file. The new HomePage has three sections: today's airing anime (AnimeRow), trending (horizontal scroll of AnimeCard), and library tiles (kept from existing design). Read the current `HomePage.tsx` first to preserve the library tile component.

Key imports needed:
```typescript
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { PageTransition } from '../components/PageTransition';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeRow } from '../components/AnimeRow';
import { libraryApi, libraryKeys, type Library } from '../lib/api/library';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryGradient } from '../lib/gradient';
```

The page should have:
1. Greeting + title (keep existing pattern)
2. **今日新番** section — filter calendar for today's weekday CN name, show as AnimeRow list. "查看全部 →" links to `/schedule`. If calendar fails or loading, show inline skeleton/error.
3. **熱門動畫** section — first 10 trending, horizontal overflow scroll of AnimeCard. "查看全部 →" links to `/trending`.
4. **我的媒體庫** section — existing library tiles (LibraryTile component from current HomePage). Keep the `libraryGradient` import from `gradient.ts`.

Each section uses the same pattern: section header with label + "view all" link, content below.

The implementer should read the full current `HomePage.tsx` and preserve the `LibraryTile` and `EmptyLibraries` components, updating them to use imported gradients. The greeting, hero gradient, and quick actions sidebar can be removed — the sidebar now handles navigation.

- [ ] **Step 2: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 3: Lint**

```bash
cd web && bun run lint:fix
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/HomePage.tsx
git commit -m "feat: rewrite HomePage with calendar, trending, and library sections"
```

---

## Final Verification

- [ ] **Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Lint**

```bash
cd web && bun run lint
```

- [ ] **Build**

```bash
cd web && bun run build
```

Expected: all pass with no errors from our new files (pre-existing lint warnings are OK).
