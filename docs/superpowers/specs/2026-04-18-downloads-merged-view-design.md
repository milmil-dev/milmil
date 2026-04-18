# Downloads — Merged Library View Design

**Date:** 2026-04-18
**Scope:** Collapse the three download-management tabs (已追番 / 下載緊 / 已完成) into a single "庫" view. Reuse the existing `AnimeDownloadCard` primitive (landed in `ffc2698`). Search tab stays separate.

## Context

The current Downloads page has four tabs: `search / subscriptions / downloading / completed`. The last three share the same card primitive and — since a rule can have a mix of active + complete + pending episodes — the same anime often appears across multiple tabs. The mental model is wrong: tabs pretend to be mutually exclusive states, but subscribed / downloading / completed are orthogonal axes. Subscription is an **anime-level** state (rule exists). Downloading / completed are **episode-level** states.

One card per anime, shown once, is more honest. Status is already encoded visually on the card (live dot, progress bar, mode-driven stat line). Tab switching adds cost without adding information.

## 1. Information Architecture

Two top-level tabs:

| Tab | Scope |
|-----|-------|
| 搜尋 | Discovery + subscribe flow. Unchanged. |
| 庫 | Every rule that exists (enabled or disabled) + manual downloads. One card per rule. |

A rule with no triggers still shows as a card. A rule that the user disabled still shows (with `自動下載停咗` and a neutral progress bar). Manual magnet adds (no `rule_id`) collect into a `其他下載` section at the bottom.

**No status filter.** Cards express status visually; the user scans instead of clicking. Sort replaces filtering: `最近活動` default sinks inactive rules to the bottom.

## 2. Card Mode Priority

Each card picks exactly one `mode` per render, based on the following ordered check:

1. Any episode with `status === 'active' | 'paused' | 'waiting'` → `downloading` mode
2. Rule `enabled === 1`, zero active episodes → `subscribed` mode
3. Otherwise → `completed` mode

### Stat-line content per mode

| Mode | Stat line |
|------|-----------|
| `downloading` | `<live-dot> N 下載緊 · X MB/s · Y / Z GB · ~T min` |
| `subscribed` (enabled) | `<live-dot> 追番中 · 下次刷新 ~N min · A / B eps` |
| `subscribed` (disabled) | `自動下載停咗 · A / B eps` (no live dot) |
| `completed` | `N eps · X GB · 完成於 Y ago` (no live dot) |

`A / B eps` where B is `rule.episode_count` if known (from bangumi detail); hide `/ B` when unknown.

### Progress bar per mode

| Mode | Bar |
|------|-----|
| `downloading` | state-green (`#4ade80` @ 78% opacity) fill, 2px, no glow |
| `subscribed` | state-green fill (may be 0% — empty green track) |
| `completed` | **neutral** 14% white fill at 100% — "complete" is not an "active" state |

### Expand list content per mode

Mode gates what episodes show in the expand:

- `downloading` mode: episodes with `status ∈ {active, paused, waiting}`, sorted by ETA ascending
- `subscribed` mode: empty expand → `EpisodeRowPending` with refresh button
- `completed` mode: episodes with `status === 'complete'`, sorted by `created_at` descending
- Mixed cases: a rule in `downloading` mode may still have complete episodes. Those are hidden from expand — user switches to sort `下載進度 %` or name to see them alongside completed.

**Alternative considered:** show all episodes regardless of mode, segmented by status within the expand. Rejected to keep expand density consistent and avoid a second hierarchy.

## 3. Card Action Layout (Hybrid pattern)

Card right-side, below the percent:

```
[ ✎ ] [ ⋯ ] [ ▾ ]
```

- **✎** — opens `RuleEditorModal` directly. Most-common action stays one click.
- **⋯** — opens a dropdown menu:
  1. `自動下載` toggle (immediate enable/disable via `ruleApi.update({ enabled })`)
  2. `即刻 refresh feed` (`rssFeedApi.refresh(feed.id)`)
  3. `喺 Anime 頁面打開` (`navigate({ to: '/anime/$id', params })` if `bangumi_id`)
  4. `複製 RSS URL` (`navigator.clipboard.writeText(feed.url)`, toast confirm)
  5. ─ divider ─
  6. `刪除訂閱` (danger styling) — confirm dialog → `ruleApi.delete` + `rssFeedApi.delete`
- **▾** / **▴** — collapse/expand the episode list

Menu anchors to the `⋯` button, `bottom-end` placement, closes on outside click or `Escape`.

## 4. Top Bar

```
┌──────────────────────────────────────────────────────────────┐
│  搜尋   庫*                                                    │
├──────────────────────────────────────────────────────────────┤
│  [🔍 Search downloads…]           [⇅ 最近活動 ▾] [＋ Add URL] │
│                                                               │
│   • 8 訂閱 · ● 3 下載緊 · 9.0 MB/s · 48 GB 儲咗                │
└──────────────────────────────────────────────────────────────┘
```

- Tabs: `搜尋 / 庫` (renamed from `subscriptions / downloading / completed`). Pink underline (`--mm-accent`) on the active tab.
- Search input: client-side filter over anime title + sub-chips + episode filenames. Debounced 150ms.
- Sort dropdown (see §5).
- `＋ Add URL` button — unchanged; opens the existing `AddUrlDialog`.
- Aggregate summary: `N 訂閱`, live-dot `N 下載緊`, total speed, total complete size. Hidden when `rules.length === 0 && miscDownloads.length === 0`.

## 5. Sort

Single dropdown. Options:

| Key | Label | Comparator |
|-----|-------|------------|
| `activity` (default) | 最近活動 | `max(last_triggered_at, any download.created_at, now if any active)` desc |
| `name` | 名稱 A–Z | `rule.name` localeCompare |
| `progress` | 下載進度 | `deriveGroupPercent(group)` desc |
| `created` | 訂閱時間 | `rule.created_at` desc |

Tie-breaker: `rule.name` A–Z.

Store selected sort in `useDownloadsUIStore` (session-scoped, no persistence). Default = `activity`.

## 6. Misc 其他下載 Section

Bottom of the 庫 tab. Collapsed by default. Shows one unified `MiscDownloadsSection` aggregating any `Download` where `rule_id` is null or empty, **regardless of status**. Current dual-bucket impl (one on DownloadingTab, one on CompletedTab) collapses into one.

Implementation: drop the `mode` prop on `MiscDownloadsSection`; each `EpisodeRowMisc` row infers its own visual from the download's `status` (active → progress bar + size, complete → final size + completion time).

## 7. Empty States

| Condition | Display |
|-----------|---------|
| No rules + no misc | Centred card: "未有訂閱，去搜尋加第一個" + CTA button switching to 搜尋 tab |
| No rules, has misc | Collapsed `其他下載` section only |
| Search query matches nothing | Subtle inline message below summary: `冇匹配「<query>」嘅動畫` |

## 8. Expand State

All cards start **collapsed** in the merged view. (Current `DownloadingTab` auto-expands every active group; that was tolerable with ≤5 cards but noisy in the merged view which may have 20+.)

User preference persists per-card in-session via `useDownloadsUIStore.expandedGroupIds` (existing store, no new code). No cross-session persistence.

## 9. Visual Tokens

All from `web/src/styles/theme.css`. No new CSS variables.

| Purpose | Token / Value |
|---------|---------------|
| Canvas bg | `--mm-bg` `#070707` |
| Card surface | `rgba(255,255,255,0.02)` / hover `0.035` |
| Card border | `--mm-border` `rgba(255,255,255,0.10)`, radius `14px` |
| Accent | `--mm-accent` `#e88faa` — **only** active tab underline, confirm buttons |
| State green | `#4ade80` — active progress fill + live dot (matches existing `AnimeCard.completed`, `NotificationBell.success`, `ConnectionBadge`) |
| Completed bar | `rgba(255,255,255,0.14)` — neutral, not dimmed-accent |
| Text primary / secondary / tertiary / muted | `rgba(255,255,255,0.93 / 0.60 / 0.40 / 0.20)` |

No glow (`box-shadow` on progress bars) and no halo (`box-shadow` on live dot). Live dot pulses opacity only (`0.35` ↔ `1` at 1.6s).

## 10. File Impact

### Created

- `web/src/pages/downloads/LibraryTab.tsx` — merged view rendering all rules + misc.
- `web/src/components/downloads/CardMenu.tsx` — the `⋯` dropdown (Radix DropdownMenu or Base UI Menu — match existing convention).

### Modified

- `web/src/pages/DownloadsPage.tsx`:
  - `type Tab = 'search' | 'library'` (was 4-way).
  - Tab-switch render collapses three branches into `{tab === 'library' && <LibraryTab … />}`.
  - Remove per-tab stats memos (`activeDownloads`, `completedDownloads`) in favour of letting `LibraryTab` derive what it needs from `groups` + `rules` + `allDownloads`.
- `web/src/components/downloads/AnimeGroupHeader.tsx`:
  - Remove `box-shadow` from progress fill and live dot.
  - Add `headerActions` slot usage for CardMenu (ordering: `✎` button first, then `<CardMenu />`, then expand toggle).
  - Completed mode progress bar uses `rgba(255,255,255,0.14)` instead of `rgba(74,222,128,0.18)`.
- `web/src/pages/downloads/shared/adapters.ts`:
  - Add `deriveCardMode(group, rule)` returning `'downloading' | 'subscribed' | 'completed'` using the priority in §2.
  - Add `deriveEpsForExpand(group, mode)` filtering + sorting the episode list per mode.
  - Add sort comparators (`byActivity`, `byName`, `byProgress`, `byCreated`).

### Deleted

- `web/src/pages/downloads/SubscribedTab.tsx`
- `web/src/pages/downloads/DownloadingTab.tsx`
- `web/src/pages/downloads/CompletedTab.tsx`

(Their test files too — replaced by `LibraryTab.test.tsx` covering the merged behaviour.)

### i18n

New keys to add across all 6 locales (`en / ja / ko / zh-CN / zh-HK / zh-TW`):

- `downloads.tab.library` — "庫" / "Library" / "ライブラリ" / "라이브러리"
- `downloads.sort.activity` — "最近活動"
- `downloads.sort.name` — "名稱"
- `downloads.sort.progress` — "下載進度"
- `downloads.sort.created` — "訂閱時間"
- `downloads.menu.autoDownload` — "自動下載"
- `downloads.menu.refresh` — "即刻 refresh"
- `downloads.menu.openAnime` — "喺 Anime 頁面打開"
- `downloads.menu.copyRSS` — "複製 RSS URL"
- `downloads.menu.delete` — "刪除訂閱"
- `downloads.confirm.delete` — "確定刪除訂閱？" + body
- `downloads.autoDisabled` — "自動下載停咗"
- `downloads.summary.subscribed` — "N 訂閱"
- `downloads.summary.downloading` — "N 下載緊"
- `downloads.summary.stored` — "N 儲咗"
- `downloads.noRulesHint` — "未有訂閱，去搜尋加第一個"
- `downloads.searchEmpty` — "冇匹配「{query}」嘅動畫"

## 11. Out of Scope

- Keyboard shortcuts in the card menu (listed in tooltip but not wired to global hotkeys).
- Undo for `刪除訂閱` — plain confirm dialog only. A toast-with-undo pattern is deferred.
- Cross-session persistence of expand state, sort selection.
- Section-based grouping (e.g. "Active now" vs "Completed" vertical sections). Sort + single list is simpler and avoids mode shifting cards between sections during a session.
- Multi-select / batch delete for rules.

## 12. Decisions and Risks

**Decision: hide completed episodes from a `downloading` card's expand list.** A rule in downloading mode may have 5 complete eps + 2 active eps. The expand shows only the 2 actives. Reasoning: the mixed-status display is visually confusing (two different progress-bar styles, two different row densities), and the completed eps can be seen by sorting `下載進度 %` (which moves the card to `completed` mode). Accepted cost: users can't see completed eps for an actively-downloading anime from that card directly — they navigate to the Anime page.

**Decision: no status filter chips.** Tested against §2 scenarios: every meaningful filter ("show me actively downloading", "show me stuck downloads", "show me completed") is expressible as a sort. Filter would add UI surface for a control the sort already provides.

**Risk: single list gets long for power users with 30+ subscriptions.** Virtualization at card level is out of scope for this PR (the `AnimeEpisodeList` already virtualizes its children). If it bites, follow-up: wrap the card list in `useVirtualizer`. Default `最近活動` sort already pushes dormant rules to the bottom so the top of the list stays relevant.

**Risk: collapsing 3 tabs changes a familiar mental model.** Mitigated by the summary line making counts (8 訂閱 · 3 下載緊) immediately visible. Users who think in tabs see their counts. The empty-state copy explicitly says "all subscriptions in one place".

## 13. Success Criteria

- [ ] `Tab` type in `DownloadsPage.tsx` is `'search' | 'library'` (2 values).
- [ ] Clicking 庫 renders one `AnimeDownloadCard` per rule, one `MiscDownloadsSection` at the bottom.
- [ ] Card mode is derived automatically; a rule with mixed ep states appears exactly once.
- [ ] `✎` button opens `RuleEditorModal`; `⋯` opens `CardMenu` with 6 items; `▾` toggles expand.
- [ ] Progress bars have no `box-shadow`; live dot has no halo.
- [ ] Completed mode uses `rgba(255,255,255,0.14)` for its hairline.
- [ ] Sort dropdown defaults to `最近活動`; dormant rules sink; active cards float to top.
- [ ] Search input filters cards in real time across title + sub-chips + episode filenames.
- [ ] 6 locales include all new i18n keys.
- [ ] Deleted `SubscribedTab.tsx`, `DownloadingTab.tsx`, `CompletedTab.tsx` and their tests.
- [ ] `LibraryTab.test.tsx` covers: mode derivation per rule shape, mixed-status card renders once, menu actions fire mutations, search filter, sort.
