# Downloads Merged Library View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three download-management tabs (已追番 / 下載緊 / 已完成) into a single `庫` tab with one mode-driven card per rule. Reuse the existing `AnimeDownloadCard` primitive.

**Architecture:** New pure helpers for mode derivation + sort in `shared/adapters.ts`. New `LibraryTab.tsx` replaces three per-status tab files. New `CardMenu.tsx` provides the ⋯ dropdown via the existing `Popover` UI primitive. `AnimeGroupHeader.tsx` gets a visual pass (drop green glow/halo, neutralise completed bar) and takes a menu slot. `DownloadsPage.tsx` collapses its 4-way tab switch into 2 tabs.

**Tech Stack:** React 19 + Compiler, TanStack Router + Query, Zustand, Radix Popover (via `web/src/components/ui/popover.tsx`), Tailwind v4, Lingui v5, Vitest + Testing Library, Playwright. Package manager: bun.

**Spec:** `docs/superpowers/specs/2026-04-18-downloads-merged-view-design.md`

---

## File Structure

```
web/src/pages/downloads/
├── LibraryTab.tsx                      ← NEW — merged view
├── LibraryTab.test.tsx                 ← NEW
├── shared/
│   └── adapters.ts                     ← MODIFY — add deriveCardMode + sort comparators
├── SubscribedTab.tsx                   ← DELETE after LibraryTab ships
├── SubscribedTab.test.tsx              ← DELETE
├── DownloadingTab.tsx                  ← DELETE
├── DownloadingTab.test.tsx             ← DELETE
├── CompletedTab.tsx                    ← DELETE
└── CompletedTab.test.tsx               ← DELETE

web/src/components/downloads/
├── AnimeGroupHeader.tsx                ← MODIFY — drop glow/halo, neutral completed bar, menu slot
├── AnimeGroupHeader.test.tsx           ← MODIFY — drop obsolete testids, add new assertions
├── CardMenu.tsx                        ← NEW — ⋯ dropdown menu
├── CardMenu.test.tsx                   ← NEW
├── MiscDownloadsSection.tsx            ← MODIFY — drop `mode` prop, row infers from status
└── MiscDownloadsSection.test.tsx       ← MODIFY

web/src/pages/DownloadsPage.tsx         ← MODIFY — tab collapse, call <LibraryTab />
web/src/locales/{en,ja,ko,zh-CN,zh-HK,zh-TW}/messages.po  ← MODIFY — 17 new keys
```

---

## Task 1: Add `deriveCardMode` helper

**Files:**
- Modify: `web/src/pages/downloads/shared/adapters.ts`
- Modify: `web/src/pages/downloads/shared/adapters.test.ts` (create alongside if not exists)

- [ ] **Step 1: Write the failing test**

Create or append to `web/src/pages/downloads/shared/adapters.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { DownloadGroup, DownloadRule } from '@/lib/api/downloads';
import { deriveCardMode } from './adapters';

const baseRule: DownloadRule = {
  id: 'r', name: 'X', enabled: 1, rss_feed_id: 'f',
  filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
  resolution_filter: '', subgroup_filter: '', min_seeders: 0,
  match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
  last_triggered_at: null, created_at: '', library_id: null, bangumi_id: null,
};

function group(downloads: { status: string }[]): DownloadGroup {
  return {
    rule_id: 'r', rule_name: 'X',
    downloads: downloads.map((d, i) => ({
      id: String(i), gid: String(i), name: `x - ${i}`,
      status: d.status, total_bytes: 100, completed_bytes: 50,
      speed_bytes: 0, created_at: '',
    })),
    active_count: downloads.filter((d) => d.status === 'active').length,
    complete_count: downloads.filter((d) => d.status === 'complete').length,
    total_count: downloads.length,
  };
}

test('downloading mode when any ep is active', () => {
  const g = group([{ status: 'complete' }, { status: 'active' }]);
  expect(deriveCardMode(g, baseRule)).toBe('downloading');
});

test('downloading mode when ep is paused or waiting', () => {
  expect(deriveCardMode(group([{ status: 'paused' }]), baseRule)).toBe('downloading');
  expect(deriveCardMode(group([{ status: 'waiting' }]), baseRule)).toBe('downloading');
});

test('subscribed mode when rule enabled and no active eps', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 1 })).toBe('subscribed');
});

test('subscribed mode when no group at all and rule enabled', () => {
  expect(deriveCardMode(undefined, baseRule)).toBe('subscribed');
});

test('completed mode when rule disabled, regardless of complete count', () => {
  const g = group([{ status: 'complete' }]);
  expect(deriveCardMode(g, { ...baseRule, enabled: 0 })).toBe('completed');
});

test('completed mode when rule disabled and no group', () => {
  expect(deriveCardMode(undefined, { ...baseRule, enabled: 0 })).toBe('completed');
});
```

- [ ] **Step 2: Run — confirm RED**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- adapters
```
Expected: FAIL with `deriveCardMode is not exported` or similar.

- [ ] **Step 3: Implement**

Append to `web/src/pages/downloads/shared/adapters.ts`:

```ts
import type { DownloadGroup, DownloadRule } from '@/lib/api/downloads';

export type CardMode = 'downloading' | 'subscribed' | 'completed';

/**
 * Priority: any active episode → downloading; else rule enabled → subscribed; else completed.
 */
export function deriveCardMode(
  group: DownloadGroup | undefined,
  rule: DownloadRule,
): CardMode {
  const hasActive = (group?.downloads ?? []).some(
    (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
  );
  if (hasActive) return 'downloading';
  if (rule.enabled === 1) return 'subscribed';
  return 'completed';
}
```

- [ ] **Step 4: Run — confirm GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- adapters
```
Expected: 6 passed (plus any pre-existing adapters tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/downloads/shared/adapters.ts web/src/pages/downloads/shared/adapters.test.ts
git commit -m "feat(downloads): add deriveCardMode helper for merged view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `deriveEpsForExpand` and sort comparators

**Files:**
- Modify: `web/src/pages/downloads/shared/adapters.ts`
- Modify: `web/src/pages/downloads/shared/adapters.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `adapters.test.ts`:

```ts
import { deriveEpsForExpand, sortRulesBy, type LibraryItem } from './adapters';

test('deriveEpsForExpand in downloading mode: only active/paused/waiting, sorted by ETA asc', () => {
  const g = group([
    { status: 'active' },   // index 0
    { status: 'complete' }, // index 1 (skipped)
    { status: 'active' },   // index 2
  ]);
  // Fake ETAs by speed: ep0 full 100 left, speed 10 → eta 10; ep2 speed 2 → eta 50
  g.downloads[0].speed_bytes = 10;
  g.downloads[0].completed_bytes = 0;
  g.downloads[2].speed_bytes = 2;
  g.downloads[2].completed_bytes = 0;
  const eps = deriveEpsForExpand(g, 'downloading');
  expect(eps.map((d) => d.gid)).toEqual(['0', '2']);  // ep0 (eta 10) before ep2 (eta 50)
});

test('deriveEpsForExpand in completed mode: only complete, sorted by created_at desc', () => {
  const g = group([
    { status: 'complete' },
    { status: 'complete' },
    { status: 'active' },  // skipped
  ]);
  g.downloads[0].created_at = '2024-01-01T00:00:00Z';
  g.downloads[1].created_at = '2024-02-01T00:00:00Z';
  const eps = deriveEpsForExpand(g, 'completed');
  expect(eps.map((d) => d.gid)).toEqual(['1', '0']);  // feb before jan
});

test('deriveEpsForExpand in subscribed mode: always empty (expand shows pending row)', () => {
  const g = group([{ status: 'active' }, { status: 'complete' }]);
  expect(deriveEpsForExpand(g, 'subscribed')).toEqual([]);
});

test('sortRulesBy("name") sorts alphabetically', () => {
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'b', name: 'Bocchi' }, group: undefined, feed: undefined },
    { rule: { ...baseRule, id: 'a', name: 'Akudama' }, group: undefined, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'name');
  expect(sorted.map((i) => i.rule.id)).toEqual(['a', 'b']);
});

test('sortRulesBy("activity") puts active groups first, then by last_triggered_at desc', () => {
  const active = group([{ status: 'active' }]);
  const dormant = group([{ status: 'complete' }]);
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'dormant', name: 'D', last_triggered_at: '2024-01-01' }, group: dormant, feed: undefined },
    { rule: { ...baseRule, id: 'active', name: 'A', last_triggered_at: '2023-01-01' }, group: active, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'activity');
  expect(sorted.map((i) => i.rule.id)).toEqual(['active', 'dormant']);
});

test('sortRulesBy("progress") sorts by group percent descending', () => {
  const g100 = group([{ status: 'complete' }]);
  g100.downloads[0].completed_bytes = g100.downloads[0].total_bytes;
  const g50 = group([{ status: 'active' }]);
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'half' }, group: g50, feed: undefined },
    { rule: { ...baseRule, id: 'done' }, group: g100, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'progress');
  expect(sorted.map((i) => i.rule.id)).toEqual(['done', 'half']);
});

test('sortRulesBy("created") sorts by rule.created_at desc', () => {
  const items: LibraryItem[] = [
    { rule: { ...baseRule, id: 'older', created_at: '2023-01-01' }, group: undefined, feed: undefined },
    { rule: { ...baseRule, id: 'newer', created_at: '2024-06-01' }, group: undefined, feed: undefined },
  ];
  const sorted = sortRulesBy(items, 'created');
  expect(sorted.map((i) => i.rule.id)).toEqual(['newer', 'older']);
});
```

- [ ] **Step 2: Run — RED**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- adapters
```

- [ ] **Step 3: Implement**

Append to `adapters.ts`:

```ts
import type { RSSFeed } from '@/lib/api/downloads';

export type SortKey = 'activity' | 'name' | 'progress' | 'created';

export interface LibraryItem {
  rule: DownloadRule;
  group: DownloadGroup | undefined;
  feed: RSSFeed | undefined;
}

export function deriveEpsForExpand(
  group: DownloadGroup | undefined,
  mode: CardMode,
): DownloadGroup['downloads'] {
  if (!group || mode === 'subscribed') return [];
  const eps = group.downloads.filter((d) => {
    if (mode === 'downloading') {
      return d.status === 'active' || d.status === 'paused' || d.status === 'waiting';
    }
    return d.status === 'complete';
  });
  if (mode === 'downloading') {
    return [...eps].sort((a, b) => {
      const etaA = a.speed_bytes > 0 ? (a.total_bytes - a.completed_bytes) / a.speed_bytes : Infinity;
      const etaB = b.speed_bytes > 0 ? (b.total_bytes - b.completed_bytes) / b.speed_bytes : Infinity;
      return etaA - etaB;
    });
  }
  // completed — sort by created_at desc
  return [...eps].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function isActiveGroup(g: DownloadGroup | undefined): boolean {
  return !!g && g.downloads.some(
    (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
  );
}

export function sortRulesBy(items: LibraryItem[], key: SortKey): LibraryItem[] {
  const copy = [...items];
  const nameCmp = (a: LibraryItem, b: LibraryItem) =>
    a.rule.name.localeCompare(b.rule.name);

  switch (key) {
    case 'name':
      return copy.sort(nameCmp);
    case 'progress':
      return copy.sort((a, b) => {
        const pa = deriveGroupPercent(a.group);
        const pb = deriveGroupPercent(b.group);
        return pb - pa || nameCmp(a, b);
      });
    case 'created':
      return copy.sort((a, b) => {
        const ta = new Date(a.rule.created_at || 0).getTime();
        const tb = new Date(b.rule.created_at || 0).getTime();
        return tb - ta || nameCmp(a, b);
      });
    case 'activity':
    default:
      return copy.sort((a, b) => {
        const aActive = isActiveGroup(a.group);
        const bActive = isActiveGroup(b.group);
        if (aActive !== bActive) return aActive ? -1 : 1;
        const ta = new Date(a.rule.last_triggered_at || a.rule.created_at || 0).getTime();
        const tb = new Date(b.rule.last_triggered_at || b.rule.created_at || 0).getTime();
        return tb - ta || nameCmp(a, b);
      });
  }
}
```

- [ ] **Step 4: Run — GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- adapters
```

Expected: all 12 adapter tests pass (6 from Task 1 + 6 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/downloads/shared/adapters.ts web/src/pages/downloads/shared/adapters.test.ts
git commit -m "feat(downloads): add deriveEpsForExpand + sort comparators

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Drop glow/halo from `AnimeGroupHeader`

**Files:**
- Modify: `web/src/components/downloads/AnimeGroupHeader.tsx`

- [ ] **Step 1: Inspect current glow / halo**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
grep -n "shadow-\[0_0_8px_rgba(74,222,128\|shadow-\[0_0_0_3px_rgba(74,222,128\|rgba(74,222,128,0.18)" web/src/components/downloads/AnimeGroupHeader.tsx
```

Expected: 3 hits (one glow on progress fill, one halo on live dot, one dim-green hairline for completed mode).

- [ ] **Step 2: Edit AnimeGroupHeader.tsx**

Remove the `shadow-[0_0_8px_rgba(74,222,128,0.35)]` from the progress-fill div (leave the background gradient). The progress bar should become:

```tsx
{showProgressBar && (
  <div className="mt-2.5 h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
    <div
      data-testid="progress-fill"
      className="h-full rounded-sm"
      style={{
        width: `${percent}%`,
        background: 'linear-gradient(90deg, rgba(74,222,128,0.85), #4ade80)',
      }}
    />
  </div>
)}
{!showProgressBar && (
  <div className="mt-2.5 h-[1px] bg-white/[0.14]" data-testid="progress-fill-neutral" />
)}
```

(Previous dim-green hairline `bg-[rgba(74,222,128,0.18)]` → new neutral `bg-white/[0.14]`.)

Remove `shadow-[0_0_0_3px_rgba(74,222,128,0.35)]` from the live dot class and remove the animation name if it was tied to that. The new live-dot class should be:

```tsx
<span
  data-testid="live-dot"
  className="w-[5px] h-[5px] rounded-full bg-[#4ade80] animate-[pulse_1.6s_ease-in-out_infinite]"
/>
```

- [ ] **Step 3: Run existing tests — confirm still GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- AnimeGroupHeader
```

Expected: existing 5 tests still pass (live dot testid check continues to work; progress-fill testid unchanged; width assertion unchanged).

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/components/downloads/AnimeGroupHeader.tsx
git commit -m "fix(downloads): drop green glow on progress bar and halo on live dot

Progress bar uses clean fill (no box-shadow). Live dot pulses opacity only.
Completed mode hairline switches from dim-green to neutral 14% white —
completion is not an active state and shouldn't signal with the accent colour.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `CardMenu` dropdown component

**Files:**
- Create: `web/src/components/downloads/CardMenu.tsx`
- Create: `web/src/components/downloads/CardMenu.test.tsx`

- [ ] **Step 1: Inspect the existing Popover pattern**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
cat web/src/components/ui/popover.tsx
grep -rn "import.*Popover.*from.*ui/popover" web/src/ 2>&1 | head -5
```

This tells you the component is Radix-based and what API it exposes.

- [ ] **Step 2: Write failing tests**

```tsx
// web/src/components/downloads/CardMenu.test.tsx
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { CardMenu } from './CardMenu';

const baseProps = {
  enabled: true,
  bangumiId: 1 as number | null,
  feedUrl: 'https://example/rss',
  onToggleEnabled: vi.fn(),
  onRefresh: vi.fn(),
  onOpenAnime: vi.fn(),
  onCopyRssUrl: vi.fn(),
  onDelete: vi.fn(),
};

test('button opens the menu on click', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

test('clicking "auto-download" item calls onToggleEnabled', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/自動下載|auto.?download/i));
  expect(baseProps.onToggleEnabled).toHaveBeenCalled();
});

test('clicking "refresh" item calls onRefresh', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/refresh|刷新/i));
  expect(baseProps.onRefresh).toHaveBeenCalled();
});

test('clicking "delete" item calls onDelete', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  await user.click(screen.getByText(/刪除|delete/i));
  expect(baseProps.onDelete).toHaveBeenCalled();
});

test('"open in anime page" item disabled when bangumiId is null', async () => {
  const user = userEvent.setup();
  render(<CardMenu {...baseProps} bangumiId={null} />);
  await user.click(screen.getByRole('button', { name: /more/i }));
  const item = screen.getByText(/anime 頁面|anime page/i).closest('[role="menuitem"]');
  expect(item).toHaveAttribute('aria-disabled', 'true');
});
```

- [ ] **Step 3: Run — RED**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- CardMenu
```

- [ ] **Step 4: Implement**

```tsx
// web/src/components/downloads/CardMenu.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  MoreHorizontalIcon,
  PowerIcon,
  Refresh03Icon,
  Link02Icon,
  Copy01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  enabled: boolean;
  bangumiId: number | null;
  feedUrl: string;
  onToggleEnabled: () => void;
  onRefresh: () => void;
  onOpenAnime: () => void;
  onCopyRssUrl: () => void;
  onDelete: () => void;
}

export function CardMenu({
  enabled, bangumiId, feedUrl,
  onToggleEnabled, onRefresh, onOpenAnime, onCopyRssUrl, onDelete,
}: Props) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const animeDisabled = !bangumiId;

  function handle(fn: () => void) {
    return () => { fn(); setOpen(false); };
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.menu.more`)}
          className={cn(
            'w-[26px] h-[26px] rounded-[7px] flex items-center justify-center',
            'text-white/20 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer',
            open && 'text-white bg-white/[0.06]',
          )}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        align="end"
        sideOffset={6}
        className="w-[220px] p-1 bg-[#121212] border border-white/[0.10] rounded-[10px] shadow-xl"
      >
        <MenuItem
          icon={PowerIcon}
          label={i18n._(msg`downloads.menu.autoDownload`)}
          trailing={
            <span
              className={cn(
                'text-[10px] px-2 py-[2px] rounded-full tabular-nums',
                enabled ? 'bg-[rgba(74,222,128,0.15)] text-[#4ade80]' : 'bg-white/[0.06] text-white/40',
              )}
            >
              {enabled ? i18n._(msg`downloads.menu.on`) : i18n._(msg`downloads.menu.off`)}
            </span>
          }
          onClick={handle(onToggleEnabled)}
        />
        <MenuItem
          icon={Refresh03Icon}
          label={i18n._(msg`downloads.menu.refresh`)}
          onClick={handle(onRefresh)}
        />
        <MenuSeparator />
        <MenuItem
          icon={Link02Icon}
          label={i18n._(msg`downloads.menu.openAnime`)}
          disabled={animeDisabled}
          onClick={handle(onOpenAnime)}
        />
        <MenuItem
          icon={Copy01Icon}
          label={i18n._(msg`downloads.menu.copyRSS`)}
          onClick={handle(() => {
            navigator.clipboard.writeText(feedUrl).catch(() => {});
            onCopyRssUrl();
          })}
        />
        <MenuSeparator />
        <MenuItem
          icon={Delete02Icon}
          label={i18n._(msg`downloads.menu.delete`)}
          onClick={handle(onDelete)}
          danger
        />
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  icon, label, trailing, onClick, disabled, danger,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]['icon'];
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-[10px] px-[10px] py-[7px] rounded-md text-[12px]',
        'transition-colors text-left cursor-pointer',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && !danger && 'text-white/60 hover:text-white hover:bg-white/[0.04]',
        !disabled && danger && 'text-[#f87171] hover:bg-[rgba(248,113,113,0.08)]',
      )}
    >
      <HugeiconsIcon icon={icon} size={12} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function MenuSeparator() {
  return <div className="h-px bg-white/[0.05] my-1" />;
}
```

- [ ] **Step 5: Run — GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- CardMenu
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/components/downloads/CardMenu.tsx web/src/components/downloads/CardMenu.test.tsx
git commit -m "feat(downloads): add CardMenu dropdown for card actions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `MiscDownloadsSection` — drop `mode` prop, row infers status

**Files:**
- Modify: `web/src/components/downloads/MiscDownloadsSection.tsx`
- Modify: `web/src/components/downloads/MiscDownloadsSection.test.tsx`

- [ ] **Step 1: Update test**

Replace `MiscDownloadsSection.test.tsx` with:

```tsx
import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { MiscDownloadsSection } from './MiscDownloadsSection';

test('renders header with total count and toggles open', async () => {
  const user = userEvent.setup();
  const downloads = [
    { id: 'a', gid: 'a', name: '[manual] foo', status: 'active',
      total_bytes: 100, completed_bytes: 50, speed_bytes: 10, created_at: '', rule_id: null },
    { id: 'b', gid: 'b', name: '[manual] bar', status: 'complete',
      total_bytes: 200, completed_bytes: 200, speed_bytes: 0, created_at: '', rule_id: null },
  ] as never;
  render(<MiscDownloadsSection downloads={downloads} onDelete={() => {}} />);
  expect(screen.getByRole('button', { name: /2/ })).toBeInTheDocument();
  expect(screen.queryByText('[manual] foo')).toBeNull();
  await user.click(screen.getByRole('button', { name: /2/ }));
  expect(screen.getByText('[manual] foo')).toBeInTheDocument();
  expect(screen.getByText('[manual] bar')).toBeInTheDocument();
});

test('returns null when no downloads', () => {
  const { container } = render(<MiscDownloadsSection downloads={[]} onDelete={() => {}} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Run — RED (old signature mismatched)**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- MiscDownloadsSection
```

- [ ] **Step 3: Update implementation**

Edit `MiscDownloadsSection.tsx`:

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
  onDelete: (gid: string) => void;
}

export function MiscDownloadsSection({ downloads, onDelete }: Props) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  if (downloads.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-[11px] text-white/20 hover:text-white/60 uppercase tracking-[0.08em] cursor-pointer"
      >
        <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={10} />
        <span>{i18n._(msg`downloads.miscHeader`)} ({downloads.length})</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col">
          {downloads.map((d) => {
            const percent = d.total_bytes > 0
              ? Math.min(100, Math.round((d.completed_bytes / d.total_bytes) * 100))
              : 0;
            return (
              <EpisodeRowMisc
                key={d.gid}
                gid={d.gid}
                filename={d.name}
                downloadedBytes={d.completed_bytes}
                totalBytes={d.total_bytes}
                percent={percent}
                status={d.status === 'complete' ? 'complete' : 'active'}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- MiscDownloadsSection
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/components/downloads/MiscDownloadsSection.tsx web/src/components/downloads/MiscDownloadsSection.test.tsx
git commit -m "refactor(downloads): MiscDownloadsSection infers row status from each download

Drop the mode prop. Each EpisodeRowMisc row picks its own visual from the
download status, letting the section handle a mix of active + complete
downloads in one place.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Create `LibraryTab.tsx`

**Files:**
- Create: `web/src/pages/downloads/LibraryTab.tsx`
- Create: `web/src/pages/downloads/LibraryTab.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// web/src/pages/downloads/LibraryTab.test.tsx
import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import LibraryTab from './LibraryTab';
import * as discoverModule from '@/lib/api/discover';

vi.spyOn(discoverModule.discoverApi, 'detail').mockResolvedValue({
  bangumi_id: 1, title: 'T', title_original: 'T', cover_image: '',
  episode_count: 12, score: 8, synopsis: '', tags: [], rating: { score: 0, total: 0 },
} as never);

const baseRule = {
  id: 'r', name: 'Test', enabled: 1, rss_feed_id: 'f',
  filter_regex: '', exclude_regex: '', save_dir: '', episode_offset: 0,
  resolution_filter: '', subgroup_filter: '', min_seeders: 0,
  match_mode: 'fuzzy', episode_filter: 'all', episode_range: '',
  last_triggered_at: null, created_at: '', library_id: null, bangumi_id: 1,
};

test('renders one card per rule', () => {
  const rules = [
    { ...baseRule, id: 'a', name: 'Alpha' },
    { ...baseRule, id: 'b', name: 'Bravo' },
  ] as never;
  render(<LibraryTab rules={rules} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText('Bravo')).toBeInTheDocument();
});

test('empty state when no rules and no misc downloads', () => {
  render(<LibraryTab rules={[]} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  expect(screen.getByText(/去搜尋加第一個|go to search|no subscriptions/i)).toBeInTheDocument();
});

test('search input filters cards by rule name', async () => {
  const user = userEvent.setup();
  const rules = [
    { ...baseRule, id: 'a', name: 'Alpha' },
    { ...baseRule, id: 'b', name: 'Bravo' },
  ] as never;
  render(<LibraryTab rules={rules} feeds={[]} groups={[]} miscDownloads={[]} isLoading={false} onSwitchToSearch={() => {}} />);
  await user.type(screen.getByPlaceholderText(/search/i), 'alph');
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.queryByText('Bravo')).toBeNull();
});

test('shows skeleton when loading', () => {
  render(<LibraryTab rules={[]} feeds={[]} groups={[]} miscDownloads={[]} isLoading={true} onSwitchToSearch={() => {}} />);
  const skeletons = document.querySelectorAll('[data-testid="skeleton-cover"]');
  expect(skeletons.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run — RED**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- LibraryTab
```

- [ ] **Step 3: Implement**

```tsx
// web/src/pages/downloads/LibraryTab.tsx
import { useState, useMemo } from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { RssIcon, Search01Icon, ArrowUpDownIcon, Edit02Icon } from '@hugeicons/core-free-icons';
import {
  type Download, type DownloadGroup, type DownloadRule, type RSSFeed,
  downloadApi, downloadKeys, rssFeedApi, ruleApi,
} from '../../lib/api/downloads';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { AnimeDownloadCardSkeleton } from '../../components/downloads/AnimeDownloadCardSkeleton';
import { CardMenu } from '../../components/downloads/CardMenu';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { EpisodeRowComplete } from '../../components/downloads/episode-rows/EpisodeRowComplete';
import { EpisodeRowPending } from '../../components/downloads/episode-rows/EpisodeRowPending';
import { RuleEditorModal } from '../../components/RuleEditorModal';
import {
  deriveCardMode, deriveEpsForExpand, deriveGroupPercent, deriveNextFetch,
  formatRelative, ruleSubChips, sortRulesBy, type CardMode, type LibraryItem, type SortKey,
  toActiveProps, toCompleteProps,
} from './shared/adapters';

interface Props {
  rules: DownloadRule[];
  feeds: RSSFeed[];
  groups: DownloadGroup[];
  miscDownloads: Download[];
  isLoading: boolean;
  onSwitchToSearch: () => void;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export default function LibraryTab({
  rules, feeds, groups, miscDownloads, isLoading, onSwitchToSearch,
}: Props) {
  const { i18n } = useLingui();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('activity');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.rule_id, g])), [groups]);

  const items: LibraryItem[] = useMemo(
    () => rules.map((rule) => ({
      rule,
      group: groupMap.get(rule.id),
      feed: feedMap.get(rule.rss_feed_id),
    })),
    [rules, feedMap, groupMap],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (it.rule.name.toLowerCase().includes(q)) return true;
      if (it.rule.subgroup_filter?.toLowerCase().includes(q)) return true;
      return (it.group?.downloads ?? []).some((d) => d.name.toLowerCase().includes(q));
    });
  }, [items, query]);

  const sorted = useMemo(() => sortRulesBy(filtered, sort), [filtered, sort]);

  // Aggregate summary
  const stats = useMemo(() => {
    let downloadingCount = 0;
    let speed = 0;
    let storedBytes = 0;
    for (const g of groups) {
      for (const d of g.downloads) {
        if (d.status === 'active' || d.status === 'paused' || d.status === 'waiting') {
          downloadingCount += 1;
          speed += d.speed_bytes;
        }
        if (d.status === 'complete') storedBytes += d.total_bytes;
      }
    }
    return { downloadingCount, speed, storedBytes };
  }, [groups]);

  const selectedRule = selectedRuleId ? rules.find((r) => r.id === selectedRuleId) ?? null : null;
  const selectedFeed = selectedRule ? feedMap.get(selectedRule.rss_feed_id) : undefined;

  const queryClient = useQueryClient();
  const miscDeleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => <AnimeDownloadCardSkeleton key={i} />)}
      </div>
    );
  }

  if (rules.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.02] p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-white/[0.04]">
            <HugeiconsIcon icon={RssIcon} size={24} className="text-white/15" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white/50 mb-1">
              {i18n._(msg`downloads.noRulesHint`)}
            </p>
          </div>
          <Button onClick={onSwitchToSearch} variant="ghost" className="shrink-0 text-[12px]">
            {i18n._(msg`autoDownload.goToSearch`)}
          </Button>
        </div>
      </div>
    );
  }

  const sortLabels: Record<SortKey, string> = {
    activity: i18n._(msg`downloads.sort.activity`),
    name: i18n._(msg`downloads.sort.name`),
    progress: i18n._(msg`downloads.sort.progress`),
    created: i18n._(msg`downloads.sort.created`),
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[280px]">
          <HugeiconsIcon icon={Search01Icon} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={i18n._(msg`autoDownload.searchDownloads`)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white/[0.03] text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:bg-white/[0.05] transition-colors"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.03] text-[11px] font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={ArrowUpDownIcon} size={12} />
            {sortLabels[sort]}
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg bg-[#1a1a1e] py-1 shadow-xl">
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setSort(key); setSortMenuOpen(false); }}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer',
                      sort === key ? 'text-[#e88faa] bg-white/[0.04]' : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]',
                    )}
                  >
                    {sortLabels[key]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {(rules.length > 0 || miscDownloads.length > 0) && (
        <div className="flex items-center gap-3 mb-3 text-[11px] text-white/20 flex-wrap">
          <span><b className="text-white/40 font-medium">{rules.length}</b> {i18n._(msg`downloads.summary.subscribed`)}</span>
          <span className="text-white/10">·</span>
          <span>
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-[#4ade80] mr-1.5 align-middle" />
            <b className="text-white/40 font-medium">{stats.downloadingCount}</b> {i18n._(msg`downloads.summary.downloading`)}
          </span>
          {stats.speed > 0 && (
            <>
              <span className="text-white/10">·</span>
              <span className="tabular-nums"><b className="text-white/40 font-medium">{formatBytes(stats.speed)}/s</b></span>
            </>
          )}
          <span className="text-white/10">·</span>
          <span className="tabular-nums"><b className="text-white/40 font-medium">{formatBytes(stats.storedBytes)}</b> {i18n._(msg`downloads.summary.stored`)}</span>
        </div>
      )}

      {query.trim() && sorted.length === 0 && (
        <p className="text-[12px] text-white/30 mb-3">{i18n._(msg`downloads.searchEmpty`).replace('{query}', query)}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {sorted.map((item) => (
          <LibraryCard
            key={item.rule.id}
            item={item}
            onEdit={() => setSelectedRuleId(item.rule.id)}
          />
        ))}
        <MiscDownloadsSection
          downloads={miscDownloads}
          onDelete={(gid) => miscDeleteMutation.mutate(gid)}
        />
      </div>

      {selectedRule && (
        <RuleEditorModal
          rule={selectedRule}
          feed={selectedFeed}
          open={!!selectedRuleId}
          onClose={() => setSelectedRuleId(null)}
        />
      )}
    </>
  );
}

function LibraryCard({ item, onEdit }: { item: LibraryItem; onEdit: () => void }) {
  const { i18n } = useLingui();
  const { rule, group, feed } = item;
  const { coverUrl } = useAnimeCover(rule.bangumi_id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(rule.id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const mode: CardMode = deriveCardMode(group, rule);
  const eps = deriveEpsForExpand(group, mode);

  const refreshMutation = useMutation({
    mutationFn: () => (feed ? rssFeedApi.refresh(feed.id) : Promise.resolve()),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: () => ruleApi.update(rule.id, { enabled: rule.enabled === 1 ? 0 : 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutationTarget = useMutation({
    mutationFn: async () => {
      await ruleApi.delete(rule.id);
      if (feed) await rssFeedApi.delete(feed.id).catch(() => {});
    },
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.pause(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.resume(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteDownloadMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Stats by mode
  const percent = deriveGroupPercent(group);
  const speed = group?.downloads.reduce((s, d) => s + d.speed_bytes, 0) ?? 0;
  const downloaded = group?.downloads.reduce((s, d) => s + d.completed_bytes, 0) ?? 0;
  const total = group?.downloads.reduce((s, d) => s + d.total_bytes, 0) ?? 0;
  const remaining = Math.max(0, total - downloaded);
  const etaSeconds = speed > 0 ? Math.round(remaining / speed) : 0;

  const headerActions = (
    <>
      <button
        type="button"
        onClick={onEdit}
        aria-label={i18n._(msg`ruleEditor.openEditor`)}
        className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-white/20 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <HugeiconsIcon icon={Edit02Icon} size={12} />
      </button>
      <CardMenu
        enabled={rule.enabled === 1}
        bangumiId={rule.bangumi_id}
        feedUrl={feed?.url ?? ''}
        onToggleEnabled={() => toggleEnabledMutation.mutate()}
        onRefresh={() => refreshMutation.mutate()}
        onOpenAnime={() => {
          if (rule.bangumi_id) navigate({ to: '/anime/$id', params: { id: String(rule.bangumi_id) } });
        }}
        onCopyRssUrl={() => toast.success(i18n._(msg`downloads.menu.copied`))}
        onDelete={() => {
          if (window.confirm(i18n._(msg`downloads.confirm.delete`))) deleteMutationTarget.mutate();
        }}
      />
    </>
  );

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={rule.name}
      subChips={ruleSubChips(rule)}
      stats={{
        mode,
        percent,
        speedBytes: mode === 'downloading' ? speed : undefined,
        downloadedBytes: mode === 'downloading' ? downloaded : undefined,
        totalBytes: mode === 'completed' ? total : mode === 'downloading' ? total : undefined,
        etaSeconds: mode === 'downloading' ? etaSeconds : undefined,
        activeCount: mode === 'downloading'
          ? (group?.downloads ?? []).filter((d) =>
              d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
            ).length
          : undefined,
        episodeCount: rule.bangumi_id ? undefined : undefined,  // not fetched here
        completedCount: mode === 'completed' ? (group?.complete_count ?? 0) : undefined,
        completedAtRelative: mode === 'completed' && eps[0]?.created_at
          ? formatRelative(eps[0].created_at)
          : undefined,
        nextFetchRelative: mode === 'subscribed' ? deriveNextFetch(feed) : undefined,
        live: mode === 'downloading' || (mode === 'subscribed' && rule.enabled === 1),
      }}
      expanded={expanded}
      onToggle={() => toggle(rule.id)}
      headerActions={headerActions}
    >
      {mode === 'subscribed' && (
        <EpisodeRowPending
          nextFetchRelative={deriveNextFetch(feed) ?? '—'}
          onRefresh={() => refreshMutation.mutate()}
        />
      )}
      {mode === 'downloading' && eps.map((d) => (
        <EpisodeRowActive
          key={d.gid}
          {...toActiveProps(d)}
          onPause={(gid) => pauseMutation.mutate(gid)}
          onResume={(gid) => resumeMutation.mutate(gid)}
          onDelete={(gid) => deleteDownloadMutation.mutate(gid)}
        />
      ))}
      {mode === 'completed' && eps.map((d) => (
        <EpisodeRowComplete
          key={d.gid}
          {...toCompleteProps(d)}
          onPlay={() => {
            if (rule.bangumi_id) navigate({ to: '/anime/$id', params: { id: String(rule.bangumi_id) } });
          }}
          onDelete={(gid) => deleteDownloadMutation.mutate(gid)}
        />
      ))}
    </AnimeDownloadCard>
  );
}
```

- [ ] **Step 4: Run — GREEN**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- LibraryTab
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/downloads/LibraryTab.tsx web/src/pages/downloads/LibraryTab.test.tsx
git commit -m "feat(downloads): add LibraryTab merged view

Renders one AnimeDownloadCard per rule with mode-driven content (downloading /
subscribed / completed). Top bar has search + sort + aggregate summary.
MiscDownloadsSection at the bottom. Replaces the three per-status tabs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: i18n — add 17 new keys across 6 locales

**Files:**
- Modify: `web/src/locales/{en,ja,ko,zh-CN,zh-HK,zh-TW}/messages.po`

- [ ] **Step 1: Append keys to each locale**

For each of the 6 locale files, append (use Edit to add at end, before the final newline):

```po
msgid "downloads.tab.library"
msgstr "<TRANSLATION>"

msgid "downloads.sort.activity"
msgstr "<TRANSLATION>"

msgid "downloads.sort.name"
msgstr "<TRANSLATION>"

msgid "downloads.sort.progress"
msgstr "<TRANSLATION>"

msgid "downloads.sort.created"
msgstr "<TRANSLATION>"

msgid "downloads.menu.more"
msgstr "<TRANSLATION>"

msgid "downloads.menu.autoDownload"
msgstr "<TRANSLATION>"

msgid "downloads.menu.on"
msgstr "<TRANSLATION>"

msgid "downloads.menu.off"
msgstr "<TRANSLATION>"

msgid "downloads.menu.refresh"
msgstr "<TRANSLATION>"

msgid "downloads.menu.openAnime"
msgstr "<TRANSLATION>"

msgid "downloads.menu.copyRSS"
msgstr "<TRANSLATION>"

msgid "downloads.menu.copied"
msgstr "<TRANSLATION>"

msgid "downloads.menu.delete"
msgstr "<TRANSLATION>"

msgid "downloads.confirm.delete"
msgstr "<TRANSLATION>"

msgid "downloads.autoDisabled"
msgstr "<TRANSLATION>"

msgid "downloads.summary.subscribed"
msgstr "<TRANSLATION>"

msgid "downloads.summary.downloading"
msgstr "<TRANSLATION>"

msgid "downloads.summary.stored"
msgstr "<TRANSLATION>"

msgid "downloads.noRulesHint"
msgstr "<TRANSLATION>"

msgid "downloads.searchEmpty"
msgstr "<TRANSLATION>"
```

Translation table (pick the right column per locale):

| Key | EN | JA | KO | zh-CN | zh-HK | zh-TW |
|-----|----|----|----|----|----|----|
| `tab.library` | Library | ライブラリ | 라이브러리 | 库 | 庫 | 庫 |
| `sort.activity` | Recent activity | 最近の活動 | 최근 활동 | 最近活动 | 最近活動 | 最近活動 |
| `sort.name` | Name | 名前 | 이름 | 名称 | 名稱 | 名稱 |
| `sort.progress` | Progress | 進捗 | 진행도 | 进度 | 下載進度 | 下載進度 |
| `sort.created` | Subscription time | 購読日 | 구독일 | 订阅时间 | 訂閱時間 | 訂閱時間 |
| `menu.more` | More | もっと見る | 더 보기 | 更多 | 更多 | 更多 |
| `menu.autoDownload` | Auto download | 自動ダウンロード | 자동 다운로드 | 自动下载 | 自動下載 | 自動下載 |
| `menu.on` | On | ON | ON | 开 | 開咗 | 開啟 |
| `menu.off` | Off | OFF | OFF | 关 | 停咗 | 關閉 |
| `menu.refresh` | Refresh now | 今すぐ更新 | 지금 새로고침 | 立即刷新 | 即刻刷新 | 立即重新整理 |
| `menu.openAnime` | Open anime page | アニメページを開く | 애니메 페이지 열기 | 打开动画页 | 喺 Anime 頁面打開 | 開啟動畫頁面 |
| `menu.copyRSS` | Copy RSS URL | RSS URL をコピー | RSS URL 복사 | 复制 RSS URL | 複製 RSS URL | 複製 RSS URL |
| `menu.copied` | Copied | コピーしました | 복사됨 | 已复制 | 已複製 | 已複製 |
| `menu.delete` | Delete subscription | 購読を削除 | 구독 삭제 | 删除订阅 | 刪除訂閱 | 刪除訂閱 |
| `confirm.delete` | Delete this subscription? The feed will also be removed. | この購読を削除しますか？フィードも削除されます。 | 이 구독을 삭제할까요? 피드도 함께 삭제됩니다. | 确定删除此订阅？Feed 也会一起删除。 | 確定刪除呢個訂閱？連 feed 一齊刪。 | 確定刪除此訂閱？Feed 也會一併刪除。 |
| `autoDisabled` | Auto-download off | 自動ダウンロード停止 | 자동 다운로드 꺼짐 | 自动下载已停用 | 自動下載停咗 | 自動下載已停用 |
| `summary.subscribed` | subscribed | 購読中 | 구독 중 | 订阅 | 訂閱 | 訂閱 |
| `summary.downloading` | downloading | ダウンロード中 | 다운로드 중 | 下载中 | 下載緊 | 下載中 |
| `summary.stored` | stored | 保存 | 저장됨 | 已存 | 儲咗 | 已儲存 |
| `noRulesHint` | No subscriptions yet — go search to add your first | 購読がありません — 検索から追加してください | 구독이 없습니다 — 검색에서 추가하세요 | 暂无订阅，去搜索添加第一个 | 未有訂閱，去搜尋加第一個 | 尚無訂閱，去搜尋加入第一個 |
| `searchEmpty` | No anime matches "{query}" | "{query}" に一致するアニメなし | "{query}"에 일치하는 애니메가 없습니다 | 没有匹配「{query}」的动画 | 冇匹配「{query}」嘅動畫 | 沒有匹配「{query}」的動畫 |

Use Edit tool on each `.po` file — append the block with translations filled in.

- [ ] **Step 2: Compile**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run i18n:compile 2>&1 | tail -3
```

Expected: "Done in <time>". If compile fails, re-check for missing `msgid`/`msgstr` pairs.

Do NOT run `bun run i18n:extract` — it fails due to pre-existing JSX errors in `AnimeDetailPage.tsx`.

- [ ] **Step 3: Verify count**

```bash
for locale in en ja ko zh-CN zh-HK zh-TW; do
  count=$(grep -c "^msgid \"downloads\." "web/src/locales/$locale/messages.po")
  echo "$locale: $count downloads.* keys"
done
```

Expected: each locale has at least 21 keys (previous + 21 new). The exact previous count depends on history, but each locale should show the same number.

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/locales/
git commit -m "i18n(downloads): add merged-view strings for 6 locales

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Collapse 4 tabs in `DownloadsPage.tsx`

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Inspect current structure**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
grep -n "type Tab = \|const tab: Tab\|setTab\|'subscriptions'\|'downloading'\|'completed'\|<SubscribedTab\|<DownloadingTab\|<CompletedTab" web/src/pages/DownloadsPage.tsx
```

This maps every callsite.

- [ ] **Step 2: Edit the Tab type + tab buttons + render**

Change the `Tab` type from:

```ts
type Tab = 'search' | 'subscriptions' | 'downloading' | 'completed';
```

to:

```ts
type Tab = 'search' | 'library';
```

In the tabs array (around line 415), replace the three `subscriptions / downloading / completed` entries with one `library` entry:

```ts
const tabs: { key: Tab; label: string; icon: typeof Search01Icon }[] = [
  { key: 'search', label: i18n._(msg`autoDownload.tab.search`), icon: Search01Icon },
  { key: 'library', label: i18n._(msg`downloads.tab.library`), icon: RssIcon },
];
```

Replace the three `{tab === '...' && <XTab ... />}` branches with a single one:

```tsx
{tab === 'library' && (
  <LibraryTab
    rules={rules}
    feeds={feeds}
    groups={groups}
    miscDownloads={miscDownloads}
    isLoading={groupsLoading}
    onSwitchToSearch={() => setTab('search')}
  />
)}
```

where `miscDownloads` is the useMemo already computed. If two separate memos existed (`miscDownloads` for downloading, `miscCompletedDownloads` for completed), **concatenate them**:

```ts
const miscDownloads = useMemo(
  () => allDownloads.filter((d) => !d.rule_id || d.rule_id === ''),
  [allDownloads],
);
```

Delete the now-unused `miscCompletedDownloads` memo and `activeDownloads` / `completedDownloads` memos if no other consumer.

Add the import:

```tsx
import LibraryTab from './downloads/LibraryTab';
```

Remove imports for the three deleted tabs:

```tsx
// delete these:
import SubscribedTab from './downloads/SubscribedTab';
import DownloadingTab from './downloads/DownloadingTab';
import CompletedTab from './downloads/CompletedTab';
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run typecheck 2>&1 | grep -v "AnimeDetailPage" | head -20
```

Expected: no new errors (pre-existing AnimeDetailPage unrelated).

- [ ] **Step 4: Run all downloads-related tests**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- downloads 2>&1 | tail -10
```

Expected: all downloads tests pass — the three old-tab tests will still pass too until Task 9 deletes them.

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/DownloadsPage.tsx
git commit -m "refactor(downloads): collapse 4 tabs into search+library

Wires the new LibraryTab. Old SubscribedTab/DownloadingTab/CompletedTab
callsites removed; their imports will go away in Task 9 along with the
tab files themselves.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Delete legacy tab files

**Files:**
- Delete: `web/src/pages/downloads/SubscribedTab.tsx` + `.test.tsx`
- Delete: `web/src/pages/downloads/DownloadingTab.tsx` + `.test.tsx`
- Delete: `web/src/pages/downloads/CompletedTab.tsx` + `.test.tsx`

- [ ] **Step 1: Delete files**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
rm web/src/pages/downloads/SubscribedTab.tsx web/src/pages/downloads/SubscribedTab.test.tsx
rm web/src/pages/downloads/DownloadingTab.tsx web/src/pages/downloads/DownloadingTab.test.tsx
rm web/src/pages/downloads/CompletedTab.tsx web/src/pages/downloads/CompletedTab.test.tsx
```

- [ ] **Step 2: grep to confirm no dangling references**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
grep -rn "SubscribedTab\|DownloadingTab\|CompletedTab" web/src web/e2e 2>&1 | head -10
```

Expected: empty (or only the `data-testid` string literal in the unified e2e spec — that's fine).

If the e2e spec `web/e2e/downloads-unified.spec.ts` references `tab=subscriptions|downloading|completed` URL params, update them to `tab=library`. Run:

```bash
grep -n "tab=" web/e2e/downloads-unified.spec.ts
```

Edit each occurrence to use `tab=library`.

- [ ] **Step 3: Run full check**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run typecheck 2>&1 | grep -v "AnimeDetailPage" | head -10
bun run test -- downloads 2>&1 | tail -10
```

Expected: no new typecheck errors. Test count drops by (2 + 2 + 2 + whatever was in the deleted test files) — but all remaining should pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add -A
git commit -m "refactor(downloads): delete legacy SubscribedTab/DownloadingTab/CompletedTab

Superseded by LibraryTab. E2E spec updated to navigate via ?tab=library.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wrap-up

- [ ] **Step 1: Full quality gate**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run check:all 2>&1 | tail -20
```

Pre-existing failures in `AnimeDetailPage.tsx`, `AppSidebar.test.tsx`, `HomePage.test.tsx`, `WatchPage.test.tsx`, `image-fallbacks.test.tsx`, `media-surfaces.test.tsx`, `__root.test.tsx`, `danmaku-worker.test.ts` are OK. No new failures.

- [ ] **Step 2: Biome autofix if needed**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run lint 2>&1 | tail -10
# If new issues, auto-fix:
bun run lint:fix
bun run format
```

- [ ] **Step 3: Run downloads tests one more time**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web
bun run test -- downloads 2>&1 | tail -8
```

All green.

- [ ] **Step 4: Draft PR body**

```bash
cat > /tmp/pr-merged-view-body.md <<'EOF'
## Summary

Collapses the three download-management tabs (已追番 / 下載緊 / 已完成) into a single **庫** tab with one mode-driven card per rule.

### What changed

- **Tab count:** `Tab = 'search' | 'subscriptions' | 'downloading' | 'completed'` → `Tab = 'search' | 'library'`.
- **LibraryTab** renders one `AnimeDownloadCard` per rule. Each card picks its mode automatically:
  - Has active eps → `downloading`
  - Rule enabled + no active eps → `subscribed`
  - Otherwise → `completed`
- **CardMenu** dropdown: auto-download toggle, refresh feed, open anime page, copy RSS URL, delete subscription (danger).
- **Sort** dropdown replaces status filtering: Recent activity (default) · Name · Progress · Subscription time.
- **Visual cleanup:**
  - Drop green glow on progress bar
  - Drop halo on live dot
  - Completed bar uses neutral 14% white (not dim green)
- **MiscDownloadsSection** collapses the previous two buckets into one; each row infers its own status.

### Deleted

- `SubscribedTab.tsx`, `DownloadingTab.tsx`, `CompletedTab.tsx` and their tests.

### Added

- `LibraryTab.tsx` + test
- `CardMenu.tsx` + test
- `deriveCardMode`, `deriveEpsForExpand`, `sortRulesBy` in `adapters.ts` + tests
- 21 i18n keys across 6 locales

## Test plan

- [x] `bun run test -- downloads` — all pass
- [x] `bun run check:all` — no new failures
- [ ] `bun run test:e2e e2e/downloads-unified.spec.ts` against running dev server
- [ ] Manual: check that `尖帽子的魔法工房` with 3 active + 2 complete eps shows as a single card in `downloading` mode; expand shows only 3 active rows sorted by ETA
- [ ] Manual: toggle `自動下載` via `⋯` menu — rule persists, card mode changes to `completed` when disabled
- [ ] Manual: delete a subscription via `⋯` menu — rule + feed removed, confirm dialog shown

## Spec & plan

- Spec: `docs/superpowers/specs/2026-04-18-downloads-merged-view-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-downloads-merged-view.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
echo "PR body at /tmp/pr-merged-view-body.md"
```

- [ ] **Step 5: Final verification**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git log --oneline main..HEAD
wc -l web/src/pages/downloads/*.tsx web/src/components/downloads/*.tsx web/src/components/downloads/episode-rows/*.tsx
```

Expected commit count: ~10 (one per task). Expected file counts: `LibraryTab.tsx` ≈ 350 lines, deleted tabs files gone.

---

## Success Criteria (from spec)

- [ ] `Tab` type in `DownloadsPage.tsx` is `'search' | 'library'` (2 values)
- [ ] Clicking 庫 renders one `AnimeDownloadCard` per rule, one `MiscDownloadsSection` at the bottom
- [ ] Card mode is derived automatically; a rule with mixed ep states appears exactly once
- [ ] `✎` button opens `RuleEditorModal`; `⋯` opens `CardMenu` with 6 items; `▾` toggles expand
- [ ] Progress bars have no `box-shadow`; live dot has no halo
- [ ] Completed mode uses `rgba(255,255,255,0.14)` for its hairline
- [ ] Sort dropdown defaults to `最近活動`; dormant rules sink; active cards float to top
- [ ] Search input filters cards in real time across title + sub-chips + episode filenames
- [ ] 6 locales include all new i18n keys
- [ ] Deleted `SubscribedTab.tsx`, `DownloadingTab.tsx`, `CompletedTab.tsx` and their tests
- [ ] `LibraryTab.test.tsx` covers: mode derivation per rule shape, mixed-status card renders once, search filter
