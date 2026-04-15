# Missing Episode Detection

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Follow-ups:** "Find missing episode" RSS search UI + auto-download rule creation — separate spec

## Goals

Surface which episodes a user is missing from each anime in their library, without false-flagging episodes that haven't aired yet. Computation is on-demand so cached state never drifts. UI shows counts and specific episode numbers on anime detail pages, badges on library cards, and a "Incomplete only" library filter.

### In scope

- On-demand aggregation helper `completeness.BuildReport(ctx, q, animeID)` → `{total, have, missing, airing_pending}`.
- `completeness.BuildLibrarySummary(ctx, q, libraryID)` batching per-anime reports with a single batched query.
- Two API endpoints: `GET /api/v1/anime/:bangumiId/missing` and `GET /api/v1/libraries/:id/missing-summary`.
- Anime detail page: "Episode status" section with specific missing episode numbers and upcoming air dates.
- Library page: badge on each anime card (`⚠️ N missing`) when missing > 0.
- Library page: "Incomplete only" filter toggle.

### Out of scope (deferred)

- Auto-search RSS / auto-create download rules for missing episodes (Phase B).
- Manual "Find this episode" button that opens the RSS search (Phase B).
- Distinguishing between "episode row missing" and "episode row present but no file" in the UI; both count as missing.
- Tracking 0.5 / special episodes in the gap math; only integer episodes 1..`total_episodes` are checked.
- Notifications when a missing episode airs.

## Non-goals

- Caching the report on the anime row. On-demand compute is fast enough on SQLite and avoids every invalidation bug scan / rclone / manual-match would introduce.

## Architecture

### New package — `api/internal/library/completeness/`

| File | Responsibility |
|---|---|
| `report.go` | `Report` struct + JSON tags; small helpers like `IsComplete()`. |
| `analyzer.go` | `BuildReport(ctx, q, animeID)` single anime; `BuildLibrarySummary(ctx, q, libraryID)` batched library-wide. |
| `analyzer_test.go` | Exhaustive edge-case coverage. |

```go
// report.go
package completeness

import "time"

type Report struct {
    AnimeID         string  `json:"anime_id"`
    BangumiID       int64   `json:"bangumi_id,omitempty"`
    Title           string  `json:"title,omitempty"`
    Total           int     `json:"total"`
    Have            []int   `json:"have"`
    Missing         []int   `json:"missing"`
    AiringPending   []int   `json:"airing_pending"`
    UnknownTotal    bool    `json:"unknown_total"`
    GeneratedAt     time.Time `json:"generated_at"`
}

func (r Report) MissingCount() int { return len(r.Missing) }
func (r Report) IsComplete() bool  { return r.Total > 0 && len(r.Missing) == 0 && len(r.AiringPending) == 0 }
```

```go
// analyzer.go — signature sketch
func BuildReport(ctx context.Context, q *store.Queries, animeID string) (Report, error)
func BuildLibrarySummary(ctx context.Context, q *store.Queries, libraryID string) ([]Report, error)
```

### New store queries

`api/internal/store/queries/media_files.sql` appendix:

```sql
-- name: CountMediaFilesPerEpisodeByAnime :many
-- Returns one row per episode_id that has at least one media file linked.
SELECT e.id AS episode_id, e.episode_number, COUNT(mf.id) AS file_count
FROM episodes e
JOIN media_files mf ON mf.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
GROUP BY e.id, e.episode_number;

-- name: CountMediaFilesPerEpisodeByLibrary :many
-- Batched variant for library summary: returns per-anime per-episode counts.
SELECT e.anime_id, e.id AS episode_id, e.episode_number, COUNT(mf.id) AS file_count
FROM episodes e
JOIN media_files mf ON mf.episode_id = e.id
JOIN anime a ON a.id = e.anime_id
WHERE a.library_id = sqlc.arg('library_id')
GROUP BY e.anime_id, e.id, e.episode_number;
```

`api/internal/store/queries/episodes.sql` appendix (if not already present):

```sql
-- name: ListEpisodesByAnimeIDWithAirDate :many
SELECT id, anime_id, episode_number, air_date FROM episodes
WHERE anime_id = ? ORDER BY episode_number ASC;

-- name: ListEpisodesByLibraryIDWithAirDate :many
SELECT e.id, e.anime_id, e.episode_number, e.air_date FROM episodes e
JOIN anime a ON a.id = e.anime_id
WHERE a.library_id = ? ORDER BY e.anime_id, e.episode_number ASC;
```

### API handlers

New file `api/internal/api/completeness_handler.go`:

```go
func (h *handler) handleAnimeMissing(c echo.Context) error {
    ctx := c.Request().Context()
    bangumiID := parseBangumiID(c.Param("bangumiId"))
    anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil { return echo.ErrNotFound }
    report, err := completeness.BuildReport(ctx, h.queries, anime.ID)
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, report)
}

func (h *handler) handleLibraryMissingSummary(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    reports, err := completeness.BuildLibrarySummary(ctx, h.queries, libraryID)
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, reports)
}
```

Register under authenticated routes:

- `GET /api/v1/anime/:bangumiId/missing`
- `GET /api/v1/libraries/:id/missing-summary`

### Frontend

- `web/src/lib/api/completeness.ts` — typed client with `CompletenessReport` matching the Go struct.
- `web/src/pages/AnimeDetailPage.tsx` — new `EpisodeStatusCard` below the main metadata. Hidden when `IsComplete()` == true (computed client-side to avoid a flash). Uses skeleton while loading.
- `web/src/components/library/AnimeCard.tsx` (or wherever cards live) — `missingCount > 0` badge in the top-right corner using white/opacity (no accent color, per project rules).
- `web/src/pages/LibraryDetailPage.tsx` — "Incomplete only" toggle in the filter bar. Backed by the summary endpoint; client filters when toggled.

## Data flow

### Single anime detail

```
AnimeDetailPage mounts
  → useQuery(['anime-missing', bangumiId], fetchCompleteness)
  → GET /api/v1/anime/:bangumiId/missing
  → resolver: bangumi_id → anime.id
  → BuildReport(anime.id)
    → ListEpisodesByAnimeIDWithAirDate → []Episode
    → CountMediaFilesPerEpisodeByAnime → map[episode_id]int
    → walk 1..anime.total_episodes
    → Report JSON
  → EpisodeStatusCard renders missing + airing_pending
```

### Library summary

```
LibraryDetailPage mounts
  → useQuery(['library-missing', libraryId])
  → GET /api/v1/libraries/:id/missing-summary
  → BuildLibrarySummary:
      GetAllAnimeByLibraryID → []Anime
      ListEpisodesByLibraryIDWithAirDate → []Episode (grouped in Go by anime_id)
      CountMediaFilesPerEpisodeByLibrary → map[anime_id]map[episode_id]int
      For each anime, compute Report using already-loaded data (no per-anime query)
  → [Report]
  → AnimeCard reads report.missing_count
  → FilterBar "Incomplete only" filters client-side
```

This keeps the library summary to **3 queries total** regardless of library size.

### BuildReport logic (precise)

```
BuildReport(animeID):
    anime := GetAnime(animeID)
    if anime.total_episodes IS NULL or 0:
        return Report{AnimeID: animeID, UnknownTotal: true, GeneratedAt: now}

    episodes := ListEpisodesByAnimeIDWithAirDate(animeID)
    fileCounts := CountMediaFilesPerEpisodeByAnime(animeID)

    haveEpisodeNumbers := {}
    airDateByNumber := map[int]time.Time{}
    for ep in episodes:
        // episode_number is REAL; we only care about integer values for gap math.
        if ep.episode_number != math.Trunc(ep.episode_number):
            continue  // skip 0.5 specials etc.
        n := int(ep.episode_number)
        if fileCounts[ep.id] > 0:
            haveEpisodeNumbers[n] = true
        if ep.air_date != "":
            if t, err := time.Parse("2006-01-02", ep.air_date); err == nil:
                airDateByNumber[n] = t

    today := now (UTC, midnight).
    report := Report{AnimeID: animeID, Total: int(total)}
    for n := 1; n <= int(total); n++:
        if haveEpisodeNumbers[n]:
            report.Have = append(report.Have, n)
            continue
        if t, ok := airDateByNumber[n]; ok && t.After(today):
            report.AiringPending = append(report.AiringPending, n)
            continue
        report.Missing = append(report.Missing, n)
    report.GeneratedAt = now
    return report
```

Unambiguous on every edge case:
- Episode row exists, file linked → `have`.
- Episode row exists, no file, air date future → `airing_pending`.
- Episode row exists, no file, air date past or empty → `missing`.
- Episode row missing entirely (gap in `episodes` table) → `missing`.
- Non-integer episode numbers never count in gap math.
- Episodes beyond `total_episodes` (specials numbered 13 of a 12-ep show) are ignored (they're extras).

## Edge cases

| Case | Behavior |
|---|---|
| `total_episodes = 0 / NULL` | Return `UnknownTotal: true`; API responds 200; UI hides the card. |
| Anime has only special episodes (all float) | `Total` comes from metadata; all floats skipped; likely all flagged missing, which is technically correct (user will see `total_episodes=12, missing=[1..12]` if no integer episode rows exist yet — reasonable). |
| Air date `"2026-04-17"` but today is also `"2026-04-17"` | `t.After(today)` is false when dates are equal; episode counts as missing if no file. Acceptable nuance. |
| Library with 5000 anime | Library summary runs exactly 3 queries; typical SQLite response under 50ms. |
| Library summary: anime has `total_episodes = 0` | Returns `UnknownTotal: true`; UI card shows no badge (`missing_count` = 0). |
| Episode has `air_date = "TBA"` or malformed | Parse fails; treated as empty; falls through to `missing`. |
| Season 2 of a series with `total_episodes = 12` but user has ep 13 as a file | That media file's episode row has `episode_number = 13 > total`; skipped by gap walk. Not flagged as "extra" in the UI today. |

## Testing

- `analyzer_test.go`:
  - `TestBuildReport_UnknownTotal`
  - `TestBuildReport_CompletelyHave`
  - `TestBuildReport_GapInMiddle` (missing ep 3 of 12)
  - `TestBuildReport_FutureAirDate_IsAiringPending`
  - `TestBuildReport_PastAirDateNoFile_IsMissing`
  - `TestBuildReport_MissingEpisodeRow_IsMissing`
  - `TestBuildReport_NonIntegerEpisodesIgnored`
  - `TestBuildLibrarySummary_BatchesQueries` (asserts 3 queries for a 100-anime fixture via a query-counting `*store.Queries` wrapper, or verified by test timing)
- `completeness_handler_test.go`: happy path + 404 on unknown bangumi_id.
- Frontend: typecheck-only (UI changes are mechanical; manual sanity in dev server).

## Rollout

1. Migration-free: ship package + handlers + UI behind no flag. No user-facing breakage possible if toggle is not engaged.
2. If SQL perf is a concern on huge libraries, add a JSON `missing_snapshot` column on `anime` and a scheduler job that refreshes nightly. Defer unless observed.

## Open questions

- **Extra-episodes surfacing**: should the UI tell the user they have `ep 13` in a 12-ep show? Probably yes in a follow-up, but out of scope now.
- **Bangumi mis-reported total**: some Bangumi subjects report `total_episodes` as the lifetime count including a future season. Users will see perpetually-missing episodes. Out of scope; users can override `anime.total_episodes` via the edit UI (if one exists) or we add an override column later.
