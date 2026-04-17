# Downloads Unified Anime Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three Downloads tabs (已追番 / 下載緊 / 已完成) under a single anime-centric card design so the same anime looks identical across tabs and only per-episode rows differ by status.

**Architecture:** New shared primitives under `web/src/components/downloads/` compose a single `AnimeDownloadCard`. Each tab becomes its own page file under `web/src/pages/downloads/` that feeds tab-specific `EpisodeRow` variants into the shared card. Backend unchanged — we use the existing `/api/v1/downloads/grouped` endpoint plus `discoverApi.detail` for cover art.

**Tech Stack:** React 19, TanStack Router + Query, Zustand (for expand state), Tailwind CSS v4, Lingui i18n, Vitest + Testing Library, Playwright (e2e), Motion (animation), Hugeicons. Project uses `bun`.

**Spec:** `docs/superpowers/specs/2026-04-17-downloads-unified-cards-design.md`

---

## File Structure

```
web/src/components/downloads/            ← NEW
├── AnimeDownloadCard.tsx                 outer card shell; grid + hover + expand
├── AnimeCoverBlock.tsx                   92×130 cover with placeholder fallback
├── AnimeGroupHeader.tsx                  title + chips + stats + progress + big %
├── AnimeEpisodeList.tsx                  hairline + padding + children slot
├── MiscDownloadsSection.tsx              collapsible "其他下載" at bottom of each tab
├── placeholder.ts                        cover placeholder helpers (SSR-safe)
└── episode-rows/
    ├── EpisodeRowActive.tsx              live bar + speed + ETA + hover actions
    ├── EpisodeRowComplete.tsx            size + completed-time + Play + Delete
    ├── EpisodeRowPending.tsx             "等待中 · 下次 fetch 喺 18 min"
    └── EpisodeRowMisc.tsx                manual download (no rule)

web/src/hooks/
└── use-anime-cover.ts                   ← NEW — wraps discoverApi.detail, 24h staleTime

web/src/store/
└── downloads-ui-store.ts                ← NEW — expand state (Set<string>)

web/src/pages/downloads/                 ← NEW (replaces the single DownloadsPage.tsx)
├── DownloadsPage.tsx                     shell: tabs + top bar (search/sort/aggregate)
├── SubscribedTab.tsx                     ← NEW — uses AnimeDownloadCard
├── DownloadingTab.tsx                    ← NEW — uses AnimeDownloadCard
├── CompletedTab.tsx                      ← NEW — uses AnimeDownloadCard
└── shared/
    ├── DownloadsTopBar.tsx               search + sort + aggregate line
    └── sort-utils.ts                     per-tab sort comparators

web/src/pages/DownloadsPage.tsx          ← DELETE after PR 2 restructure
web/src/locales/*/messages.po            ← MODIFY — add new i18n keys in PR 3
web/e2e/downloads-unified.spec.ts        ← NEW — PR 3
```

**Why this split:** one file per responsibility. The old `DownloadsPage.tsx` (~3800 lines) conflated search UI, subscription grid, download list, completed list, detail modals, and filter chips. After the refactor, each file holds one coherent concern.

---

# PR 1 — Shared Primitives

New code only. No page-level changes. Each task lands a testable unit; at the end of PR 1 you can render every primitive in isolation via tests.

## Task 1: Downloads-UI Zustand store

**Files:**
- Create: `web/src/store/downloads-ui-store.ts`
- Test:   `web/src/store/downloads-ui-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/store/downloads-ui-store.test.ts
import { afterEach, expect, test } from 'vitest';
import { useDownloadsUIStore } from './downloads-ui-store';

afterEach(() => {
  useDownloadsUIStore.setState({ expandedGroupIds: new Set() });
});

test('toggleGroup adds then removes the id', () => {
  const { toggleGroup } = useDownloadsUIStore.getState();
  toggleGroup('rule-1');
  expect(useDownloadsUIStore.getState().expandedGroupIds.has('rule-1')).toBe(true);
  toggleGroup('rule-1');
  expect(useDownloadsUIStore.getState().expandedGroupIds.has('rule-1')).toBe(false);
});

test('expandAll replaces the set', () => {
  const { expandAll } = useDownloadsUIStore.getState();
  expandAll(['a', 'b']);
  const set = useDownloadsUIStore.getState().expandedGroupIds;
  expect(set.has('a')).toBe(true);
  expect(set.has('b')).toBe(true);
  expect(set.size).toBe(2);
});

test('collapseAll clears the set', () => {
  useDownloadsUIStore.getState().expandAll(['x']);
  useDownloadsUIStore.getState().collapseAll();
  expect(useDownloadsUIStore.getState().expandedGroupIds.size).toBe(0);
});
```

- [ ] **Step 2: Run the test — confirm RED**

```bash
cd web && bun run test -- downloads-ui-store -t 'toggleGroup'
```
Expected: FAIL with `Cannot find module './downloads-ui-store'`.

- [ ] **Step 3: Implement**

```ts
// web/src/store/downloads-ui-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface DownloadsUIState {
  expandedGroupIds: Set<string>;

  toggleGroup: (id: string) => void;
  expandAll: (ids: string[]) => void;
  collapseAll: () => void;
  isExpanded: (id: string) => boolean;
}

export const useDownloadsUIStore = create<DownloadsUIState>()(
  devtools(
    (set, get) => ({
      expandedGroupIds: new Set(),

      toggleGroup: (id) =>
        set(
          (state) => {
            const next = new Set(state.expandedGroupIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return { expandedGroupIds: next };
          },
          undefined,
          'toggleGroup'
        ),

      expandAll: (ids) =>
        set({ expandedGroupIds: new Set(ids) }, undefined, 'expandAll'),

      collapseAll: () =>
        set({ expandedGroupIds: new Set() }, undefined, 'collapseAll'),

      isExpanded: (id) => get().expandedGroupIds.has(id),
    }),
    { name: 'downloads-ui-store' }
  )
);
```

- [ ] **Step 4: Run the test — confirm GREEN**

```bash
cd web && bun run test -- downloads-ui-store
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/store/downloads-ui-store.ts web/src/store/downloads-ui-store.test.ts
git commit -m "feat(downloads): add downloads-ui-store for expand state"
```

---

## Task 2: `useAnimeCover` hook

**Files:**
- Create: `web/src/hooks/use-anime-cover.ts`
- Test:   `web/src/hooks/use-anime-cover.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/hooks/use-anime-cover.test.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as discoverModule from '@/lib/api/discover';
import { useAnimeCover } from './use-anime-cover';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

afterEach(() => vi.restoreAllMocks());

test('returns cover_image when bangumi_id present', async () => {
  vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
    bangumi_id: 123,
    title: 'x',
    title_original: 'x',
    cover_image: 'https://example.com/cover.jpg',
    episode_count: 12,
    score: 8,
    synopsis: '',
    tags: [],
    rating: { score: 8, total: 100 },
  } as never);

  const { result } = renderHook(() => useAnimeCover(123), { wrapper });
  await waitFor(() => expect(result.current.coverUrl).toBe('https://example.com/cover.jpg'));
});

test('returns undefined cover when bangumi_id is null', () => {
  const { result } = renderHook(() => useAnimeCover(null), { wrapper });
  expect(result.current.coverUrl).toBeUndefined();
  expect(result.current.isLoading).toBe(false);
});
```

- [ ] **Step 2: Run test — confirm RED**

```bash
cd web && bun run test -- use-anime-cover
```
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement**

```ts
// web/src/hooks/use-anime-cover.ts
import { useQuery } from '@tanstack/react-query';
import { discoverApi, discoverKeys } from '@/lib/api/discover';

const ONE_DAY = 24 * 60 * 60 * 1000;

interface Result {
  coverUrl: string | undefined;
  title: string | undefined;
  titleOriginal: string | undefined;
  isLoading: boolean;
}

export function useAnimeCover(bangumiId: number | null | undefined): Result {
  const enabled = !!bangumiId;
  const { data, isLoading } = useQuery({
    queryKey: discoverKeys.detail(bangumiId ?? 0),
    queryFn: () => discoverApi.detail(bangumiId as number),
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
  });

  return {
    coverUrl: data?.cover_image,
    title: data?.title,
    titleOriginal: data?.title_original,
    isLoading: enabled && isLoading,
  };
}
```

- [ ] **Step 4: Run test — confirm GREEN**

```bash
cd web && bun run test -- use-anime-cover
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/use-anime-cover.ts web/src/hooks/use-anime-cover.test.ts
git commit -m "feat(downloads): add useAnimeCover hook"
```

---

## Task 3: `AnimeCoverBlock` component

**Files:**
- Create: `web/src/components/downloads/AnimeCoverBlock.tsx`
- Create: `web/src/components/downloads/placeholder.ts`
- Test:   `web/src/components/downloads/AnimeCoverBlock.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// web/src/components/downloads/AnimeCoverBlock.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AnimeCoverBlock } from './AnimeCoverBlock';

test('renders img when coverUrl provided', () => {
  render(<AnimeCoverBlock coverUrl="https://example.com/a.jpg" title="Title" />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', 'https://example.com/a.jpg');
  expect(img).toHaveAttribute('alt', 'Title');
});

test('renders placeholder letter when coverUrl missing', () => {
  render(<AnimeCoverBlock coverUrl={undefined} title="Frieren" />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('F')).toBeInTheDocument();
});

test('falls back to placeholder on img error', () => {
  render(<AnimeCoverBlock coverUrl="https://bad.example/x.jpg" title="Naruto" />);
  const img = screen.getByRole('img');
  img.dispatchEvent(new Event('error'));
  expect(screen.getByText('N')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- AnimeCoverBlock
```
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement placeholder helpers**

```ts
// web/src/components/downloads/placeholder.ts
// Deterministic gradient pairs keyed by first char so the same title always gets the same colour
const GRADIENTS: [string, string][] = [
  ['#2a1b3d', '#1a2a3d'],
  ['#3d2a1b', '#2a3d1a'],
  ['#2a3d1b', '#1a3d2a'],
  ['#1b2a3d', '#2a1b3d'],
  ['#3d1b2a', '#3d2a1b'],
];

export function placeholderGradient(title: string): string {
  const code = title.charCodeAt(0) || 0;
  const [from, to] = GRADIENTS[code % GRADIENTS.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

export function placeholderLetter(title: string): string {
  const trimmed = title.trim();
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : '?';
}
```

- [ ] **Step 4: Implement `AnimeCoverBlock`**

```tsx
// web/src/components/downloads/AnimeCoverBlock.tsx
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { placeholderGradient, placeholderLetter } from './placeholder';

interface Props {
  coverUrl?: string;
  title: string;
  className?: string;
}

export function AnimeCoverBlock({ coverUrl, title, className }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = coverUrl && !errored;

  return (
    <div
      className={cn(
        'relative w-[92px] h-[130px] flex-none rounded-lg overflow-hidden',
        'shadow-[0_4px_18px_rgba(0,0,0,0.4)]',
        className
      )}
      style={!showImage ? { background: placeholderGradient(title) } : undefined}
    >
      {showImage && (
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      )}
      {!showImage && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-3xl font-light">
          {placeholderLetter(title)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run — confirm GREEN**

```bash
cd web && bun run test -- AnimeCoverBlock
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/downloads/AnimeCoverBlock.tsx web/src/components/downloads/AnimeCoverBlock.test.tsx web/src/components/downloads/placeholder.ts
git commit -m "feat(downloads): add AnimeCoverBlock with placeholder fallback"
```

---

## Task 4: `AnimeGroupHeader` component

**Files:**
- Create: `web/src/components/downloads/AnimeGroupHeader.tsx`
- Test:   `web/src/components/downloads/AnimeGroupHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// web/src/components/downloads/AnimeGroupHeader.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AnimeGroupHeader } from './AnimeGroupHeader';

const baseProps = {
  coverUrl: undefined,
  title: '尖帽子的魔法工房',
  subChips: ['沸班亞馬製作組', 'AI2160p'],
  stats: {
    mode: 'downloading' as const,
    percent: 72,
    speedBytes: 9_000_000,
    downloadedBytes: 4_300_000_000,
    totalBytes: 6_100_000_000,
    etaSeconds: 240,
    activeCount: 3,
    live: true,
  },
  expanded: false,
  onToggle: () => {},
};

test('renders title, chips, and percent', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  expect(screen.getByText('尖帽子的魔法工房')).toBeInTheDocument();
  expect(screen.getByText('沸班亞馬製作組')).toBeInTheDocument();
  expect(screen.getByText('AI2160p')).toBeInTheDocument();
  expect(screen.getByText('72')).toBeInTheDocument();
});

test('shows live dot when live=true', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  expect(screen.getByTestId('live-dot')).toBeInTheDocument();
});

test('hides live dot when live=false', () => {
  render(<AnimeGroupHeader {...baseProps} stats={{ ...baseProps.stats, live: false }} />);
  expect(screen.queryByTestId('live-dot')).toBeNull();
});

test('clicking toggle button calls onToggle', async () => {
  const user = userEvent.setup();
  let clicked = false;
  render(<AnimeGroupHeader {...baseProps} onToggle={() => { clicked = true; }} />);
  await user.click(screen.getByRole('button', { name: /expand|collapse/i }));
  expect(clicked).toBe(true);
});

test('progress bar width reflects percent', () => {
  render(<AnimeGroupHeader {...baseProps} />);
  const fill = screen.getByTestId('progress-fill');
  expect(fill.style.width).toBe('72%');
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- AnimeGroupHeader
```
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/downloads/AnimeGroupHeader.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { AnimeCoverBlock } from './AnimeCoverBlock';

export type GroupMode = 'subscribed' | 'downloading' | 'completed';

export interface GroupStats {
  mode: GroupMode;
  percent: number;              // 0-100
  speedBytes?: number;          // only when downloading
  downloadedBytes?: number;
  totalBytes?: number;
  etaSeconds?: number;
  activeCount?: number;         // downloading / subscribed
  episodeCount?: number;        // total eps in season (for subscribed N/M)
  completedCount?: number;      // completed tab
  completedAtRelative?: string; // "2h ago" preformatted
  nextFetchRelative?: string;   // "18 min" preformatted
  live: boolean;
}

interface Props {
  coverUrl?: string;
  title: string;
  subChips: string[];
  stats: GroupStats;
  expanded: boolean;
  onToggle: () => void;
  headerActions?: React.ReactNode;
}

function formatBytes(n?: number): string {
  if (n === undefined) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}
function formatSpeed(n?: number): string {
  return n === undefined ? '' : `${formatBytes(n)}/s`;
}
function formatEta(s?: number): string {
  if (s === undefined || s <= 0) return '';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function AnimeGroupHeader({
  coverUrl,
  title,
  subChips,
  stats,
  expanded,
  onToggle,
  headerActions,
}: Props) {
  const { i18n } = useLingui();
  const { mode, live, percent } = stats;
  const showProgressBar = mode !== 'completed';

  return (
    <div className="grid grid-cols-[92px_1fr_auto] gap-5 p-4">
      <AnimeCoverBlock coverUrl={coverUrl} title={title} />

      <div className="min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em] truncate">
            {title}
          </h3>
          <div className="mt-1 flex gap-2 items-center text-[11px] text-white/40">
            {subChips.map((chip) => (
              <span
                key={chip}
                className="px-[7px] py-[2px] rounded bg-white/[0.04] text-white/65 text-[10px]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <StatLine stats={stats} i18n={i18n} />
        {showProgressBar && (
          <div className="mt-2.5 h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
            <div
              data-testid="progress-fill"
              className="h-full rounded-sm shadow-[0_0_8px_rgba(74,222,128,0.35)]"
              style={{
                width: `${percent}%`,
                background: 'linear-gradient(90deg, rgba(74,222,128,0.85), #4ade80)',
              }}
            />
          </div>
        )}
        {!showProgressBar && (
          <div className="mt-2.5 h-[1px] bg-[rgba(74,222,128,0.18)]" />
        )}
      </div>

      <div className="flex flex-col items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 text-white/90">
          <span className="text-[20px] font-medium tracking-[-0.02em] tabular-nums">
            {percent}
          </span>
          <span className="text-[14px] font-light text-white/50">%</span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? i18n._(msg`downloads.collapse`) : i18n._(msg`downloads.expand`)}
            className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/65 cursor-pointer"
          >
            <span>
              {expanded ? i18n._(msg`downloads.collapse`) : i18n._(msg`downloads.expand`)}
            </span>
            <HugeiconsIcon
              icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
              size={11}
            />
          </button>
        </div>
      </div>
      {live && (
        <span
          data-testid="live-dot"
          className={cn(
            'absolute w-[5px] h-[5px] rounded-full bg-[#4ade80]',
            'shadow-[0_0_0_3px_rgba(74,222,128,0.35)]',
            'animate-[pulse_1.6s_ease-in-out_infinite]'
          )}
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}

function StatLine({ stats, i18n }: { stats: GroupStats; i18n: ReturnType<typeof useLingui>['i18n'] }) {
  const parts: React.ReactNode[] = [];

  if (stats.live) {
    parts.push(
      <span key="live" className="inline-flex items-center gap-1.5">
        <span
          data-testid="live-dot"
          className="w-[5px] h-[5px] rounded-full bg-[#4ade80] shadow-[0_0_0_3px_rgba(74,222,128,0.35)] animate-[pulse_1.6s_ease-in-out_infinite]"
        />
      </span>
    );
  }

  if (stats.mode === 'downloading') {
    parts.push(<span key="n"><b className="text-white/90 font-medium">{stats.activeCount ?? 0}</b> {i18n._(msg`downloads.downloading`)}</span>);
    if (stats.speedBytes !== undefined)
      parts.push(<span key="s"><b className="text-white/90 font-medium tabular-nums">{formatSpeed(stats.speedBytes)}</b></span>);
    if (stats.downloadedBytes !== undefined && stats.totalBytes !== undefined)
      parts.push(<span key="d" className="tabular-nums">{formatBytes(stats.downloadedBytes)} / {formatBytes(stats.totalBytes)}</span>);
    if (stats.etaSeconds !== undefined)
      parts.push(<span key="e" className="tabular-nums">~{formatEta(stats.etaSeconds)}</span>);
  } else if (stats.mode === 'subscribed') {
    parts.push(<span key="m">{stats.live ? i18n._(msg`downloads.autoEnabled`) : i18n._(msg`downloads.autoDisabled`)}</span>);
    if (stats.nextFetchRelative)
      parts.push(<span key="nf">{i18n._(msg`downloads.nextFetch`)} ~{stats.nextFetchRelative}</span>);
    if (stats.activeCount !== undefined && stats.episodeCount !== undefined)
      parts.push(<span key="eps" className="tabular-nums">{stats.activeCount} / {stats.episodeCount} eps</span>);
    else if (stats.activeCount !== undefined)
      parts.push(<span key="ec" className="tabular-nums">{stats.activeCount} eps</span>);
  } else {
    // completed
    if (stats.completedCount !== undefined)
      parts.push(<span key="c" className="tabular-nums">{stats.completedCount} eps</span>);
    if (stats.totalBytes !== undefined)
      parts.push(<span key="sz" className="tabular-nums">{formatBytes(stats.totalBytes)}</span>);
    if (stats.completedAtRelative)
      parts.push(<span key="at">{i18n._(msg`downloads.completedAt`)} {stats.completedAtRelative}</span>);
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-[12px] text-white/45 flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {p}
          {i < parts.length - 1 && <span className="text-white/15">·</span>}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd web && bun run test -- AnimeGroupHeader
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/downloads/AnimeGroupHeader.tsx web/src/components/downloads/AnimeGroupHeader.test.tsx
git commit -m "feat(downloads): add AnimeGroupHeader with mode-driven stat line"
```

---

## Task 5: `AnimeEpisodeList` and `AnimeDownloadCard` shell

**Files:**
- Create: `web/src/components/downloads/AnimeEpisodeList.tsx`
- Create: `web/src/components/downloads/AnimeDownloadCard.tsx`
- Test:   `web/src/components/downloads/AnimeDownloadCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/downloads/AnimeDownloadCard.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AnimeDownloadCard } from './AnimeDownloadCard';

const baseProps = {
  coverUrl: undefined,
  title: 'Test Anime',
  subChips: ['Group'],
  stats: {
    mode: 'downloading' as const,
    percent: 50,
    speedBytes: 1_000_000,
    downloadedBytes: 5e8,
    totalBytes: 1e9,
    etaSeconds: 60,
    activeCount: 1,
    live: true,
  },
  expanded: true,
  onToggle: () => {},
};

test('renders children when expanded', () => {
  render(
    <AnimeDownloadCard {...baseProps}>
      <div data-testid="ep-row">EP 01</div>
    </AnimeDownloadCard>
  );
  expect(screen.getByTestId('ep-row')).toBeInTheDocument();
});

test('hides children when collapsed', () => {
  render(
    <AnimeDownloadCard {...baseProps} expanded={false}>
      <div data-testid="ep-row">EP 01</div>
    </AnimeDownloadCard>
  );
  expect(screen.queryByTestId('ep-row')).toBeNull();
});

test('renders hairline divider between header and list when expanded', () => {
  render(
    <AnimeDownloadCard {...baseProps}>
      <div>ep</div>
    </AnimeDownloadCard>
  );
  expect(screen.getByTestId('card-divider')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- AnimeDownloadCard
```
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `AnimeEpisodeList`**

```tsx
// web/src/components/downloads/AnimeEpisodeList.tsx
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  expanded: boolean;
  children: ReactNode;
}

export function AnimeEpisodeList({ expanded, children }: Props) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div
            data-testid="card-divider"
            className="mx-4 h-px bg-white/[0.035]"
          />
          <div className="px-2 pt-1.5 pb-2.5 flex flex-col">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Implement `AnimeDownloadCard`**

```tsx
// web/src/components/downloads/AnimeDownloadCard.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AnimeGroupHeader, type GroupStats } from './AnimeGroupHeader';
import { AnimeEpisodeList } from './AnimeEpisodeList';

interface Props {
  coverUrl?: string;
  title: string;
  subChips: string[];
  stats: GroupStats;
  expanded: boolean;
  onToggle: () => void;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function AnimeDownloadCard({
  coverUrl,
  title,
  subChips,
  stats,
  expanded,
  onToggle,
  headerActions,
  children,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'relative bg-white/[0.02] hover:bg-white/[0.035] transition-colors',
        'border border-white/[0.06] rounded-[14px] overflow-hidden',
        className
      )}
    >
      <AnimeGroupHeader
        coverUrl={coverUrl}
        title={title}
        subChips={subChips}
        stats={stats}
        expanded={expanded}
        onToggle={onToggle}
        headerActions={headerActions}
      />
      <AnimeEpisodeList expanded={expanded}>{children}</AnimeEpisodeList>
    </div>
  );
}
```

- [ ] **Step 5: Run — confirm GREEN**

```bash
cd web && bun run test -- AnimeDownloadCard
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/downloads/AnimeDownloadCard.tsx web/src/components/downloads/AnimeEpisodeList.tsx web/src/components/downloads/AnimeDownloadCard.test.tsx
git commit -m "feat(downloads): add AnimeDownloadCard shell + AnimeEpisodeList"
```

---

## Task 6: `EpisodeRowActive` component

**Files:**
- Create: `web/src/components/downloads/episode-rows/EpisodeRowActive.tsx`
- Test:   `web/src/components/downloads/episode-rows/EpisodeRowActive.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowActive.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowActive } from './EpisodeRowActive';

const base = {
  gid: 'gid1',
  episodeLabel: 'EP 02',
  downloadedBytes: 1_500_000_000,
  totalBytes: 2_200_000_000,
  speedBytes: 1_900_000,
  etaSeconds: 360,
  percent: 71,
  status: 'active' as const,
  onPause: () => {},
  onResume: () => {},
  onDelete: () => {},
};

test('renders episode label and percent', () => {
  render(<EpisodeRowActive {...base} />);
  expect(screen.getByText('EP 02')).toBeInTheDocument();
  expect(screen.getByText('71%')).toBeInTheDocument();
});

test('progress bar fill width matches percent', () => {
  render(<EpisodeRowActive {...base} />);
  const fill = screen.getByTestId('ep-bar-fill');
  expect(fill.style.width).toBe('71%');
});

test('shows pause button when active', () => {
  render(<EpisodeRowActive {...base} />);
  expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /resume/i })).toBeNull();
});

test('shows resume button when paused', () => {
  render(<EpisodeRowActive {...base} status="paused" />);
  expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^pause$/i })).toBeNull();
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- EpisodeRowActive
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowActive.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PauseIcon, PlayIcon, Delete02Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

export type ActiveStatus = 'active' | 'paused' | 'waiting';

interface Props {
  gid: string;
  episodeLabel: string;         // "EP 02"
  downloadedBytes: number;
  totalBytes: number;
  speedBytes: number;
  etaSeconds: number;
  percent: number;
  status: ActiveStatus;
  onPause: (gid: string) => void;
  onResume: (gid: string) => void;
  onDelete: (gid: string) => void;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}
function fmtEta(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function EpisodeRowActive({
  gid, episodeLabel, downloadedBytes, totalBytes, speedBytes, etaSeconds, percent, status,
  onPause, onResume, onDelete,
}: Props) {
  const { i18n } = useLingui();
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  return (
    <div className="group grid grid-cols-[92px_1fr_80px_70px_50px] gap-5 items-center px-2 py-[9px] rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className="text-center text-[11px] font-semibold tabular-nums tracking-[0.04em] text-[#4ade80]">
        {episodeLabel}
      </div>
      <div className="text-[12px] text-white/65 tabular-nums truncate">
        <span className="text-white/90 font-medium mr-1">{fmt(downloadedBytes)} / {fmt(totalBytes)}</span>
        <span className="text-white/25 mx-1.5">·</span>
        <span>{fmt(speedBytes)}/s</span>
      </div>
      <div className="h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
        <div
          data-testid="ep-bar-fill"
          className={cn('h-full bg-[rgba(74,222,128,0.85)] rounded-sm', isActive && 'animate-[pulse_2.2s_ease-in-out_infinite]')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] text-white/25 tabular-nums text-right">
        {etaSeconds > 0 ? fmtEta(etaSeconds) : ''}
      </div>
      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        {isActive && (
          <button
            type="button"
            aria-label={i18n._(msg`downloads.pause`)}
            onClick={() => onPause(gid)}
            className="text-white/35 hover:text-white/75"
          >
            <HugeiconsIcon icon={PauseIcon} size={12} />
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            aria-label={i18n._(msg`downloads.resume`)}
            onClick={() => onResume(gid)}
            className="text-white/35 hover:text-white/75"
          >
            <HugeiconsIcon icon={PlayIcon} size={12} />
          </button>
        )}
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-white/35 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
      <div className="col-start-5 text-[11px] text-white/65 tabular-nums text-right font-medium">
        {percent}%
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd web && bun run test -- EpisodeRowActive
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/downloads/episode-rows/EpisodeRowActive.tsx web/src/components/downloads/episode-rows/EpisodeRowActive.test.tsx
git commit -m "feat(downloads): add EpisodeRowActive with pause/resume/delete"
```

---

## Task 7: `EpisodeRowComplete` component

**Files:**
- Create: `web/src/components/downloads/episode-rows/EpisodeRowComplete.tsx`
- Test:   `web/src/components/downloads/episode-rows/EpisodeRowComplete.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowComplete.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowComplete } from './EpisodeRowComplete';

const base = {
  gid: 'g1',
  episodeLabel: 'EP 01',
  filename: 'Show - 01.mkv',
  sizeBytes: 2_000_000_000,
  completedAtRelative: '2h ago',
  onPlay: () => {},
  onDelete: () => {},
};

test('renders episode label, filename, size, completed time', () => {
  render(<EpisodeRowComplete {...base} />);
  expect(screen.getByText('EP 01')).toBeInTheDocument();
  expect(screen.getByText('Show - 01.mkv')).toBeInTheDocument();
  expect(screen.getByText(/2.0 GB/)).toBeInTheDocument();
  expect(screen.getByText(/2h ago/)).toBeInTheDocument();
});

test('play button triggers onPlay', async () => {
  const user = userEvent.setup();
  let called = false;
  render(<EpisodeRowComplete {...base} onPlay={() => { called = true; }} />);
  await user.click(screen.getByRole('button', { name: /play/i }));
  expect(called).toBe(true);
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- EpisodeRowComplete
```

- [ ] **Step 3: Implement**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowComplete.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlayIcon, Delete02Icon } from '@hugeicons/core-free-icons';

interface Props {
  gid: string;
  episodeLabel: string;
  filename: string;
  sizeBytes: number;
  completedAtRelative: string;
  onPlay: (gid: string) => void;
  onDelete: (gid: string) => void;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function EpisodeRowComplete({
  gid, episodeLabel, filename, sizeBytes, completedAtRelative, onPlay, onDelete,
}: Props) {
  const { i18n } = useLingui();
  return (
    <div className="group grid grid-cols-[92px_1fr_auto_auto_auto] gap-5 items-center px-2 py-[9px] rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className="text-center text-[11px] font-semibold tabular-nums tracking-[0.04em] text-[rgba(74,222,128,0.7)]">
        {episodeLabel}
      </div>
      <div className="text-[12px] text-white/65 truncate">{filename}</div>
      <div className="text-[11px] text-white/45 tabular-nums">{fmt(sizeBytes)}</div>
      <div className="text-[11px] text-white/25">{completedAtRelative}</div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label={i18n._(msg`downloads.play`)}
          onClick={() => onPlay(gid)}
          className="text-white/35 hover:text-white/75"
        >
          <HugeiconsIcon icon={PlayIcon} size={12} />
        </button>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-white/35 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd web && bun run test -- EpisodeRowComplete
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/downloads/episode-rows/EpisodeRowComplete.tsx web/src/components/downloads/episode-rows/EpisodeRowComplete.test.tsx
git commit -m "feat(downloads): add EpisodeRowComplete with play/delete"
```

---

## Task 8: `EpisodeRowPending` + `EpisodeRowMisc`

**Files:**
- Create: `web/src/components/downloads/episode-rows/EpisodeRowPending.tsx`
- Create: `web/src/components/downloads/episode-rows/EpisodeRowMisc.tsx`
- Test:   `web/src/components/downloads/episode-rows/EpisodeRowPending.test.tsx`
- Test:   `web/src/components/downloads/episode-rows/EpisodeRowMisc.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// EpisodeRowPending.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowPending } from './EpisodeRowPending';

test('shows next fetch text and refresh button', () => {
  render(<EpisodeRowPending nextFetchRelative="18 min" onRefresh={() => {}} />);
  expect(screen.getByText(/18 min/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
});

test('refresh click triggers handler', async () => {
  const user = userEvent.setup();
  let called = false;
  render(<EpisodeRowPending nextFetchRelative="18 min" onRefresh={() => { called = true; }} />);
  await user.click(screen.getByRole('button', { name: /refresh/i }));
  expect(called).toBe(true);
});
```

```tsx
// EpisodeRowMisc.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EpisodeRowMisc } from './EpisodeRowMisc';

test('renders filename and percent for active misc', () => {
  render(
    <EpisodeRowMisc
      gid="g"
      filename="[manual] foo.mkv"
      downloadedBytes={5e8}
      totalBytes={1e9}
      percent={50}
      status="active"
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText('[manual] foo.mkv')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd web && bun run test -- "EpisodeRow(Pending|Misc)"
```

- [ ] **Step 3: Implement `EpisodeRowPending`**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowPending.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Refresh03Icon } from '@hugeicons/core-free-icons';

interface Props {
  nextFetchRelative: string;
  onRefresh: () => void;
}

export function EpisodeRowPending({ nextFetchRelative, onRefresh }: Props) {
  const { i18n } = useLingui();
  return (
    <div className="grid grid-cols-[92px_1fr_auto] gap-5 items-center px-2 py-[9px]">
      <div className="text-center text-[10px] uppercase tracking-[0.08em] text-white/25">
        {i18n._(msg`downloads.waiting`)}
      </div>
      <div className="text-[12px] text-white/45">
        {i18n._(msg`downloads.nextFetch`)} ~{nextFetchRelative}
      </div>
      <button
        type="button"
        aria-label={i18n._(msg`downloads.refresh`)}
        onClick={onRefresh}
        className="text-white/35 hover:text-white/75"
      >
        <HugeiconsIcon icon={Refresh03Icon} size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Implement `EpisodeRowMisc`**

```tsx
// web/src/components/downloads/episode-rows/EpisodeRowMisc.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';

interface Props {
  gid: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'active' | 'complete';
  onDelete: (gid: string) => void;
}
function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function EpisodeRowMisc({
  gid, filename, downloadedBytes, totalBytes, percent, status, onDelete,
}: Props) {
  const { i18n } = useLingui();
  return (
    <div className="group grid grid-cols-[1fr_80px_auto_auto] gap-4 items-center px-3 py-2 rounded-md hover:bg-white/[0.02]">
      <div className="text-[12px] text-white/65 truncate">{filename}</div>
      <div className="h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
        <div
          className="h-full bg-[rgba(74,222,128,0.85)] rounded-sm"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] text-white/45 tabular-nums min-w-[110px] text-right">
        {status === 'complete'
          ? fmt(totalBytes)
          : `${fmt(downloadedBytes)} / ${fmt(totalBytes)}`}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/65 tabular-nums w-[34px] text-right font-medium">
          {percent}%
        </span>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-white/25 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — confirm GREEN**

```bash
cd web && bun run test -- "EpisodeRow(Pending|Misc)"
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/downloads/episode-rows/EpisodeRowPending.tsx web/src/components/downloads/episode-rows/EpisodeRowMisc.tsx web/src/components/downloads/episode-rows/EpisodeRowPending.test.tsx web/src/components/downloads/episode-rows/EpisodeRowMisc.test.tsx
git commit -m "feat(downloads): add EpisodeRowPending and EpisodeRowMisc"
```

---

## Task 9: PR 1 wrap-up — typecheck, lint, push, open PR

- [ ] **Step 1: Run the full quality gate**

```bash
cd web && bun run check:all
```
Expected: passes. If lint complains about the existing `DownloadsPage.tsx` or `danmaku-worker.test.ts`, those are pre-existing failures — confirm no new failures from this PR's files.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(downloads): shared primitives for unified anime cards" --body "$(cat <<'EOF'
## Summary
- Adds `AnimeDownloadCard`, `AnimeGroupHeader`, `AnimeEpisodeList`, `AnimeCoverBlock`.
- Adds `EpisodeRow{Active,Complete,Pending,Misc}`.
- Adds `useAnimeCover` hook and `useDownloadsUIStore` Zustand store.
- No page-level change — everything is net-new under `components/downloads/`.

## Test plan
- [ ] `bun run test -- downloads` — all component and store tests pass
- [ ] `bun run check:all` — no new typecheck/lint errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# PR 2 — Split DownloadsPage

Pure file restructure. **No visual changes.** Still uses the old `SubscriptionAnimeCard` / `DownloadCard` / `SubscriptionDetailContent` from the existing file.

## Task 10: Identify tab renderers inside `DownloadsPage.tsx`

- [ ] **Step 1: Read the current file end-to-end**

```bash
wc -l web/src/pages/DownloadsPage.tsx
```
Expected: ~3800 lines.

Map out the three tab renderers. Grep for the tab-switch statement:

```bash
cd web && grep -n "tab === " src/pages/DownloadsPage.tsx | head
```

Note the component names / sections rendering each tab. In the current file these are:
- Subscribed → lines ~1780–1890 (`SubscribedView`, uses `SubscriptionAnimeCard` grid)
- Downloading → lines ~2450–2900 (inline rendering of `DownloadCard` list)
- Completed → adjacent section in same render branch

Confirm the actual line ranges before editing, as the file evolves.

- [ ] **Step 2: No code change. Commit nothing.** This task is a reading pass.

---

## Task 11: Extract `SubscribedTab.tsx`

**Files:**
- Create: `web/src/pages/downloads/SubscribedTab.tsx`
- Modify: `web/src/pages/DownloadsPage.tsx` (import + render)

- [ ] **Step 1: Create the new file with the subscribed renderer**

Move the subscribed-view section verbatim. Keep existing component names (`SubscriptionAnimeCard`, `SubscriptionDetailContent`, `RuleEditorModal`) — they will be replaced in PR 3. Export a single default component.

```tsx
// web/src/pages/downloads/SubscribedTab.tsx
import type { DownloadGroup, DownloadRule, RSSFeed } from '@/lib/api/downloads';
// ...plus other imports copied from the section being extracted...

interface Props {
  rules: DownloadRule[];
  feeds: RSSFeed[];
  groups: DownloadGroup[];
}

export default function SubscribedTab({ rules, feeds, groups }: Props) {
  // ... entire subscribed view body moved here verbatim ...
}
```

Preserve **every line** of logic. This is a textual move, not a rewrite.

- [ ] **Step 2: Wire it into `DownloadsPage.tsx`**

Replace the inlined subscribed section with `<SubscribedTab rules={rules} feeds={feeds} groups={groups} />`.

- [ ] **Step 3: Run tests + typecheck**

```bash
cd web && bun run test && bun run typecheck
```
Expected: no new failures.

- [ ] **Step 4: Visually smoke test**

Ask the user to run the dev server, navigate to 已追番 tab, confirm pixel-identical behaviour. (Project convention: no automated dev server start.)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/downloads/SubscribedTab.tsx web/src/pages/DownloadsPage.tsx
git commit -m "refactor(downloads): extract SubscribedTab from DownloadsPage"
```

---

## Task 12: Extract `DownloadingTab.tsx` and `CompletedTab.tsx`

**Files:**
- Create: `web/src/pages/downloads/DownloadingTab.tsx`
- Create: `web/src/pages/downloads/CompletedTab.tsx`
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Move the downloading section verbatim**

```tsx
// web/src/pages/downloads/DownloadingTab.tsx
import type { Download } from '@/lib/api/downloads';
// ...imports...

interface Props {
  downloads: Download[];
  // ...existing props used in the section...
}

export default function DownloadingTab(props: Props) {
  // ...entire downloading branch copied verbatim...
}
```

- [ ] **Step 2: Move the completed section verbatim** — same pattern into `CompletedTab.tsx`.

- [ ] **Step 3: Wire into page**

```tsx
{tab === 'downloading' && <DownloadingTab {...} />}
{tab === 'completed'   && <CompletedTab {...} />}
```

- [ ] **Step 4: Run checks**

```bash
cd web && bun run check:all
```
Expected: no new failures.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/downloads/DownloadingTab.tsx web/src/pages/downloads/CompletedTab.tsx web/src/pages/DownloadsPage.tsx
git commit -m "refactor(downloads): extract Downloading and Completed tabs"
```

---

## Task 13: PR 2 wrap-up

- [ ] **Step 1: Confirm `DownloadsPage.tsx` is now a thin shell**

```bash
wc -l web/src/pages/DownloadsPage.tsx
```
Expected: < 1000 lines (ideally ~500; remaining bits are the search/sort/aggregate toolbar + subscribe modal).

- [ ] **Step 2: Manual regression**

User loads the app; confirms all three tabs render identically to `main`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin HEAD
gh pr create --title "refactor(downloads): split DownloadsPage into per-tab files" --body "$(cat <<'EOF'
## Summary
- Extracts `SubscribedTab`, `DownloadingTab`, `CompletedTab` from the 3800-line `DownloadsPage.tsx`.
- No visual change — existing cards and logic moved verbatim.

## Test plan
- [ ] `bun run check:all` passes
- [ ] Manual: all three tabs render pixel-identically to main
EOF
)"
```

---

# PR 3 — Adopt the Unified Card

Visual change lands. Each tab stops using the old per-tab card and switches to `AnimeDownloadCard` + the matching `EpisodeRow`. Old cards get deleted.

## Task 14: Update i18n strings

**Files:**
- Modify: `web/src/locales/{en,ja,ko,zh-CN,zh-HK,zh-TW}/messages.po`

- [ ] **Step 1: Add new keys**

Run:

```bash
cd web && bun run i18n:extract
```
This updates `.po` files with new `msg\`downloads.*\`` keys from the new components. Keys that need translation:

- `downloads.downloading` — "downloading"
- `downloads.autoEnabled` — "Auto-download on"
- `downloads.autoDisabled` — "Disabled"
- `downloads.nextFetch` — "Next fetch"
- `downloads.completedAt` — "Completed"
- `downloads.collapse` — "Collapse"
- `downloads.expand` — "Expand"
- `downloads.waiting` — "Waiting"
- `downloads.refresh` — "Refresh"
- `downloads.pause` — "Pause"
- `downloads.resume` — "Resume"
- `downloads.delete` — "Delete"
- `downloads.play` — "Play"
- `downloads.miscHeader` — "Other downloads"

- [ ] **Step 2: Translate all six locales**

Translate each new `msgstr ""` in `en`, `ja`, `ko`, `zh-CN`, `zh-HK`, `zh-TW`. For example in `zh-HK/messages.po`:

```po
msgid "downloads.downloading"
msgstr "下載緊"

msgid "downloads.autoEnabled"
msgstr "自動下載開咗"

msgid "downloads.autoDisabled"
msgstr "已停用"
# ... etc
```

Reference the existing `autoDownload.*` keys in each file for tone.

- [ ] **Step 3: Compile**

```bash
cd web && bun run i18n:compile
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "i18n(downloads): add unified-card strings for 6 locales"
```

---

## Task 15: Migrate `SubscribedTab` to `AnimeDownloadCard`

**Files:**
- Modify: `web/src/pages/downloads/SubscribedTab.tsx`

- [ ] **Step 1: Write an integration test first**

```tsx
// web/src/pages/downloads/SubscribedTab.test.tsx
import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import SubscribedTab from './SubscribedTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1,
  title: 'Test Anime',
  title_original: 'T',
  cover_image: 'https://example/c.jpg',
  episode_count: 12,
  score: 8,
  synopsis: '',
  tags: [],
  rating: { score: 0, total: 0 },
} as never);

test('renders AnimeDownloadCard per rule', () => {
  const rules = [{
    id: 'r1', name: 'Test Anime', enabled: 1, rss_feed_id: 'f1',
    filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
    resolution_filter: '', subgroup_filter: '', min_seeders: 0,
    match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
    last_triggered_at: null, created_at: '', library_id: null, bangumi_id: 1,
  }] as never;

  render(<SubscribedTab rules={rules} feeds={[]} groups={[]} />);
  expect(screen.getByText('Test Anime')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — confirm RED** (old component doesn't match the new expectations)

- [ ] **Step 3: Rewrite the tab's body**

Replace `SubscriptionAnimeCard` grid with a list of `AnimeDownloadCard`:

```tsx
// SubscribedTab.tsx (new body)
import { useDownloadsUIStore } from '@/store/downloads-ui-store';
import { useAnimeCover } from '@/hooks/use-anime-cover';
import { AnimeDownloadCard } from '@/components/downloads/AnimeDownloadCard';
import { EpisodeRowActive } from '@/components/downloads/episode-rows/EpisodeRowActive';
import { EpisodeRowComplete } from '@/components/downloads/episode-rows/EpisodeRowComplete';
import { EpisodeRowPending } from '@/components/downloads/episode-rows/EpisodeRowPending';

function SubscribedCard({ rule, feed, group }: {
  rule: DownloadRule; feed?: RSSFeed; group?: DownloadGroup;
}) {
  const { coverUrl } = useAnimeCover(rule.bangumi_id);
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(rule.id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);
  const recent = (group?.downloads ?? []).slice(0, 10);

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={rule.name}
      subChips={[rule.subgroup_filter || '', rule.resolution_filter || ''].filter(Boolean)}
      stats={{
        mode: 'subscribed',
        percent: deriveGroupPercent(group),
        activeCount: group?.total_count ?? 0,
        nextFetchRelative: deriveNextFetch(feed),
        live: rule.enabled === 1,
      }}
      expanded={expanded}
      onToggle={() => toggle(rule.id)}
    >
      {recent.length === 0 ? (
        <EpisodeRowPending
          nextFetchRelative={deriveNextFetch(feed) ?? ''}
          onRefresh={() => feed && refreshFeed(feed.id)}
        />
      ) : (
        recent.map((d) => (
          d.status === 'complete' ? (
            <EpisodeRowComplete key={d.gid} {...toCompleteProps(d)} />
          ) : (
            <EpisodeRowActive key={d.gid} {...toActiveProps(d)} />
          )
        ))
      )}
    </AnimeDownloadCard>
  );
}

export default function SubscribedTab({ rules, feeds, groups }: Props) {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const groupMap = new Map(groups.map((g) => [g.rule_id, g]));
  return (
    <div className="flex flex-col gap-2.5">
      {rules.map((rule) => (
        <SubscribedCard
          key={rule.id}
          rule={rule}
          feed={feedMap.get(rule.rss_feed_id)}
          group={groupMap.get(rule.id)}
        />
      ))}
    </div>
  );
}
```

Helper functions `deriveGroupPercent`, `deriveNextFetch`, `toActiveProps`, `toCompleteProps`, and `refreshFeed` go in a colocated `helpers.ts` — write them inline if short. `deriveNextFetch` reads `feed.last_fetched_at` + `feed.fetch_interval_minutes` and formats as relative string.

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd web && bun run test -- SubscribedTab
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/downloads/SubscribedTab.tsx web/src/pages/downloads/SubscribedTab.test.tsx
git commit -m "feat(downloads): migrate SubscribedTab to AnimeDownloadCard"
```

---

## Task 16: Migrate `DownloadingTab` to `AnimeDownloadCard`

**Files:**
- Modify: `web/src/pages/downloads/DownloadingTab.tsx`

- [ ] **Step 1: Write integration test**

```tsx
// DownloadingTab.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import DownloadingTab from './DownloadingTab';

test('renders one card per active group', () => {
  const groups = [{
    rule_id: 'r1', rule_name: 'Test', bangumi_id: 1,
    downloads: [
      { id: 'd1', gid: 'g1', name: 'Test - 01.mkv', status: 'active',
        total_bytes: 1e9, completed_bytes: 5e8, speed_bytes: 1e6, created_at: '' },
    ],
    active_count: 1, complete_count: 0, total_count: 1,
  }] as never;
  const miscDownloads: never[] = [];
  render(<DownloadingTab groups={groups} miscDownloads={miscDownloads} />);
  expect(screen.getByText('Test')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — confirm RED**

- [ ] **Step 3: Rewrite body**

```tsx
// DownloadingTab.tsx
import { useDownloadsUIStore } from '@/store/downloads-ui-store';
import { useEffect } from 'react';
// ...
interface Props {
  groups: DownloadGroup[];
  miscDownloads: Download[];  // downloads with rule_id=null, status active/paused/waiting
}

export default function DownloadingTab({ groups, miscDownloads }: Props) {
  const activeGroups = groups.filter((g) => g.active_count > 0);
  const expandAll = useDownloadsUIStore((s) => s.expandAll);

  // Default-expand all active groups
  useEffect(() => {
    expandAll(activeGroups.map((g) => g.rule_id));
  }, [activeGroups.length]); // run when group count changes

  return (
    <div className="flex flex-col gap-2.5">
      {activeGroups.map((g) => (
        <DownloadingCard key={g.rule_id} group={g} />
      ))}
      <MiscDownloadsSection downloads={miscDownloads} mode="active" />
    </div>
  );
}

function DownloadingCard({ group }: { group: DownloadGroup }) {
  const { coverUrl } = useAnimeCover(group.bangumi_id);
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(group.rule_id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);
  const active = group.downloads.filter((d) =>
    d.status === 'active' || d.status === 'paused' || d.status === 'waiting'
  );
  const stats = aggregateActiveStats(active);

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={group.rule_name}
      subChips={[group.subgroup_filter, group.resolution_filter].filter(Boolean) as string[]}
      stats={{
        mode: 'downloading',
        percent: stats.percent,
        speedBytes: stats.speed,
        downloadedBytes: stats.downloaded,
        totalBytes: stats.total,
        etaSeconds: stats.eta,
        activeCount: active.length,
        live: stats.speed > 0,
      }}
      expanded={expanded}
      onToggle={() => toggle(group.rule_id)}
    >
      {active.map((d) => (
        <EpisodeRowActive key={d.gid} {...toActiveProps(d)} />
      ))}
    </AnimeDownloadCard>
  );
}

function aggregateActiveStats(eps: DownloadGroup['downloads']) {
  const total = eps.reduce((s, d) => s + d.total_bytes, 0);
  const downloaded = eps.reduce((s, d) => s + d.completed_bytes, 0);
  const speed = eps.reduce((s, d) => s + d.speed_bytes, 0);
  const remaining = total - downloaded;
  const eta = speed > 0 ? Math.round(remaining / speed) : 0;
  const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  return { speed, downloaded, total, eta, percent };
}
```

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd web && bun run test -- DownloadingTab
```

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/downloads/DownloadingTab.tsx web/src/pages/downloads/DownloadingTab.test.tsx
git commit -m "feat(downloads): migrate DownloadingTab to AnimeDownloadCard"
```

---

## Task 17: Migrate `CompletedTab` to `AnimeDownloadCard`

**Files:**
- Modify: `web/src/pages/downloads/CompletedTab.tsx`

- [ ] **Step 1: Write integration test (structurally identical to Task 16; fill `status: 'complete'` on the mocked download).**

- [ ] **Step 2: Run — RED.**

- [ ] **Step 3: Rewrite body** — same structure as `DownloadingTab` but:
  - Filters `complete_count > 0`
  - Collects `status === 'complete'` downloads for the episode list
  - Passes `mode: 'completed'`, sets `live: false`, hides speed/eta
  - Default collapsed (do **not** call `expandAll` in `useEffect`)
  - Uses `EpisodeRowComplete` instead of `EpisodeRowActive`
  - Renders `<MiscDownloadsSection mode="complete" …>` at bottom

- [ ] **Step 4: Run — GREEN.**

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/downloads/CompletedTab.tsx web/src/pages/downloads/CompletedTab.test.tsx
git commit -m "feat(downloads): migrate CompletedTab to AnimeDownloadCard"
```

---

## Task 18: `MiscDownloadsSection` component

**Files:**
- Create: `web/src/components/downloads/MiscDownloadsSection.tsx`
- Test:   `web/src/components/downloads/MiscDownloadsSection.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// MiscDownloadsSection.test.tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { MiscDownloadsSection } from './MiscDownloadsSection';

test('renders count badge and toggles open/close', async () => {
  const user = userEvent.setup();
  const downloads = [
    { id: 'd', gid: 'g', name: '[manual] foo', status: 'active',
      total_bytes: 100, completed_bytes: 50, speed_bytes: 10, created_at: '' },
  ] as never;
  render(<MiscDownloadsSection downloads={downloads} mode="active" onDelete={() => {}} />);
  expect(screen.getByText(/其他下載|Other downloads/i)).toBeInTheDocument();
  expect(screen.queryByText('[manual] foo')).toBeNull();  // collapsed by default
  await user.click(screen.getByRole('button', { name: /其他下載|Other downloads/i }));
  expect(screen.getByText('[manual] foo')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement**

```tsx
// web/src/components/downloads/MiscDownloadsSection.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import type { Download } from '@/lib/api/downloads';
import { EpisodeRowMisc } from './episode-rows/EpisodeRowMisc';

interface Props {
  downloads: Download[];
  mode: 'active' | 'complete';
  onDelete: (gid: string) => void;
}

export function MiscDownloadsSection({ downloads, mode, onDelete }: Props) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  if (downloads.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[11px] text-white/35 hover:text-white/65 uppercase tracking-[0.08em]"
      >
        <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={10} />
        {i18n._(msg`downloads.miscHeader`)} ({downloads.length})
      </button>
      {open && (
        <div className="mt-2 flex flex-col">
          {downloads.map((d) => (
            <EpisodeRowMisc
              key={d.gid}
              gid={d.gid}
              filename={d.name}
              downloadedBytes={d.completed_bytes}
              totalBytes={d.total_bytes}
              percent={d.total_bytes > 0 ? Math.round(d.completed_bytes / d.total_bytes * 100) : 0}
              status={mode}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run — GREEN**

```bash
cd web && bun run test -- MiscDownloadsSection
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/downloads/MiscDownloadsSection.tsx web/src/components/downloads/MiscDownloadsSection.test.tsx
git commit -m "feat(downloads): add MiscDownloadsSection for rule-less downloads"
```

---

## Task 19: Delete dead components

**Files:**
- Delete: references to `SubscriptionAnimeCard` in `DownloadsPage.tsx` and any exports
- Delete: `DownloadCard` component and its helpers in `DownloadsPage.tsx`
- Delete: `SubscriptionDetailContent` component (unless still referenced by `RuleEditorModal` trigger — keep the modal trigger button)

- [ ] **Step 1: grep for references**

```bash
cd web && grep -rn "SubscriptionAnimeCard\|SubscriptionDetailContent\|from.*DownloadCard" src/
```

- [ ] **Step 2: Delete the definitions** in `DownloadsPage.tsx` after confirming no remaining imports.

- [ ] **Step 3: Typecheck**

```bash
cd web && bun run typecheck
```
Fix any dangling imports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(downloads): delete legacy cards replaced by unified design"
```

---

## Task 20: End-to-end test

**Files:**
- Create: `web/e2e/downloads-unified.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// web/e2e/downloads-unified.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Downloads — unified card layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/downloads');
  });

  test('subscribed tab shows anime cards with covers', async ({ page }) => {
    await page.getByRole('tab', { name: /已追番|Subscribed/ }).click();
    // Seeded fixture: at least one rule present
    const firstCard = page.locator('[data-testid="anime-download-card"]').first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator('img')).toBeVisible();
  });

  test('downloading tab auto-expands active groups', async ({ page }) => {
    await page.getByRole('tab', { name: /下載緊|Downloading/ }).click();
    const ep = page.locator('[data-testid="ep-bar-fill"]').first();
    await expect(ep).toBeVisible();
  });

  test('expand toggle shows/hides episodes', async ({ page }) => {
    await page.getByRole('tab', { name: /已完成|Completed/ }).click();
    const toggle = page.getByRole('button', { name: /Expand|展開|展开/ }).first();
    await toggle.click();
    await expect(page.locator('[data-testid="card-divider"]').first()).toBeVisible();
  });

  test('search filters cards', async ({ page }) => {
    await page.getByPlaceholder(/Search downloads/i).fill('nonexistent_xyz_999');
    await expect(page.locator('[data-testid="anime-download-card"]')).toHaveCount(0);
  });
});
```

Add `data-testid="anime-download-card"` to the outer div in `AnimeDownloadCard.tsx` before running.

- [ ] **Step 2: Run locally** (user starts dev server if not running)

```bash
cd web && bun run test:e2e -- downloads-unified
```
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/downloads-unified.spec.ts web/src/components/downloads/AnimeDownloadCard.tsx
git commit -m "test(e2e): verify unified downloads card across tabs"
```

---

## Task 21: PR 3 wrap-up

- [ ] **Step 1: Full quality gate**

```bash
cd web && bun run check:all && bun run test:e2e -- downloads-unified
```

- [ ] **Step 2: Push + PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(downloads): adopt unified anime card across all tabs" --body "$(cat <<'EOF'
## Summary
- All three tabs (已追番 / 下載緊 / 已完成) now use `AnimeDownloadCard`.
- Episode rows are tab-specific: `EpisodeRowActive`, `EpisodeRowComplete`, `EpisodeRowPending`, `EpisodeRowMisc`.
- Legacy `SubscriptionAnimeCard`, `DownloadCard`, `SubscriptionDetailContent` deleted.
- i18n strings added for 6 locales.
- e2e coverage: card render, auto-expand, expand toggle, search filter.

## Test plan
- [ ] `bun run check:all` passes
- [ ] `bun run test:e2e -- downloads-unified` passes
- [ ] Manual QA of all three tabs
EOF
)"
```

---

# PR 4 — Polish, Virtualization, Skeletons

## Task 22: Skeleton loader

**Files:**
- Create: `web/src/components/downloads/AnimeDownloadCardSkeleton.tsx`
- Modify: each tab component to render the skeleton when loading

- [ ] **Step 1: Failing test**

```tsx
// AnimeDownloadCardSkeleton.test.tsx
import { expect, test } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AnimeDownloadCardSkeleton } from './AnimeDownloadCardSkeleton';

test('renders placeholder boxes', () => {
  render(<AnimeDownloadCardSkeleton />);
  expect(screen.getByTestId('skeleton-cover')).toBeInTheDocument();
  expect(screen.getByTestId('skeleton-title')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement**

```tsx
// AnimeDownloadCardSkeleton.tsx
export function AnimeDownloadCardSkeleton() {
  return (
    <div className="grid grid-cols-[92px_1fr_auto] gap-5 p-4 bg-white/[0.02] border border-white/[0.06] rounded-[14px] animate-pulse">
      <div data-testid="skeleton-cover" className="w-[92px] h-[130px] rounded-lg bg-white/[0.05]" />
      <div className="flex flex-col justify-between py-0.5">
        <div>
          <div data-testid="skeleton-title" className="h-[16px] w-[180px] rounded bg-white/[0.08]" />
          <div className="mt-2 h-[10px] w-[140px] rounded bg-white/[0.04]" />
        </div>
        <div className="h-[12px] w-[220px] rounded bg-white/[0.04]" />
        <div className="mt-2.5 h-[2px] w-full rounded-sm bg-white/[0.04]" />
      </div>
      <div className="w-[48px] flex items-end">
        <div className="h-[20px] w-[40px] rounded bg-white/[0.08]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into tabs**

In each tab, when the source queries are loading, render 3 skeletons:

```tsx
if (isLoading) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 3 }).map((_, i) => <AnimeDownloadCardSkeleton key={i} />)}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/downloads/AnimeDownloadCardSkeleton.tsx web/src/components/downloads/AnimeDownloadCardSkeleton.test.tsx web/src/pages/downloads/*.tsx
git commit -m "feat(downloads): add skeleton loaders for unified cards"
```

---

## Task 23: Virtualize episode list above 30 items

**Files:**
- Modify: `web/src/components/downloads/AnimeEpisodeList.tsx`

- [ ] **Step 1: Install `@tanstack/react-virtual`** (check first — may already be in deps):

```bash
cd web && bun pm ls @tanstack/react-virtual || bun add @tanstack/react-virtual
```

- [ ] **Step 2: Add virtualization branch**

```tsx
// AnimeEpisodeList.tsx (updated)
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, Children, cloneElement, isValidElement } from 'react';

const VIRTUAL_THRESHOLD = 30;

export function AnimeEpisodeList({ expanded, children }: Props) {
  const items = Children.toArray(children);
  const shouldVirtualize = items.length > VIRTUAL_THRESHOLD;
  // ... existing animation wrapper ...
  // Inside the inner div:
  if (shouldVirtualize) {
    return <VirtualList items={items} />;
  }
  return <>{items}</>;
}

function VirtualList({ items }: { items: React.ReactNode[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 6,
  });
  return (
    <div ref={parentRef} className="max-h-[480px] overflow-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {rowVirtualizer.getVirtualItems().map((virt) => (
          <div
            key={virt.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virt.start}px)` }}
          >
            {items[virt.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test with synthetic 50-episode group**

Add a vitest case:

```tsx
// AnimeEpisodeList.test.tsx
test('virtualizes above 30 children', () => {
  const children = Array.from({ length: 50 }, (_, i) => <div key={i}>ep-{i}</div>);
  render(<AnimeEpisodeList expanded>{children}</AnimeEpisodeList>);
  // Only a subset renders in the DOM
  expect(document.querySelectorAll('[data-index]').length).toBeLessThan(50);
});
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/downloads/AnimeEpisodeList.tsx web/src/components/downloads/AnimeEpisodeList.test.tsx web/package.json
git commit -m "feat(downloads): virtualize episode list when >30 items"
```

---

## Task 24: `simplify` pass + code-reviewer agent

- [ ] **Step 1: Invoke the `simplify` skill on the diff**

Run `/simplify` against `web/src/components/downloads/*` and `web/src/pages/downloads/*`. Apply or reject each suggestion.

- [ ] **Step 2: Dispatch the code-reviewer agent**

Invoke `feature-dev:code-reviewer` with the PR diff. Address high-confidence findings only (per its default filter).

- [ ] **Step 3: Final typecheck + tests**

```bash
cd web && bun run check:all && bun run test:e2e -- downloads-unified
```
Expected: all green.

- [ ] **Step 4: Commit any resulting tweaks**

```bash
git add -A && git commit -m "refactor(downloads): simplify + review polish"
```

---

## Task 25: PR 4 wrap-up

- [ ] **Step 1: Push + PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(downloads): polish — skeletons, virtualization, misc section" --body "$(cat <<'EOF'
## Summary
- Skeleton loader matching the `AnimeDownloadCard` shape
- `AnimeEpisodeList` virtualizes when >30 children
- `MiscDownloadsSection` at the bottom of Downloading and Completed tabs
- `simplify` + code-reviewer polish pass

## Test plan
- [ ] `bun run check:all`
- [ ] `bun run test:e2e -- downloads-unified`
- [ ] Manual: load a rule with >30 triggered downloads; scroll the expanded list smoothly
EOF
)"
```

- [ ] **Step 2: Verify all 4 PRs merge in sequence.**

---

## Success Criteria (final check)

Copied from the spec §"Success Criteria":

- [ ] All three tabs share the Unified card design
- [ ] Group header progress bar is visually attached to its card (no floating divider look)
- [ ] Linear-only progress — no circular ring redundancy
- [ ] Episode rows align cleanly under the title column; cover column stays visually empty inside rows
- [ ] Same anime across tabs looks identical (only episode rows differ)
- [ ] Search filters by anime + episode title in real time
- [ ] Manual downloads without `rule_id` collect into "其他下載" section
- [ ] `DownloadsPage.tsx` ≤ 400 lines after refactor
- [ ] Full E2E coverage of subscribe → download → complete flow
