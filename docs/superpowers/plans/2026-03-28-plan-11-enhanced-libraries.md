# Enhanced Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the libraries feature with a detail page showing media files, match status, scan history, stats — plus manual matching, enriched library cards, and SMB network discovery.

**Architecture:** New sqlc queries for stats aggregation and paginated media file listing. New handlers for media file operations. Frontend adds a `/libraries/:id` detail page with tabs (All Files / Unmatched / Scan History), a manual match modal, and enriched library cards showing file counts and match percentages.

**Tech Stack:** Go (Echo, sqlc, SQLite), React 19 (TanStack Router, TanStack Query, Tailwind v4, Motion, Lingui)

**Spec:** `docs/superpowers/specs/2026-03-28-enhanced-libraries-design.md`

---

### Task 1: SQL Queries — Stats Aggregation + Paginated Media Files

**Files:**
- Modify: `api/internal/store/queries/libraries.sql`
- Modify: `api/internal/store/queries/media_files.sql`

- [ ] **Step 1: Add ListLibrariesWithStats query**

In `api/internal/store/queries/libraries.sql`, append:

```sql
-- name: ListLibrariesWithStats :many
SELECT l.*,
  COALESCE(s.file_count, 0) AS file_count,
  COALESCE(s.matched_count, 0) AS matched_count,
  COALESCE(s.unmatched_count, 0) AS unmatched_count,
  COALESCE(s.total_size_bytes, 0) AS total_size_bytes
FROM libraries l
LEFT JOIN (
  SELECT library_id,
    COUNT(*) AS file_count,
    SUM(CASE WHEN match_status != 'unmatched' THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched_count,
    COALESCE(SUM(size_bytes), 0) AS total_size_bytes
  FROM media_files GROUP BY library_id
) s ON l.id = s.library_id
ORDER BY l.name ASC;

-- name: GetLibraryWithStats :one
SELECT l.*,
  COALESCE(s.file_count, 0) AS file_count,
  COALESCE(s.matched_count, 0) AS matched_count,
  COALESCE(s.unmatched_count, 0) AS unmatched_count,
  COALESCE(s.total_size_bytes, 0) AS total_size_bytes
FROM libraries l
LEFT JOIN (
  SELECT library_id,
    COUNT(*) AS file_count,
    SUM(CASE WHEN match_status != 'unmatched' THEN 1 ELSE 0 END) AS matched_count,
    SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched_count,
    COALESCE(SUM(size_bytes), 0) AS total_size_bytes
  FROM media_files GROUP BY library_id
) s ON l.id = s.library_id
WHERE l.id = ?;
```

- [ ] **Step 2: Add media file queries**

In `api/internal/store/queries/media_files.sql`, append:

```sql
-- name: ListMediaFilesByLibrary :many
SELECT mf.*,
       COALESCE(e.title, '') AS matched_anime_title,
       COALESCE(e.episode_number, 0) AS matched_episode_sort,
       (SELECT COUNT(*) FROM subtitle_files sf WHERE sf.media_file_id = mf.id) AS subtitle_count
FROM media_files mf
LEFT JOIN episodes e ON mf.episode_id = e.id
WHERE mf.library_id = ?
  AND (? = 'all' OR mf.match_status = ?)
  AND (? = '' OR mf.filename LIKE '%' || ? || '%')
ORDER BY mf.filename ASC
LIMIT ? OFFSET ?;

-- name: CountMediaFilesByStatus :one
SELECT COUNT(*) AS total
FROM media_files
WHERE library_id = ?
  AND (? = 'all' OR match_status = ?)
  AND (? = '' OR filename LIKE '%' || ? || '%');

-- name: UpdateMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = ?, dandanplay_episode_id = ?, match_status = 'manual',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ClearMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = NULL, dandanplay_episode_id = NULL,
    episode_id = NULL, match_status = 'unmatched',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
```

- [ ] **Step 3: Run sqlc generate**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && sqlc generate
```

Expected: generates updated `libraries.sql.go` and `media_files.sql.go` with new types and methods.

- [ ] **Step 4: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...
```

Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add api/internal/store/
git commit -m "feat(api): add sqlc queries for library stats and media file listing"
```

---

### Task 2: Backend Handlers — Media Files List + Match/Unmatch

**Files:**
- Create: `api/internal/api/media_file_handler.go`
- Modify: `api/internal/api/library_handler.go` (update list/get to use WithStats queries)
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create media file handler**

Create `api/internal/api/media_file_handler.go`:

```go
package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"milmil/internal/store"
)

type mediaFileResponse struct {
	store.MediaFile
	MatchedAnimeTitle  string `json:"matched_anime_title"`
	MatchedEpisodeSort int64  `json:"matched_episode_sort"`
	SubtitleCount      int64  `json:"subtitle_count"`
}

type mediaFilesListResponse struct {
	Items   []mediaFileResponse `json:"items"`
	Total   int64               `json:"total"`
	Page    int                 `json:"page"`
	PerPage int                 `json:"per_page"`
}

func (h *handler) handleListMediaFiles(c echo.Context) error {
	libraryID := c.Param("id")

	// Check library exists
	_, err := h.queries.GetLibrary(c.Request().Context(), libraryID)
	if err != nil {
		return echo.ErrNotFound
	}

	// Parse query params
	status := c.QueryParam("status")
	if status == "" {
		status = "all"
	}
	search := c.QueryParam("q")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))
	if perPage < 1 || perPage > 100 {
		perPage = 50
	}
	offset := (page - 1) * perPage

	// Fetch files
	rows, err := h.queries.ListMediaFilesByLibrary(c.Request().Context(), store.ListMediaFilesByLibraryParams{
		LibraryID:    libraryID,
		StatusFilter: status,
		Search:       search,
		PerPage:      int64(perPage),
		PageOffset:   int64(offset),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Count total
	total, err := h.queries.CountMediaFilesByStatus(c.Request().Context(), store.CountMediaFilesByStatusParams{
		LibraryID:    libraryID,
		StatusFilter: status,
		Search:       search,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	items := make([]mediaFileResponse, len(rows))
	for i, row := range rows {
		items[i] = mediaFileResponse{
			MediaFile:          row.MediaFile,
			MatchedAnimeTitle:  row.MatchedAnimeTitle,
			MatchedEpisodeSort: int64(row.MatchedEpisodeSort),
			SubtitleCount:      row.SubtitleCount,
		}
	}

	return c.JSON(http.StatusOK, mediaFilesListResponse{
		Items:   items,
		Total:   total,
		Page:    page,
		PerPage: perPage,
	})
}

type matchMediaFileRequest struct {
	BangumiID int64 `json:"bangumi_id"`
	EpisodeID int64 `json:"episode_id"`
}

// Note: JSON tags use snake_case to match frontend. Go field names stay PascalCase.

func (h *handler) handleMatchMediaFile(c echo.Context) error {
	fileID := c.Param("id")

	var req matchMediaFileRequest
	if err := c.Bind(&req); err != nil {
		return echo.ErrBadRequest
	}
	if req.BangumiID == 0 || req.EpisodeID == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "bangumi_id and episode_id required")
	}

	// Check file exists
	_, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrNotFound
	}

	err = h.queries.UpdateMediaFileMatch(c.Request().Context(), store.UpdateMediaFileMatchParams{
		DandanplayAnimeID:   toNullInt64(req.BangumiID),
		DandanplayEpisodeID: toNullInt64(req.EpisodeID),
		ID:                  fileID,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	// Return updated file
	file, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, file)
}

func (h *handler) handleUnmatchMediaFile(c echo.Context) error {
	fileID := c.Param("id")

	_, err := h.queries.GetMediaFileByID(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrNotFound
	}

	err = h.queries.ClearMediaFileMatch(c.Request().Context(), fileID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.NoContent(http.StatusNoContent)
}
```

> **Note**: Use `sql.NullInt64{Int64: v, Valid: v != 0}` inline (following existing pattern in `library_handler.go`) rather than creating a helper function. Import `database/sql` at the top.

- [ ] **Step 2: Update library handler to use WithStats queries**

In `api/internal/api/library_handler.go`, update `handleListLibraries` to use `ListLibrariesWithStats` and `handleGetLibrary` to use `GetLibraryWithStats`. The response type will change to include the stats fields.

Replace the body of `handleListLibraries`:
```go
func (h *handler) handleListLibraries(c echo.Context) error {
	libs, err := h.queries.ListLibrariesWithStats(c.Request().Context())
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, libs)
}
```

Replace the body of `handleGetLibrary`:
```go
func (h *handler) handleGetLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibraryWithStats(c.Request().Context(), c.Param("id"))
	if err != nil {
		return echo.ErrNotFound
	}
	return c.JSON(http.StatusOK, lib)
}
```

- [ ] **Step 3: Register new routes**

In `api/internal/api/router.go`, add to the library group:

```go
libGroup.GET("/:id/media-files", h.handleListMediaFiles)
```

Add a new media files group (also JWT-protected):

```go
// Media files — protected
mediaGroup := v1.Group("/media-files", jwtMiddleware(cfg.JWTSecret))
mediaGroup.PUT("/:id/match", h.handleMatchMediaFile)
mediaGroup.DELETE("/:id/match", h.handleUnmatchMediaFile)
```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...
```

Expected: PASS. Adjust types as needed based on sqlc-generated structs (the `ListMediaFilesByLibraryRow` struct may need field mapping adjustments).

- [ ] **Step 5: Write tests**

In `api/internal/api/library_handler_test.go`, add tests:

```go
func TestListMediaFiles_Empty(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()

	// Create library
	createBody := `{"name":"Anime","path":"` + dir + `"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", createBody)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var lib map[string]any
	json.NewDecoder(rec.Body).Decode(&lib)
	id := lib["id"].(string)

	// List media files
	req2 := makeAuthRequest(t, e, http.MethodGet, "/api/v1/libraries/"+id+"/media-files", "")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("want 200 got %d: %s", rec2.Code, rec2.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec2.Body).Decode(&resp)
	items := resp["items"].([]any)
	if len(items) != 0 {
		t.Errorf("want 0 items, got %d", len(items))
	}
}

func TestListLibrariesWithStats(t *testing.T) {
	e := newTestApp(t)
	dir := t.TempDir()

	createBody := `{"name":"Anime","path":"` + dir + `"}`
	req := makeAuthRequest(t, e, http.MethodPost, "/api/v1/libraries", createBody)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d: %s", rec.Code, rec.Body.String())
	}

	// List should include stats fields
	req2 := makeAuthRequest(t, e, http.MethodGet, "/api/v1/libraries", "")
	rec2 := httptest.NewRecorder()
	e.ServeHTTP(rec2, req2)
	var libs []map[string]any
	json.NewDecoder(rec2.Body).Decode(&libs)
	if len(libs) != 1 {
		t.Fatalf("want 1 lib, got %d", len(libs))
	}
	if _, ok := libs[0]["file_count"]; !ok {
		t.Error("missing file_count in response")
	}
}
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/api/ -v -run "TestListMediaFiles|TestListLibrariesWithStats"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/internal/api/
git commit -m "feat(api): add media file list, match/unmatch endpoints and stats"
```

---

### Task 3: Backend — Network Discovery Endpoint

**Files:**
- Create: `api/internal/api/network_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create network discovery handler**

Create `api/internal/api/network_handler.go`:

```go
package api

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	smb2 "github.com/hirochachacha/go-smb2"
	"github.com/labstack/echo/v4"
)

type discoveredHost struct {
	IP       string   `json:"ip"`
	Hostname string   `json:"hostname"`
	Shares   []string `json:"shares"`
}

type discoverNetworkResponse struct {
	Hosts []discoveredHost `json:"hosts"`
}

func (h *handler) handleDiscoverNetwork(c echo.Context) error {
	ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
	defer cancel()

	// Get local subnet
	subnet, err := getLocalSubnet()
	if err != nil {
		return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: []discoveredHost{}})
	}

	// Scan port 445 on /24 subnet
	var (
		mu    sync.Mutex
		hosts []discoveredHost
		wg    sync.WaitGroup
		sem   = make(chan struct{}, 32) // max 32 concurrent
	)

	for i := 1; i < 255; i++ {
		select {
		case <-ctx.Done():
			goto done
		default:
		}

		ip := fmt.Sprintf("%s.%d", subnet, i)
		wg.Add(1)
		sem <- struct{}{}

		go func(ip string) {
			defer wg.Done()
			defer func() { <-sem }()

			conn, err := net.DialTimeout("tcp", ip+":445", 1*time.Second)
			if err != nil {
				return
			}
			conn.Close()

			host := discoveredHost{IP: ip}

			// Try to resolve hostname
			names, err := net.LookupAddr(ip)
			if err == nil && len(names) > 0 {
				host.Hostname = names[0]
			}

			// Try to list shares (anonymous)
			shares := listSMBShares(ip)
			host.Shares = shares

			mu.Lock()
			hosts = append(hosts, host)
			mu.Unlock()
		}(ip)
	}

done:
	wg.Wait()

	if hosts == nil {
		hosts = []discoveredHost{}
	}
	return c.JSON(http.StatusOK, discoverNetworkResponse{Hosts: hosts})
}

func getLocalSubnet() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			ip := ipnet.IP.To4()
			return fmt.Sprintf("%d.%d.%d", ip[0], ip[1], ip[2]), nil
		}
	}
	return "", fmt.Errorf("no suitable interface found")
}

func listSMBShares(ip string) []string {
	conn, err := net.DialTimeout("tcp", ip+":445", 2*time.Second)
	if err != nil {
		return nil
	}
	defer conn.Close()

	d := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     "Guest",
			Password: "",
		},
	}

	s, err := d.DialContext(context.Background(), conn)
	if err != nil {
		return nil
	}
	defer s.Logoff()

	names, err := s.ListSharenames()
	if err != nil {
		return nil
	}

	// Filter out admin shares
	var shares []string
	for _, name := range names {
		if len(name) > 0 && name[len(name)-1] != '$' {
			shares = append(shares, name)
		}
	}
	return shares
}
```

- [ ] **Step 2: Register route**

In `api/internal/api/router.go`, add **before** the `/:id` routes (to avoid `/:id` capturing "discover-network" as an ID):

```go
// Place BEFORE libGroup.GET("/:id", ...) to avoid path conflict
libGroup.GET("/discover-network", h.handleDiscoverNetwork)
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/network_handler.go api/internal/api/router.go
git commit -m "feat(api): add SMB network discovery endpoint"
```

---

### Task 4: Frontend API Types + Query Keys

**Files:**
- Modify: `web/src/lib/api/library.ts`

- [ ] **Step 1: Add new types and API methods**

In `web/src/lib/api/library.ts`, add the new types and extend the API:

```typescript
// Add these interfaces after existing ones

export interface MediaFileEntry {
  id: string;
  library_id: string;
  path: string;
  filename: string;
  size_bytes: number;
  match_status: 'unmatched' | 'auto' | 'manual';
  dandanplay_anime_id: number | null;
  dandanplay_episode_id: number | null;
  subtitle_count: number;
  matched_anime_title: string;
  matched_episode_sort: number;
  created_at: string;
}

export interface MediaFilesResponse {
  items: MediaFileEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface LibraryWithStats extends Library {
  file_count: number;
  matched_count: number;
  unmatched_count: number;
  total_size_bytes: number;
}

export interface DiscoveredHost {
  ip: string;
  hostname: string;
  shares: string[];
}

export interface MediaFilesParams {
  status?: 'all' | 'matched' | 'unmatched';
  q?: string;
  page?: number;
  per_page?: number;
}
```

Update the `libraryApi` object — change `list` and `get` return types, add new methods:

```typescript
export const libraryApi = {
  list: () => api.get<LibraryWithStats[]>('/api/v1/libraries'),
  get: (id: string) => api.get<LibraryWithStats>(`/api/v1/libraries/${id}`),
  create: (input: CreateLibraryInput) => api.post<Library>('/api/v1/libraries', input),
  update: (id: string, input: UpdateLibraryInput) =>
    api.put<Library>(`/api/v1/libraries/${id}`, input),
  delete: (id: string) => api.delete<void>(`/api/v1/libraries/${id}`),
  scan: (id: string) => api.post<void>(`/api/v1/libraries/${id}/scan`),
  scanSummaries: (id: string) => api.get<ScanSummary[]>(`/api/v1/libraries/${id}/scan-summaries`),
  testConnection: (input: TestConnectionInput) =>
    api.post<TestConnectionResult>('/api/v1/libraries/test-connection', input),
  mediaFiles: (id: string, params: MediaFilesParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set('status', params.status);
    if (params.q) searchParams.set('q', params.q);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return api.get<MediaFilesResponse>(`/api/v1/libraries/${id}/media-files${qs ? `?${qs}` : ''}`);
  },
  matchFile: (fileId: string, body: { bangumi_id: number; episode_id: number }) =>
    api.put<MediaFileEntry>(`/api/v1/media-files/${fileId}/match`, body),
  unmatchFile: (fileId: string) => api.delete<void>(`/api/v1/media-files/${fileId}/match`),
  discoverNetwork: () => api.get<{ hosts: DiscoveredHost[] }>('/api/v1/libraries/discover-network'),
};
```

Add new query keys:

```typescript
export const libraryKeys = {
  all: ['libraries'] as const,
  list: () => [...libraryKeys.all, 'list'] as const,
  detail: (id: string) => [...libraryKeys.all, 'detail', id] as const,
  summaries: (id: string) => [...libraryKeys.all, 'summaries', id] as const,
  mediaFiles: (id: string, params: MediaFilesParams = {}) =>
    [...libraryKeys.all, 'media-files', id, params] as const,
  network: () => [...libraryKeys.all, 'network'] as const,
};
```

- [ ] **Step 2: Update LibrariesPage.tsx to use LibraryWithStats**

In `web/src/pages/LibrariesPage.tsx`, update the import to use `LibraryWithStats` instead of `Library` for the list query data type. The `LibraryCard` component should receive `LibraryWithStats`. No other changes needed yet — card enhancements come in Task 5.

- [ ] **Step 3: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api/library.ts web/src/pages/LibrariesPage.tsx
git commit -m "feat(web): add media file API types, query keys, and network discovery"
```

---

> **Frontend tasks (5-9)**: Invoke the `frontend-design` skill before implementing UI components to ensure design quality matches the app's aesthetic.

### Task 5: Frontend — Enriched Library Cards

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx`

- [ ] **Step 1: Update LibraryCard to show stats and navigate**

Update the `LibraryCard` component to:
- Show file count, match percentage bar, and total size
- Make the card itself clickable (navigates to `/libraries/${lib.id}`)
- Keep hover overlay for scan/edit/delete actions

Key changes to `LibraryCard`:
- Add `useNavigate` from TanStack Router
- Wrap card in a link/button that navigates on click
- Add stats display in the info section:
  - File count: `{lib.file_count} {i18n._(msg`library.files`)}`
  - Match bar: thin progress bar `w-[${matchPct}%]` with green bg
  - Size: formatted with `formatBytes()` helper
- Add `formatBytes` utility function at the top of the file:

```typescript
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 2 ? 1 : 0)} ${sizes[i]}`;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(web): enrich library cards with file count, match bar, and size"
```

---

### Task 6: Frontend — Library Detail Page Route + Header + Stats

**Files:**
- Create: `web/src/routes/libraries.$id.tsx`
- Create: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Create route file**

Create `web/src/routes/libraries.$id.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const LibraryDetailPage = lazy(() =>
  import('../pages/LibraryDetailPage').then((m) => ({ default: m.LibraryDetailPage })),
);

export const Route = createFileRoute('/libraries/$id')({
  component: LibraryDetailPage,
});
```

- [ ] **Step 2: Create LibraryDetailPage with header + stats**

Create `web/src/pages/LibraryDetailPage.tsx` with:
- `useParams()` to get `id` from route
- `useQuery` to fetch `libraryApi.get(id)` with `libraryKeys.detail(id)`
- Loading state with skeleton
- Error/not-found state
- Header: back link, library name, path, source badge, last scanned, action buttons (Scan Now + Settings)
- Stats bar: 4 metric cards (Total Files, Matched %, Unmatched, Total Size)
- Placeholder for tabs (implemented in Task 7)

Use the same styling patterns as other pages (e.g., `SchedulePage.tsx` for tabs, `AnimeDetailPage.tsx` for header layout).

Include the `formatBytes` utility (or extract to shared lib).

- [ ] **Step 3: Verify build and route generation**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

TanStack Router should auto-generate the route tree entry.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/libraries.\$id.tsx web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add library detail page with header and stats bar"
```

---

### Task 7: Frontend — File Table with Tabs

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Add tab navigation**

Add animated tab bar (matching SchedulePage pattern):
- Tabs: "All Files", "Unmatched", "Scan History"
- `layoutId="library-tab-underline"` for animated underline
- `useState` for active tab
- `AnimatePresence mode="wait"` for tab content transitions

- [ ] **Step 2: Implement All Files tab**

- `useQuery` with `libraryKeys.mediaFiles(id, { status: 'all', q: searchTerm, page })`
- Search input (debounced 300ms with `useState` + `useEffect`)
- Table with columns: Filename (mono, truncated), Matched To, Status badge, Subs count, Size
- "Load More" button for pagination (increment page, append results)
- Empty state: "No files found"

- [ ] **Step 3: Implement Unmatched tab**

- Same table component, pre-filtered with `status: 'unmatched'`
- Each row has a "Match" button that sets state for the match modal
- Empty state: "All files matched" (success message)

- [ ] **Step 4: Implement Scan History tab**

- `useQuery` with `libraryKeys.summaries(id)` using `libraryApi.scanSummaries(id)`
- List rows: started time (formatted), duration, files found/matched/unmatched, error count
- Expandable error details (click error count to toggle showing error messages, parsed from JSON array)
- Empty state: "No scans yet"

- [ ] **Step 5: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add file table with All/Unmatched/Scan History tabs"
```

---

### Task 8: Frontend — Manual Match Modal

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Add MatchModal component**

Create a `MatchModal` component within `LibraryDetailPage.tsx` (or as a separate file if it gets large):

- Props: `file: MediaFileEntry | null`, `onClose: () => void`
- Two-step wizard state: `step: 'search' | 'episode'`
- Step 1: Show filename, search input, results from `discoverApi.search(q)`, click to select anime
- Step 2: Show selected anime, load episodes via `discoverApi.episodes(bangumiId)` (verify `Episode` type in `discover.ts` has `bangumi_episode_id` or use `sort` field), click episode, confirm button
- Confirm calls `libraryApi.matchFile(file.id, { bangumi_id, episode_id })`
- On success: `toast.success`, close modal, invalidate `libraryKeys.mediaFiles` and `libraryKeys.detail`
- On error: `toast.error`, keep modal open

- [ ] **Step 2: Wire modal to Unmatched tab**

- Add `matchingFile` state to `LibraryDetailPage`
- "Match" button on each unmatched row sets `matchingFile`
- `<MatchModal file={matchingFile} onClose={() => setMatchingFile(null)} />`

- [ ] **Step 3: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add manual match modal with anime search and episode picker"
```

---

### Task 9: Frontend — Network Discovery UI

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx`

- [ ] **Step 1: Add NetworkBrowser component**

Create a `NetworkBrowser` component within `LibrariesPage.tsx`:

- Shown when source type is `smb`, below the host field
- "Browse Network" button triggers `useMutation` calling `libraryApi.discoverNetwork()`
- Loading state: "Scanning network..." with skeleton rows
- Results: expandable host rows (IP / hostname) → clicking expands to show shares
- Clicking a share auto-fills: `smb_host`, `smb_port` (445), `smb_share` fields via form field handlers
- No results: "No hosts found" message
- Error/timeout: graceful fallback message

- [ ] **Step 2: Wire into LibraryForm**

- Pass form field handlers to `NetworkBrowser` so it can set values
- Place the component between the SMB host field and the port/share fields
- Component only renders when `source_type === 'smb'`

- [ ] **Step 3: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(web): add SMB network discovery browser in add library form"
```

---

### Task 10: i18n — All Translation Keys

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add all i18n keys**

Add all translation keys from the spec's i18n section to all three `.po` files. Use `msg` template literals in components and match the key format used in existing translations.

See full key list in spec: `docs/superpowers/specs/2026-03-28-enhanced-libraries-design.md` section "5. i18n Keys".

- [ ] **Step 2: Compile translations**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract && bun run i18n:compile
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "feat(web): add i18n keys for library detail, match modal, and network discovery"
```

---

### Task 11: Final Integration Test

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./... -v
```

Expected: all PASS.

- [ ] **Step 2: Run frontend build**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run build
```

Expected: successful production build.

- [ ] **Step 3: Run frontend typecheck + lint**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck && bun run lint
```

Expected: PASS.
