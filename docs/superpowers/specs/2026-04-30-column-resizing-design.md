# Column Resizing Design

**Date:** 2026-04-30
**Scope:** User-resizable column widths for the library media files table; persisted per-table in localStorage.

## Context

`MotionTable` (`web/src/components/MotionTable.tsx`) is a generic TanStack-React-Table v8 wrapper used by `LibraryDetailPage` to render the media files data table. Today columns have fixed widths declared via `meta.width` in each column def; the user cannot resize them. This was the only remaining gap from the data-table polish work — server-side sorting, batch selection, bulk match/unmatch all shipped.

After this spec, users can drag column dividers to resize, double-click a divider to reset that column to its default width, and have their adjustments persisted across reloads on the same browser. Cross-device sync is intentionally out of scope.

## Goals

1. Resizable columns wired through TanStack Table's built-in `enableColumnResizing` + `columnSizing` state — no custom drag math.
2. Per-table persistence in `localStorage` via a small zustand store (`milmil-table-prefs`), keyed by `tableId` then `columnId`.
3. `MotionTable` stays generic: it emits an `onColumnResizeEnd` event but doesn't reach into any store. The store wiring lives in the caller.
4. Visual handle that respects the project's no-accent-color rule (`feedback_no_primary_color`): white-with-opacity throughout.
5. Resizing is opt-in per column via `enableResizing` on the column def — default true; `select` and `actions` set it false.

## Non-Goals

- Column reordering
- Cross-device sync (would require a server table; column widths aren't worth that)
- Auto-fit-to-content on double-click (double-click resets to the column's `meta.width` default, not measured content width)
- Right-click context menu / "reset all" UI button (deferred — `resetTable` exists in the store for a future trigger)

## Architecture

```
[LibraryDetailPage]
  ↓ tableId="library-detail-files"
  ↓ initial columnSizing ← useTablePrefsStore.columnWidths[tableId]
  ↓ onColumnSizingChange → React state
  ↓ onColumnResizeEnd (mouseup) → useTablePrefsStore.setColumnWidth
[MotionTable<T>]
  ↓ enableColumnResizing on table
  ↓ each <TableHead> renders <ResizeHandle> when column.getCanResize()
[useTablePrefsStore (new, zustand + persist 'milmil-table-prefs')]
  ↓ shape: { columnWidths: Record<tableId, Record<colId, number>> }
```

**Final width per cell is computed in this order**:

1. `columnSizing[colId]` — user override from store (via TanStack's `header.getSize()`)
2. `meta.width` — column-def default (kept unchanged for backwards compat)
3. `defaultColumn.minSize: 60` — global floor

`meta.width` is fed to TanStack via the column def's `size` field, so `header.getSize()` returns it when no user override exists.

## Components

### 1. `MotionTable` changes (`web/src/components/MotionTable.tsx`)

**New props:**

```ts
interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
  tableId?: string;                             // NEW — undefined disables persistence emission
  onColumnResizeEnd?: (colId: string, w: number) => void;  // NEW — fires on mouseup only
}
```

**Width source:** replace `meta.width`-based inline style with `header.getSize()` / `cell.column.getSize()`. Column defs continue to declare `meta: { width: 650 }`; the `MotionTable` (or its column-def builder) maps that to TanStack's `size` so `getSize()` works.

**Resize handle:** in each `<TableHead>` whose column passes `header.column.getCanResize()`, render an absolute-positioned `<div>` on the right edge:

- Outer hit area: 6px wide, `right: -3px` (extends slightly past the cell edge for easier grabbing)
- Inner visual: 2px wide vertical line, centered in the hit area
- Default: visual is `bg-transparent`
- Hover (on the hit area): visual is `bg-white/30`, cursor `col-resize`
- During active drag (`header.column.getIsResizing()`): visual is `bg-white/60`
- `onMouseDown={header.getResizeHandler()}` and `onTouchStart={header.getResizeHandler()}` — TanStack handles the rest of the drag math
- `onDoubleClick={() => onColumnResizeEnd?.(colId, NaN)}` — sentinel meaning "reset"; the caller maps NaN → `resetColumn`. (Cleaner than adding another prop.)
- `title="Drag to resize. Double-click to reset."`

**End-of-drag emission:** TanStack's `columnResizeMode: 'onChange'` updates state on every mouse move. We don't want to write to localStorage on every move. Two options considered:

- (a) Watch `columnSizingInfo.isResizingColumn` via a `useEffect` that fires when it transitions truthy → falsy, and emit `onColumnResizeEnd` then.
- (b) Bind `onMouseUp` / `onTouchEnd` on the resize handle and call `onColumnResizeEnd` with `header.getSize()`.

**Choose (a)** — survives drags that end outside the handle (mouse leaves the cell mid-drag, then releases over the body). The effect lives inside `MotionTable` and reads `table.getState().columnSizingInfo.isResizingColumn`.

### 2. `LibraryDetailPage` integration

```tsx
const TABLE_ID = 'library-detail-files';

const persistedWidths = useTablePrefsStore((s) => s.columnWidths[TABLE_ID] ?? {});
const setColumnWidth = useTablePrefsStore((s) => s.setColumnWidth);
const resetColumn = useTablePrefsStore((s) => s.resetColumn);

const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(persistedWidths);

const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
  state: { columnSizing },
  onColumnSizingChange: setColumnSizing,
  defaultColumn: { minSize: 60 },
});

const handleResizeEnd = (colId: string, w: number) => {
  if (Number.isNaN(w)) {
    resetColumn(TABLE_ID, colId);
    setColumnSizing((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  } else {
    setColumnWidth(TABLE_ID, colId, w);
  }
};
```

**Column-def changes:**

- Add `enableResizing: false` to the `select` and `actions` columns
- Migrate every column from `meta: { width: N }` to TanStack's first-class `size: N`
- Delete the `meta.width` field (and the `ColumnMeta` augmentation in `MotionTable.tsx`) so there's only one source of truth for width

`MotionTable` reads `header.getSize()` / `cell.column.getSize()` exclusively. After this change `grep -r 'meta.width\|meta: { width' web/src` returns zero hits — verified before merge.

### 3. New store `useTablePrefsStore` (`web/src/store/table-prefs-store.ts`)

```ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface TablePrefsState {
  columnWidths: Record<string, Record<string, number>>;

  setColumnWidth: (tableId: string, columnId: string, width: number) => void;
  resetColumn: (tableId: string, columnId: string) => void;
  resetTable: (tableId: string) => void;
}

export const useTablePrefsStore = create<TablePrefsState>()(
  devtools(
    persist(
      (set) => ({
        columnWidths: {},

        setColumnWidth: (tableId, columnId, width) =>
          set(
            (state) => ({
              columnWidths: {
                ...state.columnWidths,
                [tableId]: { ...state.columnWidths[tableId], [columnId]: width },
              },
            }),
            undefined,
            'setColumnWidth'
          ),

        resetColumn: (tableId, columnId) =>
          set(
            (state) => {
              const next = { ...(state.columnWidths[tableId] ?? {}) };
              delete next[columnId];
              return { columnWidths: { ...state.columnWidths, [tableId]: next } };
            },
            undefined,
            'resetColumn'
          ),

        resetTable: (tableId) =>
          set(
            (state) => {
              const next = { ...state.columnWidths };
              delete next[tableId];
              return { columnWidths: next };
            },
            undefined,
            'resetTable'
          ),
      }),
      { name: 'milmil-table-prefs' }
    )
  )
);
```

**Why a new store** instead of merging into `ui-store`: `ui-store` is for app-wide UI state (sidebar, week start day) that is global by definition. Per-table column widths are a different scope keyed by table id. Mixing them dilutes both stores. Future MotionTable users get `useTablePrefsStore` for free.

**`resetColumn` deletes the key** rather than writing back the default. If we ever change `meta.width` defaults, users who previously reset to default still get the new default automatically.

## Data Flow

1. **First visit**: `persistedWidths` is `{}`, `columnSizing` initial state is `{}`, TanStack uses `column.size` from defs → renders with `meta.width` defaults.
2. **User drags `filename` from 650 to 720**: TanStack updates `columnSizing` on every move via `setColumnSizing` → React re-renders → cells reflow → drag ends → `useEffect` in `MotionTable` detects `isResizingColumn` going false → calls `onColumnResizeEnd('filename', 720)` → `setColumnWidth('library-detail-files', 'filename', 720)` → zustand persist middleware writes to localStorage.
3. **Reload page**: `persistedWidths` reads from localStorage → `{ filename: 720 }` → `columnSizing` initialised with that → TanStack renders `filename` at 720.
4. **User double-clicks `filename` resize handle**: `onColumnResizeEnd('filename', NaN)` → `resetColumn('library-detail-files', 'filename')` removes the entry from store AND clears React state → next render uses `column.size` default → 650.

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Drag below 60px | TanStack `defaultColumn.minSize: 60` floors it |
| Drag very wide (5000px) | Allowed; existing horizontal scroll on the table container handles overflow |
| Stored width for a column id that no longer exists | TanStack ignores keys with no matching column; entry stays in localStorage harmlessly |
| Column id renamed | Old key sits idle until a future migration; no crash |
| Filter / search / page change | `columnSizing` unaffected (only `rowSelection` resets per `useEffect`) |
| First paint flash before localStorage hydrates | Zustand persist hydrates synchronously on store creation; SPA so no SSR concerns |
| Translation switch | TanStack uses column `id`; widths persist across language change |
| Two tabs editing concurrently | Last writer wins on next localStorage write; non-issue for single-user UI |
| `tableId` not provided to MotionTable | `onColumnResizeEnd` not called; columns still resize per-session but nothing is persisted |

## Files to Change

### Modified

| File | Change |
|------|--------|
| `web/src/components/MotionTable.tsx` | Add `tableId` + `onColumnResizeEnd` props; replace `meta.width` reads with `header.getSize()` / `cell.column.getSize()`; remove the `ColumnMeta.width` module augmentation; render `<ResizeHandle>` in each `<TableHead>` whose column has `getCanResize()`; add `useEffect` watching `columnSizingInfo.isResizingColumn` for end-of-drag emission |
| `web/src/pages/LibraryDetailPage.tsx` | Read store, hydrate `columnSizing`, set `enableColumnResizing` on the table, migrate `meta: { width: N }` → `size: N` on every column def, add `enableResizing: false` to `select` and `actions`, pass `tableId` and `onColumnResizeEnd` to `<MotionTable>` |

### Added

| File | Purpose |
|------|---------|
| `web/src/store/table-prefs-store.ts` | New zustand store, `milmil-table-prefs` localStorage key |
| `web/src/store/table-prefs-store.test.ts` | Vitest: set / reset column / reset table / multiple table-id isolation |
| `web/e2e/library-column-resize.spec.ts` | Playwright: drag → reload → reset → reload (per the testing plan) |

### Unchanged

`api/`, all other web/store files, all other web/components, all i18n files (no new strings — `title="Drag to resize. Double-click to reset."` lives only in the resize handle and can be wrapped in `i18n._(msg\`...\`)` if i18n is wanted; recommend deferring — single tooltip, low value, easy to add later).

## Testing

### Unit (vitest)

`table-prefs-store.test.ts`:
- `setColumnWidth` writes the width
- `setColumnWidth` overrides existing width on same `(tableId, columnId)`
- `setColumnWidth` on different `tableId`s stays isolated
- `resetColumn` removes the key (column drops back to default)
- `resetColumn` on a non-existent column is a no-op
- `resetTable` clears all columns for that table only
- localStorage roundtrip: write → re-read store from fresh hydrate → values present

Drag interaction itself is **not** unit-tested — JSDOM lacks reliable pointer-event support and TanStack's drag is pure DOM math. E2E covers it.

### E2E (playwright)

`library-column-resize.spec.ts`:
1. Navigate to a library detail page that has at least one media file
2. Hover the right edge of the `filename` header → assert cursor is `col-resize`
3. Drag the divider 100px to the right → assert the `<th>` `offsetWidth` increased
4. Reload the page → assert the new width persists
5. Double-click the same divider → assert width returns to default (650)
6. Reload → assert default still applies (store was actually cleared)

### Manual smoke

- Drag `subtitle_count` (no default `meta.width`) — should still resize using TanStack's default 150
- Hover right edge of `select` and `actions` — cursor should NOT change to `col-resize`; resize handle not rendered

## Migration / Rollback

**Migration:** none. First load with the new code: `columnWidths = {}` in localStorage → identical visual to today.

**Rollback:** delete the new files, revert `MotionTable` and `LibraryDetailPage`. Stale `milmil-table-prefs` entries in user localStorage become inert (no code reads them).

## Open Questions

None.
