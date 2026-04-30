# Data-Table Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side column sorting and batch selection (bulk match/unmatch) to the library media files table.

**Architecture:** Backend adds `sort_by`/`sort_order` query params with Go-side SQL building (sqlc can't do dynamic ORDER BY). Two new bulk endpoints under `/media-files`. Frontend adds sorting state, row selection via TanStack Table, and a floating action bar.

**Tech Stack:** Go/Echo, SQLite, sqlc, TanStack React Table v8, TanStack Query v5, Motion, Zustand selectors

---

### Task 1: Backend — Server-Side Sorting

**Files:**
- Modify: `api/internal/api/media_file_handler.go:20-62`
- Modify: `api/internal/store/queries/media_files.sql:52-65`
- Modify: `api/internal/store/` (regenerate sqlc)

Since sqlc doesn't support dynamic ORDER BY, we'll create multiple named queries for each sort column, and select the right one in Go. However, that's verbose for 4 columns x 2 directions = 8 queries. A cleaner approach: keep the sqlc query for filtering/pagination, but build the ORDER BY clause in Go using a raw query wrapper.

Actually, the simplest approach: replace the sqlc `ListMediaFilesByLibrary` query with a Go function that builds the query string with a whitelisted ORDER BY, using the same SQL body.

- [ ] **Step 1: Add sort helper function to media_file_handler.go**

Add a `listMediaFilesSorted` method on `handler` that wraps the existing SQL with dynamic ORDER BY. Add this above `handleListMediaFiles`:

```go
// validSortColumns maps allowed sort_by values to SQL expressions.
var validSortColumns = map[string]string{
	"filename":       "mf.filename",
	"size_bytes":     "mf.size_bytes",
	"match_status":   "mf.match_status",
	"subtitle_count": "subtitle_count",
}

type mediaFileRow struct {
	ID                string  `json:"id"`
	LibraryID         string  `json:"library_id"`
	Path              string  `json:"path"`
	Filename          string  `json:"filename"`
	SizeBytes         int64   `json:"size_bytes"`
	MatchStatus       string  `json:"match_status"`
	SubtitleCount     int64   `json:"subtitle_count"`
	MatchedAnimeTitle string  `json:"matched_anime_title"`
	MatchedEpisodeSort float64 `json:"matched_episode_sort"`
	MatchedBangumiID  int64   `json:"matched_bangumi_id"`
	CreatedAt         string  `json:"created_at"`
}

func (h *handler) listMediaFilesSorted(ctx context.Context, libraryID, status, q, sortBy, sortOrder string, limit, offset int64) ([]mediaFileRow, error) {
	col, ok := validSortColumns[sortBy]
	if !ok {
		col = "mf.filename"
	}
	dir := "ASC"
	if strings.EqualFold(sortOrder, "desc") {
		dir = "DESC"
	}

	query := fmt.Sprintf(`
		SELECT mf.id, mf.library_id, mf.path, mf.filename, mf.size_bytes, mf.match_status, mf.created_at,
		       COALESCE(a.title, '') AS matched_anime_title,
		       COALESCE(e.episode_number, 0) AS matched_episode_sort,
		       COALESCE(a.bangumi_id, 0) AS matched_bangumi_id,
		       (SELECT COUNT(*) FROM subtitle_files sf WHERE sf.media_file_id = mf.id) AS subtitle_count
		FROM media_files mf
		LEFT JOIN episodes e ON mf.episode_id = e.id
		LEFT JOIN anime a ON e.anime_id = a.id
		WHERE mf.library_id = ?
		  AND (? = 'all' OR (? = 'matched' AND mf.match_status != 'unmatched') OR mf.match_status = ?)
		  AND (? = '' OR mf.filename LIKE '%%' || ? || '%%')
		ORDER BY %s %s
		LIMIT ? OFFSET ?`, col, dir)

	rows, err := h.db.QueryContext(ctx, query,
		libraryID, status, status, status, q, q, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []mediaFileRow
	for rows.Next() {
		var r mediaFileRow
		if err := rows.Scan(&r.ID, &r.LibraryID, &r.Path, &r.Filename, &r.SizeBytes,
			&r.MatchStatus, &r.CreatedAt, &r.MatchedAnimeTitle, &r.MatchedEpisodeSort,
			&r.MatchedBangumiID, &r.SubtitleCount); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	if results == nil {
		results = []mediaFileRow{}
	}
	return results, rows.Err()
}
```

Note: `h.db` is the `*sql.DB` handle. Check how the handler struct accesses the raw DB — it may be `h.db` or passed through another field. The handler struct is defined in the handler file; read it to confirm the field name.

- [ ] **Step 2: Update handleListMediaFiles to parse sort params and use the new function**

Replace the query call in `handleListMediaFiles` (lines 33-65):

```go
func (h *handler) handleListMediaFiles(c echo.Context) error {
	libraryID := c.Param("id")

	_, err := h.queries.GetLibrary(c.Request().Context(), libraryID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	status := c.QueryParam("status")
	if status == "" {
		status = "all"
	}
	q := c.QueryParam("q")
	sortBy := c.QueryParam("sort_by")
	if sortBy == "" {
		sortBy = "filename"
	}
	sortOrder := c.QueryParam("sort_order")
	if sortOrder == "" {
		sortOrder = "asc"
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))
	if perPage < 1 {
		perPage = 50
	}
	if perPage > 100 {
		perPage = 100
	}

	offset := (page - 1) * perPage

	files, err := h.listMediaFilesSorted(c.Request().Context(),
		libraryID, status, q, sortBy, sortOrder, int64(perPage), int64(offset))
	if err != nil {
		return echo.ErrInternalServerError
	}

	total, err := h.queries.CountMediaFilesByStatus(c.Request().Context(), store.CountMediaFilesByStatusParams{
		LibraryID:   libraryID,
		Column2:     status,
		Column3:     status,
		MatchStatus: status,
		Column5:     q,
		Column6:     sql.NullString{String: q, Valid: q != ""},
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items":    files,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}
```

- [ ] **Step 3: Ensure handler has access to raw *sql.DB**

Check the handler struct definition. If it only has `queries *store.Queries`, you need to also store the `*sql.DB`. Look at how the handler is constructed in `router.go` or `server.go` and add `db *sql.DB` to the struct if not already present. Add `"context"` and `"fmt"` to imports.

- [ ] **Step 4: Build and verify**

Run: `cd api && go build ./...`
Expected: Clean build with no errors.

- [ ] **Step 5: Manual test**

Start the server and test:
```bash
curl -s "http://localhost:8080/api/v1/libraries/<LIB_ID>/media-files?sort_by=size_bytes&sort_order=desc&per_page=5" -H "Authorization: Bearer <TOKEN>" | jq '.items[:3] | .[].size_bytes'
```
Expected: File sizes in descending order.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/media_file_handler.go
git commit -m "feat(api): add server-side sorting to media files endpoint"
```

---

### Task 2: Backend — Bulk Match & Unmatch Endpoints

**Files:**
- Modify: `api/internal/api/media_file_handler.go` (add two handlers)
- Modify: `api/internal/api/router.go:122-126` (register routes)

- [ ] **Step 1: Add bulk match handler**

Append to `media_file_handler.go`:

```go
type bulkMatchRequest struct {
	FileIDs      []string `json:"file_ids"`
	BangumiID    int64    `json:"bangumi_id"`
	EpisodeStart int64    `json:"episode_start"`
}

func (h *handler) handleBulkMatchMediaFiles(c echo.Context) error {
	var req bulkMatchRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if len(req.FileIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids required")
	}
	if req.BangumiID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "bangumi_id required")
	}
	if len(req.FileIDs) > 500 {
		return echo.NewHTTPError(http.StatusBadRequest, "max 500 files per request")
	}

	ctx := c.Request().Context()
	matched := 0
	for i, fileID := range req.FileIDs {
		episodeSort := req.EpisodeStart + int64(i)

		// Look up the episode by bangumi_id + episode_number
		episode, err := h.queries.GetEpisodeByAnimeAndSort(ctx, store.GetEpisodeByAnimeAndSortParams{
			BangumiID:     req.BangumiID,
			EpisodeNumber: float64(episodeSort),
		})
		if err != nil {
			continue // skip files where episode doesn't exist
		}

		if err := h.queries.UpdateMediaFileMatch(ctx, store.UpdateMediaFileMatchParams{
			DandanplayAnimeID:   sql.NullInt64{Int64: req.BangumiID, Valid: true},
			DandanplayEpisodeID: sql.NullInt64{Int64: episode.ID, Valid: true},
			ID:                  fileID,
		}); err != nil {
			continue
		}

		// Link to resolved episode
		if err := h.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
			EpisodeID: sql.NullString{String: episode.ID, Valid: true},
			ID:        fileID,
		}); err != nil {
			continue
		}

		matched++
	}

	return c.JSON(http.StatusOK, map[string]any{"matched": matched})
}
```

Note: The `GetEpisodeByAnimeAndSort` query may not exist. Check if there's a query that looks up an episode by anime's bangumi_id and episode_number. If not, you'll need to add one — see Step 2.

- [ ] **Step 2: Add episode lookup query if needed**

Check `api/internal/store/queries/episodes.sql` for a query that finds an episode by bangumi_id + episode_number. If missing, add to `episodes.sql`:

```sql
-- name: GetEpisodeByAnimeAndSort :one
SELECT e.* FROM episodes e
JOIN anime a ON e.anime_id = a.id
WHERE a.bangumi_id = ? AND e.episode_number = ?
LIMIT 1;
```

Then regenerate: `cd api && go generate ./...` (or `sqlc generate` if that's the pattern).

Check the existing `UpdateMediaFileMatch` params struct — the field names `DandanplayAnimeID` and `DandanplayEpisodeID` are from the sqlc-generated code. The `DandanplayEpisodeID` here actually stores a bangumi episode ID based on how the single match handler uses it. Verify the column semantics match.

Also check `UpdateMediaFileEpisodeID` params — the `EpisodeID` field type may be `sql.NullString` or `sql.NullInt64` depending on the schema. Read the generated Go type to confirm.

- [ ] **Step 3: Add bulk unmatch handler**

Append to `media_file_handler.go`:

```go
type bulkUnmatchRequest struct {
	FileIDs []string `json:"file_ids"`
}

func (h *handler) handleBulkUnmatchMediaFiles(c echo.Context) error {
	var req bulkUnmatchRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if len(req.FileIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "file_ids required")
	}
	if len(req.FileIDs) > 500 {
		return echo.NewHTTPError(http.StatusBadRequest, "max 500 files per request")
	}

	ctx := c.Request().Context()
	cleared := 0
	for _, fileID := range req.FileIDs {
		if err := h.queries.ClearMediaFileMatch(ctx, fileID); err != nil {
			continue
		}
		cleared++
	}

	return c.JSON(http.StatusOK, map[string]any{"cleared": cleared})
}
```

- [ ] **Step 4: Register routes in router.go**

Add after line 126 (`mediaGroup.GET("/:id/info", h.handleMediaInfo)`):

```go
mediaGroup.POST("/bulk-match", h.handleBulkMatchMediaFiles)
mediaGroup.POST("/bulk-unmatch", h.handleBulkUnmatchMediaFiles)
```

Important: These must be registered BEFORE the `/:id/*` routes to avoid `:id` capturing "bulk-match" as a param. Move them above line 124.

- [ ] **Step 5: Build and verify**

Run: `cd api && go build ./...`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/media_file_handler.go api/internal/api/router.go api/internal/store/queries/episodes.sql api/internal/store/
git commit -m "feat(api): add bulk match and unmatch endpoints for media files"
```

---

### Task 3: Frontend — Sorting State & API Params

**Files:**
- Modify: `web/src/lib/api/library.ts:130-160`
- Modify: `web/src/pages/LibraryDetailPage.tsx:321-360, 518-522`

- [ ] **Step 1: Add sort params to API types and client**

In `web/src/lib/api/library.ts`, update `MediaFilesParams`:

```typescript
export interface MediaFilesParams {
  status?: 'all' | 'matched' | 'unmatched';
  q?: string;
  page?: number;
  per_page?: number;
  sort_by?: 'filename' | 'size_bytes' | 'match_status' | 'subtitle_count';
  sort_order?: 'asc' | 'desc';
}
```

Update the `mediaFiles` function to pass sort params:

```typescript
mediaFiles: (id: string, params: MediaFilesParams = {}) => {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.q) searchParams.set('q', params.q);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.per_page) searchParams.set('per_page', String(params.per_page));
  if (params.sort_by) searchParams.set('sort_by', params.sort_by);
  if (params.sort_order) searchParams.set('sort_order', params.sort_order);
  const qs = searchParams.toString();
  return api.get<MediaFilesResponse>(`/api/v1/libraries/${id}/media-files${qs ? `?${qs}` : ''}`);
},
```

Add bulk API functions after the existing `mediaFiles` entry in `libraryApi` or in a new section. Actually, since bulk endpoints are under `/media-files` not `/libraries`, add them separately:

```typescript
export const mediaFileApi = {
  bulkMatch: (data: { file_ids: string[]; bangumi_id: number; episode_start: number }) =>
    api.post<{ matched: number }>('/api/v1/media-files/bulk-match', data),
  bulkUnmatch: (data: { file_ids: string[] }) =>
    api.post<{ cleared: number }>('/api/v1/media-files/bulk-unmatch', data),
};
```

- [ ] **Step 2: Add sorting state to FileTable**

In `LibraryDetailPage.tsx`, inside `FileTable` component, add state after existing state declarations (around line 332):

```typescript
const [sortBy, setSortBy] = useState<'filename' | 'size_bytes' | 'match_status' | 'subtitle_count'>('filename');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
```

Update the `useQuery` call to include sort params:

```typescript
const { data, isLoading, isFetching } = useQuery<MediaFilesResponse, Error>({
  queryKey: ['media-files', libraryId, page, perPage, statusFilter, debouncedSearch, sortBy, sortOrder],
  queryFn: () =>
    libraryApi.mediaFiles(libraryId, {
      status: statusFilter === 'all' ? undefined : statusFilter,
      q: debouncedSearch || undefined,
      page,
      per_page: perPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
  enabled: !!libraryId,
  staleTime: 0,
  placeholderData: keepPreviousData,
});
```

Add a sort toggle handler:

```typescript
const handleSort = (column: typeof sortBy) => {
  if (sortBy === column) {
    if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      // Reset to default
      setSortBy('filename');
      setSortOrder('asc');
    }
  } else {
    setSortBy(column);
    setSortOrder('asc');
  }
  setPage(1);
};
```

- [ ] **Step 3: Typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api/library.ts web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add sorting state and API params to media files table"
```

---

### Task 4: Frontend — Sortable Column Headers in MotionTable

**Files:**
- Modify: `web/src/components/MotionTable.tsx`

- [ ] **Step 1: Add sort props and indicator to MotionTable**

Replace the entire `MotionTable.tsx`:

```tsx
'use no memo';

import { flexRender, type Table as TanStackTable } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface MotionTableProps<T> {
  table: TanStackTable<T>;
  tableClassName?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (columnId: string) => void;
}

const sortableColumns = new Set(['filename', 'size_bytes', 'match_status', 'subtitle_count']);

export function MotionTable<T>({ table, tableClassName, sortBy, sortOrder, onSort }: MotionTableProps<T>) {
  return (
    <Table className={tableClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
            {headerGroup.headers.map((header) => {
              const width = header.column.columnDef.meta?.width;
              const colId = header.column.id ?? header.column.columnDef.accessorKey;
              const isSortable = onSort && sortableColumns.has(colId as string);
              const isActive = sortBy === colId;

              return (
                <TableHead
                  key={header.id}
                  className={`text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3 ${isSortable ? 'cursor-pointer select-none hover:text-white/50 transition-colors' : ''}`}
                  style={width ? { width, minWidth: width, maxWidth: width } : undefined}
                  onClick={isSortable ? () => onSort(colId as string) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {isSortable && isActive && (
                      <svg
                        className="w-3 h-3 text-white/50"
                        viewBox="0 0 12 12"
                        fill="currentColor"
                      >
                        {sortOrder === 'asc' ? (
                          <path d="M6 2L10 8H2L6 2Z" />
                        ) : (
                          <path d="M6 10L2 4H10L6 10Z" />
                        )}
                      </svg>
                    )}
                    {isSortable && !isActive && (
                      <svg
                        className="w-3 h-3 text-white/10"
                        viewBox="0 0 12 12"
                        fill="currentColor"
                      >
                        <path d="M6 2L9 5.5H3L6 2Z" />
                        <path d="M6 10L3 6.5H9L6 10Z" />
                      </svg>
                    )}
                  </span>
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
              const width = cell.column.columnDef.meta?.width;
              return (
                <TableCell
                  key={cell.id}
                  className="py-3 transition-colors duration-150 group-hover:text-mm-accent/80"
                  style={width ? { width, minWidth: width, maxWidth: width } : undefined}
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

- [ ] **Step 2: Pass sort props from FileTable to MotionTable**

In `LibraryDetailPage.tsx`, update the `<MotionTable>` call (around line 631):

```tsx
<MotionTable
  table={table}
  tableClassName="table-fixed"
  sortBy={sortBy}
  sortOrder={sortOrder}
  onSort={handleSort}
/>
```

- [ ] **Step 3: Typecheck and visual verify**

Run: `cd web && bun run typecheck`
Expected: No errors.

Start dev server, navigate to a library detail page. Click column headers — should see sort indicators and data re-ordered on each click.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MotionTable.tsx web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add sortable column headers with sort indicators"
```

---

### Task 5: Frontend — Row Selection with Checkboxes

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx:321-522`

- [ ] **Step 1: Add row selection state and checkbox column**

In `FileTable`, add selection state:

```typescript
const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
```

Clear selection on page/filter/search changes — add to `handleFilterChange`:

```typescript
const handleFilterChange = (f: 'all' | 'matched' | 'unmatched') => {
  setStatusFilter(f);
  setPage(1);
  setRowSelection({});
};
```

Also clear in the debounce effect and when page changes. Add an effect:

```typescript
useEffect(() => {
  setRowSelection({});
}, [page, debouncedSearch]);
```

Add the checkbox column as the first column in the `columns` useMemo (before the `filename` column):

```typescript
{
  id: 'select',
  meta: { width: 40 },
  header: () => {
    const allSelected = files.length > 0 && files.every((f) => rowSelection[f.id]);
    const someSelected = files.some((f) => rowSelection[f.id]) && !allSelected;
    return (
      <Checkbox
        checked={allSelected}
        // indeterminate visual: use a different style when someSelected
        onCheckedChange={(checked) => {
          if (checked) {
            const next: Record<string, boolean> = {};
            for (const f of files) next[f.id] = true;
            setRowSelection(next);
          } else {
            setRowSelection({});
          }
        }}
        size={15}
        className={someSelected ? 'opacity-60' : ''}
      />
    );
  },
  cell: ({ row }: { row: { original: MediaFileEntry } }) => (
    <Checkbox
      checked={!!rowSelection[row.original.id]}
      onCheckedChange={(checked) => {
        setRowSelection((prev) => {
          const next = { ...prev };
          if (checked) {
            next[row.original.id] = true;
          } else {
            delete next[row.original.id];
          }
          return next;
        });
      }}
      size={15}
    />
  ),
} satisfies ColumnDef<MediaFileEntry>,
```

Make sure `Checkbox` is imported at the top of the file:

```typescript
import { Checkbox } from '@/components/ui/checkbox';
```

Update the `useReactTable` call — add `getRowId`:

```typescript
const table = useReactTable({
  data: files,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (row) => row.id,
});
```

- [ ] **Step 2: Typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add row selection checkboxes to media files table"
```

---

### Task 6: Frontend — Floating Action Bar with Bulk Operations

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx` (inside FileTable, after DataPagination)
- Uses: `web/src/lib/api/library.ts` (mediaFileApi already added in Task 3)

- [ ] **Step 1: Add floating action bar**

Inside `FileTable`, after the `<DataPagination>` component, add the floating bar. Import `AnimatePresence` and `motion` from `motion/react`, `useMutation` and `useQueryClient` from `@tanstack/react-query`, and `mediaFileApi` from the API file.

```tsx
const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
const selectedCount = selectedIds.length;
const queryClient = useQueryClient();

const bulkUnmatchMutation = useMutation({
  mutationFn: (fileIds: string[]) => mediaFileApi.bulkUnmatch({ file_ids: fileIds }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['media-files', libraryId] });
    setRowSelection({});
  },
});
```

Add the floating bar JSX after `<DataPagination>`:

```tsx
<AnimatePresence>
  {selectedCount > 0 && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.15 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.06] shadow-2xl"
    >
      <span className="text-sm text-white/70 tabular-nums">
        {selectedCount} {i18n._(msg`library.detail.selected`)}
      </span>
      <div className="w-px h-5 bg-white/10" />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          // Open match modal for bulk — set a state to trigger it
          setBulkMatchOpen(true);
        }}
      >
        {i18n._(msg`library.detail.bulkMatch`)}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          if (confirm(i18n._(msg`library.detail.bulkUnmatchConfirm`))) {
            bulkUnmatchMutation.mutate(selectedIds);
          }
        }}
        disabled={bulkUnmatchMutation.isPending}
      >
        {i18n._(msg`library.detail.bulkUnmatch`)}
      </Button>
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 2: Add bulk match flow**

Add state for the bulk match modal:

```typescript
const [bulkMatchOpen, setBulkMatchOpen] = useState(false);
```

For the bulk match modal, reuse the existing `MatchModal` search step (step 1 — anime search) but with a custom confirm handler. The simplest approach: create a `BulkMatchModal` that reuses the anime search from `MatchModal` but calls `mediaFileApi.bulkMatch` instead.

Add a new component `BulkMatchModal` in the same file (or import from a separate file). It should:
1. Show anime search (same as MatchModal step 1)
2. Ask for starting episode number
3. Call `mediaFileApi.bulkMatch({ file_ids: selectedIds, bangumi_id, episode_start })`

```tsx
function BulkMatchModal({
  fileIds,
  onClose,
}: {
  fileIds: string[];
  onClose: () => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<{ id: number; title: string } | null>(null);
  const [episodeStart, setEpisodeStart] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = useQuery({
    queryKey: ['discover-search', debouncedQuery],
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const bulkMatchMutation = useMutation({
    mutationFn: () =>
      mediaFileApi.bulkMatch({
        file_ids: fileIds,
        bangumi_id: selectedAnime!.id,
        episode_start: episodeStart,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['media-files'] });
      toast.success(i18n._(msg`library.detail.bulkMatchSuccess`, { count: data.matched }));
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {i18n._(msg`library.detail.bulkMatchTitle`, { count: fileIds.length })}
          </DialogTitle>
        </DialogHeader>

        {!selectedAnime ? (
          <div className="space-y-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={i18n._(msg`library.detail.searchAnime`)}
              className="w-full h-9 bg-white/[0.05] rounded-lg px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/[0.08] transition-colors"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {searchResults.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              )}
              {searchResults.data?.map((anime: any) => (
                <button
                  key={anime.id}
                  type="button"
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                  onClick={() => setSelectedAnime({ id: anime.id, title: anime.title })}
                >
                  <span className="text-sm text-white/80 truncate">{anime.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.04]">
              <span className="text-sm text-white/70 truncate flex-1">{selectedAnime.title}</span>
              <Button size="xs" variant="ghost" onClick={() => setSelectedAnime(null)}>
                {i18n._(msg`common.change`)}
              </Button>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">
                {i18n._(msg`library.detail.episodeStart`)}
              </label>
              <input
                type="number"
                min={1}
                value={episodeStart}
                onChange={(e) => setEpisodeStart(Number(e.target.value))}
                className="w-24 h-9 bg-white/[0.05] rounded-lg px-3 text-sm text-white focus:outline-none focus:bg-white/[0.08] transition-colors"
              />
              <p className="text-xs text-white/25 mt-1">
                {i18n._(msg`library.detail.episodeStartHint`, {
                  count: fileIds.length,
                  start: episodeStart,
                  end: episodeStart + fileIds.length - 1,
                })}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => bulkMatchMutation.mutate()}
              disabled={bulkMatchMutation.isPending}
            >
              {bulkMatchMutation.isPending
                ? i18n._(msg`common.loading`)
                : i18n._(msg`library.detail.matchFiles`, { count: fileIds.length })}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Add the modal rendering in `FileTable`'s return, after the floating bar:

```tsx
{bulkMatchOpen && (
  <BulkMatchModal
    fileIds={selectedIds}
    onClose={() => {
      setBulkMatchOpen(false);
      setRowSelection({});
    }}
  />
)}
```

Make sure `discoverApi`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Skeleton`, `toast`, and `Button` are imported. Check existing imports in the file — most should already be available.

- [ ] **Step 3: Add i18n keys**

Run `bun run i18n:extract` from `web/` to pick up new message keys. Fill in translations for:
- `library.detail.selected` — "{count} selected" / "{count} 已選擇"
- `library.detail.bulkMatch` — "Bulk Match" / "批次匹配"
- `library.detail.bulkUnmatch` — "Bulk Unmatch" / "批次取消匹配"
- `library.detail.bulkUnmatchConfirm` — "Unmatch {count} files?" / "取消匹配 {count} 個檔案？"
- `library.detail.bulkMatchTitle` — "Match {count} files" / "匹配 {count} 個檔案"
- `library.detail.searchAnime` — "Search anime..." / "搜尋動畫..."
- `library.detail.episodeStart` — "Starting episode" / "起始集數"
- `library.detail.episodeStartHint` — "{count} files → EP{start}–EP{end}" / "{count} 個檔案 → EP{start}–EP{end}"
- `library.detail.matchFiles` — "Match {count} files" / "匹配 {count} 個檔案"
- `library.detail.bulkMatchSuccess` — "Matched {count} files" / "已匹配 {count} 個檔案"
- `common.change` — "Change" / "更換"

- [ ] **Step 4: Typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx web/src/locales/
git commit -m "feat(web): add floating action bar with bulk match/unmatch operations"
```

---

### Task 7: End-to-End Verification

- [ ] **Step 1: Build backend**

Run: `cd api && go build ./...`
Expected: Clean build.

- [ ] **Step 2: Typecheck + lint frontend**

Run: `cd web && bun run check:all`
Expected: All checks pass.

- [ ] **Step 3: Manual E2E test**

With the server running and a library with media files:

1. Navigate to library detail page
2. Click "Filename" header → files sort A-Z, arrow up shown
3. Click again → files sort Z-A, arrow down shown
4. Click again → resets to default
5. Click "Size" header → sorts by size ascending
6. Select 3 files via checkboxes → floating bar appears with "3 selected"
7. Click "Select all" checkbox → all on page selected
8. Change page → selection clears
9. Select 2 unmatched files → click "Bulk Match" → search anime → select → set EP start → confirm
10. Select 2 matched files → click "Bulk Unmatch" → confirm → files show as unmatched

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during E2E testing"
```
