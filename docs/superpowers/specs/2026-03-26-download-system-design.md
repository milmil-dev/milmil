# Download System — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Existing migrations (000010-000012) for rss_feeds, download_rules, downloads tables

---

## 1. Overview

Full download management system: aria2 JSON-RPC client, download CRUD, RSS feed management with auto-refresh, download rules with regex matching, and a frontend downloads page.

### Goals
- aria2 JSON-RPC client for download management
- Download CRUD endpoints (add magnet/URL, pause, resume, delete, list)
- RSS feed CRUD + manual refresh
- Download rules with regex matching (auto-download new episodes)
- RSS auto-check worker (periodic refresh)
- Frontend: Downloads page, RSS feeds management

### Non-goals
- Torrent search (Nyaa/Mikan search API — later)
- WebSocket real-time progress (later — use polling for now)
- Debrid integration

---

## 2. Architecture

```
internal/integration/aria2/     ← aria2 JSON-RPC client
internal/rss/                   ← RSS feed parser + rule matcher
internal/api/download_handler.go
internal/api/rss_handler.go
internal/api/rule_handler.go
web/src/pages/DownloadsPage.tsx
web/src/pages/RSSPage.tsx
```

---

## 3. aria2 JSON-RPC Client

**Package:** `internal/integration/aria2/`

**Connects to:** `http://localhost:6800/jsonrpc` (configurable via `ARIA2_RPC_URL` env var)

**Interface:**
```go
type Client interface {
    AddURI(ctx, uris []string, options map[string]string) (gid string, err error)
    Pause(ctx, gid string) error
    Resume(ctx, gid string) error
    Remove(ctx, gid string) error
    GetStatus(ctx, gid string) (*Status, error)
    ListActive(ctx) ([]Status, error)
    ListWaiting(ctx, offset, num int) ([]Status, error)
    ListStopped(ctx, offset, num int) ([]Status, error)
}
```

aria2 JSON-RPC uses POST with method names like `aria2.addUri`, `aria2.pause`, etc. Auth via `token:SECRET` prefix.

**Status struct:**
```go
type Status struct {
    GID             string `json:"gid"`
    Status          string `json:"status"` // active/waiting/paused/complete/error/removed
    TotalLength     int64  `json:"totalLength,string"`
    CompletedLength int64  `json:"completedLength,string"`
    DownloadSpeed   int64  `json:"downloadSpeed,string"`
    Dir             string `json:"dir"`
    Files           []File `json:"files"`
}
```

---

## 4. RSS Feed Parser

**Package:** `internal/rss/`

**`ParseFeed(ctx, url) ([]FeedItem, error)`** — fetches and parses RSS/Atom feed.

```go
type FeedItem struct {
    Title   string
    Link    string // magnet or torrent URL
    PubDate time.Time
}
```

Use `github.com/mmcdole/gofeed` for RSS parsing.

**`MatchRule(item FeedItem, rule store.DownloadRule) bool`** — checks if a feed item matches a download rule's filter_regex and doesn't match exclude_regex.

---

## 5. API Endpoints

### Downloads (JWT auth)
```
GET    /api/v1/downloads              → list all downloads (from DB + aria2 status)
POST   /api/v1/downloads              → add new download (magnet/URL)
POST   /api/v1/downloads/:gid/pause   → pause
POST   /api/v1/downloads/:gid/resume  → resume
DELETE /api/v1/downloads/:gid         → remove
```

### RSS Feeds (JWT auth)
```
GET    /api/v1/rss-feeds              → list feeds
POST   /api/v1/rss-feeds              → create feed
PUT    /api/v1/rss-feeds/:id          → update feed
DELETE /api/v1/rss-feeds/:id          → delete feed
POST   /api/v1/rss-feeds/:id/refresh  → manual refresh (check for new items)
```

### Download Rules (JWT auth)
```
GET    /api/v1/download-rules              → list rules
POST   /api/v1/download-rules              → create rule
PUT    /api/v1/download-rules/:id          → update rule
DELETE /api/v1/download-rules/:id          → delete rule
```

---

## 6. RSS Auto-Check Flow

When a feed is refreshed (manual or periodic):
1. Fetch RSS feed → parse items
2. For each item, check all enabled rules targeting this feed
3. If item matches a rule and hasn't been downloaded yet (check by URL):
   a. Call aria2 `AddURI` with the item's link
   b. Create `downloads` record in DB with the aria2 GID
   c. Update rule's `last_triggered_at`

---

## 7. sqlc Queries

**New file:** `api/internal/store/queries/downloads.sql`
```sql
-- name: ListDownloads :many
SELECT * FROM downloads ORDER BY created_at DESC;

-- name: CreateDownload :one
INSERT INTO downloads (id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, rule_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: GetDownloadByGID :one
SELECT * FROM downloads WHERE gid = ? LIMIT 1;

-- name: GetDownloadByURL :one
SELECT * FROM downloads WHERE url = ? LIMIT 1;

-- name: UpdateDownloadStatus :exec
UPDATE downloads SET status = ?, total_bytes = ?, completed_bytes = ?, speed_bytes = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE gid = ?;

-- name: DeleteDownload :exec
DELETE FROM downloads WHERE gid = ?;
```

**New file:** `api/internal/store/queries/rss_feeds.sql`
```sql
-- name: ListRSSFeeds :many
SELECT * FROM rss_feeds ORDER BY name;

-- name: CreateRSSFeed :one
INSERT INTO rss_feeds (id, name, url, type, enabled, fetch_interval_minutes, created_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: UpdateRSSFeed :exec
UPDATE rss_feeds SET name = ?, url = ?, type = ?, enabled = ?, fetch_interval_minutes = ?
WHERE id = ?;

-- name: DeleteRSSFeed :exec
DELETE FROM rss_feeds WHERE id = ?;

-- name: GetRSSFeed :one
SELECT * FROM rss_feeds WHERE id = ? LIMIT 1;

-- name: UpdateRSSFeedLastFetched :exec
UPDATE rss_feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?;
```

**New file:** `api/internal/store/queries/download_rules.sql`
```sql
-- name: ListDownloadRules :many
SELECT * FROM download_rules ORDER BY name;

-- name: CreateDownloadRule :one
INSERT INTO download_rules (id, name, enabled, rss_feed_id, filter_regex, exclude_regex, save_dir, episode_offset, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;

-- name: UpdateDownloadRule :exec
UPDATE download_rules SET name = ?, enabled = ?, rss_feed_id = ?, filter_regex = ?, exclude_regex = ?, save_dir = ?, episode_offset = ?
WHERE id = ?;

-- name: DeleteDownloadRule :exec
DELETE FROM download_rules WHERE id = ?;

-- name: ListDownloadRulesByFeedID :many
SELECT * FROM download_rules WHERE rss_feed_id = ? AND enabled = 1;

-- name: UpdateDownloadRuleTriggered :exec
UPDATE download_rules SET last_triggered_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?;
```

---

## 8. Frontend

### DownloadsPage (`/downloads`)
- List active/completed/paused downloads
- "Add Download" button → input for magnet/URL
- Per-download: progress bar, speed, pause/resume/delete actions
- Auto-refresh every 5 seconds via TanStack Query `refetchInterval`

### RSSPage (`/rss`)
- List RSS feeds with last-fetched time
- Add/edit/delete feeds
- List download rules per feed
- Add/edit/delete rules
- "Refresh" button per feed

### Sidebar Update
- Add "Downloads" icon to sidebar (between Trending and Libraries)

---

## 9. File Map

### Created (Backend)
- `api/internal/integration/aria2/client.go`
- `api/internal/integration/aria2/types.go`
- `api/internal/integration/aria2/client_test.go`
- `api/internal/rss/parser.go`
- `api/internal/rss/matcher.go`
- `api/internal/rss/parser_test.go`
- `api/internal/api/download_handler.go`
- `api/internal/api/rss_handler.go`
- `api/internal/api/rule_handler.go`
- `api/internal/store/queries/downloads.sql`
- `api/internal/store/queries/rss_feeds.sql`
- `api/internal/store/queries/download_rules.sql`

### Created (Frontend)
- `web/src/lib/api/downloads.ts`
- `web/src/pages/DownloadsPage.tsx`
- `web/src/pages/RSSPage.tsx`
- `web/src/routes/downloads.tsx`
- `web/src/routes/rss.tsx`

### Modified
- `api/internal/api/router.go` — add download/rss/rule routes + aria2 client
- `api/cmd/server/main.go` — init aria2 client
- `api/internal/config/config.go` — add Aria2RPCURL config
- `web/src/components/AppSidebar.tsx` — add Downloads + RSS nav items
- `web/src/routes/__root.tsx` — add routes to isPublicRoute if needed
