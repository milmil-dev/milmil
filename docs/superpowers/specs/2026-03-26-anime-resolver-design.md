# Anime Matching Pipeline — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Plan 6 (DandanPlay) — matcher service, Plan 4 (Metadata) — Bangumi client

---

## 1. Overview

After DandanPlay matches media files to episode IDs, the AnimeResolver populates local `anime` and `episodes` tables from Bangumi data and links `media_files.episode_id` to create a complete local library.

### Goals
- Resolve DandanPlay anime IDs to Bangumi subject IDs
- Create/update local `anime` records from Bangumi metadata
- Create/update local `episodes` records from Bangumi episodes
- Link `media_files.episode_id` → `episodes.id`
- Integrate into scan pipeline (scan → match → resolve)

### Non-goals
- AniList enrichment on local anime records (metadata service handles display)
- Manual re-matching UI
- Frontend library browse by anime (later plan)

---

## 2. Architecture

```
internal/resolver/resolver.go   ← AnimeResolver service
internal/integration/dandanplay/ ← Add GetBangumiInfo method
```

Scan pipeline becomes:
```
scanner.ScanLibrary() → matcher.MatchLibrary() → resolver.ResolveLibrary()
```

---

## 3. New DandanPlay Client Method

Add to `internal/integration/dandanplay/client.go`:

```go
GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error)
// GET /api/v2/bangumi/{animeId}
```

**BangumiInfo type:**
```go
type BangumiInfo struct {
    AnimeID    int64  `json:"animeId"`
    AnimeTitle string `json:"animeTitle"`
    BangumiID  int64  `json:"bangumiId"`  // Bangumi.tv subject ID
}

type bangumiInfoResponse struct {
    ErrorCode    int         `json:"errorCode"`
    ErrorMessage string      `json:"errorMessage"`
    BangumiID    int64       `json:"bangumiId"`
    AnimeTitle   string      `json:"animeTitle"`
}
```

---

## 4. AnimeResolver Service

**Package:** `internal/resolver/`

```go
type Resolver struct {
    queries    *store.Queries
    bangumi    bangumi.Client
    dandanplay dandanplay.Client
    cache      cache.Cache
}

func New(q *store.Queries, bgm bangumi.Client, ddp dandanplay.Client, c cache.Cache) *Resolver

func (r *Resolver) ResolveLibrary(ctx context.Context, libraryID string) (*ResolveSummary, error)
```

**ResolveSummary:**
```go
type ResolveSummary struct {
    AnimeCreated    int `json:"anime_created"`
    EpisodesCreated int `json:"episodes_created"`
    FilesLinked     int `json:"files_linked"`
    Errors          int `json:"errors"`
}
```

### ResolveLibrary Flow

1. Query `ListMatchedUnlinkedMediaFiles(libraryID)` — files with `dandanplay_episode_id IS NOT NULL AND episode_id IS NULL`
2. Group files by `dandanplay_episode_id` to avoid duplicate API calls
3. For each unique DandanPlay episode ID:
   a. Need the DandanPlay `animeId` — stored in match result. Since we don't store it, we need to call DandanPlay match API again OR store the animeId during matching.

   **Decision:** During matching (Plan 6), we only stored `dandanplay_episode_id`. We didn't store the `animeId`. Two approaches:
   - **(Chosen)** Call `dandanplay.GetComments(episodeID)` — the response includes enough info. Actually no — comments don't include animeId.
   - **(Chosen)** Store `dandanplay_anime_id` on `media_files` during matching. This requires a new column OR we use the DandanPlay search API to reverse-lookup.

   **Simplest approach:** The DandanPlay `GET /api/v2/bangumi/{animeId}` requires the DandanPlay animeId, which we don't have. Instead, use the **Bangumi cross-reference**: DandanPlay's API `GET /api/v2/bangumi/bgmtv/{bgmtvSubjectId}` goes the other direction.

   **Better approach:** During matching, the `MatchResult.Matches[0]` contains both `EpisodeID` and `AnimeID`. We should store the `AnimeID` on `media_files` too. But we don't have a column for it.

   **Chosen approach:** Add a nullable `dandanplay_anime_id INTEGER` column to `media_files` via a new migration. Update the matcher to store it during matching. Then the resolver can use it.

4. With `dandanplay_anime_id` available:
   a. Call DandanPlay `GET /api/v2/bangumi/{dandanplayAnimeId}` → get `bangumiId`
   b. Cache the mapping: `resolve:ddp2bgm:{dandanplayAnimeId}` → bangumiId (7 day TTL)
   c. Check if `anime` record exists by `bangumi_id` — if not, fetch from Bangumi API and create
   d. Fetch Bangumi episodes, create missing `episodes` records
   e. Match `media_files.dandanplay_episode_id` to `episodes.dandanplay_episode_id` and set `media_files.episode_id`

---

## 5. New Migration

`api/migrations/000015_add_dandanplay_anime_id.up.sql`:
```sql
ALTER TABLE media_files ADD COLUMN dandanplay_anime_id INTEGER;
```

`api/migrations/000015_add_dandanplay_anime_id.down.sql`:
```sql
ALTER TABLE media_files DROP COLUMN dandanplay_anime_id;
```

---

## 6. sqlc Queries

**New queries in `media_files.sql`:**
```sql
-- name: UpdateMediaFileDandanplayIDs :exec
UPDATE media_files
SET dandanplay_episode_id = ?, dandanplay_anime_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListMatchedUnlinkedMediaFiles :many
SELECT * FROM media_files
WHERE library_id = ? AND dandanplay_episode_id IS NOT NULL AND episode_id IS NULL;

-- name: UpdateMediaFileEpisodeID :exec
UPDATE media_files
SET episode_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
```

**New queries in `anime.sql`:**
```sql
-- name: GetAnimeByBangumiID :one
SELECT * FROM anime WHERE bangumi_id = ? LIMIT 1;

-- name: CreateAnime :one
INSERT INTO anime (id, library_id, title, title_zh, title_en, synopsis, cover_image_url,
    total_episodes, status, air_date, year, season, genres, bangumi_id, dandanplay_bangumi_id,
    created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;
```

**New queries in `episodes.sql`:** (create this file)
```sql
-- name: GetEpisodeByDandanplayID :one
SELECT * FROM episodes WHERE dandanplay_episode_id = ? LIMIT 1;

-- name: CreateEpisode :one
INSERT INTO episodes (id, anime_id, episode_number, title, title_zh, air_date,
    dandanplay_episode_id, bangumi_episode_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: ListEpisodesByAnimeID :many
SELECT * FROM episodes WHERE anime_id = ? ORDER BY episode_number;
```

---

## 7. Matcher Update

Update `internal/matcher/matcher.go` to store `dandanplay_anime_id` during matching:

Change from `UpdateMediaFileDandanplayID` (only episode ID) to `UpdateMediaFileDandanplayIDs` (both episode + anime IDs).

---

## 8. Handler Integration

Update `handleScanLibrary` in `library_handler.go`:

```go
// After scan + match:
if h.resolver != nil {
    _, _ = h.resolver.ResolveLibrary(ctx, lib.ID)
}
```

Add `resolver *resolver.Resolver` to handler struct. Update `NewRouter` signature.

---

## 9. Caching

| Data | Cache Key | TTL |
|------|-----------|-----|
| DandanPlay animeId → Bangumi subjectId | `resolve:ddp2bgm:{dandanplayAnimeId}` | 7 days |

---

## 10. File Map

### Created
- `api/migrations/000015_add_dandanplay_anime_id.up.sql`
- `api/migrations/000015_add_dandanplay_anime_id.down.sql`
- `api/internal/store/queries/anime.sql`
- `api/internal/store/queries/episodes.sql`
- `api/internal/resolver/resolver.go`
- `api/internal/resolver/resolver_test.go`

### Modified
- `api/internal/integration/dandanplay/types.go` — add BangumiInfo type
- `api/internal/integration/dandanplay/client.go` — add GetBangumiInfo method
- `api/internal/store/queries/media_files.sql` — add new queries
- `api/internal/matcher/matcher.go` — store dandanplay_anime_id
- `api/internal/api/router.go` — add resolver to handler struct
- `api/internal/api/library_handler.go` — call resolver after match
- `api/cmd/server/main.go` — initialize resolver
