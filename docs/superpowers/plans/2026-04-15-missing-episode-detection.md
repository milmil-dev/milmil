# Missing Episode Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface which episodes a user is missing from each anime in their library, compute on-demand, display badges on library cards and a dedicated section on the anime detail page, with a library-wide "Incomplete only" filter.

**Architecture:** New `api/internal/library/completeness/` package with pure analyzer functions (`BuildReport`, `BuildLibrarySummary`) consuming already-existing `store.Queries`. Library summary batches into 3 queries regardless of library size. Two REST endpoints feed a React card + badge + filter toggle.

**Tech Stack:** Go 1.24, SQLite + sqlc, React 19 + TanStack Query + Lingui.

**Spec:** `docs/superpowers/specs/2026-04-15-missing-episode-detection-design.md`

---

## File Structure

Files to create:

- `api/internal/library/completeness/report.go`
- `api/internal/library/completeness/analyzer.go`
- `api/internal/library/completeness/analyzer_test.go`
- `api/internal/api/completeness_handler.go`
- `api/internal/api/completeness_handler_test.go`
- `web/src/lib/api/completeness.ts`
- `web/src/components/anime/EpisodeStatusCard.tsx`

Files to modify:

- `api/internal/store/queries/episodes.sql` — add `ListEpisodesByAnimeIDWithAirDate`, `ListEpisodesByLibraryIDWithAirDate`
- `api/internal/store/queries/media_files.sql` — add `CountMediaFilesPerEpisodeByAnime`, `CountMediaFilesPerEpisodeByLibrary`
- `api/internal/api/router.go` — register two new routes
- `web/src/pages/AnimeDetailPage.tsx` — render `EpisodeStatusCard`
- `web/src/pages/LibraryDetailPage.tsx` — show missing badge on anime cards; "Incomplete only" filter toggle

---

## Task 1: Sqlc queries

**Files:**
- Modify: `api/internal/store/queries/episodes.sql`
- Modify: `api/internal/store/queries/media_files.sql`

- [ ] **Step 1: Append to `episodes.sql`**

```sql
-- name: ListEpisodesByAnimeIDWithAirDate :many
SELECT id, anime_id, episode_number, air_date FROM episodes
WHERE anime_id = ? ORDER BY episode_number ASC;

-- name: ListEpisodesByLibraryIDWithAirDate :many
SELECT e.id, e.anime_id, e.episode_number, e.air_date
FROM episodes e
JOIN anime a ON a.id = e.anime_id
WHERE a.library_id = ? ORDER BY e.anime_id, e.episode_number ASC;
```

- [ ] **Step 2: Append to `media_files.sql`**

```sql
-- name: CountMediaFilesPerEpisodeByAnime :many
SELECT e.id AS episode_id, e.episode_number, COUNT(mf.id) AS file_count
FROM episodes e
JOIN media_files mf ON mf.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
GROUP BY e.id, e.episode_number;

-- name: CountMediaFilesPerEpisodeByLibrary :many
SELECT e.anime_id, e.id AS episode_id, e.episode_number, COUNT(mf.id) AS file_count
FROM episodes e
JOIN media_files mf ON mf.episode_id = e.id
JOIN anime a ON a.id = e.anime_id
WHERE a.library_id = sqlc.arg('library_id')
GROUP BY e.anime_id, e.id, e.episode_number;
```

- [ ] **Step 3: Regenerate + build**

```bash
cd api && sqlc generate && go build ./...
```

Expected: clean. Four new methods on `*store.Queries`.

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/ api/internal/store/
git commit -m "feat(store): add completeness aggregation queries"
```

---

## Task 2: Report type

**Files:**
- Create: `api/internal/library/completeness/report.go`

- [ ] **Step 1: Write the file**

```go
package completeness

import "time"

// Report describes episode completeness for one anime.
type Report struct {
    AnimeID       string    `json:"anime_id"`
    BangumiID     int64     `json:"bangumi_id,omitempty"`
    Title         string    `json:"title,omitempty"`
    Total         int       `json:"total"`
    Have          []int     `json:"have"`
    Missing       []int     `json:"missing"`
    AiringPending []int     `json:"airing_pending"`
    UnknownTotal  bool      `json:"unknown_total"`
    GeneratedAt   time.Time `json:"generated_at"`
}

func (r Report) MissingCount() int { return len(r.Missing) }

func (r Report) IsComplete() bool {
    return r.Total > 0 && len(r.Missing) == 0 && len(r.AiringPending) == 0
}
```

- [ ] **Step 2: Build**

```bash
cd api && go build ./internal/library/completeness/
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/library/completeness/report.go
git commit -m "feat(completeness): add Report type"
```

---

## Task 3: `BuildReport` single anime

**Files:**
- Create: `api/internal/library/completeness/analyzer.go`
- Create: `api/internal/library/completeness/analyzer_test.go`

- [ ] **Step 1: Write failing tests**

`analyzer_test.go`:

```go
package completeness

import (
    "context"
    "database/sql"
    "strings"
    "testing"

    _ "github.com/mattn/go-sqlite3" // or whichever driver the repo uses
    "github.com/milmil/api/internal/store"
)

// newTestQueries mirrors the pattern from other packages' tests. Find
// the shared helper (e.g., internal/resolver/resolver_test.go's newTestDB)
// and reuse it; do not reinvent.
func newTestQueries(t *testing.T) (*store.Queries, func()) {
    t.Helper()
    // TEMPORARY placeholder — replace with the real shared harness.
    // In the real run, extract or import the pattern used by
    // api/internal/resolver/resolver_test.go or
    // api/internal/matcher/matcher_test.go.
    panic("wire up shared test harness before running")
}

// insertAnime inserts an anime row with total_episodes set.
func insertAnime(t *testing.T, q *store.Queries, id string, total int64) {
    t.Helper()
    _, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
        ID:    id,
        Title: "test-" + id,
        TotalEpisodes: sql.NullInt64{Int64: total, Valid: total > 0},
        // Match whatever fields CreateAnime requires (WatchStatus "none",
        // Genres "[]", Score 0, etc.). If a shared helper like
        // mustInsertAnime already exists in another test package, prefer it.
    })
    if err != nil { t.Fatal(err) }
}

func insertEpisode(t *testing.T, q *store.Queries, animeID string, num float64, airDate string) string {
    t.Helper()
    id := animeID + "-ep-" + strings.TrimRight(strings.TrimRight(string(rune('0'+int(num))), "0"), ".")
    _, err := q.CreateEpisode(context.Background(), store.CreateEpisodeParams{
        ID: id, AnimeID: animeID, EpisodeNumber: num,
        AirDate: sql.NullString{String: airDate, Valid: airDate != ""},
    })
    if err != nil { t.Fatal(err) }
    return id
}

func linkMediaFile(t *testing.T, q *store.Queries, episodeID string) {
    t.Helper()
    // Insert a minimal media_file row linked to this episode. Use the
    // existing CreateMediaFile query signature — look it up in
    // api/internal/store/media_files.sql.go.
    panic("fill in with real CreateMediaFile signature")
}

func TestBuildReport_UnknownTotal(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 0) // total_episodes NULL
    r, err := BuildReport(context.Background(), q, "a1")
    if err != nil { t.Fatal(err) }
    if !r.UnknownTotal { t.Error("expected UnknownTotal") }
    if r.Total != 0 { t.Errorf("total=%d want 0", r.Total) }
}

func TestBuildReport_CompletelyHave(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 3)
    for i := 1; i <= 3; i++ {
        epID := insertEpisode(t, q, "a1", float64(i), "2024-01-01")
        linkMediaFile(t, q, epID)
    }
    r, _ := BuildReport(context.Background(), q, "a1")
    if len(r.Missing) != 0 { t.Errorf("missing=%v", r.Missing) }
    if len(r.Have) != 3 { t.Errorf("have=%v", r.Have) }
    if !r.IsComplete() { t.Error("expected complete") }
}

func TestBuildReport_GapInMiddle(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 5)
    for _, n := range []int{1, 2, 4, 5} {
        epID := insertEpisode(t, q, "a1", float64(n), "2024-01-01")
        linkMediaFile(t, q, epID)
    }
    insertEpisode(t, q, "a1", 3, "2024-01-01") // row exists, no file
    r, _ := BuildReport(context.Background(), q, "a1")
    if len(r.Missing) != 1 || r.Missing[0] != 3 {
        t.Errorf("missing=%v want [3]", r.Missing)
    }
}

func TestBuildReport_FutureAirDateIsAiringPending(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 2)
    epID := insertEpisode(t, q, "a1", 1, "2024-01-01")
    linkMediaFile(t, q, epID)
    insertEpisode(t, q, "a1", 2, "2099-01-01") // future
    r, _ := BuildReport(context.Background(), q, "a1")
    if len(r.AiringPending) != 1 || r.AiringPending[0] != 2 {
        t.Errorf("airing_pending=%v want [2]", r.AiringPending)
    }
    if len(r.Missing) != 0 { t.Errorf("missing=%v want []", r.Missing) }
}

func TestBuildReport_PastAirDateNoFileIsMissing(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 2)
    epID := insertEpisode(t, q, "a1", 1, "2024-01-01")
    linkMediaFile(t, q, epID)
    insertEpisode(t, q, "a1", 2, "2024-02-01") // past, no file
    r, _ := BuildReport(context.Background(), q, "a1")
    if len(r.Missing) != 1 || r.Missing[0] != 2 {
        t.Errorf("missing=%v want [2]", r.Missing)
    }
}

func TestBuildReport_MissingEpisodeRowIsMissing(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 3)
    epID := insertEpisode(t, q, "a1", 1, "2024-01-01")
    linkMediaFile(t, q, epID)
    // No row for ep 2 or 3 — should still be flagged missing.
    r, _ := BuildReport(context.Background(), q, "a1")
    if len(r.Missing) != 2 { t.Errorf("missing=%v", r.Missing) }
}

func TestBuildReport_NonIntegerEpisodesIgnored(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    insertAnime(t, q, "a1", 2)
    for _, n := range []float64{1, 2} {
        epID := insertEpisode(t, q, "a1", n, "2024-01-01")
        linkMediaFile(t, q, epID)
    }
    // Add a 1.5 special — should NOT affect the gap math.
    epID := insertEpisode(t, q, "a1", 1.5, "2024-01-01")
    linkMediaFile(t, q, epID)
    r, _ := BuildReport(context.Background(), q, "a1")
    if !r.IsComplete() { t.Errorf("should be complete: %+v", r) }
}
```

**Important:** the `newTestQueries`, `insertAnime`, `insertEpisode`, `linkMediaFile` helpers are stubbed. Before running, find and reuse the shared harness from `api/internal/resolver/resolver_test.go` or `api/internal/matcher/matcher_test.go`. Most likely there's a `newTestDB`/`mustInsertAnime`/`mustInsertEpisodes` pattern already. If the helpers don't cover `link media file to episode`, extend via the existing `CreateMediaFile` query (signature in `store.CreateMediaFileParams`).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && go test -count=1 ./internal/library/completeness/ -v
```

Expected: FAIL — `BuildReport` not defined.

- [ ] **Step 3: Implement `analyzer.go`**

```go
package completeness

import (
    "context"
    "math"
    "time"

    "github.com/milmil/api/internal/store"
)

// BuildReport computes missing-episode state for a single anime.
func BuildReport(ctx context.Context, q *store.Queries, animeID string) (Report, error) {
    anime, err := q.GetAnime(ctx, animeID)
    if err != nil { return Report{}, err }
    now := time.Now().UTC()

    rep := Report{AnimeID: animeID, GeneratedAt: now}
    if anime.BangumiID.Valid { rep.BangumiID = anime.BangumiID.Int64 }
    rep.Title = anime.Title

    if !anime.TotalEpisodes.Valid || anime.TotalEpisodes.Int64 == 0 {
        rep.UnknownTotal = true
        return rep, nil
    }
    total := int(anime.TotalEpisodes.Int64)
    rep.Total = total

    episodes, err := q.ListEpisodesByAnimeIDWithAirDate(ctx, animeID)
    if err != nil { return Report{}, err }
    fileRows, err := q.CountMediaFilesPerEpisodeByAnime(ctx, animeID)
    if err != nil { return Report{}, err }

    have := make(map[int]bool, len(fileRows))
    for _, row := range fileRows {
        if row.FileCount == 0 { continue }
        if row.EpisodeNumber != math.Trunc(row.EpisodeNumber) { continue }
        have[int(row.EpisodeNumber)] = true
    }

    airDate := make(map[int]time.Time, len(episodes))
    for _, ep := range episodes {
        if ep.EpisodeNumber != math.Trunc(ep.EpisodeNumber) { continue }
        n := int(ep.EpisodeNumber)
        if ep.AirDate.Valid && ep.AirDate.String != "" {
            if t, err := time.Parse("2006-01-02", ep.AirDate.String); err == nil {
                airDate[n] = t
            }
        }
    }

    today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
    for n := 1; n <= total; n++ {
        if have[n] {
            rep.Have = append(rep.Have, n)
            continue
        }
        if t, ok := airDate[n]; ok && t.After(today) {
            rep.AiringPending = append(rep.AiringPending, n)
            continue
        }
        rep.Missing = append(rep.Missing, n)
    }
    return rep, nil
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/library/completeness/ -v
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/library/completeness/
git commit -m "feat(completeness): add BuildReport single-anime analyzer"
```

---

## Task 4: `BuildLibrarySummary` batched

**Files:**
- Modify: `api/internal/library/completeness/analyzer.go`
- Modify: `api/internal/library/completeness/analyzer_test.go`

- [ ] **Step 1: Write failing test**

Append to `analyzer_test.go`:

```go
func TestBuildLibrarySummary_BatchesAcrossAnime(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    // Create a library row via the store. Shared helper may exist.
    // Omitted for brevity; use whatever test helper the repo has for
    // creating libraries — see media_file_handler_test.go or similar.
    libID := "lib-1"
    createTestLibrary(t, q, libID)

    // 3 animes in the library, various states.
    insertAnimeInLibrary(t, q, "a1", libID, 3)
    for _, n := range []int{1, 2, 3} {
        epID := insertEpisode(t, q, "a1", float64(n), "2024-01-01")
        linkMediaFile(t, q, epID)
    }
    insertAnimeInLibrary(t, q, "a2", libID, 5)
    for _, n := range []int{1, 2} {
        epID := insertEpisode(t, q, "a2", float64(n), "2024-01-01")
        linkMediaFile(t, q, epID)
    }
    insertAnimeInLibrary(t, q, "a3", libID, 0) // unknown total

    reports, err := BuildLibrarySummary(context.Background(), q, libID)
    if err != nil { t.Fatal(err) }
    if len(reports) != 3 { t.Fatalf("want 3 reports, got %d", len(reports)) }

    byID := make(map[string]Report, len(reports))
    for _, r := range reports { byID[r.AnimeID] = r }
    if !byID["a1"].IsComplete() { t.Errorf("a1 not complete: %+v", byID["a1"]) }
    if byID["a2"].MissingCount() != 3 { t.Errorf("a2 missing=%d want 3", byID["a2"].MissingCount()) }
    if !byID["a3"].UnknownTotal { t.Errorf("a3 unknown_total expected") }
}
```

Helpers `createTestLibrary`, `insertAnimeInLibrary` — reuse shared patterns; extend them minimally if needed. `insertAnimeInLibrary` is `insertAnime` but passing a `library_id`.

- [ ] **Step 2: Implement `BuildLibrarySummary`**

Append to `analyzer.go`:

```go
// BuildLibrarySummary computes one Report per anime in the library using
// three batched queries.
func BuildLibrarySummary(ctx context.Context, q *store.Queries, libraryID string) ([]Report, error) {
    animes, err := q.ListAnimeByLibraryID(ctx, libraryID)
    if err != nil { return nil, err }
    episodes, err := q.ListEpisodesByLibraryIDWithAirDate(ctx, libraryID)
    if err != nil { return nil, err }
    fileRows, err := q.CountMediaFilesPerEpisodeByLibrary(ctx, libraryID)
    if err != nil { return nil, err }

    type epMeta struct {
        number  float64
        airDate time.Time
        hasDate bool
    }

    // episode meta per anime → per episode number
    episodesByAnime := make(map[string]map[int]epMeta)
    for _, e := range episodes {
        if e.EpisodeNumber != math.Trunc(e.EpisodeNumber) { continue }
        m := episodesByAnime[e.AnimeID]
        if m == nil { m = make(map[int]epMeta); episodesByAnime[e.AnimeID] = m }
        em := epMeta{number: e.EpisodeNumber}
        if e.AirDate.Valid && e.AirDate.String != "" {
            if t, err := time.Parse("2006-01-02", e.AirDate.String); err == nil {
                em.airDate = t; em.hasDate = true
            }
        }
        m[int(e.EpisodeNumber)] = em
    }

    haveByAnime := make(map[string]map[int]bool)
    for _, row := range fileRows {
        if row.FileCount == 0 { continue }
        if row.EpisodeNumber != math.Trunc(row.EpisodeNumber) { continue }
        m := haveByAnime[row.AnimeID]
        if m == nil { m = make(map[int]bool); haveByAnime[row.AnimeID] = m }
        m[int(row.EpisodeNumber)] = true
    }

    now := time.Now().UTC()
    today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

    reports := make([]Report, 0, len(animes))
    for _, a := range animes {
        rep := Report{AnimeID: a.ID, Title: a.Title, GeneratedAt: now}
        if a.BangumiID.Valid { rep.BangumiID = a.BangumiID.Int64 }
        if !a.TotalEpisodes.Valid || a.TotalEpisodes.Int64 == 0 {
            rep.UnknownTotal = true
            reports = append(reports, rep)
            continue
        }
        total := int(a.TotalEpisodes.Int64)
        rep.Total = total
        have := haveByAnime[a.ID]
        eps := episodesByAnime[a.ID]
        for n := 1; n <= total; n++ {
            if have[n] {
                rep.Have = append(rep.Have, n)
                continue
            }
            if em, ok := eps[n]; ok && em.hasDate && em.airDate.After(today) {
                rep.AiringPending = append(rep.AiringPending, n)
                continue
            }
            rep.Missing = append(rep.Missing, n)
        }
        reports = append(reports, rep)
    }
    return reports, nil
}
```

If the existing `ListAnimeByLibraryID` query doesn't return the anime in a stable order, that's fine — UI doesn't depend on it. If the generated struct for `CountMediaFilesPerEpisodeByLibraryRow` uses different field names, adjust.

- [ ] **Step 3: Run tests**

```bash
cd api && go test -count=1 ./internal/library/completeness/ -v
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/completeness/
git commit -m "feat(completeness): add BuildLibrarySummary with 3-query batching"
```

---

## Task 5: API handlers

**Files:**
- Create: `api/internal/api/completeness_handler.go`
- Create: `api/internal/api/completeness_handler_test.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Write the handler**

```go
package api

import (
    "database/sql"
    "net/http"
    "strconv"

    "github.com/labstack/echo/v4"
    "github.com/milmil/api/internal/library/completeness"
)

func (h *handler) handleAnimeMissing(c echo.Context) error {
    ctx := c.Request().Context()
    idStr := c.Param("bangumiId")
    bangumiID, err := strconv.ParseInt(idStr, 10, 64)
    if err != nil { return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId") }

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

- [ ] **Step 2: Register routes**

In `api/internal/api/router.go`, find the authenticated anime group and the libraries group. Add:

```go
animeGroup.GET("/:bangumiId/missing", h.handleAnimeMissing)
librariesGroup.GET("/:id/missing-summary", h.handleLibraryMissingSummary)
```

(Use the exact group variable names present in the file; grep for an existing `animeGroup.GET` call to confirm.)

- [ ] **Step 3: Handler tests**

`completeness_handler_test.go`:

```go
package api

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestAnimeMissing_OK(t *testing.T) {
    // Use the existing test server harness. Seed an anime with known state,
    // GET /api/v1/anime/:bangumiId/missing, assert JSON shape.
    //
    // Pattern: grep for "newTestServer" or similar in other handler tests.
    t.Skip("flesh out with repo's existing handler-test harness")
}

func TestAnimeMissing_404UnknownBangumi(t *testing.T) {
    t.Skip("flesh out with repo's existing handler-test harness")
}

func TestLibraryMissingSummary_EmptyReturnsArray(t *testing.T) {
    // Library exists but has no anime → response should be `[]`, not `null`.
    // Enforce via json.RawMessage comparison.
    t.Skip("flesh out with repo's existing handler-test harness")
}

// Silence unused imports if a subtest is trivially skipped.
var _ = json.Marshal
var _ = http.StatusOK
var _ = httptest.NewRecorder
var _ = strings.HasPrefix
```

Flesh out each test using the repo's existing handler-test pattern (see `api/internal/api/progress_handler_test.go` or similar). If no such pattern exists, keep the tests skipped and rely on analyzer unit tests + manual E2E.

- [ ] **Step 4: Build + run**

```bash
cd api && go build ./... && go test -count=1 ./internal/api/... ./internal/library/completeness/...
```

All green (or skipped per above).

- [ ] **Step 5: Commit**

```bash
git add api/internal/api/completeness_handler.go api/internal/api/completeness_handler_test.go api/internal/api/router.go
git commit -m "feat(api): add anime-missing and library-missing-summary endpoints"
```

---

## Task 6: Frontend API client

**Files:**
- Create: `web/src/lib/api/completeness.ts`

- [ ] **Step 1: Write the client**

```ts
export interface CompletenessReport {
  anime_id: string;
  bangumi_id?: number;
  title?: string;
  total: number;
  have: number[];
  missing: number[];
  airing_pending: number[];
  unknown_total: boolean;
  generated_at: string;
}

const base = "/api/v1";

export const completenessApi = {
  async anime(bangumiId: number): Promise<CompletenessReport> {
    const res = await fetch(`${base}/anime/${bangumiId}/missing`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`anime missing: ${res.status}`);
    return res.json();
  },
  async librarySummary(libraryId: string): Promise<CompletenessReport[]> {
    const res = await fetch(`${base}/libraries/${libraryId}/missing-summary`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`library missing: ${res.status}`);
    return res.json();
  },
};

export const completenessKeys = {
  anime: (bangumiId: number) => ["completeness-anime", bangumiId] as const,
  library: (libraryId: string) => ["completeness-library", libraryId] as const,
};
```

Match the fetch/auth convention used by `web/src/lib/api/sync.ts` and `anime.ts` — if those use an axios instance or a custom wrapper, use that instead of raw `fetch`.

- [ ] **Step 2: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -10
```

No new errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/completeness.ts
git commit -m "feat(web): add completeness API client"
```

---

## Task 7: EpisodeStatusCard component

**Files:**
- Create: `web/src/components/anime/EpisodeStatusCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { completenessApi, completenessKeys, type CompletenessReport } from "@/lib/api/completeness";
import { Skeleton } from "@/components/ui/skeleton";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";

interface Props {
  bangumiId: number;
}

export function EpisodeStatusCard({ bangumiId }: Props) {
  const { i18n } = useLingui();
  const { data, isLoading } = useQuery({
    queryKey: completenessKeys.anime(bangumiId),
    queryFn: () => completenessApi.anime(bangumiId),
  });

  if (isLoading) return <EpisodeStatusSkeleton />;
  if (!data) return null;
  if (data.unknown_total) return null;
  if (data.missing.length === 0 && data.airing_pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/80">
        {i18n._(msg`Episode status`)}
      </h3>
      <div className="mt-2 space-y-1 text-sm text-white/60">
        {data.missing.length > 0 && (
          <div>
            {i18n._(msg`Missing`)}: <span className="text-white">{formatRanges(data.missing)}</span>
          </div>
        )}
        {data.airing_pending.length > 0 && (
          <div>
            {i18n._(msg`Not aired yet`)}: <span className="text-white">{formatRanges(data.airing_pending)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EpisodeStatusSkeleton() {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-3 w-40" />
    </div>
  );
}

// "1, 2, 5-8, 10" for [1, 2, 5, 6, 7, 8, 10]
function formatRanges(nums: number[]): string {
  if (nums.length === 0) return "";
  const sorted = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (i === j) parts.push(String(sorted[i]));
    else parts.push(`${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}
```

Match the existing Skeleton component import path from other files. If `@lingui/core/macro` isn't how this repo uses Lingui, use the pattern from a recently-modified i18n file (e.g., `IntegrationsPanel.tsx`).

- [ ] **Step 2: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/anime/EpisodeStatusCard.tsx
git commit -m "feat(web): add EpisodeStatusCard component"
```

---

## Task 8: Wire EpisodeStatusCard into AnimeDetailPage

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Add the card**

Import and render it in the appropriate section of the detail page. Find the section that shows episode list or metadata cards and insert:

```tsx
import { EpisodeStatusCard } from "@/components/anime/EpisodeStatusCard";

// inside the render, near the other side-panel/metadata cards:
<EpisodeStatusCard bangumiId={bangumiId} />
```

`bangumiId` is already available on the page (it's the route param). The card hides itself when complete or unknown.

- [ ] **Step 2: Verify in browser**

Start the dev server. Open an anime with known missing episodes (or temporarily fake one by deleting a media_file row in SQLite). Confirm the card appears and `formatRanges` produces readable output (e.g., "5-8, 11").

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): show EpisodeStatusCard on anime detail page"
```

---

## Task 9: Library badge + "Incomplete only" filter

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Fetch library-summary alongside existing anime list**

At the top of the page, add:

```tsx
import { completenessApi, completenessKeys, type CompletenessReport } from "@/lib/api/completeness";

const { data: missingSummary } = useQuery({
  queryKey: completenessKeys.library(libraryId),
  queryFn: () => completenessApi.librarySummary(libraryId),
});

const missingByAnimeID = useMemo(() => {
  const map = new Map<string, CompletenessReport>();
  (missingSummary ?? []).forEach((r) => map.set(r.anime_id, r));
  return map;
}, [missingSummary]);
```

- [ ] **Step 2: Render badge on each anime card**

Find the existing anime card render. Add:

```tsx
const report = missingByAnimeID.get(anime.id);
const missingCount = report?.missing.length ?? 0;
{missingCount > 0 && (
  <div
    className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm"
    title={i18n._(msg`${missingCount} missing episodes`)}
  >
    ⚠ {missingCount}
  </div>
)}
```

(White/opacity only — no accent color per project convention.)

- [ ] **Step 3: Add "Incomplete only" toggle**

In the filter bar (or alongside existing filters), add:

```tsx
const [incompleteOnly, setIncompleteOnly] = useState(false);

<label className="flex items-center gap-2 text-sm text-white/70">
  <input
    type="checkbox"
    checked={incompleteOnly}
    onChange={(e) => setIncompleteOnly(e.target.checked)}
  />
  {i18n._(msg`Incomplete only`)}
</label>
```

Filter the anime list before render:

```tsx
const visibleAnime = incompleteOnly
  ? animes.filter((a) => (missingByAnimeID.get(a.id)?.missing.length ?? 0) > 0)
  : animes;
```

- [ ] **Step 4: Verify in browser**

Confirm the filter toggles and the badge displays expected counts.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add missing-episode badge and Incomplete filter on library page"
```

---

## Task 10: Full validation

- [ ] **Step 1: Backend build + tests**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/library/... ./internal/api/... ./internal/store/...
```

All green (pre-existing baseline cleanup means zero expected failures).

- [ ] **Step 2: Frontend typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

- [ ] **Step 3: Manual E2E**

1. Run a library scan that deliberately leaves some episodes missing.
2. Confirm `GET /api/v1/anime/:bangumiId/missing` returns the correct shape.
3. Confirm the anime detail page shows `EpisodeStatusCard` with expected missing list.
4. Confirm the library page shows the ⚠ badge on incomplete anime.
5. Toggle "Incomplete only" and confirm filtering.

- [ ] **Step 4: PR**

```bash
gh pr create --title "feat: missing episode detection" --body-file -
```

Reference the spec + plan.

---

## Self-review notes

- **Spec coverage:** on-demand ✓, integer-only gap math ✓, air-date-aware airing_pending ✓, three-query library summary ✓, anime detail card ✓, library badge + filter ✓.
- **Scope:** detection + display only. Auto-search, download-rule creation, notifications deliberately deferred.
- **Known follow-ups:** extra-episodes surfacing ("you have ep 13 of a 12-ep show"), user override of `total_episodes` for shows whose metadata is wrong.
