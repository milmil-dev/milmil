# Downloads — Unified Anime Cards Design

**Date:** 2026-04-17
**Scope:** Redesign the Downloads page (`DownloadsPage.tsx`) so that 「已追番 / 下載緊 / 已完成」three tabs share a single visual language — one card per anime, episode list on expand.

## Context

The current Downloads page (`web/src/pages/DownloadsPage.tsx`, ~3800 lines) has three tabs with three different visual languages:

- **已追番** (Subscribed) — grid of `SubscriptionAnimeCard`s with cover art
- **下載緊** (Downloading) — flat list of `DownloadCard` rows with full-width progress bars that visually float between rows, a circular percentage ring redundant with the linear bar, and no grouping by anime
- **已完成** (Completed) — same `DownloadCard` rows, status = complete

User pain points observed in-session:

1. Progress bars look like section dividers, not attached to their row.
2. Circular ring + linear bar encode the same number twice.
3. No visual grouping — three episodes of the same anime appear as three independent jobs.
4. Top-right action icons (pause/refresh/select/delete) lack labels; destructive (delete) and benign (refresh) have equal weight.
5. No cover art in download list — scanning is slow.
6. Visual language between tabs is inconsistent despite all three showing "anime → episodes" structure.

## Design Principle

**One card = one anime, across all three tabs.** Group key is `rule_id` (the backend already groups via `DownloadGroup`). Tab determines which cards appear and what the expanded episode list shows. Downloads without a `rule_id` (manual magnet adds) collect into a per-tab "其他下載" section at the bottom.

## 1. Information Architecture

| Tab | Cards included | Expanded list content |
|-----|---------------|------------------------|
| 已追番 | All `download_rules` (enabled + disabled) | Up to 10 most-recent triggered downloads + a slim "管理規則" button opening `RuleEditorModal` |
| 下載緊 | Groups where `active_count > 0` | Active episode rows (live progress bar, speed, ETA) |
| 已完成 | Groups where `complete_count > 0` | Completed episode rows (size, completed-time, Play, Delete) |

A group may appear in both 下載緊 and 已完成 if it has mixed statuses — no deduplication. Each tab only renders episode rows matching its status filter.

**Search** filters cards by title (from rule name + bangumi_id → anime title) and by episode title text. A card hides entirely when no children match.

**Sort** applies at group level. Each tab exposes its own relevant options:

| Tab | Sort options |
|-----|--------------|
| 已追番 | `latest` (most-recent trigger), `name`, `progress` |
| 下載緊 | `eta` (soonest completion first — default), `speed` desc, `progress` desc, `name` |
| 已完成 | `completed-time` desc (default), `size` desc, `name` |

**Top-level aggregate line** varies per tab:
- 已追番: "N 個規則追番緊"
- 下載緊: "N downloading · X MB/s · ~Y min"
- 已完成: "N eps · X GB"

## 2. Visual Design — The Unified Card

Card design is the "Unified" variant picked in brainstorm: parent header and episode list live inside **one card** with a hairline divider between them. Cover anchors the left edge, title/meta span the middle column, big percentage + expand toggle on the right.

### Card Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ╔═══╗   [chip] Subgroup · codec                            72%│
│  ║   ║   Anime Title                                  Collapse▾│
│  ║cov║   ● 3 downloading · 9.0 MB/s · 4.3/6.1 GB · ~4 min      │
│  ╚═══╝   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬            │  <- 2px progress
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │  <- 1px hairline (6% opacity)
│                                                                  │
│   EP 03    1.8 / 1.9 GB · 4.9 MB/s  ▬▬▬▬▬▬▬▬▬▬▬▬  12s    97%  │
│   EP 02    1.5 / 2.2 GB · 1.9 MB/s  ▬▬▬▬▬▬▬▬      6m     71%  │
│   EP 01    1.0 / 2.0 GB · 2.2 MB/s  ▬▬▬▬▬         9m     48%  │
└─────────────────────────────────────────────────────────────────┘
```

### Visual Tokens

| Element | Spec |
|---------|------|
| Card background | `rgba(255,255,255,0.02)` → hover `0.035` |
| Card border | `1px rgba(255,255,255,0.06)`, radius `14px` |
| Cover | 92×130, `border-radius: 8px`, shadow `0 4px 18px rgba(0,0,0,0.4)` |
| Title | `15px 600`, letter-spacing `-0.01em`, `rgba(255,255,255,0.92)` |
| Sub chips | `10px 500`, `rgba(255,255,255,0.04)` bg, `4px` radius |
| Aggregate progress bar | `height 2px`, `green linear-gradient` + subtle glow (`box-shadow 0 0 8px rgba(74,222,128,0.35)`) |
| Big percentage | `20px 300` with number `500` (two-weight): `72` = 500, `%` = 300 |
| Hairline divider | `1px rgba(255,255,255,0.035)`, flush with card sides |
| Episode row | `grid-template-columns: 92px 1fr 80px 70px 50px` with `20px` gap, mirrors parent's column grid so EP number aligns under cover column, filename aligns under title column |
| Episode bar | `height 2px`, no glow, optional `pulse` animation when active |
| Live dot | `5px`, green, `animation: blink 1.6s infinite`, `0 0 0 3px rgba(74,222,128,0.35)` halo |

All numerical text uses `font-variant-numeric: tabular-nums` to prevent digit jitter.

Green (`#4ade80`) is reserved for progress + live state. Per project convention, no accent color on borders / focus rings / chips.

## 3. Component Breakdown

### New files

```
web/src/components/downloads/
├─ AnimeDownloadCard.tsx         — outer shell, grid, hover, expand anim
├─ AnimeCoverBlock.tsx           — cover 92×130 + placeholder fallback + shadow
├─ AnimeGroupHeader.tsx          — title + chips + stats + progress bar + big %
├─ AnimeEpisodeList.tsx          — hairline + padding + children slot + optional virtualization
├─ episode-rows/
│   ├─ EpisodeRow.Active.tsx     — live bar (pulse) + speed + ETA + hover actions
│   ├─ EpisodeRow.Complete.tsx   — size + completed-time + Play + Delete
│   ├─ EpisodeRow.Pending.tsx    — "等待中 · 下次 fetch 喺 18 min" (for 已追番 when rule has no recent matches)
│   └─ EpisodeRow.Misc.tsx       — manual download (no rule): filename + bar + delete
└─ MiscDownloadsSection.tsx      — bottom collapsible "其他下載"

web/src/pages/downloads/
├─ DownloadsPage.tsx             — shell: tabs + top bar (search/sort/aggregate) (~300 lines)
├─ SubscribedTab.tsx             — renders AnimeDownloadCard per rule
├─ DownloadingTab.tsx            — renders AnimeDownloadCard per active group
└─ CompletedTab.tsx              — renders AnimeDownloadCard per complete group
```

### Card API sketch

```tsx
<AnimeDownloadCard
  coverUrl={cover}                         // undefined → placeholder
  title={ruleName ?? fallbackFilename}
  subChips={['沸班亞馬製作組', 'AI2160p']}  // freely composable
  stats={{
    speed,           // bytes/s, undefined for completed
    downloaded,      // bytes
    total,           // bytes
    eta,             // seconds, undefined if not active
    live,            // boolean — toggles pulse dot
    percent,         // 0–100
    // one of: 'subscribed' | 'downloading' | 'completed'
    mode,
  }}
  headerActions={<RefreshFeedBtn /><DeleteBtn />}
  expanded={expanded}
  onToggle={() => toggleExpand(ruleId)}
>
  {episodes.map(ep => <EpisodeRow.Active {...ep} />)}
</AnimeDownloadCard>
```

The card is **dumb** — per-mode logic (which stats to show, what colour the big % is) lives in `AnimeGroupHeader` via `mode` switch. Tabs only compose `AnimeDownloadCard` + the right `EpisodeRow` children.

### Supporting hooks

```
web/src/hooks/useAnimeCover.ts       — wraps discoverApi.detail(bangumiId), staleTime 24h
web/src/store/downloads-ui.ts        — Zustand: { expandedGroupIds: Set<string>, ... }
```

Expand state is session-memory-only (no `localStorage`). Default rule: in 下載緊 tab auto-expand all active groups; in the other tabs everything starts collapsed.

## 4. Per-Tab Specifics

### 已追番 · Subscribed

- **Cards included:** every `download_rule` from `ruleApi.list()`, enabled + disabled.
- **Header stats:** `<live-dot if enabled> · 自動下載開咗 / 已停用 · 上次 fetch 12 min ago · 下次 ~18 min · N / M eps`
  - `N` = triggered downloads count; `M` = anime total episodes from bangumi (if known, else omit "/ M")
- **Progress bar:** filled percent = N/M when M known, else hidden.
- **Expand content:** up to 10 most-recent triggered downloads mixing statuses (Active/Complete rows); at the bottom a flush pill-button `[管理規則]` opening `RuleEditorModal`.
- **Empty state (rule with zero triggers):** single `EpisodeRow.Pending` row with text "未有 episode 匹配，下次 fetch 喺 X min 後" + inline refresh icon.
- **Sort options:** see §1 table.

### 下載緊 · Downloading

- **Cards included:** `groups.filter(g => g.active_count > 0)`.
- **Header stats:** `<live-dot> · N downloading · X MB/s · Y/Z GB · ~T min`
- **Progress bar:** aggregate % across all episodes in the group (sum completed / sum total).
- **Expand content:** only episodes with `status === 'active' | 'paused' | 'waiting'`. Sort: ETA asc (fastest-completing first).
- **Per-row actions:** hover reveals pause (when `active`) / resume (when `paused`) / delete; only one of pause/resume is visible based on status. Keyboard `Delete` on a focused row triggers delete with confirm.
- **Default expanded** in this tab.
- **Sort options:** see §1 table.

### 已完成 · Completed

- **Cards included:** `groups.filter(g => g.complete_count > 0)`.
- **Header stats:** `N eps · X GB · 完成 於 2h ago` (no live dot, no speed).
- **Progress bar:** hidden; replace with a dim-green hairline at 100% as completion indicator.
- **Expand content:** completed episodes; sort by completed-time desc. Each row shows filename, size, relative complete time, Play icon (opens player at that episode), Delete (soft confirm: delete record only / delete with files).
- **Default collapsed** — completed downloads are historical; user opens on demand.

### 其他下載 · Misc (all tabs)

Bottom of each tab, collapsed by default. Counter in label:

```
▸ 其他下載 (2)
```

Contains `EpisodeRow.Misc` for downloads with `rule_id = null`. Filtered by tab status: 下載緊 shows active/pending misc; 已完成 shows complete misc. Not shown in 已追番 (no "subscription" concept for manual adds).

### Shared top bar

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 Search downloads…]                                [⇅ Sort]  │
├─────────────────────────────────────────────────────────────────┤
│ <aggregate line>              [⏸ Pause all] [🔄 Refresh] [🗑]  │
└─────────────────────────────────────────────────────────────────┘
```

- Search is client-side over currently-loaded groups and their episodes (no API changes).
- Sort menu per-tab (see each section above).
- Batch actions at top-right have explicit text labels (not icon-only). Delete is `white/50` not red — accent only on confirmation step.
- Selection mode (multi-select) opt-in via a `▢ Select` button sitting to the left of the batch actions; entering selection mode swaps to `[N selected] [Pause] [Delete]` style bar as per the existing floating bar pattern.

## 5. Edge Cases

| Case | Behavior |
|------|----------|
| `bangumi_id` missing | Cover → placeholder (gradient bg + first char of title); title uses `rule.name` |
| Cover URL 404 | `onError` swap to placeholder silently; no toast |
| Rule with zero triggered downloads | Card still renders; expand shows single `EpisodeRow.Pending` |
| Group has both active + complete eps | Card appears in both 下載緊 and 已完成; each tab only renders eps matching its status |
| 30+ episodes in one group | `@tanstack/react-virtual` virtualizes the episode list when `episodes.length > 30`; default collapsed |
| Loading state | Skeleton loaders (required by project convention) — skeleton card shape matching real card layout, 3 placeholder rows |
| Cover query failure | Fallback placeholder; React Query staleTime 24h prevents retry storms |
| Dark/light mode | Uses existing CSS vars from `theme.css`; tokens listed in §2 are dark values, theme-file provides light values |

## 6. Out of Scope

- Backend changes. `/api/v1/downloads/grouped` is sufficient; `discoverApi.detail` already provides cover.
- `RuleEditorModal` internal redesign — it opens from the new card's "管理規則" button but the modal itself is unchanged (already polished in a previous session).
- URL sync for search / sort / expanded state.
- Drag-to-reorder rules or episodes.
- Queue management UI (re-order, priority).

## 7. Risks and Decisions

**Risk: same rule appearing in two tabs simultaneously.** Accepted — the user filters by intent (looking at active vs completed), and the tab-scoped episode list ensures no duplicated progress bars. Tested: a rule with 1 complete + 2 active eps should show as a card in both tabs with eps filtered accordingly.

**Decision: no cross-session expand persistence.** Simpler, avoids stale state after rule deletion. Can be added later if requested.

**Risk: cover query burst when 20+ subscriptions.** Mitigated by React Query staleTime 24h and automatic query dedupe by `bangumiId`. `useAnimeCover` is the single entry point.

**Decision: virtualize only above 30 episodes.** Under 30, the DOM overhead is negligible and animation snappiness matters more than memory.

## 8. Implementation Path

Four PRs in sequence. Each ends in a working, testable state.

**PR 1 · Shared primitives** — new code only, no page changes.
- `AnimeDownloadCard` + `AnimeCoverBlock` + `AnimeGroupHeader` + `AnimeEpisodeList`
- All four `EpisodeRow` variants
- `useAnimeCover` hook
- `useDownloadsUiStore` for expand state
- Vitest tests: render each mode (subscribed/downloading/completed), expand toggle, cover fallback, missing-bangumi fallback

**PR 2 · Split `DownloadsPage.tsx`** — file restructure, no visual change yet.
- Create `pages/downloads/{SubscribedTab,DownloadingTab,CompletedTab}.tsx` using the existing `SubscriptionAnimeCard` / `DownloadCard` (keep current UI)
- `DownloadsPage.tsx` becomes a thin shell (~300 lines): tabs + shared search/sort/aggregate bar
- Guard rail: existing E2E tests must still pass

**PR 3 · Adopt new card across all tabs** — visual change lands.
- Each tab file swaps to `AnimeDownloadCard` + appropriate `EpisodeRow`
- Delete `SubscriptionAnimeCard`, `DownloadCard`, `SubscriptionDetailContent` (RuleEditorModal remains as edit entry)
- i18n strings extracted for 6 locales (en, ja, ko, zh-CN, zh-HK, zh-TW)
- Playwright E2E covering: subscribe flow lands card in 已追番, download appears in 下載緊, completion moves to 已完成, expand toggle works, search filters cards

**PR 4 · Polish + edge cases**
- Bottom "其他下載" section
- Virtualization for 30+-episode groups
- Skeleton loaders matching card shape
- Cover 404 fallback testing
- Final `simplify` pass + code-reviewer agent pass

## Success Criteria

- [ ] All three tabs share the Unified card design
- [ ] Group header progress bar is visually attached to its card (no floating divider look)
- [ ] Linear-only progress — no circular ring redundancy
- [ ] Episode rows align cleanly under the title column; cover column stays visually empty inside rows
- [ ] Same anime across tabs looks identical (only episode rows differ)
- [ ] Search filters by anime + episode title in real time
- [ ] Manual downloads without `rule_id` collect into "其他下載" section
- [ ] `DownloadsPage.tsx` ≤ 400 lines after refactor
- [ ] Full E2E coverage of subscribe → download → complete flow (per project convention)
