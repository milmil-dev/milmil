# AnimeDetailPage Playback + Progress + Season Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable episode playback, watch progress display, continue watching, and season switching on the anime detail page.

**Architecture:** New sqlc query joins episodes + media_files + watch_progress. New API endpoint returns enriched episode data. Frontend AnimeDetailPage fetches playable episodes for authenticated users and renders play buttons, progress bars, continue banner, and season tabs.

**Tech Stack:** Go (Echo, sqlc, SQLite), TypeScript (TanStack Router/Query, Motion, Tailwind)

**Spec:** `docs/superpowers/specs/2026-03-30-anime-detail-playback-design.md`

---

## File Structure

### Backend (create)
- `api/internal/store/queries/playable_episodes.sql` — sqlc query joining episodes + media_files + watch_progress
- `api/internal/api/anime_handler.go` — handler for playable episodes endpoint

### Backend (modify)
- `api/internal/api/router.go` — register new route

### Frontend (create)
- `web/src/lib/api/anime.ts` — playable episodes API client + types

### Frontend (modify)
- `web/src/pages/AnimeDetailPage.tsx` — integrate playable episodes, continue watching, season tabs, collection status
- `web/src/components/EpisodeListItem.tsx` — add play icon, file info, hasFile state

---

## Task 1: sqlc Query — Playable Episodes

**Files:**
- Create: `api/internal/store/queries/playable_episodes.sql`

- [ ] **Step 1: Create the query file**

```sql
-- name: ListPlayableEpisodes :many
SELECT
  e.id AS episode_id,
  e.episode_number AS sort,
  e.title AS episode_title,
  e.title_zh AS episode_title_zh,
  e.air_date,
  e.synopsis,
  e.synopsis_zh,
  e.thumbnail_url AS image,
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
WHERE e.anime_id = sqlc.arg(anime_id)
ORDER BY e.episode_number ASC;
```

- [ ] **Step 2: Run sqlc generate**

Run: `cd api && sqlc generate`
Expected: No errors. New file `api/internal/store/playable_episodes.sql.go` generated.

- [ ] **Step 3: Verify build**

Run: `cd api && go build ./...`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/playable_episodes.sql api/internal/store/playable_episodes.sql.go api/internal/store/models.go api/internal/store/querier.go
git commit -m "feat(db): add ListPlayableEpisodes sqlc query"
```

---

## Task 2: API Handler — Playable Episodes

**Files:**
- Create: `api/internal/api/anime_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create anime_handler.go**

```go
package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

type playableEpisodeMedia struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Size     int64  `json:"size_bytes"`
	Width    *int64 `json:"width,omitempty"`
	Height   *int64 `json:"height,omitempty"`
}

type playableEpisodeProgress struct {
	PositionSeconds int64 `json:"position_seconds"`
	DurationSeconds int64 `json:"duration_seconds"`
	Completed       bool  `json:"completed"`
}

type playableEpisodeResponse struct {
	EpisodeID     string                   `json:"episode_id"`
	Sort          float64                  `json:"sort"`
	Title         *string                  `json:"title"`
	TitleZh       *string                  `json:"title_zh"`
	AirDate       *string                  `json:"air_date"`
	Synopsis      *string                  `json:"synopsis"`
	SynopsisZh    *string                  `json:"synopsis_zh"`
	Image         *string                  `json:"image"`
	MediaFile     *playableEpisodeMedia    `json:"media_file"`
	Progress      *playableEpisodeProgress `json:"progress"`
}

type playableEpisodesEnvelope struct {
	WatchStatus string                    `json:"watch_status"`
	Episodes    []playableEpisodeResponse `json:"episodes"`
}

func (h *handler) handlePlayableEpisodes(c echo.Context) error {
	bangumiIDStr := c.Param("bangumiId")
	bangumiID, err := strconv.ParseInt(bangumiIDStr, 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId")
	}

	// Look up anime by bangumi_id
	anime, err := h.queries.GetAnimeByBangumiID(c.Request().Context(), sql.NullInt64{Int64: bangumiID, Valid: true})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "anime not found")
		}
		return echo.ErrInternalServerError
	}

	// Get playable episodes
	rows, err := h.queries.ListPlayableEpisodes(c.Request().Context(), anime.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}

	episodes := make([]playableEpisodeResponse, 0, len(rows))
	for _, row := range rows {
		ep := playableEpisodeResponse{
			EpisodeID:  row.EpisodeID,
			Sort:       row.Sort,
			Title:      nullStr(row.EpisodeTitle),
			TitleZh:    nullStr(row.EpisodeTitleZh),
			AirDate:    nullStr(row.AirDate),
			Synopsis:   nullStr(row.Synopsis),
			SynopsisZh: nullStr(row.SynopsisZh),
			Image:      nullStr(row.Image),
		}

		// Attach media file if matched
		if row.MediaFileID.Valid {
			mf := &playableEpisodeMedia{
				ID:       row.MediaFileID.String,
				Filename: row.MediaFilename.String,
				Size:     row.MediaSizeBytes.Int64,
			}
			if row.MediaWidth.Valid {
				mf.Width = &row.MediaWidth.Int64
			}
			if row.MediaHeight.Valid {
				mf.Height = &row.MediaHeight.Int64
			}
			ep.MediaFile = mf
		}

		// Attach progress if exists
		if row.PositionSeconds.Valid {
			ep.Progress = &playableEpisodeProgress{
				PositionSeconds: row.PositionSeconds.Int64,
				DurationSeconds: row.ProgressDuration.Int64,
				Completed:       row.Completed.Int64 == 1,
			}
		}

		episodes = append(episodes, ep)
	}

	return c.JSON(http.StatusOK, playableEpisodesEnvelope{
		WatchStatus: anime.WatchStatus,
		Episodes:    episodes,
	})
}
```

Note: This handler uses `nullStr` from `collection_handler.go`. If that function is not accessible (different file, same package — it IS accessible since same package `api`), it will work. Verify after build.

- [ ] **Step 2: Register route in router.go**

Add after the collection group:

```go
	// Anime — protected (local library data)
	animeGroup := v1.Group("/anime", jwtMiddleware(cfg.JWTSecret))
	animeGroup.GET("/:bangumiId/playable-episodes", h.handlePlayableEpisodes)
```

- [ ] **Step 3: Build and verify**

Run: `cd api && go build ./...`
Expected: Build succeeds.

Check that `nullStr` and `nullInt` from `collection_handler.go` are accessible. They should be since both files are in the same `api` package.

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/anime_handler.go api/internal/api/router.go
git commit -m "feat(api): add playable episodes endpoint with media file + progress"
```

---

## Task 3: Frontend API Client

**Files:**
- Create: `web/src/lib/api/anime.ts`

- [ ] **Step 1: Create anime API client**

Read `web/src/lib/api/discover.ts` and `web/src/lib/api/collection.ts` first to match the import pattern for `api` from `../api-client`.

```typescript
import { api } from '../api-client';

export interface PlayableEpisodeMedia {
  id: string;
  filename: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface PlayableEpisodeProgress {
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
}

export interface PlayableEpisode {
  episode_id: string;
  sort: number;
  title: string | null;
  title_zh: string | null;
  air_date: string | null;
  synopsis: string | null;
  synopsis_zh: string | null;
  image: string | null;
  media_file: PlayableEpisodeMedia | null;
  progress: PlayableEpisodeProgress | null;
}

export interface PlayableEpisodesResponse {
  watch_status: string;
  episodes: PlayableEpisode[];
}

export const animeApi = {
  playableEpisodes: (bangumiId: number) =>
    api.get<PlayableEpisodesResponse>(`/api/v1/anime/${bangumiId}/playable-episodes`),
};

export const animeKeys = {
  playableEpisodes: (bangumiId: number) => ['anime', 'playable-episodes', bangumiId] as const,
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api/anime.ts
git commit -m "feat(web): add playable episodes API client"
```

---

## Task 4: EpisodeListItem — Play Icon + File Info

**Files:**
- Modify: `web/src/components/EpisodeListItem.tsx`

- [ ] **Step 1: Read the current file**

Read `web/src/components/EpisodeListItem.tsx` fully.

- [ ] **Step 2: Update the props interface**

Add new props to `EpisodeListItemProps`:

```typescript
interface EpisodeListItemProps {
  sort: number;
  title: string;
  titleOriginal?: string;
  isActive: boolean;
  href: string;          // existing — will now be /watch/:fileId or '#'
  airDate?: string;
  synopsis?: string;
  image?: string;
  duration?: number;
  progress?: number;     // existing — 0 to 1 fraction
  hasFile: boolean;      // NEW — whether a local media file exists
  fileQuality?: string;  // NEW — e.g. "1080p", "720p"
  completed?: boolean;   // NEW — whether episode is fully watched
}
```

Default `hasFile` to `true` for backward compatibility.

- [ ] **Step 3: Update rendering**

Changes to make:
1. When `hasFile` is false: replace `<Link>` with a `<div>` (not clickable), add `opacity-50` styling, show "無本地文件" badge
2. When `hasFile` is true: show a small green play icon (▶) in the thumbnail area
3. When `completed` is true: show a ✓ checkmark overlay on the thumbnail
4. When `fileQuality` is provided: show it as a small badge (e.g. "1080p") next to the air date

For the play icon, use a simple SVG triangle or the existing icon pattern. Keep it minimal — a small green circle with ▶ overlaid on the episode thumbnail.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/EpisodeListItem.tsx
git commit -m "feat(web): add play icon, file info, and completed state to EpisodeListItem"
```

---

## Task 5: AnimeDetailPage — Playable Episodes Integration

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Read the current file fully**

Read `web/src/pages/AnimeDetailPage.tsx`.

- [ ] **Step 2: Add playable episodes query**

Import:
```typescript
import { animeApi, animeKeys } from '../lib/api/anime';
import type { PlayableEpisode } from '../lib/api/anime';
import { useAuth } from '../hooks/use-auth';
```

Add a new query alongside the existing episodes query:

```typescript
const { isAuthenticated } = useAuth();

// Playable episodes (authenticated — includes local files + progress)
const { data: playableData } = useQuery({
  queryKey: animeKeys.playableEpisodes(numericId),
  queryFn: () => animeApi.playableEpisodes(numericId),
  enabled: !Number.isNaN(numericId) && isAuthenticated,
});
```

Use `playableData?.episodes` when available, fall back to `episodes` (discover API) for unauthenticated users.

- [ ] **Step 3: Update EpisodeListItem rendering**

Replace the current episode rendering loop (around lines 277-296). When `playableData` is available, map from playable episodes:

```typescript
const episodeList = playableData?.episodes ?? episodes?.map(e => ({
  episode_id: '',
  sort: e.sort,
  title: e.title,
  title_zh: null,
  air_date: e.air_date ?? null,
  synopsis: e.synopsis ?? null,
  synopsis_zh: null,
  image: e.image ?? null,
  media_file: null,
  progress: null,
})) ?? [];
```

For each episode:
```typescript
<EpisodeListItem
  key={ep.episode_id || ep.sort}
  sort={ep.sort}
  title={ep.title_zh || ep.title || `Episode ${ep.sort}`}
  titleOriginal={ep.title ?? undefined}
  synopsis={ep.synopsis_zh || ep.synopsis ?? undefined}
  image={ep.image ?? undefined}
  airDate={ep.air_date ?? undefined}
  isActive={false}
  href={ep.media_file ? `/watch/${ep.media_file.id}` : '#'}
  hasFile={!!ep.media_file}
  fileQuality={ep.media_file?.height ? `${ep.media_file.height}p` : undefined}
  progress={ep.progress && ep.progress.duration_seconds > 0
    ? ep.progress.position_seconds / ep.progress.duration_seconds
    : undefined}
  completed={ep.progress?.completed}
/>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): integrate playable episodes with file info and progress"
```

---

## Task 6: Continue Watching Banner

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Compute continue episode**

After the playable episodes query, compute the "continue" episode:

```typescript
const continueEpisode = useMemo(() => {
  if (!playableData?.episodes) return null;
  // Find first episode with progress but not completed
  const inProgress = playableData.episodes.find(
    ep => ep.progress && !ep.progress.completed && ep.progress.position_seconds > 0 && ep.media_file
  );
  if (inProgress) return inProgress;
  // Or find next unwatched episode after last completed
  const lastCompleted = [...playableData.episodes]
    .reverse()
    .find(ep => ep.progress?.completed);
  if (lastCompleted) {
    const nextSort = lastCompleted.sort + 1;
    return playableData.episodes.find(ep => ep.sort >= nextSort && ep.media_file);
  }
  // Or first episode with a file
  return playableData.episodes.find(ep => ep.media_file) ?? null;
}, [playableData]);
```

- [ ] **Step 2: Render continue banner**

Place after the hero section, before the episodes grid. Use `useLingui` for i18n:

```tsx
{continueEpisode && continueEpisode.media_file && (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-6"
  >
    <Link
      to="/watch/$fileId"
      params={{ fileId: continueEpisode.media_file.id }}
      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-mm-accent/10 border border-mm-accent/20 hover:bg-mm-accent/15 transition-colors group"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-mm-accent/20 text-mm-accent group-hover:bg-mm-accent/30 transition-colors">
        <span className="text-sm ml-0.5">▶</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {i18n._(msg`anime.continueWatching`)}
        </p>
        <p className="text-xs text-white/50 truncate">
          {i18n._(msg`anime.episode`)} {continueEpisode.sort}
          {continueEpisode.title ? ` — ${continueEpisode.title_zh || continueEpisode.title}` : ''}
          {continueEpisode.progress && !continueEpisode.progress.completed
            ? ` · ${formatTime(continueEpisode.progress.position_seconds)} / ${formatTime(continueEpisode.progress.duration_seconds)}`
            : ''}
        </p>
      </div>
    </Link>
  </motion.div>
)}
```

Add helper:
```typescript
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): add continue watching banner to anime detail page"
```

---

## Task 7: Season Tabs

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Build season chain from relations**

Add a function to extract the season chain:

```typescript
function buildSeasonChain(
  relations: RelatedAnime[] | undefined,
  currentId: number,
  currentTitle: string
): Array<{ bangumiId: number; label: string; isCurrent: boolean }> {
  if (!relations?.length) return [];

  const sequels = relations.filter(r => r.relation_type === 'SEQUEL' || r.relation_type === 'Sequel');
  const prequels = relations.filter(r => r.relation_type === 'PREQUEL' || r.relation_type === 'Prequel');

  if (sequels.length === 0 && prequels.length === 0) return [];

  const chain: Array<{ bangumiId: number; label: string; isCurrent: boolean }> = [];

  // Add prequels (reversed so earliest season first)
  for (let i = prequels.length - 1; i >= 0; i--) {
    chain.push({
      bangumiId: prequels[i].anime.bangumi_id,
      label: `S${chain.length + 1}`,
      isCurrent: false,
    });
  }

  // Add current
  chain.push({
    bangumiId: currentId,
    label: `S${chain.length + 1}`,
    isCurrent: true,
  });

  // Add sequels
  for (const sequel of sequels) {
    chain.push({
      bangumiId: sequel.anime.bangumi_id,
      label: `S${chain.length + 1}`,
      isCurrent: false,
    });
  }

  return chain;
}
```

- [ ] **Step 2: Render season tabs below title**

In the hero section, after the title area, render the season tabs:

```tsx
{(() => {
  const seasons = buildSeasonChain(anime.relations, numericId, anime.title);
  if (seasons.length <= 1) return null;
  return (
    <div className="flex gap-1.5 mt-3 overflow-x-auto">
      {seasons.map(s => (
        <Tooltip key={s.bangumiId}>
          <TooltipTrigger asChild>
            <Link
              to="/anime/$id"
              params={{ id: String(s.bangumiId) }}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0",
                s.isCurrent
                  ? "bg-mm-accent/20 text-mm-accent"
                  : "bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70"
              )}
            >
              {s.label}
            </Link>
          </TooltipTrigger>
          <TooltipContent>{/* title from relation */}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
})()}
```

Import `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from ui/tooltip if not already imported.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): add season tabs to anime detail page"
```

---

## Task 8: Collection Status on Detail Page

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Add collection status display**

In the hero section (near tags/metadata), add a status dropdown button. Reuse the pattern from CollectionPage:

```typescript
import { collectionApi, collectionKeys } from '../lib/api/collection';
```

Use `playableData?.watch_status` for the current status. Add a mutation to update:

```typescript
const queryClient = useQueryClient();
const statusMutation = useMutation({
  mutationFn: ({ status }: { status: string }) =>
    collectionApi.updateStatus(numericId, status),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(numericId) });
    queryClient.invalidateQueries({ queryKey: collectionKeys.all });
  },
});
```

Render a simple dropdown or pill buttons for status in the hero section. Keep it minimal — a single button showing current status that opens a small dropdown on click.

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): add collection status dropdown to anime detail page"
```

---

## Task 9: i18n Translations

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add translations to all 3 files**

English:
```po
msgid "anime.continueWatching"
msgstr "Continue Watching"

msgid "anime.episode"
msgstr "Episode"

msgid "anime.noLocalFile"
msgstr "No local file"

msgid "anime.season"
msgstr "Season"
```

Traditional Chinese:
```po
msgid "anime.continueWatching"
msgstr "繼續觀看"

msgid "anime.episode"
msgstr "第"

msgid "anime.noLocalFile"
msgstr "無本地文件"

msgid "anime.season"
msgstr "季"
```

Simplified Chinese:
```po
msgid "anime.continueWatching"
msgstr "继续观看"

msgid "anime.episode"
msgstr "第"

msgid "anime.noLocalFile"
msgstr "无本地文件"

msgid "anime.season"
msgstr "季"
```

- [ ] **Step 2: Compile translations**

Run: `cd web && bun run i18n:compile`
Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add anime detail playback translations"
```

---

## Task 10: Verification

- [ ] **Step 1: Build backend**

Run: `cd api && go build ./...`
Expected: Succeeds.

- [ ] **Step 2: Typecheck frontend**

Run: `cd web && bun run typecheck 2>&1 | grep -v "MotionTable\|LibraryDetailPage\|SchedulePage"`
Expected: No new errors.

- [ ] **Step 3: Manual test**

1. Start backend + frontend
2. Navigate to an anime with matched files (e.g. `/anime/277554`)
3. Verify:
   - Episodes show green play icon for matched episodes
   - Episodes without files are grayed out
   - Clicking a playable episode navigates to `/watch/:fileId`
   - Progress bars show if episodes have been partially watched
   - Continue watching banner appears if there's an in-progress episode
   - Season tabs appear if the anime has sequels/prequels
   - Collection status dropdown shows current watch_status
