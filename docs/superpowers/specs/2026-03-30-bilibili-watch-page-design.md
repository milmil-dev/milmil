# Bilibili-Style Watch Page Revamp

**Date:** 2026-03-30
**Status:** Design approved, pending implementation

## Overview

Revamp the WatchPage to adopt Bilibili's layout and style. The current page is a full-width player with a narrow 320px technical sidebar. The new design centers on a Bilibili-inspired two-column layout with anime context, episode navigation, danmaku management, and Bangumi comments — turning the watch page into a complete viewing experience.

## Route Change

**Current:** `/watch/$fileId?episodeId=xxx`
**New:** `/watch/$animeId?ep=<episodeSort>`

- `$animeId` = bangumiId (the anime identifier used throughout the app)
- `ep` query param = episode sort number (optional)
- **Auto-select logic:** If no `ep` param, find the first episode where `progress.completed === false` and `progress.position_seconds > 0` (resume). If none, pick the first episode with no progress (start from beginning).
- The fileId is resolved internally from the selected episode's `media_file.id`.

### Migration

- Update route file from `watch.$fileId.tsx` to `watch.$animeId.tsx`
- Update all `Link` components pointing to the watch page (currently in `EpisodeListItem`, `AnimeDetailPage`)
- Old `/watch/$fileId` URLs will no longer work (acceptable — no external links exist)

## Desktop Layout (lg+)

Top-to-bottom, left column + right sidebar:

```
┌─────────────────────────────────────────────────────────────┐
│ [Anime Title]  MAPPA · 2022 · 16集    ★ 8.5  ❤ 收藏  📤 分享 │
├──────────────────────────────────┬──────────────────────────┤
│                                  │  [選集]  [彈幕列表]  tabs  │
│         Video Player             │                          │
│     + Danmaku Overlay            │   ┌──┬──┬──┬──┐          │
│                                  │   │1 │2 │③│4 │ ...      │
│  ┌─「第3集 — 戰士候補生」(overlay) │   └──┴──┴──┴──┘          │
│                                  │   ■ 已看完 ■ 看到一半     │
│                      ⚙ 資訊      │                          │
├──────────────────────────────────┤   ── 相關推薦 ──          │
│ 彈幕 [  發送彈幕...  ]  Aa  ⚙   │   [封面] 進擊的巨人 S3    │
├──────────────────────────────────┤   [封面] 鬼滅之刃         │
│ ⬇ 下載字幕                       │                          │
├──────────────────────────────────┤                          │
│ [封面] 簡介文字...  動作 奇幻 劇情 │                          │
├──────────────────────────────────┤                          │
│ ── 評論 ──                       │                          │
│ [頭像] 使用者A ★9  很棒的一季... │                          │
│ [頭像] 使用者B ★8  作畫穩定...   │                          │
│            查看更多評論 →          │                          │
└──────────────────────────────────┴──────────────────────────┘
```

### Left Column

1. **Title Bar (above player)**
   - Anime title (from discover API or new endpoint)
   - Meta line: studio, year, total episode count
   - Action buttons: score (star rating), favorite (heart), share

2. **Video Player**
   - Same VideoPlayer component (`@videojs/react`)
   - DanmakuOverlay on top
   - **Episode title overlay:** Top-left corner, semi-transparent pill with `第 N 集 — {title}`. Auto-fades after 4 seconds, reappears on episode change or hover.
   - **Tech info gear icon:** Bottom-right of player area. Opens a popover showing:
     - Filename, resolution, video codec, audio codec, file size, duration
     - Playback method (Direct / Remux / Transcode) with status indicators
     - Subtitle tracks available
   - Stream URL selection logic is unchanged (direct > remux > transcode)

3. **Danmaku Input Bar (below player)**
   - Text input for sending danmaku (POST to `/api/v1/danmaku/:mediaFileId`)
   - `Aa` button: danmaku style options (color, position: top/bottom/scroll)
   - `⚙` button: opens existing DanmakuSettings panel (opacity, font size, speed) repositioned as a popover from this button instead of the current top-right overlay

4. **Action Row**
   - Download subtitle button (if subtitles available)

5. **Anime Info Section**
   - Small cover image + synopsis text (from discover API `animeDetail`)
   - Genre tags as pills

6. **Bangumi Comments**
   - Fetch from existing `/api/v1/discover/anime/:id/comments` endpoint
   - Display: avatar, username, star rating, comment text
   - Initially show ~5 comments, "查看更多" to expand
   - Reuse the same display pattern as AnimeDetailPage but in a single-column layout

### Right Sidebar (width ~280px on desktop)

1. **Tab Bar: 選集 | 彈幕列表**

2. **Episodes Tab (default)**
   - Grid of episode numbers (4 columns)
   - Color coding:
     - Green background: `progress.completed === true`
     - Amber background: `progress.position_seconds > 0 && !completed`
     - Blue border + highlight: currently playing
     - Default gray: not started
   - Episode count range label (e.g., "1-16 集")
   - Click to switch episode (updates `?ep=N`, loads new media file, no full page reload)
   - If episode count > 24, paginate in ranges (1-24, 25-48, etc.) with a dropdown
   - Episodes without `media_file` (not matched to a local file): shown as disabled/dimmed, not clickable

3. **Danmaku List Tab**
   - Scrollable list of all danmaku comments for the current episode
   - Each row: timestamp (MM:SS) + comment text
   - Click a row to seek player to that timestamp
   - Sorted by time ascending
   - Show total count in tab badge: `彈幕列表 (142)`

4. **Related Recommendations (below tabs, always visible)**
   - From existing `relations` data in discover API
   - Show: thumbnail, title, relation type (前作/續作/相似)
   - Click navigates to `/watch/$relatedAnimeId`
   - Max 5 items

## Mobile Layout (< lg)

Vertical scroll, no sidebar. Order:

1. Video Player (full width, 16:9)
2. Danmaku input bar
3. Title + action buttons
4. Episode grid (6 columns, more compact)
5. Anime info section (collapsible)
6. Bangumi comments
7. Related recommendations

The right sidebar content collapses into the main flow below the player.

## Data Requirements

### Existing APIs (no changes needed)

- `GET /api/v1/anime/:bangumiId/playable-episodes` — episode list with media files and progress
- `GET /api/v1/discover/anime/:id/comments` — Bangumi comments
- `GET /api/v1/danmaku/:mediaFileId` — danmaku comments
- `POST /api/v1/danmaku/:mediaFileId` — send danmaku
- `GET /api/v1/media-info/:fileId` — media info for playback method detection
- `GET /api/v1/stream/:fileId` — direct stream
- `GET /api/v1/stream/:fileId/remux` — remux stream
- Transcode endpoints (existing)
- Subtitle endpoints (existing)
- Progress save endpoint (existing)

### No New APIs Needed

The existing `discoverApi.detail(id)` → `GET /api/v1/discover/anime/:id` returns `AnimeDetail` which includes all required fields:
- `title`, `title_original`, `synopsis`, `cover_image`, `banner_image`
- `genres`, `tags`, `air_date`, `episode_count`, `score`
- `relations` (RelatedAnime[]) — for recommendations sidebar
- `recommendations` (AnimeSummary[]) — additional recommendations
- `rating` ({ score, total }) — for display

Note: `AnimeDetail` does not include a `studio` field. The title bar meta line will show: year (from `air_date`) + episode count. Studio can be omitted or added later if the backend exposes it.

### Frontend Data Flow

```
/watch/$animeId?ep=3
  │
  ├── useQuery(discoverDetail(animeId))   → title, synopsis, cover, genres, relations, recommendations
  ├── useQuery(playableEpisodes(animeId)) → episode list with media files + progress
  ├── useQuery(comments(animeId))         → Bangumi comments
  │
  │  (after episode resolved → fileId known)
  │
  ├── useQuery(mediaInfo(fileId))          → codec info, playback method
  ├── useQuery(danmaku(fileId))            → danmaku comments
  └── useQuery(subtitles(fileId))          → subtitle tracks
```

## Component Structure

```
WatchPage.tsx (route component)
├── WatchTitleBar          — anime title, meta, actions (score, favorite, share)
├── VideoPlayerSection     — player + danmaku overlay + episode title overlay + tech info popover
├── DanmakuBar             — input + style picker + settings popover
├── WatchActionRow         — subtitle download
├── AnimeInfoSection       — cover + synopsis + genre tags
├── BangumiComments        — comment list
├── EpisodeSidebar         — tabs (episodes grid | danmaku list) + recommendations
│   ├── EpisodeGrid        — numbered grid with progress colors
│   ├── DanmakuList        — scrollable time-stamped comments
│   └── RelatedAnimeList   — recommendation cards
└── TechInfoPopover        — codec, resolution, playback method, subtitles (triggered from player gear icon)
```

## Episode Switching Behavior

1. User clicks episode N in grid
2. Update URL search param `?ep=N` (no navigation, just search update)
3. Resolve new `fileId` from `playableEpisodes` data
4. Save current progress for old episode
5. Reset player source to new stream URL
6. Load new danmaku and subtitles
7. Restore progress if episode has saved position
8. Show episode title overlay (auto-fade after 4s)

## Progress Saving

Same logic as current WatchPage:
- Save every 10 seconds during playback
- Save on pause, ended, and episode switch
- Mark completed when position >= duration - 30s

## Existing Components to Reuse

- `VideoPlayer` — no changes needed
- `DanmakuOverlay` — no changes needed
- `DanmakuSettings` — relocate from top-right overlay to danmaku bar popover (change positioning, same controls)
- `Skeleton` — loading states
- `PageTransition` — page enter animation

## Existing Components to Remove

- The current right sidebar (playback info, method, subtitles, danmaku count cards) is replaced entirely by the new layout. The technical info moves into the gear icon popover.

## Styling

- Dark theme consistent with existing app (`bg-black/20`, `mm-*` tokens)
- Player area: pure black background
- Sidebar/info areas: subtle `white/[0.04]` cards
- Episode grid: colored backgrounds for progress states
- Active tab: blue underline (consistent with existing accent patterns)
- Episode title overlay: `bg-black/60 backdrop-blur-sm` pill
