# milmil — Design Spec

**Date:** 2026-03-25
**Status:** Approved
**Inspired by:** [Seanime](https://github.com/5rahim/seanime)

---

## 1. Project Overview

**milmil** is a self-hosted, full-stack anime media server with a web UI. It manages local anime libraries, integrates with multiple metadata and tracking services, supports danmaku (bullet comment) playback, handles torrent/HTTP downloads via aria2, and streams video with optional FFmpeg transcoding.

### Goals
- Feature parity with Seanime for all Phase 1 features
- First-class DandanPlay danmaku integration (file matching + real-time playback)
- Bangumi.tv + AniList + MAL watch progress sync
- Plex/Netflix-style dark UI in Traditional Chinese by default
- Deployable on both local home servers and cloud VPS via Docker Compose

### Non-goals (Phase 2)
- Extension marketplace
- Manga reader
- Online anime streaming
- Anime4K / GPU sharpening (requires desktop shell)
- Mobile deep links (`milmil://`)

---

## 2. Architecture

### Option Chosen: Single Go API + aria2 sidecar + SPA

```
Docker Compose (production)
├── milmil-api     Go 1.26 backend (Echo v4) — API, WebSocket, file streaming, background jobs
├── milmil-web     Nginx + Vite 8 SPA build
├── aria2          p3terx/aria2-pro — download engine
├── postgres       PostgreSQL 16 (production optional — SQLite used by default)
└── redis          Redis 7 — danmaku cache + metadata cache (optional, in-memory fallback in dev)

Development (no Docker required for DB)
└── SQLite file at {data_dir}/milmil.db
```

**Rationale:** Single-binary Go service handles all API and background work via goroutines and River job queue. **SQLite-first**: development and small/home deployments use a local SQLite file — zero infrastructure needed. Production deployments switch to PostgreSQL via `DATABASE_URL`. The schema uses only portable SQL types (TEXT, INTEGER, REAL) compatible with both engines. No message broker needed.

### Go Internal Package Layout

```
milmil-api/
├── cmd/server/          # main.go — Echo setup, dependency wiring
├── internal/
│   ├── api/             # Echo route handlers, middleware, request/response types
│   ├── service/         # Business logic (library, player, download, metadata, sync)
│   ├── worker/          # River job definitions (scan, transcode, rss, danmaku-sync)
│   ├── store/           # sqlc-generated queries + DB transaction helpers
│   ├── cache/           # Redis wrapper — danmaku, metadata, stream tokens
│   ├── integration/
│   │   ├── dandanplay/  # DandanPlay API client (match, danmaku, search)
│   │   ├── bangumi/     # Bangumi.tv OAuth + API client
│   │   ├── anilist/     # AniList GraphQL client
│   │   ├── mal/         # MyAnimeList OAuth + API client
│   │   ├── discord/     # Discord Rich Presence via IPC
│   │   └── aria2/       # aria2 JSON-RPC client
│   ├── ffmpeg/          # probe (ffprobe), transcode, HLS segment generation
│   ├── scanner/         # filesystem walk, file hash, media file detection
│   └── config/          # viper config loading, env binding
└── migrations/          # golang-migrate SQL files (numbered, sequential)
```

---

## 3. Technology Stack

### Backend (Go)

| Concern | Library |
|---|---|
| HTTP framework | Echo v4 (latest) |
| SQLite driver (default) | **modernc.org/sqlite** (pure Go, no CGO) |
| PostgreSQL driver (prod) | **pgx/v5 stdlib** (`pgx/v5/stdlib`) |
| DB abstraction | `database/sql` interface (works with both drivers) |
| SQL codegen | **sqlc** (`engine: sqlite`, generates `database/sql` code compatible with both) |
| Migrations | **golang-migrate** (sqlite + postgres drivers) |
| Background jobs | **riverqueue/river** (SQLite-compatible via `riversqlite`, Postgres via `riverpgxv5`) |
| UUID generation | **github.com/google/uuid** (app-level, not DB default) |
| Redis client | go-redis/v9 (optional; in-memory fallback for dev) |
| WebSocket | gorilla/websocket |
| FFmpeg | os/exec + ffprobe binary |
| aria2 RPC | custom JSON-RPC HTTP client |
| JWT session | golang-jwt/jwt v5 |
| Hot reload (dev) | Air |
| Config | viper |
| Validation | go-playground/validator |

### Frontend (React/TS) — based on `tanstack-spa` template

| Concern | Library |
|---|---|
| Bundler | Vite 8 |
| Package manager | Bun |
| Routing | TanStack Router v1 (file-based) |
| Data fetching | TanStack Query v5 |
| Forms | TanStack Form v1 + Zod v4 |
| Tables | TanStack Table v8 |
| UI primitives | Base UI (headless, no Radix UI) |
| Styling | Tailwind CSS v4 + tw-animate-css |
| Animations | motion v12 (Framer Motion) |
| Icons | @hugeicons/react |
| i18n | Lingui v5 (default: zh-Hant; also zh-Hans, en) |
| State | Zustand v5 |
| Toasts | Sonner v2 |
| Video player | Video.js v10 |
| Danmaku renderer | Custom canvas layer (see §7) |
| PWA | Serwist |
| Linter | Biome v2 |
| Testing | Vitest v4 + Playwright |

---

## 4. Database Schema

### Portable Type Convention (SQLite-first, PostgreSQL-compatible)

| Logical type | SQLite / Migration SQL | PostgreSQL equivalent |
|---|---|---|
| UUID | `TEXT` (app generates via `uuid.New()`) | `TEXT` or native `UUID` |
| Timestamp | `TEXT` (RFC3339 stored as string) | `TEXT` or `TIMESTAMPTZ` |
| JSON object/array | `TEXT` (JSON string) | `TEXT` or `JSONB` |
| String array | `TEXT` (JSON array string e.g. `'["a","b"]'`) | `TEXT` or `TEXT[]` |
| Boolean | `INTEGER` (0/1) | `INTEGER` or `BOOLEAN` |
| Auto UUID default | No DB default — Go generates UUID before INSERT | Same |

All primary keys are app-generated UUIDs (`uuid.New().String()`), never DB-generated. This makes the schema identical across both engines.

### `libraries`
```sql
id uuid PK
name text
path text                     -- filesystem path (local, SMB mount, rclone mount)
enabled bool
scan_interval_minutes int DEFAULT 60
last_scanned_at timestamptz
created_at, updated_at timestamptz
```

### `anime`
```sql
id uuid PK
library_id uuid FK → libraries
title text                    -- original title
title_zh text
title_en text
synopsis text
cover_image_url text
total_episodes int
status text                   -- airing/completed/upcoming/hiatus
air_date date
year int
season text                   -- spring/summer/fall/winter
genres text[]
is_custom bool DEFAULT false  -- custom (non-AniList) entry
-- External IDs
anilist_id int
bangumi_id int
dandanplay_bangumi_id int
mal_id int
tmdb_id int
created_at, updated_at timestamptz
```

### `episodes`
```sql
id uuid PK
anime_id uuid FK → anime
episode_number decimal         -- supports 12.5 for specials
title text
title_zh text
air_date date
synopsis text
thumbnail_url text
dandanplay_episode_id bigint   -- used to fetch danmaku
bangumi_episode_id int         -- used for sync
mal_episode_id int
created_at, updated_at timestamptz
```

### `media_files`
```sql
id uuid PK
episode_id uuid FK → episodes (nullable — unmatched files)
library_id uuid FK → libraries
path text UNIQUE
filename text
size_bytes bigint
duration_seconds int
container_format text          -- mkv/mp4/avi
video_codec text               -- h264/hevc/av1
audio_codec text
width int, height int
file_hash text                 -- MD5 of first 16MB (DandanPlay match key)
dandanplay_episode_id bigint   -- DandanPlay episode ID resolved from file match; stored here
                               -- because one episodes row may have multiple media_files (e.g. dual audio)
                               -- and each file may match a different DandanPlay episode
match_status text              -- unmatched/auto/manual
video_tracks jsonb
audio_tracks jsonb
subtitle_tracks jsonb          -- embedded subtitle stream info
created_at, updated_at timestamptz
```

### `watch_progress`
```sql
id uuid PK
user_id uuid FK → users          -- required; all progress queries filter by authenticated user
episode_id uuid FK → episodes
media_file_id uuid FK → media_files
position_seconds int
duration_seconds int
completed bool DEFAULT false
last_watched_at timestamptz
bangumi_synced_at timestamptz
mal_synced_at timestamptz
anilist_synced_at timestamptz
UNIQUE (user_id, episode_id)     -- one progress record per user per episode
```

### `subtitle_files`
```sql
id uuid PK
media_file_id uuid FK → media_files
path text                      -- absolute local path to subtitle file on disk
                               -- for remotely-fetched subtitles, cached to
                               -- {config_dir}/subtitles/{media_file_id}/{id}.{format}
                               -- path is always populated before the row is inserted
language text                  -- zh-Hant/zh-Hans/en/ja
format text                    -- ass/srt/vtt
source text                    -- local/jimaku/opensubtitles
created_at timestamptz
```

### `transcode_sessions`
```sql
id uuid PK
media_file_id uuid FK → media_files
session_token text UNIQUE
status text                    -- pending/running/ready/error
output_dir text
codec text
resolution text
progress int                   -- 0-100
expires_at timestamptz
created_at timestamptz
```

### `downloads`
```sql
id uuid PK
gid text UNIQUE                -- aria2 GID
url text                       -- original URL/magnet/torrent path
name text
status text                    -- active/waiting/paused/complete/error/removed
total_bytes bigint
completed_bytes bigint
speed_bytes int
save_dir text
rule_id uuid FK → download_rules (nullable)
created_at, updated_at timestamptz
```

### `download_rules`
```sql
id uuid PK
name text
enabled bool DEFAULT true
rss_feed_id uuid FK → rss_feeds  -- intentionally one-to-one: one rule targets one feed.
                                  -- to apply the same regex to multiple feeds, create
                                  -- duplicate rules (simple, explicit, no join table needed)
filter_regex text              -- episode must match
exclude_regex text             -- episode must not match
save_dir text
episode_offset int DEFAULT 0
last_triggered_at timestamptz
created_at timestamptz
```

### `rss_feeds`
```sql
id uuid PK
name text
url text
type text                      -- mikan/nyaa/dmhy/custom
enabled bool DEFAULT true
fetch_interval_minutes int DEFAULT 30
last_fetched_at timestamptz
created_at timestamptz
```

### `playlists`
```sql
id uuid PK
name text
description text
cover_image_url text
created_at, updated_at timestamptz
```

### `playlist_entries`
```sql
id uuid PK
playlist_id uuid FK → playlists
episode_id uuid FK → episodes  -- only matched episodes can be added to playlists.
                                -- unmatched media_files (episode_id IS NULL) cannot be
                                -- playlisted in Phase 1. This is an intentional constraint.
position int
added_at timestamptz
```

### `scan_summaries`
```sql
id uuid PK
library_id uuid FK → libraries
started_at timestamptz
completed_at timestamptz
files_found int
files_matched int
files_unmatched int
errors jsonb                   -- array of {path, error}
```

### `users`
```sql
id uuid PK DEFAULT gen_random_uuid()
username text UNIQUE
password_hash text             -- bcrypt hash
created_at, updated_at timestamptz
```
Single row is created on first launch (setup wizard). JWT tokens reference this user ID.

### `settings`
```sql
key text PK                    -- general / dandanplay / bangumi / anilist / mal / player / appearance
value jsonb
updated_at timestamptz
```

### Redis Key Schema (cache only, TTL-based)

| Key | TTL | Content |
|---|---|---|
| `danmaku:ddp:{dandanplayEpisodeId}` | 6h (popular) / 24h (older) | DandanPlay + ext danmaku merged array. Key uses the DandanPlay bigint episode ID (not the internal UUID) because that is the natural cache key for the DandanPlay API response. |
| `danmaku:match:{fileHash}` | 7d | DandanPlay match result (maps MD5 hash → dandanplay_episode_id). On cache miss after Redis flush, the backend falls back to reading `media_files.dandanplay_episode_id` from DB; the Redis entry is an acceleration cache, not the source of truth. |
| `meta:anilist:{id}` | 24h | AniList series JSON |
| `meta:bangumi:{id}` | 24h | Bangumi series JSON |
| `stream:token:{token}` | 4h | Active stream/transcode session info |
| `rss:etag:{feedId}` | — | RSS feed ETag for conditional fetch |

---

## 5. REST API Design

```
/api/v1/
├── auth/
│   ├── POST   /login
│   ├── POST   /logout
│   └── GET    /me
│
├── library/
│   ├── GET    /
│   ├── POST   /
│   ├── PUT    /:id
│   ├── DELETE /:id
│   ├── POST   /:id/scan
│   └── GET    /scan-summaries
│
├── anime/
│   ├── GET    /                      # list (filter: status/year/season/genre/library)
│   ├── GET    /:id
│   ├── PUT    /:id
│   └── PUT    /:id/match             # re-match to AniList/Bangumi/DandanPlay
│
├── schedule/                         # top-level to avoid route conflict with /anime/:id
│   └── GET    /                      # airing schedule (window: 7/14/30 days)
│
├── episodes/
│   ├── GET    /anime/:animeId
│   ├── GET    /:id
│   └── POST   /:id/progress
│
├── media-files/
│   ├── GET    /                      # list (filter: unmatched/all)
│   ├── GET    /:id
│   └── POST   /:id/rematch
│
├── stream/
│   ├── GET    /:fileId/direct        # byte-range HTTP file serve
│   ├── POST   /:fileId/transcode     # start transcode → returns { token }
│   ├── GET    /hls/:token/master.m3u8
│   └── GET    /hls/:token/:segment   # HLS segment serve
│
├── danmaku/
│   ├── GET    /:mediaFileId          # fetch danmaku (resolves ddp ID from media_files, Redis cached)
│   ├── POST   /:mediaFileId          # submit danmaku to DandanPlay
│   ├── GET    /:mediaFileId/ext      # third-party (Bilibili) danmaku
│   └── GET    /:mediaFileId/related  # episode association mappings
│
├── subtitles/
│   ├── GET    /media/:fileId
│   ├── POST   /media/:fileId/fetch   # fetch from online source
│   └── GET    /:id/content
│
├── downloads/
│   ├── GET    /
│   ├── POST   /                      # add URL/magnet/torrent
│   ├── POST   /:gid/pause
│   ├── POST   /:gid/resume
│   ├── DELETE /:gid
│   └── GET    /stream/:gid           # partial-download stream info
│
├── torrent-search/
│   ├── GET    /                      # search Nyaa/Mikan (query, filter)
│   └── POST   /add                   # add result to aria2
│
├── download-rules/
│   ├── GET, POST, PUT /:id, DELETE /:id
│   └── POST   /:id/test             # dry-run against current RSS
│
├── rss-feeds/
│   ├── GET, POST, PUT /:id, DELETE /:id
│   └── POST   /:id/refresh
│
├── playlists/
│   ├── GET, POST, PUT /:id, DELETE /:id
│   ├── GET    /:id/entries
│   └── POST   /:id/entries
│
├── discover/
│   ├── GET    /seasonal              # AniList seasonal anime
│   ├── GET    /trending
│   ├── GET    /popular
│   └── GET    /search               # AniList search
│
├── custom-sources/
│   ├── GET, POST, PUT /:id, DELETE /:id
│   └── POST   /:id/scan             # force-scan custom source folder
│
├── debrid/
│   ├── GET    /status               # account status (Real-Debrid / Torbox)
│   └── POST   /unrestrict           # unrestrict magnet/link
│
├── external-player/
│   └── POST   /open                 # open file in MPV/VLC/MPC-HC
│
├── integrations/
│   ├── GET    /bangumi/auth-url
│   ├── GET    /bangumi/callback
│   ├── DELETE /bangumi              # disconnect
│   ├── POST   /bangumi/sync
│   ├── GET    /anilist/auth-url
│   ├── GET    /anilist/callback
│   ├── DELETE /anilist
│   ├── POST   /anilist/sync
│   ├── GET    /mal/auth-url
│   ├── GET    /mal/callback
│   ├── DELETE /mal
│   └── POST   /mal/sync
│
└── settings/
    ├── GET    /
    └── PUT    /:section
```

---

## 6. WebSocket Events (`/ws`)

Single persistent connection per client session.

### Server → Client

```
scan:started          { libraryId, libraryName }
scan:progress         { libraryId, scanned, total, currentFile }
scan:completed        { libraryId, newFiles, matchedFiles, unmatchedFiles }
scan:error            { libraryId, error }

download:added        { gid, name, url }
download:progress     { gid, completedBytes, totalBytes, speedBps, status, eta }
download:complete     { gid, name, savePath }
download:error        { gid, error }
download:removed      { gid }

transcode:progress    { token, percent, eta }
transcode:ready       { token, hlsUrl }
transcode:error       { token, error }

rss:checked           { feedId, feedName, newItems }
rss:rule:triggered    { ruleId, ruleName, added: [{name, gid}] }

player:discord:update { animeTitle, episodeNumber, position }

notification          { id, type, title, message, animeId? }
```

---

## 7. Danmaku System (Priority Feature)

Danmaku is a first-class feature. The full pipeline:

### Backend

1. **File Matching** (during library scan)
   - Compute MD5 hash of first 16MB of each video file
   - `POST /api/v2/match` with `{ fileName, fileHash, fileSize, videoDuration }`
   - Batch-match up to 32 files at a time via `/api/v2/match/batch`
   - Store returned `dandanplay_episode_id` (bigint) directly on `media_files.dandanplay_episode_id`
   - Also cache result in Redis: `danmaku:match:{fileHash}` (7d TTL) as acceleration layer

2. **Danmaku Fetch** (`GET /api/v1/danmaku/:mediaFileId`)
   - Route parameter is the internal `media_files.id` (UUID)
   - Backend resolves `media_files.dandanplay_episode_id` (bigint) from DB
   - Check Redis: `danmaku:ddp:{dandanplayEpisodeId}` — return if hit
   - Miss: fetch `GET /api/v2/comment/{dandanplayEpisodeId}` from DandanPlay
   - Optionally merge `/api/v2/extcomment` (Bilibili) if user has `danmaku.includeExt = true`
   - Store merged array in Redis with TTL (6h for recent episodes, 24h for older)
   - Return combined danmaku array

3. **Danmaku Format**
   ```json
   {
     "comments": [
       {
         "cid": 123456,
         "p": "12.5,1,16777215",   // time(s), type(1=scroll,4=bottom,5=top), color(RGB int)
         "m": "danmaku text content"
       }
     ]
   }
   ```
   Types: `1` = scrolling, `4` = bottom fixed, `5` = top fixed, `6` = reverse scroll

4. **Submit Danmaku** (`POST /api/v1/danmaku/:mediaFileId`)
   - Route parameter is internal `media_files.id` (UUID); backend resolves DandanPlay episode ID
   - Requires DandanPlay account (optional login, stored in `settings.dandanplay`)
   - Forwards to `POST /api/v2/comment/{dandanplayEpisodeId}`

### Frontend — DanmakuLayer Component

The danmaku renderer is a `<canvas>` element absolutely positioned over the video, pointer-events none by default (pass-through clicks to player controls).

```
VideoPlayer.tsx
└── <div class="player-root relative">
    ├── <video> (Video.js managed)
    ├── <DanmakuLayer />      ← canvas overlay, z-index above video
    └── <PlayerControls />    ← z-index above DanmakuLayer
```

**DanmakuLayer responsibilities:**
- Receive danmaku array on episode load, pre-process into render buckets by second
- On each animation frame (`requestAnimationFrame`):
  - Find danmaku with `time ≤ currentTime` not yet rendered
  - Enqueue into scroll/top/bottom lanes with collision detection (no overlap)
  - Draw text with shadow for legibility on any background
  - Advance x-position for scroll type; remove when off-screen
- Respond to `timeupdate` events from Video.js for seek handling (flush + re-bucket)
- Pause/resume rendering with video play/pause state

**DanmakuSettings (player settings panel):**
```
Danmaku toggle          on/off
Opacity                 slider 0–100%
Font size               12px / 16px / 20px / 24px
Speed                   slow / normal / fast
Max density             limit simultaneous comments (25/50/100/unlimited)
Type filters
  ├── Scrolling         toggle
  ├── Top fixed         toggle
  └── Bottom fixed      toggle
Keyword filters         add/remove blocked words (stored in settings)
Include Bilibili        toggle (ext danmaku source)
```

**Danmaku state** (Zustand `player` store):
```ts
interface DanmakuState {
  enabled: boolean
  opacity: number
  fontSize: number
  speed: 'slow' | 'normal' | 'fast'
  maxDensity: number
  showScroll: boolean
  showTop: boolean
  showBottom: boolean
  keywordFilters: string[]
  includeExt: boolean
}
```

All settings persisted to `settings.player` via API on change.

---

## 8. Video Streaming Strategy

```
Client requests video
  │
  ├─ Can browser decode codec/container natively?
  │     YES → GET /api/v1/stream/:fileId/direct
  │           (byte-range HTTP, supports seek, no server load)
  │
  └─ NO → POST /api/v1/stream/:fileId/transcode
               { codec: "h264", resolution: "1080p" }
               ↓
           River job: ffmpeg → HLS segments in /tmp/milmil/transcode/{token}/
               ↓
           GET /api/v1/stream/hls/{token}/master.m3u8
           Video.js HLS plugin handles segment fetching + adaptive bitrate
```

**Torrent streaming:** Deferred to Phase 2.1. Not in Phase 1 scope.

**FFmpeg transcode presets:**
- `1080p/h264` — default web-safe
- `720p/h264` — bandwidth-limited clients
- `1080p/hevc` — modern browsers (Safari 16+)
- Audio: AAC 192kbps always

---

## 9. Frontend Routes & Pages

### Route Structure

```
src/routes/
├── __root.tsx              # Root layout: sidebar + topbar
├── index.tsx               # Home: continue watching, airing today, recent
├── discover/
│   └── index.tsx           # Browse seasonal/trending/popular (AniList)
├── library/
│   └── index.tsx           # Full library grid, filter by status/genre/year
├── anime/
│   ├── index.tsx           # Search across local library
│   └── $animeId/
│       ├── index.tsx       # Detail: hero, episodes, metadata, actions
│       └── episode.$episodeId.tsx
├── player.$fileId.tsx      # Full-screen player (outside root layout)
├── downloads/
│   ├── index.tsx           # Active downloads + completed
│   └── rules.tsx           # RSS rules + feed manager
├── torrent-search/
│   └── index.tsx           # Nyaa/Mikan search, add to aria2
├── schedule/
│   └── index.tsx           # 7/14/30-day airing calendar
├── playlists/
│   ├── index.tsx
│   └── $playlistId.tsx
├── custom-sources/
│   └── index.tsx
├── debrid/
│   └── index.tsx           # Real-Debrid / Torbox account page
├── scan-summaries/
│   └── index.tsx           # Library scan history + error log
├── sync/
│   └── index.tsx           # Bangumi/AniList/MAL sync status
└── settings/
    ├── index.tsx            # General
    ├── library.tsx
    ├── integrations.tsx     # AniList/Bangumi/MAL OAuth connect
    ├── downloads.tsx        # aria2 + debrid settings
    ├── player.tsx           # Video + subtitle + danmaku defaults
    └── appearance.tsx       # Theme, background, language
```

### UI Design Principles

- **Dark mode only** — zinc-900 base, zinc-800 cards, single accent color (configurable, default indigo)
- **Geist Sans** for UI text, **Geist Mono** for paths, sizes, IDs, timestamps
- Poster cards: scale 1.03 + shadow on hover (motion v12)
- Page transitions: `AnimatePresence` shared layout animations
- Every list/grid has loading skeleton + empty state
- All UI strings via Lingui `<Trans>` / `t` macro — zero hardcoded text
- Default locale: `zh-Hant`; also `zh-Hans`, `en`

### Lingui Catalog Setup

```
src/locales/
├── zh-Hant/messages.po     # Traditional Chinese (default)
├── zh-Hans/messages.po     # Simplified Chinese
└── en/messages.po          # English fallback
```

`lingui.config.ts` updated with `locales: ['zh-Hant', 'zh-Hans', 'en']`, `sourceLocale: 'zh-Hant'`.

---

## 10. External Integrations

### DandanPlay
- Auth: `X-AppId` + `X-AppSecret` headers (server-side credential mode)
- Requires app registration: email `kaedei@dandanplay.net`
- Key APIs: `/api/v2/match`, `/api/v2/match/batch`, `/api/v2/comment/{episodeId}`, `/api/v2/extcomment`, `/api/v2/search/anime`
- Caching: Redis with 6h/24h TTL per DandanPlay usage policy
- No bulk scraping; cache aggressively

### Bangumi.tv
- Auth: OAuth 2.0 — `/api/v1/integrations/bangumi/auth-url` → callback → store token
- Metadata: series + episode data
- Watch sync: `PATCH /v0/users/-/collections/{subject_id}/episodes` on progress update
- Sync trigger: automatic on episode complete + manual via `/api/v1/integrations/bangumi/sync`

### AniList
- Auth: OAuth 2.0 Authorization Code flow (not implicit — implicit is deprecated and incompatible with server-side callback). Flow: frontend redirects to AniList → AniList redirects to `GET /api/v1/integrations/anilist/callback?code=...` → backend exchanges code for token → stores token in `settings.anilist`
- GraphQL endpoint: `https://graphql.anilist.co`
- Used for: metadata, airing schedule, list management, search, watch sync
- Redis cached 24h for metadata

### MyAnimeList
- Auth: OAuth 2.0 PKCE
- Watch sync: `PATCH /v2/anime/{id}/my_list_status`
- Optional — user connects zero, one, or all tracking services

### aria2
- JSON-RPC over HTTP: `http://aria2:6800/jsonrpc`
- Key methods: `addUri`, `addTorrent`, `addMetalink`, `pause`, `remove`, `tellStatus`, `getGlobalStat`, `onDownloadComplete`, `onDownloadError`
- WebSocket notifications forwarded to client WS event bus

### Discord Rich Presence
- Local IPC socket (only active when Discord desktop is running)
- Updates while player is active: anime title, episode number, elapsed time
- Graceful no-op if Discord is not running

---

## 11. Infrastructure

### Docker Compose

```yaml
version: "3.9"
services:
  milmil-api:
    build: ./api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://milmil:milmil@postgres:5432/milmil
      REDIS_URL: redis://redis:6379
      ARIA2_RPC_URL: http://aria2:6800/jsonrpc
      ARIA2_RPC_SECRET: ${ARIA2_RPC_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      DANDANPLAY_APP_ID: ${DANDANPLAY_APP_ID}
      DANDANPLAY_APP_SECRET: ${DANDANPLAY_APP_SECRET}
    volumes:
      - ./media:/media
      - ./config:/config
      - ./transcode-tmp:/tmp/milmil/transcode
    ports:
      - "8080:8080"
    depends_on: [postgres, redis, aria2]

  milmil-web:
    build: ./web
    restart: unless-stopped
    ports:
      - "3000:80"

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: milmil
      POSTGRES_PASSWORD: milmil
      POSTGRES_DB: milmil
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  aria2:
    image: p3terx/aria2-pro
    restart: unless-stopped
    environment:
      RPC_SECRET: ${ARIA2_RPC_SECRET}
    volumes:
      - ./downloads:/downloads
      - ./aria2-config:/config

volumes:
  pgdata:
```

### Development Setup

```
# Backend
cd api && air          # Go hot reload via Air

# Frontend
cd web && bun dev      # Vite 8 dev server

# Infrastructure
docker compose up postgres redis aria2
```

---

## 12. Phase 2 Roadmap (Documented, Not in v1)

### Phase 2.1 — Torrent Streaming
Stream video directly from in-progress aria2 downloads via HTTP range requests on the partial file. Requires buffering logic and minimum-bytes-before-play detection.

### Phase 2.2 — Manga Reader
Separate subsystem: local CBZ/CBR file support + online manga sources. Requires its own route group, reader component, progress tracking table, and chapter management.

### Phase 2.3 — Extension Marketplace
Plugin system for third-party streaming and manga sources. Requires sandboxed JS execution, extension manifest format, marketplace UI, and auto-update mechanism.

### Phase 2.4 — Online Anime Streaming
Depends on Extension Marketplace. Extensions provide streaming source adapters.

### Phase 2.5 — Anime4K / GPU Sharpening
Requires a desktop shell (Tauri). Not achievable in a pure web player.

### Phase 2.6 — Mobile Deep Links
`milmil://` URI scheme for opening files in Outplayer/VLC on iOS/Android.

### Phase 2.7 — Real-Debrid / Torbox Full Integration
Phase 1 includes a basic debrid page and link unrestriction. Phase 2 adds full torrent-to-debrid pipeline and auto-select best source.
