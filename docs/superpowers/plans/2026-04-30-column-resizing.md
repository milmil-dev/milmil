# Column Resizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-resizable columns to the library media files table, with per-table-id width persistence in localStorage and a double-click-to-reset affordance.

**Architecture:** New zustand store `useTablePrefsStore` (localStorage persisted) holds `Record<tableId, Record<columnId, number>>`. `MotionTable` gains a `<ResizeHandle>` rendered on each `<TableHead>` whose column has `enableResizing: true` (TanStack default), wires `header.getResizeHandler()` for drag, and emits `onColumnResizeEnd(colId, width)` after each drag via a `useEffect` watching `columnSizingInfo.isResizingColumn`. `LibraryDetailPage` hydrates `columnSizing` state from the store on mount and writes back on drag-end. Width source-of-truth migrates from `meta: { width: N }` to TanStack's first-class `size: N` so `header.getSize()` returns the right number. Double-click on a resize handle calls `onColumnResizeEnd(colId, NaN)` as a sentinel for reset.

**Tech Stack:** React 19 + React Compiler, TanStack Table v8 (`@tanstack/react-table`), Zustand v5 (`persist` + `devtools` middleware), Vitest + Testing Library, Playwright, Tailwind CSS v4.

---

### Task 0: Create worktree for implementation

**Files:** none (git plumbing only)

- [ ] **Step 1: Create worktree off latest main**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git fetch origin main
git worktree add -b feat/column-resizing ../milmil-column-resizing origin/main
cd ../milmil-column-resizing
```

Expected: new directory at `../milmil-column-resizing` checked out at branch `feat/column-resizing`.

- [ ] **Step 2: Symlink `.env` (per `feedback_no_symlink_data` memory: only `.env`, never data dirs)**

```bash
ln -s ../milmil/.env .env || true
ln -s ../milmil/web/.env.local web/.env.local 2>/dev/null || true
```

- [ ] **Step 3: Install web deps in worktree (bun)**

```bash
cd web
bun install
```

Expected: `bun install` reports 0 added (lockfile already up to date).

- [ ] **Step 4: Sanity-build to confirm baseline**

```bash
bun run typecheck
```

Expected: PASS, no errors.

---

### Task 1: New store `useTablePrefsStore` (TDD)

**Files:**
- Create: `web/src/store/table-prefs-store.ts`
- Test: `web/src/store/table-prefs-store.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `web/src/store/table-prefs-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { useTablePrefsStore } from './table-prefs-store';

const STORAGE_KEY = 'milmil-table-prefs';

describe('useTablePrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTablePrefsStore.setState({ columnWidths: {} });
  });
  afterEach(() => {
    localStorage.clear();
  });

  test('setColumnWidth writes the width', () => {
    useTablePrefsStore.getState().setColumnWidth('t1', 'filename', 720);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(720);
  });

  test('setColumnWidth overrides existing width on the same (tableId, columnId)', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t1', 'filename', 800);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(800);
  });

  test('setColumnWidth on different tableIds stays isolated', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t2', 'filename', 400);
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBe(720);
    expect(useTablePrefsStore.getState().columnWidths.t2?.filename).toBe(400);
  });

  test('resetColumn removes the key (column drops back to default)', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'filename', 720);
    s.setColumnWidth('t1', 'matched', 280);
    s.resetColumn('t1', 'filename');
    expect(useTablePrefsStore.getState().columnWidths.t1?.filename).toBeUndefined();
    expect(useTablePrefsStore.getState().columnWidths.t1?.matched).toBe(280);
  });

  test('resetColumn on a non-existent column is a no-op', () => {
    expect(() =>
      useTablePrefsStore.getState().resetColumn('missing', 'nope')
    ).not.toThrow();
    expect(useTablePrefsStore.getState().columnWidths).toEqual({});
  });

  test('resetTable clears all columns for that table only', () => {
    const s = useTablePrefsStore.getState();
    s.setColumnWidth('t1', 'a', 1);
    s.setColumnWidth('t1', 'b', 2);
    s.setColumnWidth('t2', 'a', 3);
    s.resetTable('t1');
    expect(useTablePrefsStore.getState().columnWidths.t1).toBeUndefined();
    expect(useTablePrefsStore.getState().columnWidths.t2?.a).toBe(3);
  });

  test('persist writes to localStorage under milmil-table-prefs', () => {
    useTablePrefsStore.getState().setColumnWidth('t1', 'filename', 720);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(persisted.state.columnWidths.t1.filename).toBe(720);
  });
});
```

- [ ] **Step 2: Run test to verify all fail with import error**

```bash
cd web && bun run test:run -- src/store/table-prefs-store.test.ts
```

Expected: FAIL with `Cannot find module './table-prefs-store'`.

- [ ] **Step 3: Implement the store**

Create `web/src/store/table-prefs-store.ts`:

```ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface TablePrefsState {
  // { 'library-detail-files': { filename: 720, matched: 280 }, ... }
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
              return {
                columnWidths: { ...state.columnWidths, [tableId]: next },
              };
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

- [ ] **Step 4: Run test to verify all pass**

```bash
cd web && bun run test:run -- src/store/table-prefs-store.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/store/table-prefs-store.ts web/src/store/table-prefs-store.test.ts
git commit -m "feat(web): table-prefs-store for column-width persistence

New zustand store keyed by (tableId, columnId) with localStorage
persist (milmil-table-prefs) and devtools. Provides setColumnWidth,
resetColumn (deletes the key so future default changes apply), and
resetTable (clears one table's prefs without touching others)."
```

---

### Task 2: Migrate width source from `meta.width` to TanStack `size`

**Files:**
- Modify: `web/src/components/MotionTable.tsx`
- Modify: `web/src/pages/LibraryDetailPage.tsx` (column defs only)

This is an atomic refactor: drop the `ColumnMeta.width` augmentation, switch the width reader to `header.getSize()` / `column.getSize()`, and migrate every column def's `meta: { width: N }` to `size: N`. After this commit, `grep -r 'meta.width\|meta: { width' web/src` returns zero hits.

- [ ] **Step 1: Read the current MotionTable to confirm shape**

```bash
sed -n '1,30p' web/src/components/MotionTable.tsx
```

Expected output includes the `declare module '@tanstack/react-table'` augmentation on lines 6-11 and `meta?.width` reads on lines 66 and 106.

- [ ] **Step 2: Modify `MotionTable.tsx` — drop the augmentation, switch reader**

Replace the file content with:

```tsx
'use no memo';

import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const SORTABLE_COLUMNS = new Set(['filename', 'size_bytes', 'match_status', 'subtitle_count']);

interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction?: 'asc' | 'desc' }) {
  if (active && direction) {
    return (
      <svg
        className="w-3 h-3 shrink-0 text-white/50"
        viewBox="0 0 12 12"
        fill="currentColor"
        aria-hidden="true"
      >
        {direction === 'asc' ? (
          <polygon points="6,2 10,8 2,8" />
        ) : (
          <polygon points="6,10 2,4 10,4" />
        )}
      </svg>
    );
  }
  return (
    <svg
      className="w-3 h-3 shrink-0 text-white/10"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="6,1 9,5 3,5" />
      <polygon points="6,11 3,7 9,7" />
    </svg>
  );
}

export function MotionTable<T>({
  table,
  tableClassName,
  sortBy,
  sortOrder,
  onSort,
}: MotionTableProps<T>) {
  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const width = header.getSize();
              const colId = header.column.id;
              const isSortable = SORTABLE_COLUMNS.has(colId) && !!onSort;
              const isActive = isSortable && sortBy === colId;

              return (
                <TableHead
                  key={header.id}
                  className={[
                    'text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3',
                    isSortable
                      ? 'cursor-pointer select-none hover:text-white/50 transition-colors'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ width, minWidth: width, maxWidth: width }}
                  onClick={isSortable ? () => onSort(colId) : undefined}
                >
                  {header.isPlaceholder ? null : (
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {isSortable && (
                        <SortIcon active={isActive} direction={isActive ? sortOrder : undefined} />
                      )}
                    </span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className="group border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-150"
          >
            {row.getVisibleCells().map((cell) => {
              const width = cell.column.getSize();
              return (
                <TableCell
                  key={cell.id}
                  className="py-3 transition-colors duration-150 group-hover:text-mm-accent/80"
                  style={{ width, minWidth: width, maxWidth: width }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

Key diffs:
- Removed the `declare module '@tanstack/react-table' { interface ColumnMeta ... }` augmentation
- Removed the `RowData` import (no longer used)
- `header.column.columnDef.meta?.width` → `header.getSize()`
- `cell.column.columnDef.meta?.width` → `cell.column.getSize()`
- Removed the `width ? {...} : undefined` ternary (`getSize()` always returns a number; default is 150)

- [ ] **Step 3: Migrate column defs in `LibraryDetailPage.tsx`**

Six edits in `web/src/pages/LibraryDetailPage.tsx`. For each `meta: { width: N }`, change to `size: N` (drop `meta`).

Edit 1 — `select` column:

Replace:
```ts
{
  id: 'select',
  meta: { width: 40 },
  header: () => {
```
With:
```ts
{
  id: 'select',
  size: 40,
  header: () => {
```

Edit 2 — `filename` column:

Replace:
```ts
{
  accessorKey: 'filename',
  header: () => i18n._(msg`library.detail.col.filename`),
  meta: { width: 650 },
  cell: ({ row }) => (
```
With:
```ts
{
  accessorKey: 'filename',
  header: () => i18n._(msg`library.detail.col.filename`),
  size: 650,
  cell: ({ row }) => (
```

Edit 3 — `matched` column:

Replace:
```ts
{
  id: 'matched',
  header: () => i18n._(msg`library.detail.col.matchedAnime`),
  meta: { width: 300 },
  cell: ({ row }) => {
```
With:
```ts
{
  id: 'matched',
  header: () => i18n._(msg`library.detail.col.matchedAnime`),
  size: 300,
  cell: ({ row }) => {
```

Edit 4 — `match_status` column:

Replace:
```ts
{
  accessorKey: 'match_status',
  header: () => i18n._(msg`library.detail.col.status`),
  meta: { width: 80 },
  cell: ({ row }) => <StatusBadge status={row.original.match_status} />,
},
```
With:
```ts
{
  accessorKey: 'match_status',
  header: () => i18n._(msg`library.detail.col.status`),
  size: 80,
  cell: ({ row }) => <StatusBadge status={row.original.match_status} />,
},
```

Edit 5 — `actions` column (inside the `...(onMatch ? [...] : [])` array):

Replace:
```ts
{
  id: 'actions',
  meta: { width: 140 },
  cell: ({ row }: { row: { original: MediaFileEntry } }) => {
```
With:
```ts
{
  id: 'actions',
  size: 140,
  cell: ({ row }: { row: { original: MediaFileEntry } }) => {
```

(`subtitle_count` and `size_bytes` had no `meta.width` — leave them; TanStack default `size: 150` applies.)

- [ ] **Step 4: Verify no `meta.width` references remain in web/src**

```bash
cd web && grep -rn "meta.width\|meta: { width" src 2>&1
```

Expected: no output (zero matches).

- [ ] **Step 5: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test:run
```

Expected: PASS for both.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MotionTable.tsx web/src/pages/LibraryDetailPage.tsx
git commit -m "refactor(web): migrate column widths from meta.width to TanStack size

Single source of truth for column width: header.getSize() /
column.getSize() backed by the column-def's first-class size field.
Drops the ColumnMeta.width module augmentation. Visual behaviour
unchanged."
```

---

### Task 3: Add `<ResizeHandle>` UI to `MotionTable`

**Files:**
- Modify: `web/src/components/MotionTable.tsx`

The handle renders unconditionally for any column where `column.getCanResize()` returns true. Until `enableColumnResizing: true` is set on the table (Task 4), `getCanResize()` returns false and the handle stays hidden — so this commit is a visual no-op until the next one.

- [ ] **Step 1: Add `ResizeHandle` component above `MotionTable`**

Insert after the `SortIcon` component (around the existing line 51 in the file):

```tsx
function ResizeHandle<T>({
  header,
}: {
  header: ReturnType<TanStackTable<T>['getHeaderGroups']>[number]['headers'][number];
}) {
  const isResizing = header.column.getIsResizing();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize. Double-click to reset."
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className="absolute top-0 right-[-3px] z-10 flex h-full w-[6px] cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      <span
        className={[
          'w-[2px] transition-colors',
          isResizing ? 'bg-white/60' : 'bg-transparent group-hover/handle:bg-white/30',
        ].join(' ')}
      />
    </div>
  );
}
```

(Imports: no new imports needed — `TanStackTable` is already imported.)

- [ ] **Step 2: Wrap each `<TableHead>` in a relative container and add the handle**

Inside the `headerGroup.headers.map(...)` block, change the `<TableHead>` to add `relative` to its className and conditionally render `<ResizeHandle>`:

Replace:
```tsx
return (
  <TableHead
    key={header.id}
    className={[
      'text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3',
      isSortable
        ? 'cursor-pointer select-none hover:text-white/50 transition-colors'
        : '',
    ]
      .filter(Boolean)
      .join(' ')}
    style={{ width, minWidth: width, maxWidth: width }}
    onClick={isSortable ? () => onSort(colId) : undefined}
  >
    {header.isPlaceholder ? null : (
      <span className="inline-flex items-center gap-1">
        {flexRender(header.column.columnDef.header, header.getContext())}
        {isSortable && (
          <SortIcon active={isActive} direction={isActive ? sortOrder : undefined} />
        )}
      </span>
    )}
  </TableHead>
);
```

With:
```tsx
return (
  <TableHead
    key={header.id}
    className={[
      'relative group/handle text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3',
      isSortable
        ? 'cursor-pointer select-none hover:text-white/50 transition-colors'
        : '',
    ]
      .filter(Boolean)
      .join(' ')}
    style={{ width, minWidth: width, maxWidth: width }}
    onClick={isSortable ? () => onSort(colId) : undefined}
  >
    {header.isPlaceholder ? null : (
      <span className="inline-flex items-center gap-1">
        {flexRender(header.column.columnDef.header, header.getContext())}
        {isSortable && (
          <SortIcon active={isActive} direction={isActive ? sortOrder : undefined} />
        )}
      </span>
    )}
    {header.column.getCanResize() ? <ResizeHandle header={header} /> : null}
  </TableHead>
);
```

Two changes: added `relative group/handle` to the `<TableHead>` className, added `{header.column.getCanResize() ? <ResizeHandle header={header} /> : null}` after the inner `<span>`.

- [ ] **Step 3: Run typecheck**

```bash
cd web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Smoke (no behaviour change yet)**

Ask the user: "Open the library detail page in dev — table should look identical to before (no resize handle visible because resizing is still disabled)."

- [ ] **Step 5: Commit**

```bash
git add web/src/components/MotionTable.tsx
git commit -m "feat(web): MotionTable ResizeHandle component

Renders a 6px-wide hit area on the right edge of each header whose
column has getCanResize() === true. Visual: invisible at rest, 2px
white/30 line on group hover, white/60 during active drag. Bound to
TanStack's getResizeHandler for mouse + touch. No-op until
enableColumnResizing is turned on (next commit)."
```

---

### Task 4: Enable column resizing on the library media files table

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Add `enableResizing: false` to `select` and `actions` column defs**

In `web/src/pages/LibraryDetailPage.tsx`, find the `select` column def and add the field:

Replace:
```ts
{
  id: 'select',
  size: 40,
  header: () => {
```
With:
```ts
{
  id: 'select',
  size: 40,
  enableResizing: false,
  header: () => {
```

Find the `actions` column def (inside `...(onMatch ? [...] : [])`) and add the field:

Replace:
```ts
{
  id: 'actions',
  size: 140,
  cell: ({ row }: { row: { original: MediaFileEntry } }) => {
```
With:
```ts
{
  id: 'actions',
  size: 140,
  enableResizing: false,
  cell: ({ row }: { row: { original: MediaFileEntry } }) => {
```

(All other columns inherit TanStack's default `enableResizing: true`.)

- [ ] **Step 2: Turn on `enableColumnResizing` and set the global min size**

Find the `useReactTable` call (around line 664):

Replace:
```ts
const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
});
```

With:
```ts
const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
  defaultColumn: { minSize: 60 },
});
```

- [ ] **Step 3: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test:run
```

Expected: PASS.

- [ ] **Step 4: Manual smoke**

Ask the user: "Run dev server, open a library detail page. You should now be able to drag column dividers (filename / matched / match_status / subtitle_count / size_bytes). Hover the right edge of a header — cursor changes to col-resize and a thin white line appears. The select (checkbox) and actions columns should NOT show a divider on hover. Width changes are session-only — refresh wipes them. Confirm before continuing."

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): enable column resizing on library media files table

enableColumnResizing on the table with onChange mode and minSize 60.
select and actions columns opt out via enableResizing: false. Widths
reset on reload — persistence wired in the next commit."
```

---

### Task 5: Persist widths via `useTablePrefsStore`

**Files:**
- Modify: `web/src/components/MotionTable.tsx`
- Modify: `web/src/pages/LibraryDetailPage.tsx`

This adds the end-of-drag emission in `MotionTable` and the store hookup in `LibraryDetailPage`.

- [ ] **Step 1: Add `tableId` + `onColumnResizeEnd` props to `MotionTable`**

In `web/src/components/MotionTable.tsx`, extend `MotionTableProps`:

Replace:
```tsx
interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}
```

With:
```tsx
interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
  // When set, MotionTable emits onColumnResizeEnd(colId, newWidth) once
  // per drag (on mouseup). The caller decides whether/where to persist.
  tableId?: string;
  onColumnResizeEnd?: (columnId: string, width: number) => void;
}
```

(`tableId` is currently unused inside MotionTable — it's a future-proofing prop the caller passes for clarity. The skill explicitly accepts it; we don't reference it in the component body.)

- [ ] **Step 2: Add the end-of-drag effect**

Add new imports at the top:

```tsx
import { useEffect, useRef } from 'react';
```

Inside the `MotionTable` function, before the `return`:

```tsx
  const resizingColId = table.getState().columnSizingInfo.isResizingColumn;
  const wasResizingRef = useRef<string | false>(false);

  useEffect(() => {
    if (wasResizingRef.current && !resizingColId) {
      const colId = wasResizingRef.current;
      const col = table.getColumn(colId);
      if (col && onColumnResizeEnd) {
        onColumnResizeEnd(colId, col.getSize());
      }
    }
    wasResizingRef.current = resizingColId;
  }, [resizingColId, onColumnResizeEnd, table]);
```

Destructure `onColumnResizeEnd` in the function args. `tableId` stays declared in the interface (so callers see it as an accepted prop and the persistence contract is documented) but we don't destructure it — TypeScript permits extra props on the destructure target, and not destructuring avoids tripping the unused-var lint:

Replace:
```tsx
export function MotionTable<T>({
  table,
  tableClassName,
  sortBy,
  sortOrder,
  onSort,
}: MotionTableProps<T>) {
```

With:
```tsx
export function MotionTable<T>({
  table,
  tableClassName,
  sortBy,
  sortOrder,
  onSort,
  onColumnResizeEnd,
}: MotionTableProps<T>) {
```

- [ ] **Step 3: Wire the store in `LibraryDetailPage`**

Add the store import alongside other imports near the top of `web/src/pages/LibraryDetailPage.tsx`:

```tsx
import { useTablePrefsStore } from '../store/table-prefs-store';
```

Inside the `FileTable` component (the function that defines the table — already has `useState` for `rowSelection` etc.), add a constant at the top of the function body and the store hooks:

Right after the existing `const { i18n } = useLingui();` line, add:

```tsx
const TABLE_ID = 'library-detail-files';
const persistedWidths = useTablePrefsStore((s) => s.columnWidths[TABLE_ID]);
const setColumnWidth = useTablePrefsStore((s) => s.setColumnWidth);
```

Then add the `columnSizing` state. Place it next to the other state declarations (around line 405-406, alongside `rowSelection`):

```tsx
const [columnSizing, setColumnSizing] = useState<Record<string, number>>(
  persistedWidths ?? {}
);
```

(Importing the type: `useState` is already imported. We use a plain `Record<string, number>` to avoid pulling in `ColumnSizingState` from `@tanstack/react-table`.)

- [ ] **Step 4: Wire `columnSizing` state into the table and pass props to `MotionTable`**

Update the `useReactTable` call from Task 4:

Replace:
```ts
const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
  defaultColumn: { minSize: 60 },
});
```

With:
```ts
const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
  defaultColumn: { minSize: 60 },
  state: { columnSizing },
  onColumnSizingChange: setColumnSizing,
});
```

Add the resize-end handler. Place it next to `handleSort` (around line 427):

```tsx
const handleColumnResizeEnd = (colId: string, w: number) => {
  setColumnWidth(TABLE_ID, colId, w);
};
```

Find the `<MotionTable ... />` JSX (search for `<MotionTable` in the file). Add the new props:

Replace (the existing call, whatever shape it has):
```tsx
<MotionTable
  table={table}
  sortBy={sortBy}
  sortOrder={sortOrder}
  onSort={handleSort}
/>
```

With:
```tsx
<MotionTable
  table={table}
  sortBy={sortBy}
  sortOrder={sortOrder}
  onSort={handleSort}
  tableId={TABLE_ID}
  onColumnResizeEnd={handleColumnResizeEnd}
/>
```

(If the existing call has different formatting, preserve the existing props and add only the new two.)

- [ ] **Step 5: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test:run
```

Expected: PASS.

- [ ] **Step 6: Manual smoke**

Ask the user: "Run dev server. Drag a column wider, release. Refresh the page — the new width should persist. Drag back narrower, refresh — also persists. Open another library's detail page — its columns should still be at default (per-table-id isolation)."

- [ ] **Step 7: Commit**

```bash
git add web/src/components/MotionTable.tsx web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): persist column widths to localStorage via useTablePrefsStore

MotionTable emits onColumnResizeEnd(colId, width) on drag mouseup
(detected via columnSizingInfo.isResizingColumn transition). The
LibraryDetailPage hydrates initial columnSizing from the store keyed
by 'library-detail-files' and writes back via setColumnWidth on each
drag-end."
```

---

### Task 6: Double-click to reset column width

**Files:**
- Modify: `web/src/components/MotionTable.tsx`
- Modify: `web/src/pages/LibraryDetailPage.tsx`

`onDoubleClick` on the resize handle calls `onColumnResizeEnd(colId, NaN)`. The caller treats `NaN` as the reset sentinel: it removes the entry from both the store and the local `columnSizing` state, letting TanStack fall back to `column.size`.

- [ ] **Step 1: Add `onDoubleClick` to the `ResizeHandle` component**

In `web/src/components/MotionTable.tsx`, extend the `ResizeHandle` props and wire the handler:

Replace:
```tsx
function ResizeHandle<T>({
  header,
}: {
  header: ReturnType<TanStackTable<T>['getHeaderGroups']>[number]['headers'][number];
}) {
  const isResizing = header.column.getIsResizing();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize. Double-click to reset."
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      className="absolute top-0 right-[-3px] z-10 flex h-full w-[6px] cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      <span
        className={[
          'w-[2px] transition-colors',
          isResizing ? 'bg-white/60' : 'bg-transparent group-hover/handle:bg-white/30',
        ].join(' ')}
      />
    </div>
  );
}
```

With:
```tsx
function ResizeHandle<T>({
  header,
  onReset,
}: {
  header: ReturnType<TanStackTable<T>['getHeaderGroups']>[number]['headers'][number];
  onReset?: (columnId: string) => void;
}) {
  const isResizing = header.column.getIsResizing();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize. Double-click to reset."
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset?.(header.column.id);
      }}
      className="absolute top-0 right-[-3px] z-10 flex h-full w-[6px] cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      <span
        className={[
          'w-[2px] transition-colors',
          isResizing ? 'bg-white/60' : 'bg-transparent group-hover/handle:bg-white/30',
        ].join(' ')}
      />
    </div>
  );
}
```

(`e.stopPropagation()` prevents the double-click from bubbling to the `<TableHead>` `onClick` for sortable columns, which would otherwise trigger a sort toggle.)

- [ ] **Step 2: Wire `onReset` from `MotionTable` to `<ResizeHandle>` and the parent**

In the same file, find the line:

```tsx
{header.column.getCanResize() ? <ResizeHandle header={header} /> : null}
```

Replace with:

```tsx
{header.column.getCanResize() ? (
  <ResizeHandle
    header={header}
    onReset={(colId) => onColumnResizeEnd?.(colId, Number.NaN)}
  />
) : null}
```

(Uses the existing `onColumnResizeEnd` prop with `NaN` as the reset sentinel — keeps the MotionTable surface area minimal.)

- [ ] **Step 3: Update `handleColumnResizeEnd` in `LibraryDetailPage` to handle the sentinel**

In `web/src/pages/LibraryDetailPage.tsx`, find the existing `handleColumnResizeEnd`:

```tsx
const handleColumnResizeEnd = (colId: string, w: number) => {
  setColumnWidth(TABLE_ID, colId, w);
};
```

Replace with:

```tsx
const resetColumn = useTablePrefsStore((s) => s.resetColumn);

const handleColumnResizeEnd = (colId: string, w: number) => {
  if (Number.isNaN(w)) {
    resetColumn(TABLE_ID, colId);
    setColumnSizing((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
    return;
  }
  setColumnWidth(TABLE_ID, colId, w);
};
```

(The `resetColumn` selector goes near the other store hooks; place it right after the `setColumnWidth` line. The local `setColumnSizing` clear is required because TanStack's `columnSizing` state still holds the last-dragged value — without clearing it, double-click would re-render but TanStack would keep using the stale entry on top of the now-empty store.)

- [ ] **Step 4: Run typecheck + tests**

```bash
cd web && bun run typecheck && bun run test:run
```

Expected: PASS.

- [ ] **Step 5: Manual smoke**

Ask the user: "Run dev server. Drag a column wider, release, refresh — width persists. Now double-click the resize handle on that column — width should snap back to default (filename → 650, matched → 300, etc.). Refresh once more — still default. Sortable column header click should still toggle sort (double-clicking the handle should NOT have triggered a sort)."

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MotionTable.tsx web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): double-click resize handle to reset column width

ResizeHandle.onDoubleClick fires onColumnResizeEnd(colId, NaN); the
caller in LibraryDetailPage treats NaN as a reset sentinel, calling
resetColumn on the store and clearing the local columnSizing entry so
TanStack falls back to the column-def size. stopPropagation prevents
the sort header onClick from also firing."
```

---

### Task 7: Playwright E2E test

**Files:**
- Create: `web/e2e/library-column-resize.spec.ts`

The E2E mocks the API so it doesn't depend on a running backend. It loads a library detail page with a fixed list of media files, performs a drag, reloads, and asserts persistence.

- [ ] **Step 1: Read existing e2e patterns**

```bash
sed -n '1,80p' web/e2e/library-folder-picker.spec.ts
```

Note the `page.route()` mock pattern.

- [ ] **Step 2: Write the e2e spec**

Create `web/e2e/library-column-resize.spec.ts`:

```ts
import { expect, type Page, test } from '@playwright/test';

const LIBRARY_ID = 'lib-test-1';

async function setupAuthAndLibrary(page: Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ id: 'user-1', username: 'testuser' }),
    });
  });
  await page.route('**/api/v1/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ initialized: true }),
    });
  });
  await page.route(`**/api/v1/libraries/${LIBRARY_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        id: LIBRARY_ID,
        name: 'Test Library',
        path: '/mnt/test',
        enabled: 1,
        source_type: 'local',
        scan_interval_minutes: 60,
      }),
    });
  });
  await page.route(`**/api/v1/libraries/${LIBRARY_ID}/media-files*`, async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        items: [
          {
            id: 'f1',
            library_id: LIBRARY_ID,
            path: '/mnt/test/f1.mkv',
            filename: 'f1.mkv',
            size_bytes: 1_000_000_000,
            match_status: 'unmatched',
            subtitle_count: 0,
            matched_anime_title: '',
            matched_episode_sort: 0,
            matched_bangumi_id: 0,
            created_at: '2026-04-30T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 10,
      }),
    });
  });
}

async function getFilenameHeaderWidth(page: Page): Promise<number> {
  return await page.locator('thead th').nth(1).evaluate((el) => el.getBoundingClientRect().width);
}

test.describe('Library media files — column resizing', () => {
  test('drag, persist across reload, reset via double-click', async ({ page }) => {
    await setupAuthAndLibrary(page);
    await page.goto(`/libraries/${LIBRARY_ID}`);

    // Wait for the table row to render
    await expect(page.locator('tbody tr')).toHaveCount(1);

    const beforeWidth = await getFilenameHeaderWidth(page);
    expect(beforeWidth).toBeCloseTo(650, 0);

    // Find the resize handle on the filename column (2nd column;
    // 1st is the select checkbox column).
    const filenameHeader = page.locator('thead th').nth(1);
    const handle = filenameHeader.locator('[role="separator"]');
    await expect(handle).toBeVisible();

    // Drag the handle 100px to the right.
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const afterDragWidth = await getFilenameHeaderWidth(page);
    expect(afterDragWidth).toBeGreaterThan(beforeWidth + 50);

    // Reload — width should persist.
    await page.reload();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    const reloadedWidth = await getFilenameHeaderWidth(page);
    expect(reloadedWidth).toBeCloseTo(afterDragWidth, 0);

    // Double-click the handle — width resets to default.
    const handleAfter = page.locator('thead th').nth(1).locator('[role="separator"]');
    await handleAfter.dblclick();
    await page.waitForTimeout(100);
    const resetWidth = await getFilenameHeaderWidth(page);
    expect(resetWidth).toBeCloseTo(650, 0);

    // Reload — still default.
    await page.reload();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    const finalWidth = await getFilenameHeaderWidth(page);
    expect(finalWidth).toBeCloseTo(650, 0);
  });

  test('select and actions columns have no resize handle', async ({ page }) => {
    await setupAuthAndLibrary(page);
    await page.goto(`/libraries/${LIBRARY_ID}`);
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // The select column is index 0 (checkbox). Confirm no handle.
    const selectHeader = page.locator('thead th').nth(0);
    await expect(selectHeader.locator('[role="separator"]')).toHaveCount(0);

    // Last column is `actions` (since onMatch is wired in LibraryDetailPage).
    const lastHeader = page.locator('thead th').last();
    await expect(lastHeader.locator('[role="separator"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run the new e2e spec**

```bash
cd web && bun run test:e2e -- library-column-resize
```

Expected: PASS, 2 tests.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/library-column-resize.spec.ts
git commit -m "test(e2e): drag, persist across reload, double-click reset

Mocks /api/v1/libraries/:id and the media-files endpoint to avoid
backend dependency. Covers: drag widens column, reload persists,
double-click resets, reload still default. Second test asserts that
select and actions columns have no resize handle rendered."
```

---

### Task 8: Final verification & PR

**Files:** none (verification + git)

- [ ] **Step 1: Run the full quality gate**

```bash
cd web && bun run check:all
```

Expected: PASS (typecheck + lint + format check + unit tests).

- [ ] **Step 2: Run e2e suite once end-to-end**

```bash
cd web && bun run test:e2e
```

Expected: all e2e specs pass (existing + new).

- [ ] **Step 3: Confirm `meta.width` is fully purged**

```bash
cd web && grep -rn "ColumnMeta\|meta.width\|meta: { width" src 2>&1
```

Expected: no output.

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin feat/column-resizing
gh pr create --base main --head feat/column-resizing \
  --title "feat(web): user-resizable columns on library media files table" \
  --body "$(cat <<'EOF'
## Summary

Closes the last gap from the data-table polish track. Library media files
table now has user-resizable columns with per-table-id width persistence
in localStorage and a double-click-to-reset affordance.

## Implementation

- New `useTablePrefsStore` (zustand + persist `milmil-table-prefs`) keyed
  by `(tableId, columnId)` with `setColumnWidth` / `resetColumn` /
  `resetTable` actions
- `MotionTable` reads widths from `header.getSize()` / `column.getSize()`;
  `meta.width` augmentation removed
- `<ResizeHandle>` renders on each header where `column.getCanResize()`;
  6px hit area, 2px white/30 line on hover, white/60 during drag
- `select` and `actions` columns opt out via `enableResizing: false`
- End-of-drag detection via `useEffect` watching
  `columnSizingInfo.isResizingColumn`; emits one `onColumnResizeEnd`
  per drag
- Double-click handle calls `onColumnResizeEnd(colId, NaN)` as a reset
  sentinel; caller clears both the store entry and local TanStack state

Spec: `docs/superpowers/specs/2026-04-30-column-resizing-design.md`
Plan: `docs/superpowers/plans/2026-04-30-column-resizing.md`

## Test plan

- [x] `web/src/store/table-prefs-store.test.ts` — 7 unit tests covering
  set / reset / isolation / persist roundtrip
- [x] `web/e2e/library-column-resize.spec.ts` — drag / reload / reset cycle,
  no-handle assertion for select + actions columns
- [x] `bun run check:all` passes
- [x] Manual smoke in dev: drag widens, reload persists, double-click
  resets, sort still works on resizable header click
EOF
)"
```

- [ ] **Step 5: Wait for CI, address feedback, merge**

After CI is green, request user review and merge per the standard branch flow.

---

## Self-Review Checklist

After completing every task above, verify:

- [ ] No `meta.width` references remain anywhere in `web/src`
- [ ] `ColumnMeta` augmentation removed from `MotionTable.tsx`
- [ ] All 7 store unit tests + 2 e2e tests pass
- [ ] Drag widens column live (onChange mode); reload persists; double-click resets; reload after reset still default
- [ ] `select` checkbox column and `actions` column have NO resize handle on hover
- [ ] Sortable column header click toggles sort; double-clicking the resize handle does NOT trigger sort
- [ ] Resize handle is only visible on hover (`bg-transparent` at rest, `bg-white/30` on group hover, `bg-white/60` while dragging — no accent colour anywhere)
- [ ] Per memory `feedback_no_primary_color`: zero `mm-accent` references introduced by this change
