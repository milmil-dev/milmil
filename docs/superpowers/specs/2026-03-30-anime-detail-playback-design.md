# AnimeDetailPage Playback + Progress + Season Integration

## Overview

Bridge the gap between episode metadata and local media files on the anime detail page. Enable playback from episode list, show watch progress, continue watching, season switching, and collection status management.

## Decisions

- **Single API**: One endpoint returns episodes + matched files + progress (no triple-fetch)
- **Playback link**: Episodes with local files link to `/watch/:fileId`
- **Season switching**: Pill tabs extracted from relations chain (SEQUEL/PREQUEL)
- **Continue watching**: Banner below hero when incomplete episodes exist
- **Collection status**: Dropdown on detail page, reuses existing collection API

## 1. Backend — Playable Episodes API

### New SQL Query

```sql
-- name: ListPlayableEpisodes :many
SELECT
  e.id AS episode_id,
  e.episode_number AS sort,
  e.title,
  e.title_original,
  e.air_date,
  e.synopsis,
  e.synopsis_zh,
  e.image,
  e.duration,
  mf.id AS media_file_id,
  mf.filename AS media_filename,
  mf.size_bytes AS media_size_bytes,
  mf.width AS media_width,
  mf.height AS media_height,
  wp.position_seconds,
  wp.duration_seconds AS progress_duration,
  wp.completed
FROM episodes e
LEFT JOIN media_files mf ON mf.episode_id = e.id
LEFT JOIN watch_progress wp ON wp.episode_id = e.id
WHERE e.anime_id = ?
ORDER BY e.episode_number ASC;
```

### New API Endpoint

`GET /api/v1/anime/:bangumiId/playable-episodes` (protected)

Handler:
1. Look up anime by bangumi_id to get internal anime.id
2. Query ListPlayableEpisodes with anime.id
3. Map to clean response type (convert sql.Null* to pointers)
4. Return JSON array

### Response Type

```go
type playableEpisodeResponse struct {
  EpisodeID     string  `json:"episode_id"`
  Sort          int64   `json:"sort"`
  Title         *string `json:"title"`
  TitleOriginal *string `json:"title_original"`
  AirDate       *string `json:"air_date"`
  Synopsis      *string `json:"synopsis"`
  SynopsisZh    *string `json:"synopsis_zh"`
  Image         *string `json:"image"`
  Duration      *int64  `json:"duration"`
  MediaFile     *struct {
    ID       string `json:"id"`
    Filename string `json:"filename"`
    Size     int64  `json:"size_bytes"`
    Width    *int64 `json:"width"`
    Height   *int64 `json:"height"`
  } `json:"media_file"`
  Progress *struct {
    PositionSeconds int64 `json:"position_seconds"`
    DurationSeconds int64 `json:"duration_seconds"`
    Completed       bool  `json:"completed"`
  } `json:"progress"`
}
```

### Route Registration

```go
animeGroup := v1.Group("/anime", jwtMiddleware(cfg.JWTSecret))
animeGroup.GET("/:bangumiId/playable-episodes", h.handlePlayableEpisodes)
```

## 2. Frontend — API Client

### New types in `web/src/lib/api/collection.ts` or new file

```typescript
export interface PlayableEpisode {
  episode_id: string;
  sort: number;
  title: string | null;
  title_original: string | null;
  air_date: string | null;
  synopsis: string | null;
  synopsis_zh: string | null;
  image: string | null;
  duration: number | null;
  media_file: {
    id: string;
    filename: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
  } | null;
  progress: {
    position_seconds: number;
    duration_seconds: number;
    completed: boolean;
  } | null;
}
```

### API method

```typescript
playableEpisodes: (bangumiId: number) =>
  api.get<PlayableEpisode[]>(`/api/v1/anime/${bangumiId}/playable-episodes`)
```

## 3. Frontend — AnimeDetailPage Changes

### 3a. Episode List with Playback

Replace current `discoverApi.episodes()` fetch with `playableEpisodes()` for authenticated users. Fall back to discover episodes for unauthenticated.

EpisodeListItem changes:
- `href` → `/watch/${episode.media_file.id}` when media_file exists, no link when null
- New prop: `mediaFile` — show file quality badge (e.g. `1080p`, `720p` derived from height)
- New prop: `progress` — already coded, just pass the data
- New prop: `hasFile` — boolean, grays out episode when false
- Show green play icon when file exists, gray "no file" indicator when not

### 3b. Continue Watching Banner

Below the hero section, conditionally render:

```tsx
{continueEpisode && (
  <div className="...banner styles...">
    <Link to={`/watch/${continueEpisode.media_file.id}`}
          search={{ t: continueEpisode.progress.position_seconds }}>
      ▶ 繼續觀看 第{continueEpisode.sort}集 「{continueEpisode.title}」
      — {formatTime(position)} / {formatTime(duration)}
    </Link>
  </div>
)}
```

`continueEpisode` = first episode where `progress && !progress.completed && progress.position_seconds > 0`, or the next unwatched episode after the last completed one.

### 3c. Season Tabs

Extract SEQUEL/PREQUEL chain from `anime.relations`:

```typescript
function buildSeasonChain(relations: RelatedAnime[], currentId: number) {
  const prequels = relations.filter(r => r.relation_type === 'PREQUEL');
  const sequels = relations.filter(r => r.relation_type === 'SEQUEL');
  // Build ordered chain: [...prequels, current, ...sequels]
  // Each item: { bangumi_id, title, isCurrent }
}
```

Render as pill tabs below the title:

```tsx
{seasons.length > 1 && (
  <div className="flex gap-1.5 mt-2 overflow-x-auto">
    {seasons.map(s => (
      <Link to={`/anime/${s.bangumi_id}`}
            className={cn("px-3 py-1 rounded-full text-xs ...",
              s.isCurrent ? "bg-mm-accent/20 text-mm-accent" : "bg-white/[0.06] text-white/50"
            )}>
        {s.label}
      </Link>
    ))}
  </div>
)}
```

Label format: "S1", "S2", etc. with title on hover (tooltip).

### 3d. Collection Status Dropdown

In the hero section, next to the title or below tags, add a status dropdown button:

```tsx
<StatusButton bangumiId={anime.bangumi_id} currentStatus={collectionStatus} />
```

Reuse the StatusDropdown pattern from CollectionPage. Fetch current status from collection API or embed in playable-episodes response.

To get current watch_status, either:
- Add `watch_status` to the anime detail API response, or
- Fetch from `collectionApi.list({ search: anime.title })` — too heavy
- **Best**: Add a simple `GET /api/v1/anime/:bangumiId/status` endpoint that returns `{ watch_status }`, or include it in the playable-episodes response header

**Decision**: Add `watch_status` field to the playable-episodes response as a top-level wrapper:

```json
{
  "watch_status": "watching",
  "episodes": [...]
}
```

## 4. i18n Keys

```
anime.continueWatching = 繼續觀看 / Continue Watching
anime.noLocalFile = 無本地文件 / No local file
anime.season = 季 / Season
anime.fileQuality = 畫質 / Quality
```

## 5. Scope Exclusions

- Character/staff info (needs additional API data source)
- User personal rating/scoring
- Additional external links (MAL, Kitsu)
- Episode filename display in episode list
- These are future iterations.
