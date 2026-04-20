# External Danmaku Search & Import

**Date:** 2026-04-19
**Status:** Approved

## Problem

When a media file has no DandanPlay episode match (`dandanplay_episode_id` is null), or when users want additional danmaku from specific platforms, there is no way to manually search and import danmaku from external sources like Bilibili, Youku, or Bahamut Anime.

## Solution

A pluggable multi-source danmaku search system that lets users search external video platforms by keyword and import their danmaku into the current playback session. Imported danmaku is cached (24h TTL) and merged with existing DandanPlay danmaku for rendering.

## Design Decisions

- **Cache-based storage (24h TTL):** Imported danmaku is stored in the existing cache layer, not persisted to DB. Keeps the system lightweight and avoids stale data accumulation.
- **Backend proxy:** All external API calls go through the Go backend to avoid CORS issues, enable caching, and keep API details server-side.
- **Pluggable source interface:** New platforms can be added by implementing a single Go interface. First version ships with Bilibili only.
- **UI in sidebar tab:** New "Danmaku" tab in the right-side EpisodeSidebar, keeping the player area and DanmakuBar untouched.
- **Pre-filled search:** Auto-fills search keywords from current anime title + episode number, but does not auto-search. User confirms or modifies before searching.

## Architecture

### Backend: Pluggable Source Interface

```go
// internal/integration/danmaku/source.go

type SearchResult struct {
    VideoID     string `json:"videoId"`     // platform-specific ID (e.g., BV number)
    Title       string `json:"title"`
    DanmakuCount int   `json:"danmakuCount"`
    Duration    string `json:"duration"`    // human-readable, e.g. "23:40"
    Thumbnail   string `json:"thumbnail"`   // optional thumbnail URL
}

type Comment struct {
    Text  string  `json:"text"`
    Time  float64 `json:"time"`  // seconds from start
    Mode  string  `json:"mode"`  // "rtl", "top", "bottom"
    Color string  `json:"color"` // hex color, e.g. "#FFFFFF"
}

type Source interface {
    Name() string
    Search(ctx context.Context, keyword string, page int) ([]SearchResult, error)
    FetchDanmaku(ctx context.Context, videoID string) ([]Comment, error)
}
```

### Backend: Bilibili Source Implementation

`internal/integration/danmaku/bilibili.go`

Bilibili API call chain (all public, no auth required):

1. **Search videos:** `GET https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={q}&page={p}`
   - Returns: `data.result[]` with `bvid`, `title`, `play`, `danmaku` count, `duration`
2. **Get cid from BV:** `GET https://api.bilibili.com/x/web-interface/view?bvid={bvid}`
   - Returns: `data.cid` (single-part) or `data.pages[].cid` (multi-part)
3. **Fetch danmaku XML:** `GET https://comment.bilibili.com/{cid}.xml`
   - Returns XML: `<d p="time,mode,fontSize,color,...">text</d>`
   - Max ~3000 comments per cid (sufficient for anime episodes)

XML `p` field mapping:
| Index | Field | Mapping |
|-------|-------|---------|
| 0 | time | `Comment.Time` (float seconds) |
| 1 | mode | 1,6→"rtl", 4→"bottom", 5→"top" |
| 2 | fontSize | ignored (use user preference) |
| 3 | color | decimal RGB → hex `Comment.Color` |

Rate limiting: 1-2 req/s with delays. Search results are not cached; fetched danmaku is cached 24h.

### Backend: API Endpoints

Added to existing router, under auth middleware:

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/api/v1/danmaku/sources` | `handleListDanmakuSources` | List available sources (`[{name, label}]`) |
| `GET` | `/api/v1/danmaku/search` | `handleSearchExternalDanmaku` | Search external platform. Query params: `source`, `q`, `page` |
| `POST` | `/api/v1/danmaku/import` | `handleImportExternalDanmaku` | Import danmaku from a specific video. Body: `{source, videoId, mediaFileId}` |
| `GET` | `/api/v1/danmaku/imported/:mediaFileId` | `handleGetImportedDanmaku` | Get cached imported danmaku for a media file |
| `DELETE` | `/api/v1/danmaku/imported/:mediaFileId` | `handleRemoveImportedDanmaku` | Remove imported danmaku from cache |

**Import flow:**
1. Receive `{source, videoId, mediaFileId}`
2. Call `source.FetchDanmaku(videoID)` to get comments
3. Cache under key `danmaku:ext:{mediaFileId}:{source}` with 24h TTL
4. Return the comments in response

**Get imported flow:**
1. Scan cache for keys matching `danmaku:ext:{mediaFileId}:*`
2. Return all cached external danmaku grouped by source

### Frontend: Sidebar Tab

New tab "Danmaku" (弹幕) added to `EpisodeSidebar` alongside the existing "Episodes" tab.

**New component:** `web/src/components/watch/DanmakuSourceTab.tsx`

```
┌─────────────────────────┐
│ [集數] [彈幕]            │  ← tab bar
├─────────────────────────┤
│ 來源: [Bilibili ▾]      │  ← source dropdown
│                         │
│ 🔍 [葬送的芙莉蓮 第1話] │  ← pre-filled keyword input
│    [搜索]               │  ← search button
├─────────────────────────┤
│ ── 搜索結果 ──           │
│                         │
│ 葬送的芙莉蓮 01          │
│ 1.2万弹幕 · 23:40       │
│              [導入]      │
│                         │
│ 葬送的芙莉蓮 EP01        │
│ 8.5千弹幕 · 15:32       │
│              [導入]      │
├─────────────────────────┤
│ ── 已導入 ──             │
│                         │
│ Bilibili · 1.2万条      │
│              [移除]      │
└─────────────────────────┘
```

**Keyword pre-fill logic:**
- Use anime title (romaji or native, whichever available) + ` 第{episodeNumber}話`
- Filled on tab open, user can modify before searching

**Data flow in WatchPage:**
1. Existing: `danmakuComments` from DandanPlay via `/api/v1/danmaku/{fileId}`
2. New: `importedDanmaku` from `/api/v1/danmaku/imported/{fileId}`
3. Merge: `DanmakuOverlay` receives `[...danmakuComments, ...importedDanmaku]`
4. On import: POST to `/api/v1/danmaku/import`, then refetch imported danmaku
5. On remove: DELETE to `/api/v1/danmaku/imported/{fileId}`, clear from state

**TanStack Query keys:**
- `['danmaku', 'sources']` — available sources list
- `['danmaku', 'search', source, keyword, page]` — search results
- `['danmaku', 'imported', mediaFileId]` — imported danmaku for current file

### What Does NOT Change

- `DanmakuOverlay` component — unchanged, just receives more comments
- `danmaku-worker` — unchanged, density filtering works on merged array
- `DanmakuBar` — unchanged (input + send + settings)
- `DanmakuSettings` — unchanged (speed/font/opacity/density)
- DandanPlay integration — unchanged, coexists with external sources
- `preferences-store` danmaku fields — unchanged

## File Plan

### New Files

| File | Purpose |
|------|---------|
| `api/internal/integration/danmaku/source.go` | Source interface + registry |
| `api/internal/integration/danmaku/bilibili.go` | Bilibili source implementation |
| `api/internal/integration/danmaku/bilibili_test.go` | Bilibili source tests |
| `api/internal/api/danmaku_external_handler.go` | HTTP handlers for external danmaku endpoints |
| `web/src/components/watch/DanmakuSourceTab.tsx` | Sidebar tab UI component |
| `web/src/lib/api/danmaku.ts` | Frontend API client for external danmaku |

### Modified Files

| File | Change |
|------|--------|
| `api/internal/api/router.go` | Register new endpoints |
| `api/internal/api/handler.go` | Add source registry to handler struct |
| `api/cmd/server/main.go` | Initialize Bilibili source |
| `web/src/components/watch/EpisodeSidebar.tsx` | Add tab switcher + render DanmakuSourceTab |
| `web/src/pages/WatchPage.tsx` | Merge imported danmaku into comments state |
| `web/src/locales/en/messages.po` | i18n strings for danmaku tab |

## Error Handling

- **Search fails / rate limited:** Show error toast, allow retry
- **Import fails:** Show error toast, keep search results visible
- **No results:** Show empty state message
- **External API timeout:** 10s timeout per request, show timeout message

## Testing

- **Backend:** Unit tests for Bilibili XML parsing, source interface compliance
- **Frontend:** E2E test — open danmaku tab, verify pre-filled keyword, mock search results
