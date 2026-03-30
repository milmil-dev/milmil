# Auto-Match Feature Design

## Problem

When files are scanned into a library, the only matching strategy is dandanplay hash lookup. If that fails (dandanplay is down, file not in their DB, no credentials configured), files stay permanently unmatched. The only recourse is manual one-by-one matching via the MatchModal.

Additionally, matching only runs as part of a full scan (`POST /libraries/:id/scan`), so there's no way to retry matching without re-scanning the entire filesystem.

## Solution

A multi-strategy auto-match system that chains dandanplay, Bangumi, AniList, and TMDB matching in priority order. Exposed as a standalone API endpoint and frontend button. TMDB is included specifically because it has the best Chinese episode descriptions/synopses.

## Strategy Chain

Each file is tried against strategies in order. First successful match wins.

### Strategy 1: dandanplay Hash Match (existing)

- **Input**: file hash + filename + size + duration
- **API**: `POST api.dandanplay.net/api/v2/match` (mode: `hashAndFileName`)
- **Output**: dandanplay episode ID + anime ID
- **Accuracy**: Highest (hash-based)
- **Requirement**: dandanplay API credentials configured, file hash computed
- **Already implemented** in `matcher.matchSingleFile()`

### Strategy 2: Filename Parse + Bangumi Search

- **Input**: filename string
- **Step 1**: Parse filename to extract anime title and episode number
- **Step 2**: Search Bangumi with parsed title (`bangumi.SearchSubjects()`)
- **Step 3**: If search returns results, fetch episodes for the top result
- **Step 4**: Match episode by sort number
- **Output**: Bangumi subject ID (used as bangumi_id) + episode sort number
- **Accuracy**: Good for well-structured filenames, especially CJK titles
- **Requirement**: None (Bangumi API is public, no auth needed)

### Strategy 3: Filename Parse + AniList Search

- **Input**: filename string (reuses parsed result from strategy 2)
- **Step 1**: Search AniList with parsed title (`anilist.SearchMedia()`)
- **Step 2**: If match found, resolve to Bangumi ID via `metadata.ResolveBangumiID()`
- **Step 3**: Fetch Bangumi episodes, match by sort number
- **Output**: Bangumi subject ID + episode sort number
- **Accuracy**: Better for newer/popular anime, English titles
- **Requirement**: None (AniList API is public)

### Strategy 4: Filename Parse + TMDB Search

- **Input**: filename string (reuses parsed result from strategy 2)
- **Step 1**: Search TMDB with parsed title (`tmdb.SearchTV()` with `language=zh-CN`)
- **Step 2**: If match found, get TMDB show ID
- **Step 3**: Use TMDB's external IDs endpoint to find the show's MAL ID or try title-based cross-reference to find Bangumi ID
- **Step 4**: If Bangumi ID resolved, fetch episodes and match by sort number
- **Output**: Bangumi subject ID + episode sort number + TMDB ID (stored for metadata enrichment)
- **Accuracy**: Good for mainstream anime, best Chinese episode descriptions
- **Requirement**: TMDB API key (free, v3 API key via settings)
- **Bonus**: After matching, TMDB episode data is used to enrich `episodes.synopsis` and `episodes.title_zh` with Chinese descriptions

**TMDB API endpoints used**:
- `GET /3/search/tv?query={title}&language=zh-CN` — search by title (Chinese results)
- `GET /3/tv/{id}/external_ids` — get MAL ID for cross-referencing
- `GET /3/tv/{id}/season/{n}?language=zh-CN` — get episodes with Chinese synopses
- `GET /3/find/{external_id}?external_source=myanimelist_id` — reverse lookup from MAL ID

### Why Bangumi is the canonical ID

The existing resolver and episode system is built around Bangumi IDs. Strategies 2, 3, and 4 all resolve to Bangumi subject IDs to reuse the existing `resolver.ResolveLibrary()` pipeline (create anime record, fetch episodes, link files). TMDB additionally enriches episode metadata with Chinese descriptions.

## Filename Parser

New package: `api/internal/matcher/fileparse/`

Must handle these common anime filename patterns:

```
[SubGroup] Anime Title - 01 [1080p].mkv
[SubGroup] Anime Title - 01v2 [1080p][HEVC].mkv
[SubGroup] Anime Title EP01 [720p].mkv
Anime Title S01E01 [1080p].mkv
Anime Title - S01E01.mkv
Anime Title 第01話.mkv
Anime Title 第1集.mkv
[Group] Anime Title [01][1080p].mkv
Anime.Title.S01E01.1080p.BluRay.mkv
Anime Title/01.mkv (episode number from filename when in anime-named folder)
```

**Output struct**:

```go
type ParsedFilename struct {
    Title          string // Cleaned anime title
    EpisodeNumber  int    // Parsed episode number (0 if not found)
    Season         int    // Season number (0 if not found, default 1)
    Version        int    // Release version (0 if not found)
    SubGroup       string // Fansub group name
    Resolution     string // e.g., "1080p"
}
```

**Parsing approach** (ordered):
1. Strip file extension
2. Extract `[SubGroup]` from leading brackets
3. Extract trailing `[tags]` (resolution, codec, etc.)
4. Match episode patterns: `- 01`, `EP01`, `S01E01`, `第01話`, `第1集`, `[01]`
5. Remaining text = anime title (clean up dots, underscores, extra whitespace)

## New SQL Query

```sql
-- name: ListUnmatchedMediaFiles :many
-- Like ListUnmatchedMediaFilesByLibrary but without requiring file_hash
SELECT * FROM media_files
WHERE library_id = ? AND match_status = 'unmatched';
```

The current `ListUnmatchedMediaFilesByLibrary` requires `file_hash IS NOT NULL` because it's designed for dandanplay hash matching only. The new query includes files without hashes so filename-based strategies can attempt matching.

## Matcher Changes

Extend `matcher.Matcher`:

```go
type Matcher struct {
    queries    *store.Queries
    dandanplay dandanplay.Client
    bangumi    bangumi.Client
    anilist    anilist.Client
    tmdb       tmdb.Client         // nil if no API key configured
    metadata   *metadata.Service   // for ResolveBangumiID
    cache      cache.Cache
}

// MatchLibrary tries all strategies on unmatched files.
// Strategy 1 (dandanplay hash) runs on files with hashes.
// Strategy 2-3 (filename parse) runs on still-unmatched files.
func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string, onProgress ...scanner.ProgressFunc) (*MatchSummary, error)
```

**MatchSummary** extended:

```go
type MatchSummary struct {
    Matched       int    `json:"matched"`
    Unmatched     int    `json:"unmatched"`
    Errors        int    `json:"errors"`
    ByDandanplay  int    `json:"by_dandanplay"`
    ByBangumi     int    `json:"by_bangumi"`
    ByAniList     int    `json:"by_anilist"`
    ByTMDB        int    `json:"by_tmdb"`
}
```

**Flow within MatchLibrary**:

1. Query all unmatched files (with and without hashes)
2. **Pass 1**: Files with hashes -> try dandanplay (existing logic)
3. **Pass 2**: Still-unmatched files -> parse filename, try Bangumi search
4. **Pass 3**: Still-unmatched files -> try AniList search (reuse parsed filename)
5. **Pass 4**: Still-unmatched files -> try TMDB search (if API key configured)
6. **Post-match**: For all matched files, if TMDB client available, enrich episodes with Chinese synopses
7. Emit progress events throughout

For strategies 2 and 3, when a match is found:
- Set `dandanplay_anime_id` to the Bangumi subject ID (reusing the column for the canonical anime reference)
- Set `dandanplay_episode_id` to a synthetic value or null (the resolver will link via Bangumi episode sort number)
- Set `match_status` to `'auto'`

**Important**: Actually, the current schema uses `dandanplay_anime_id` and `dandanplay_episode_id` which are specifically for dandanplay IDs. For Bangumi/AniList matches, we should store the Bangumi ID directly. We need a new column or to repurpose the existing columns.

**Decision**: Add `bangumi_subject_id` and `bangumi_episode_id` columns to `media_files`. The resolver already works with Bangumi IDs. For dandanplay matches, the resolver converts dandanplay ID -> Bangumi ID. For direct Bangumi/AniList matches, we skip that conversion step.

### New Migration

```sql
-- 000007_add_bangumi_ids_to_media_files.up.sql
ALTER TABLE media_files ADD COLUMN bangumi_subject_id INTEGER;
ALTER TABLE media_files ADD COLUMN bangumi_episode_id INTEGER;

-- 000008_add_synopsis_zh_to_episodes.up.sql
ALTER TABLE episodes ADD COLUMN synopsis_zh TEXT;
```

### Updated SQL Queries

```sql
-- name: UpdateMediaFileBangumiIDs :exec
UPDATE media_files
SET bangumi_subject_id = ?, bangumi_episode_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
```

### Updated Resolver

The resolver's `ResolveLibrary` is updated to also process files that have `bangumi_subject_id` set but no `episode_id`. This covers files matched via Bangumi/AniList strategies.

## TMDB Client

New package: `api/internal/integration/tmdb/`

### Client Interface

```go
type Client interface {
    SearchTV(ctx context.Context, query string, language string) ([]TVShow, error)
    GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error)
    GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error)
    FindByExternalID(ctx context.Context, externalID string, source string) (*FindResult, error)
}
```

### Types

```go
type TVShow struct {
    ID               int      `json:"id"`
    Name             string   `json:"name"`
    OriginalName     string   `json:"original_name"`
    Overview         string   `json:"overview"`
    PosterPath       string   `json:"poster_path"`
    FirstAirDate     string   `json:"first_air_date"`
    OriginCountry    []string `json:"origin_country"`
    GenreIDs         []int    `json:"genre_ids"`
}

type ExternalIDs struct {
    IMDBID    string `json:"imdb_id"`
    TVDBID    int    `json:"tvdb_id"`
    WikidataID string `json:"wikidata_id"`
}

type Season struct {
    SeasonNumber int             `json:"season_number"`
    Episodes     []TVEpisode     `json:"episodes"`
}

type TVEpisode struct {
    EpisodeNumber int    `json:"episode_number"`
    Name          string `json:"name"`
    Overview      string `json:"overview"`     // Chinese synopsis when language=zh-CN
    AirDate       string `json:"air_date"`
    StillPath     string `json:"still_path"`   // Episode thumbnail
}

type FindResult struct {
    TVResults []TVShow `json:"tv_results"`
}
```

### API Key Configuration

TMDB API key stored in the existing settings system:

```
settings key: "tmdb_api_key"
section: "integrations"
```

The matcher checks if `tmdb.Client` is non-nil (API key configured) before attempting strategy 4.

### TMDB → Bangumi Cross-Reference

TMDB doesn't directly provide Bangumi IDs. The cross-reference path:

1. Get TMDB show's external IDs → extract MAL ID (MyAnimeList)
2. If MAL ID found: use `metadata.findBangumiID()` which searches Bangumi by title to cross-reference
3. If no MAL ID: fall back to searching Bangumi directly by TMDB show title

The `anime.tmdb_id` column (already exists in schema) is populated for future lookups.

## Episode Metadata Enrichment (TMDB)

After matching is complete, a separate enrichment pass runs for all matched anime that have a TMDB ID (or can be found on TMDB):

1. Look up the anime's TMDB show ID (via `tmdb_id` on anime record, or search by title)
2. Fetch season episodes with `language=zh-CN`
3. For each episode in DB that has a matching episode_number:
   - Update `synopsis_zh` with TMDB's Chinese `overview` (dedicated Chinese synopsis column)
   - Update `title_zh` with TMDB's Chinese `name` (if empty)
   - Update `thumbnail_url` with TMDB's `still_path` (if empty)

This runs as a post-match step, not a matching strategy. It enriches existing matched episodes regardless of which strategy matched them.

### New SQL Query for Enrichment

```sql
-- name: UpdateEpisodeTMDBMetadata :exec
UPDATE episodes
SET synopsis_zh = COALESCE(NULLIF(?, ''), synopsis_zh),
    title_zh = COALESCE(NULLIF(?, ''), title_zh),
    thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
```

## API Endpoint

```
POST /api/v1/libraries/:id/match
```

- **Auth**: JWT required
- **Response**: `202 Accepted` with `{ "status": "matching", "library_id": "..." }`
- **Behavior**: Runs `matcher.MatchLibrary()` + `resolver.ResolveLibrary()` in background goroutine
- **Progress**: WebSocket events with type `match:started`, `match:progress`, `match:completed`

**Handler logic** (similar to `handleScanLibrary` but without the scan step):

```go
func (h *handler) handleMatchLibrary(c echo.Context) error {
    lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
    // ... error handling ...

    go func() {
        onProgress := func(event scanner.ProgressEvent) {
            event.LibraryName = lib.Name
            if h.wsHub != nil {
                h.wsHub.Broadcast(ws.Event{Type: event.Type, Data: event})
            }
        }
        onProgress(scanner.ProgressEvent{Type: "match:started", LibraryID: lib.ID})

        if h.matcher != nil {
            h.matcher.MatchLibrary(context.Background(), lib.ID, onProgress)
        }
        if h.resolver != nil {
            h.resolver.ResolveLibrary(context.Background(), lib.ID)
        }

        onProgress(scanner.ProgressEvent{Type: "match:completed", LibraryID: lib.ID})
    }()

    return c.JSON(http.StatusAccepted, map[string]string{
        "status":     "matching",
        "library_id": lib.ID,
    })
}
```

## Frontend Changes

### Library Detail Page

Add "Auto Match" button next to "Scan Now":

```tsx
<motion.button
  whileTap={{ scale: 0.95 }}
  onClick={() => matchMutation.mutate()}
  disabled={isMatching || matchMutation.isPending}
  className="px-5 py-2.5 text-sm font-bold rounded-lg border border-mm-accent/40 text-mm-accent hover:bg-mm-accent/10 transition-colors disabled:opacity-50 cursor-pointer"
>
  {isMatching ? i18n._(msg`library.matching`) : i18n._(msg`library.detail.autoMatch`)}
</motion.button>
```

### API Client

```typescript
// In library.ts
matchLibrary: (id: string) => api.post<void>(`/api/v1/libraries/${id}/match`),
```

### WebSocket / Scan Store

Extend `scan-store.ts` to also handle `match:started`, `match:progress`, `match:completed` events. The existing progress banner already shows matching phase, so it just needs to respond to the new standalone match events.

### Progress Banner

Reuse the existing scan progress banner. When matching is running standalone (not as part of a scan), show:
- Phase label: "Matching..." / "匹配中..."
- File count: `X/Y matched`
- Current file being processed

### i18n Strings

```
library.detail.autoMatch = "Auto Match" / "自動匹配"
library.matching = "Matching..." / "匹配中..."
library.toast.matchStarted = "Auto matching started" / "開始自動匹配"
library.toast.matchFailed = "Auto matching failed" / "自動匹配失敗"
```

## File Structure

```
api/internal/matcher/
├── matcher.go           # Extended with multi-strategy chain
├── matcher_test.go      # Updated tests
└── fileparse/
    ├── parser.go        # Filename parser
    └── parser_test.go   # Parser tests with common patterns

api/internal/integration/tmdb/
├── client.go            # TMDB API v3 client
├── types.go             # TMDB response types
└── client_test.go       # Client tests

api/migrations/
├── 000007_add_bangumi_ids_to_media_files.up.sql
├── 000007_add_bangumi_ids_to_media_files.down.sql
├── 000008_add_synopsis_zh_to_episodes.up.sql
└── 000008_add_synopsis_zh_to_episodes.down.sql

api/internal/store/queries/
├── media_files.sql      # New queries added
└── episodes.sql         # UpdateEpisodeMetadata query

api/internal/api/
└── library_handler.go   # New handleMatchLibrary endpoint

web/src/
├── lib/api/library.ts   # matchLibrary() added
├── store/scan-store.ts  # Handle match:* events
├── pages/LibraryDetailPage.tsx  # Auto Match button
└── locales/             # New i18n strings
```

## Testing

- `fileparse/parser_test.go`: Table-driven tests with 15+ filename patterns
- `matcher_test.go`: Test strategy chain (mock dandanplay fail -> bangumi succeeds -> tmdb enriches)
- `matcher_test.go`: Test all strategies fail -> file stays unmatched
- `tmdb/client_test.go`: Test TMDB search, external IDs, season fetch with mock server
- API handler test: `POST /libraries/:id/match` returns 202

## Out of Scope

- **Batch select matching**: Select multiple files and match to same anime (separate feature)
- **Match confidence scoring**: Showing users how confident the match is
- **User match strategy preferences**: Settings to enable/disable specific strategies
