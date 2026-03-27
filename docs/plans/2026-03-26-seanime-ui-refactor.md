# Seanime-Style Web UI Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the web UI into an always-dark, Seanime-style media shell with redesigned home, detail, watch, and responsive navigation while preserving existing routes and backend contracts.

**Architecture:** This is a presentation-layer refactor centered on the shell and shared media surfaces. We will keep TanStack Router and current query flows intact, build a stronger set of reusable UI surfaces, and recompose pages around them. Responsive behavior is treated as a first-class redesign concern rather than a final CSS cleanup.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS v4, Motion, Vitest, Testing Library

---

### Task 1: Lock The App To Always-Dark Mode

**Files:**
- Modify: `web/src/components/ThemeProvider.tsx`
- Modify: `web/src/styles/theme.css`
- Modify: `web/src/test/test-utils.tsx`
- Create: `web/src/components/ThemeProvider.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render } from '@/test/test-utils';

test('forces the document root into dark mode on mount', () => {
  localStorage.setItem('ui-theme', 'light');
  render(<div>theme</div>);
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.documentElement.classList.contains('light')).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/components/ThemeProvider.test.tsx`
Expected: FAIL because the provider still respects `light` and `system`

**Step 3: Write minimal implementation**

Update the provider so it always applies `dark` to `document.documentElement`, remove the system/light branching, and move the `--mm-*` token definitions so they exist without depending on `.dark`.

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/components/ThemeProvider.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/components/ThemeProvider.tsx web/src/styles/theme.css web/src/test/test-utils.tsx web/src/components/ThemeProvider.test.tsx
git commit -m "refactor(web): lock app shell to dark theme"
```

### Task 2: Redesign The Global Shell And Desktop Navigation

**Files:**
- Modify: `web/src/routes/__root.tsx`
- Modify: `web/src/components/AppSidebar.tsx`
- Modify: `web/src/components/TopNav.tsx`
- Modify: `web/src/styles/global.css`
- Create: `web/src/routes/__root.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';

test('renders the desktop shell with labeled navigation', () => {
  render(<div data-testid="shell-probe" />);
  expect(screen.queryByText(/home/i)).toBeInTheDocument();
  expect(screen.queryByText(/schedule/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/routes/__root.test.tsx`
Expected: FAIL because the current shell uses a narrow icon rail and the test harness has no labeled shell assertions yet

**Step 3: Write minimal implementation**

Refactor the root layout into a denser app shell:
- wider sidebar with icon + label rows
- richer active state treatment
- top context bar with darker layered backdrop
- content frame spacing that feels closer to a desktop media app

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/routes/__root.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/routes/__root.tsx web/src/components/AppSidebar.tsx web/src/components/TopNav.tsx web/src/styles/global.css web/src/routes/__root.test.tsx
git commit -m "refactor(web): rebuild global app shell"
```

### Task 3: Add Responsive Shell Adaptation For Mobile And Tablet

**Files:**
- Modify: `web/src/routes/__root.tsx`
- Modify: `web/src/components/AppSidebar.tsx`
- Modify: `web/src/components/TopNav.tsx`
- Modify: `web/src/hooks/use-mobile.ts`
- Create: `web/src/components/AppSidebar.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';

test('does not render the permanent desktop rail on mobile', () => {
  window.innerWidth = 390;
  window.dispatchEvent(new Event('resize'));
  render(<div>shell</div>);
  expect(screen.queryByText(/downloads/i)).not.toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/components/AppSidebar.test.tsx`
Expected: FAIL because the fixed rail remains part of the mobile shell

**Step 3: Write minimal implementation**

Adapt the shell per viewport:
- desktop keeps the labeled rail
- tablet/mobile moves to overlay or compact touch navigation
- main content no longer reserves fixed left margin on narrow screens

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/components/AppSidebar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/routes/__root.tsx web/src/components/AppSidebar.tsx web/src/components/TopNav.tsx web/src/hooks/use-mobile.ts web/src/components/AppSidebar.test.tsx
git commit -m "refactor(web): adapt shell for small screens"
```

### Task 4: Build Shared Seanime-Style Media Surfaces

**Files:**
- Modify: `web/src/components/HeroBanner.tsx`
- Modify: `web/src/components/AnimeCard.tsx`
- Modify: `web/src/components/AnimeRow.tsx`
- Create: `web/src/components/ContinueWatchingCard.tsx`
- Create: `web/src/components/EpisodeListItem.tsx`
- Create: `web/src/components/media-surfaces.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';
import { AnimeCard } from '@/components/AnimeCard';

test('anime card exposes title and metadata in a denser media surface', () => {
  render(<AnimeCard anime={{ bangumi_id: 1, title: 'Test', score: 8.2, episode_count: 12 }} />);
  expect(screen.getByText('Test')).toBeInTheDocument();
  expect(screen.getByText(/12/)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/components/media-surfaces.test.tsx`
Expected: FAIL because the new shared surfaces and richer structure do not exist yet

**Step 3: Write minimal implementation**

Create a small media-surface system:
- richer hero treatment
- denser poster card composition
- session-style continue-watching card
- reusable episode list item for detail/watch pages

Avoid cloning Seanime directly; focus on density, hierarchy, and atmosphere.

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/components/media-surfaces.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/components/HeroBanner.tsx web/src/components/AnimeCard.tsx web/src/components/AnimeRow.tsx web/src/components/ContinueWatchingCard.tsx web/src/components/EpisodeListItem.tsx web/src/components/media-surfaces.test.tsx
git commit -m "feat(web): add shared media surfaces"
```

### Task 5: Recompose The Home Page As A Media Dashboard

**Files:**
- Modify: `web/src/pages/HomePage.tsx`
- Reuse: `web/src/components/HeroBanner.tsx`
- Reuse: `web/src/components/AnimeRow.tsx`
- Reuse: `web/src/components/ContinueWatchingCard.tsx`
- Create: `web/src/pages/HomePage.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';
import { HomePage } from '@/pages/HomePage';

test('home page shows continue watching and trending as distinct dashboard sections', () => {
  render(<HomePage />);
  expect(screen.getByText(/繼續觀看/)).toBeInTheDocument();
  expect(screen.getByText(/熱門動畫/)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/pages/HomePage.test.tsx`
Expected: FAIL because the test scaffolding for mocked dashboard composition is not in place yet

**Step 3: Write minimal implementation**

Rebuild home around the new shell:
- richer hero
- stronger continue-watching session rail
- compact airing blocks
- more intentional discover/trending composition
- optional side context on larger screens

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/pages/HomePage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx
git commit -m "refactor(web): redesign home dashboard"
```

### Task 6: Rebuild The Anime Detail Page Around A Cinematic Header

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`
- Reuse: `web/src/components/EpisodeListItem.tsx`
- Create: `web/src/pages/AnimeDetailPage.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';

test('detail page presents title, synopsis, and episode list within a structured landing page', () => {
  render(<div />);
  expect(screen.queryByText(/簡介/)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/pages/AnimeDetailPage.test.tsx`
Expected: FAIL because the test fixture and redesigned structure do not exist yet

**Step 3: Write minimal implementation**

Refactor the detail page so it has:
- stronger banner scrim and title anchoring
- poster, tags, stats, and actions grouped as one header unit
- tighter synopsis and metadata layout
- episode list that feels like a watch queue

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/pages/AnimeDetailPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx web/src/pages/AnimeDetailPage.test.tsx
git commit -m "refactor(web): redesign anime detail page"
```

### Task 7: Turn Watch Into A Session Shell

**Files:**
- Modify: `web/src/pages/WatchPage.tsx`
- Modify: `web/src/components/VideoPlayer.tsx`
- Reuse: `web/src/components/EpisodeListItem.tsx`
- Create: `web/src/pages/WatchPage.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';

test('watch page includes player context beyond the video surface', () => {
  render(<div />);
  expect(screen.queryByText(/彈幕/)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/pages/WatchPage.test.tsx`
Expected: FAIL because the page currently exposes only the player and a small metadata line

**Step 3: Write minimal implementation**

Redesign the watch page into a session layout:
- integrated player frame
- episode/context panel near the player
- stronger metadata, subtitle, and danmaku framing
- styling that makes Video.js feel like part of the app shell

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/pages/WatchPage.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/pages/WatchPage.tsx web/src/components/VideoPlayer.tsx web/src/pages/WatchPage.test.tsx
git commit -m "refactor(web): redesign watch session page"
```

### Task 8: Harden Cover/Banner Fallbacks And Empty States

**Files:**
- Modify: `web/src/components/HeroBanner.tsx`
- Modify: `web/src/components/AnimeCard.tsx`
- Modify: `web/src/components/AnimeRow.tsx`
- Modify: `web/src/pages/SchedulePage.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Create: `web/src/components/image-fallbacks.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@/test/test-utils';
import { AnimeRow } from '@/components/AnimeRow';

test('anime row still renders a deliberate poster surface when the remote image is missing', () => {
  render(<AnimeRow anime={{ bangumi_id: 1, title: 'Fallback', cover_image: '', score: 0, episode_count: 0 }} />);
  expect(screen.getByText('Fallback')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run src/components/image-fallbacks.test.tsx`
Expected: FAIL if the richer fallback treatment has not been implemented

**Step 3: Write minimal implementation**

Add resilient fallback behavior:
- treat broken/empty images as designed surfaces, not browser error boxes
- keep atmosphere intact when covers fail
- improve empty states so sparse data still looks intentional

**Step 4: Run test to verify it passes**

Run: `cd web && bun vitest run src/components/image-fallbacks.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add web/src/components/HeroBanner.tsx web/src/components/AnimeCard.tsx web/src/components/AnimeRow.tsx web/src/pages/SchedulePage.tsx web/src/pages/HomePage.tsx web/src/components/image-fallbacks.test.tsx
git commit -m "fix(web): harden media artwork fallbacks"
```

### Task 9: Verify Responsive Layouts And Run Full Web Checks

**Files:**
- Modify as needed based on failures from verification
- Test: `web/src/**/*.{test,spec}.{ts,tsx}`

**Step 1: Write the failing test**

```tsx
test('schedule page does not render seven equal micro-columns on narrow screens', () => {
  expect(true).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `cd web && bun vitest run`
Expected: FAIL because the placeholder responsive regression test is intentionally red

**Step 3: Write minimal implementation**

Replace the placeholder with real responsive assertions and adjust `SchedulePage.tsx` plus any shell/page CSS needed so mobile uses stacked or sectional layouts instead of desktop column math.

**Step 4: Run test to verify it passes**

Run:
- `cd web && bun vitest run`
- `cd web && bun run typecheck`
- `cd web && bun run lint`
- `cd web && bun run build`

Expected:
- tests pass
- typecheck exits 0
- lint exits 0
- build exits 0

**Step 5: Commit**

```bash
git add web/src web/package.json web/bun.lock
git commit -m "refactor(web): finish Seanime-style UI pass"
```
