# Schedule Card Size and Settings Mobile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add schedule anime card size presets and improve settings page mobile layout.

**Architecture:** Extend the existing persisted `useUIStore` with a schedule card size enum. Use that preference in `SchedulePage` to switch width classes for timeline and seasonal grid cards. Refine `SettingsPage`, `SettingsCard`, and `SelectorGroup` with responsive classes so mobile navigation and controls adapt cleanly.

**Tech Stack:** React 19, TanStack Router, Zustand persist, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Persist Schedule Card Size

**Files:**
- Test: `web/src/store/ui-store.test.ts`
- Modify: `web/src/store/ui-store.ts`

**Step 1: Write the failing test**

Add tests for default `scheduleCardSize`, `setScheduleCardSize`, and persistence under `milmil-ui`.

**Step 2: Run test to verify it fails**

Run: `bun run test:run src/store/ui-store.test.ts`

Expected: FAIL because `scheduleCardSize` does not exist.

**Step 3: Write minimal implementation**

Add `ScheduleCardSize = 'small' | 'medium' | 'large'`, state, setter, default `medium`, and persisted partial state.

**Step 4: Run test to verify it passes**

Run: `bun run test:run src/store/ui-store.test.ts`

Expected: PASS.

### Task 2: Schedule Size Selector

**Files:**
- Modify: `web/src/pages/SchedulePage.tsx`

**Step 1: Wire store state**

Read `scheduleCardSize` and `setScheduleCardSize` in `SchedulePage`.

**Step 2: Add responsive width mapping**

Replace fixed schedule card widths with classes derived from the selected size. Use larger widths only from `sm` upward so mobile remains usable.

**Step 3: Add selector to header**

Render `Small / Medium / Large` buttons near the season controls with active state and accessible labels.

**Step 4: Verify**

Run targeted tests and typecheck.

### Task 3: Settings Mobile Layout

**Files:**
- Modify: `web/src/pages/settings/SettingsPage.tsx`
- Modify: `web/src/components/settings/SettingsCard.tsx`
- Modify: `web/src/components/settings/SelectorGroup.tsx`
- Modify as needed: settings panel rows that need mobile stacking

**Step 1: Add shared responsive behavior**

Make `SelectorGroup` wrap and make each option resist text overflow. Make `SettingsCard` use smaller mobile padding.

**Step 2: Refine settings page shell**

Use compact mobile page padding, left-aligned mobile title, horizontal scroll tabs, and desktop-only sticky side nav behavior.

**Step 3: Stack fragile rows**

Update common `flex items-center justify-between` rows that carry longer labels/descriptions to use `gap` and `min-w-0`, stacking on very small screens where needed.

**Step 4: Verify**

Run targeted tests, typecheck, and lint/format checks.
