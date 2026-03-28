# Enhanced Libraries — Design Spec

## Goal

Upgrade the libraries feature from a simple CRUD card grid to a full media management experience. Users should be able to browse into a library, see all scanned files with match status, manually match unmatched files, review scan history, and get at-a-glance stats — all while the library list page shows richer information per card.

## Architecture

### New Route

- `/libraries/:id` — Library detail page (new TanStack Router file route)

### Backend Changes

#### ID System

The project uses **Bangumi IDs** as the primary identifier for anime, and **DandanPlay IDs** for episode-level matching (auto-match via file hash). For manual matching:

- The match modal searches anime via `discoverApi.search()` which returns Bangumi-based results
- User selects an anime (provides `bangumi_id`) and an episode (provides `bangumi_episode_id` — the `bangumi_episode_id` field from the Episode struct, which maps to the episode's sort number)
- Backend stores both the `bangumi_id` (as `dandanplay_anime_id` — reusing the existing column) and `bangumi_episode_id` (as `dandanplay_episode_id`)
- `match_status` is set to `"manual"` (distinct from auto-match's `"auto"`)

> **Note**: The `dandanplay_anime_id` / `dandanplay_episode_id` columns are reused for manual matches. In future, these could be renamed to generic `matched_anime_id` / `matched_episode_id`, but for now we reuse existing schema.

#### New Endpoints

1. **`GET /api/v1/libraries/:id/media-files`** — List media files for a library
   - Query params: `status` (all/matched/unmatched), `q` (filename search), `page`, `per_page` (default 50)
   - Response: `{ items: MediaFileEntry[], total: number, page: number, per_page: number }`
   - SQL: LEFT JOIN subtitle_files grouped to get `subtitle_count` per file
   - For matched files, include `matched_anime_title` and `matched_episode_sort` via LEFT JOIN on episodes table (episode_id FK)

2. **`PUT /api/v1/media-files/:id/match`** — Manually match a media file
   - Body: `{ bangumi_id: number, episode_id: number }` where `episode_id` is the bangumi_episode_id
   - Validates: media file exists, returns 404 if not
   - Sets: `dandanplay_anime_id = bangumi_id`, `dandanplay_episode_id = episode_id`, `match_status = 'manual'`
   - Returns: updated MediaFileEntry

3. **`DELETE /api/v1/media-files/:id/match`** — Unmatch a media file
   - Sets: `dandanplay_anime_id = NULL`, `dandanplay_episode_id = NULL`, `match_status = 'unmatched'`, `episode_id = NULL`
   - Returns: 204 No Content

#### Enriched Endpoints

4. **`GET /api/v1/libraries`** (existing) — Add per-library aggregate stats
   - New response wrapper: `LibraryWithStats` containing all Library fields plus:
     - `file_count` (int), `matched_count` (int), `unmatched_count` (int), `total_size_bytes` (int64)
   - Computed via a single SQL query with LEFT JOIN + GROUP BY on media_files

5. **`GET /api/v1/libraries/:id`** (existing) — Same stats included

#### New SQL Queries (sqlc)

```sql
-- ListMediaFilesByLibrary: paginated, filtered, with subtitle count and matched info
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

-- CountMediaFilesByStatus: stats for a library
-- name: CountMediaFilesByStatus :one
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN match_status != 'unmatched' THEN 1 ELSE 0 END) AS matched,
  SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched,
  COALESCE(SUM(size_bytes), 0) AS total_size_bytes
FROM media_files WHERE library_id = ?;

-- UpdateMediaFileMatch: manual match
-- name: UpdateMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = ?, dandanplay_episode_id = ?, match_status = 'manual', updated_at = ?
WHERE id = ?;

-- ClearMediaFileMatch: unmatch
-- name: ClearMediaFileMatch :exec
UPDATE media_files
SET dandanplay_anime_id = NULL, dandanplay_episode_id = NULL, episode_id = NULL, match_status = 'unmatched', updated_at = ?
WHERE id = ?;

-- ListLibrariesWithStats: all libraries with aggregate stats
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
```

### Frontend Changes

#### 1. Library List Page Enhancements (`LibrariesPage.tsx`)

**LibraryCard** improvements:
- Show file count badge (e.g. "847 files")
- Show match percentage as a thin progress bar at bottom of the art area (green portion = matched %)
- Show total size (e.g. "1.2 TB")
- Card click navigates to `/libraries/:id` (scan/edit/delete remain on hover overlay)
- Scanning state: show animated progress sweep (existing) + "Scanning..." text

**Data**: Library list API now returns stats via `LibraryWithStats`, so no extra fetch needed.

#### 2. Library Detail Page (`LibraryDetailPage.tsx`)

**Layout**: Stats + Tabs + Table (Option A)

**Header section**:
- Back link: "← Libraries" navigating to `/libraries`
- Library name (large), path (mono, muted), source badge (SMB/SFTP/Local), last scanned relative time
- Action buttons: "Scan Now" (accent), "Settings" (secondary, opens edit modal reusing `LibraryForm`)

**Stats bar** — 4 metric cards:
| Metric | Color | Notes |
|--------|-------|-------|
| Total Files | white | Count of all media files |
| Matched | green | Percentage with progress ring or bar |
| Unmatched | amber | Count, clickable → switches to Unmatched tab |
| Total Size | white | Human-readable (MB/GB/TB) |

**Tabs** (with animated underline, matching SchedulePage `layoutId` pattern):

##### Tab: All Files
- Searchable table with columns:
  - **Filename** — truncated with tooltip, mono font
  - **Matched To** — Anime title + "EP XX" (from joined episode data) or "—" if unmatched
  - **Status** — Badge: green "AUTO", blue "MANUAL", amber "UNMATCHED"
  - **Subtitles** — Count with icon
  - **Size** — Human-readable
- Sort by: filename, size, status (default: filename asc)
- Search: filters by filename substring (debounced 300ms)
- Pagination: 50 per page with "Load More" button
- Empty state: "No files found" with hint to run a scan

##### Tab: Unmatched
- Same table, pre-filtered to `match_status = "unmatched"`
- Each row has a "Match" button on the right
- Clicking "Match" opens the Match Modal
- Empty state: "All files matched" (success state)

##### Tab: Scan History
- List of past scans, newest first
- Each row: started time, duration (computed from completed_at - started_at), files found, files matched, files unmatched, error count
- Error count is expandable — click to show individual error messages (errors field is a JSON array of strings, parsed on frontend)
- Uses existing `libraryApi.scanSummaries(id)`
- Empty state: "No scans yet — run your first scan"

#### 3. Manual Match Modal

Triggered from unmatched file rows. Two-step wizard inside a `Modal` component.

**Step 1 — Search anime**:
- Shows filename being matched (read-only, mono, at top)
- Search input field (debounced 300ms)
- Uses `discoverApi.search(q)` to find anime
- Results displayed as a list: cover thumbnail (40px) + title + episode count + score
- Click a result to select it → advance to step 2
- Empty state: "No results found"

**Step 2 — Pick episode**:
- Shows selected anime (cover + title, with "Change" link to go back to step 1)
- Loads episodes via `discoverApi.episodes(bangumiId)`
- Episode list: EP number + title + air date
- Click an episode to select it (highlighted)
- "Confirm Match" button → calls `PUT /api/v1/media-files/:id/match`
- On success: toast "File matched", close modal, invalidate media files + stats queries
- On error: toast error message, keep modal open

#### 4. Frontend API Additions (`library.ts`)

```typescript
// New types
interface MediaFileEntry {
  id: string;
  library_id: string;
  path: string;
  filename: string;
  size_bytes: number;
  match_status: 'unmatched' | 'auto' | 'manual';
  dandanplay_anime_id: number | null;
  dandanplay_episode_id: number | null;
  subtitle_count: number;
  matched_anime_title: string;    // from joined episode, empty string if unmatched
  matched_episode_sort: number;   // from joined episode, 0 if unmatched
  created_at: string;
}

interface MediaFilesResponse {
  items: MediaFileEntry[];
  total: number;
  page: number;
  per_page: number;
}

interface LibraryStats {
  file_count: number;
  matched_count: number;
  unmatched_count: number;
  total_size_bytes: number;
}

// Library type extended with optional stats
interface LibraryWithStats extends Library {
  file_count: number;
  matched_count: number;
  unmatched_count: number;
  total_size_bytes: number;
}

// New API methods
libraryApi.mediaFiles(id: string, params: {
  status?: 'all' | 'matched' | 'unmatched';
  q?: string;
  page?: number;
  per_page?: number;
}) → MediaFilesResponse

libraryApi.matchFile(fileId: string, body: {
  bangumi_id: number;
  episode_id: number;
}) → MediaFileEntry

libraryApi.unmatchFile(fileId: string) → void

// New query keys
libraryKeys.mediaFiles(id, params) → ['libraries', 'media-files', id, params]
```

#### 5. i18n Keys

New translation keys (en / zh-Hant / zh-Hans):

**Detail page:**
- `library.detail.backToLibraries` — Libraries / 媒體庫 / 媒体库
- `library.detail.scanNow` — Scan Now / 立即掃描 / 立即扫描
- `library.detail.settings` — Settings / 設定 / 设置
- `library.detail.totalFiles` — Total Files / 總檔案 / 总文件
- `library.detail.matched` — Matched / 已匹配 / 已匹配
- `library.detail.unmatched` — Unmatched / 未匹配 / 未匹配
- `library.detail.totalSize` — Total Size / 總大小 / 总大小
- `library.detail.tab.allFiles` — All Files / 全部檔案 / 全部文件
- `library.detail.tab.unmatched` — Unmatched / 未匹配 / 未匹配
- `library.detail.tab.scanHistory` — Scan History / 掃描紀錄 / 扫描记录
- `library.detail.search` — Search files... / 搜尋檔案... / 搜索文件...
- `library.detail.filename` — Filename / 檔案名稱 / 文件名
- `library.detail.matchedTo` — Matched To / 匹配至 / 匹配至
- `library.detail.status` — Status / 狀態 / 状态
- `library.detail.subtitles` — Subs / 字幕 / 字幕
- `library.detail.size` — Size / 大小 / 大小
- `library.detail.noFiles` — No files found / 找不到檔案 / 未找到文件
- `library.detail.allMatched` — All files matched / 所有檔案已匹配 / 所有文件已匹配
- `library.detail.runFirstScan` — Run your first scan / 執行首次掃描 / 执行首次扫描

**Match modal:**
- `library.detail.match` — Match / 匹配 / 匹配
- `library.detail.unmatch` — Unmatch / 取消匹配 / 取消匹配
- `library.detail.matchModal.title` — Match File / 匹配檔案 / 匹配文件
- `library.detail.matchModal.searchAnime` — Search anime... / 搜尋動畫... / 搜索动画...
- `library.detail.matchModal.pickEpisode` — Pick Episode / 選擇集數 / 选择集数
- `library.detail.matchModal.confirm` — Confirm Match / 確認匹配 / 确认匹配
- `library.detail.matchModal.change` — Change / 更換 / 更换
- `library.detail.matchModal.noResults` — No results found / 找不到結果 / 未找到结果
- `library.detail.matchModal.matched` — File matched / 檔案已匹配 / 文件已匹配
- `library.detail.matchModal.failed` — Match failed / 匹配失敗 / 匹配失败

**Scan history:**
- `library.detail.scanHistory.started` — Started / 開始時間 / 开始时间
- `library.detail.scanHistory.duration` — Duration / 耗時 / 耗时
- `library.detail.scanHistory.found` — Found / 發現 / 发现
- `library.detail.scanHistory.errors` — Errors / 錯誤 / 错误
- `library.detail.scanHistory.noScans` — No scans yet / 尚未掃描 / 尚未扫描

**Card badge:**
- `library.files` — files / 個檔案 / 个文件
- `library.detail.loadMore` — Load More / 載入更多 / 加载更多

**Network discovery:**
- `library.discover.browse` — Browse Network / 瀏覽網路 / 浏览网络
- `library.discover.scanning` — Scanning network... / 掃描網路中... / 扫描网络中...
- `library.discover.noHosts` — No hosts found / 找不到主機 / 未找到主机
- `library.discover.timeout` — Discovery timed out / 探索逾時 / 发现超时

### Network Discovery (Add Library UX Enhancement)

When adding a new library with SMB source type, provide a "Browse Network" button that auto-discovers available SMB shares on the local network.

#### Backend

**New endpoint**: `GET /api/v1/libraries/discover-network`
- **Strategy**: Subnet port scan on port 445 (TCP connect with 1s per-host timeout)
  - Determine local subnet from the server's network interfaces
  - Scan /24 subnet concurrently (max 32 goroutines)
  - For each responding host: attempt anonymous SMB session to list shares
  - Fall back to just reporting the IP if share listing fails (user can enter share manually)
- **Response**: `{ hosts: [{ ip: string, hostname: string, shares: string[] }] }`
- **Timeout**: 5 seconds total, returns partial results if scan incomplete
- **Error handling**: Returns empty hosts array on failure (never errors), frontend handles gracefully
- **Dependency**: Uses existing `go-smb2` library already in the project

#### Frontend

**"Browse Network" button** in the SMB source type form:
- Clicking it calls the discover endpoint
- Loading state with "Scanning network..." skeleton
- Shows discovered hosts as expandable rows: hostname (IP) → click to expand → shows shares
- Click a share → auto-fills host, port (445), and share fields
- Falls back gracefully: if no hosts found, show "No hosts found" with option to enter manually
- Discovery is optional — manual entry always available

## Implementation Order

1. Backend: SQL queries + stats aggregation + enriched library list
2. Backend: media files list endpoint + match/unmatch endpoints
3. Backend: network discovery endpoint (SMB share browsing)
4. Frontend: enriched library cards (stats on cards)
5. Frontend: library detail page route + header + stats bar
6. Frontend: file table with tabs (All / Unmatched / Scan History)
7. Frontend: manual match modal (search → episode picker → confirm)
8. Frontend: network discovery UI in "Add Library" form
9. i18n: add all translation keys (en, zh-Hant, zh-Hans)

## Test Data

SMB share available at `192.168.50.203` (niskan516-pc), path `Media/Video/Anime` with fansub releases. Can be used to create a test library and validate scanning + display.
