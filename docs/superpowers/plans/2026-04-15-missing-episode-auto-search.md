# Missing Episode Auto-Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search for missing episodes across all 6 torrent providers with one click, pick a result, and trigger download; OR auto-create a download rule so future episodes arrive automatically.

**Architecture:** New `api/internal/library/searchmissing/` package wrapping the existing `torrent.Registry.SearchAll` — add dedupe, rank (seeders → resolution → size → subgroup), and size-string parsing. Three REST endpoints reuse existing `downloader.Manager` for immediate download and existing `download_rules` schema for auto-subscribe. UI extends the existing `EpisodeStatusCard` from Missing Detection with a Search icon per missing episode + "Auto-download missing" action.

**Tech Stack:** Go 1.24, existing `torrent.Registry` + `torrent.Provider` interface, SQLite + sqlc, React 19 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-04-15-missing-episode-auto-search-design.md`

---

## File Structure

Files to create:

- `api/internal/library/searchmissing/search.go`
- `api/internal/library/searchmissing/search_test.go`
- `api/internal/library/searchmissing/dedupe.go`
- `api/internal/library/searchmissing/dedupe_test.go`
- `api/internal/library/searchmissing/rank.go`
- `api/internal/library/searchmissing/rank_test.go`
- `api/internal/api/missing_search_handler.go`
- `web/src/lib/api/missing_search.ts`
- `web/src/components/anime/MissingSearchModal.tsx`

Files to modify:

- `api/internal/api/router.go` — register 3 new routes
- `api/internal/api/handler.go` (or wherever `handler` struct lives) — ensure `torrentRegistry` field is reachable
- `api/cmd/server/main.go` — pass `torrentRegistry` to handler if not already
- `api/internal/store/queries/download_rules.sql` — maybe `ListDownloadRulesByBangumiID` if not present
- `web/src/components/anime/EpisodeStatusCard.tsx` — add Search icon per missing episode + "Auto-download missing" button

---

## Task 1: Rank with seeders tiebreak

**Files:**
- Create: `api/internal/library/searchmissing/rank.go`
- Create: `api/internal/library/searchmissing/rank_test.go`

- [ ] **Step 1: Write failing tests**

`rank_test.go`:

```go
package searchmissing

import (
    "testing"

    "github.com/milmil/api/internal/matcher/fileparse"
)

func r(title string, seeders int, sizeBytes int64) Result {
    return Result{
        Raw: Raw{Title: title, Seeders: seeders, SizeBytes: sizeBytes},
        Parsed: fileparse.Parse(title),
    }
}

func TestRank_DeadTorrentsLast(t *testing.T) {
    rs := []Result{
        r("[Group] Show - 01 [1080p].mkv", 0, 1_000_000_000),   // dead 1080p
        r("[Group] Show - 01 [720p].mkv", 50, 500_000_000),     // alive 720p
    }
    got := Rank(rs)
    if got[0].Seeders == 0 {
        t.Errorf("dead torrent should sink, got order %+v", seedOrder(got))
    }
}

func TestRank_ResolutionBeatsSeeders(t *testing.T) {
    // Among alive torrents, higher res wins even if fewer seeders.
    rs := []Result{
        r("[G] Show - 01 [720p].mkv", 500, 500_000_000),
        r("[G] Show - 01 [1080p].mkv", 10, 1_000_000_000),
    }
    got := Rank(rs)
    if got[0].Parsed.Resolution != 1080 {
        t.Errorf("expected 1080p first, got %d", got[0].Parsed.Resolution)
    }
}

func TestRank_SeedersTiebreakAtSameResolution(t *testing.T) {
    rs := []Result{
        r("[G] Show - 01 [1080p] A.mkv", 10, 1_000_000_000),
        r("[G] Show - 01 [1080p] B.mkv", 100, 1_000_000_000),
    }
    got := Rank(rs)
    if got[0].Seeders != 100 {
        t.Errorf("higher seeders should win, got %d", got[0].Seeders)
    }
}

func TestRank_SizeTiebreak(t *testing.T) {
    rs := []Result{
        r("[G] Show - 01 [1080p] A.mkv", 50, 500_000_000),
        r("[G] Show - 01 [1080p] B.mkv", 50, 1_500_000_000),
    }
    got := Rank(rs)
    if got[0].SizeBytes != 1_500_000_000 {
        t.Errorf("bigger size should win, got %d", got[0].SizeBytes)
    }
}

func TestRank_SubgroupTiebreak(t *testing.T) {
    // Identical except one has subgroup tag.
    rs := []Result{
        r("Show - 01 [1080p].mkv", 50, 1_000_000_000),
        r("[Erai-raws] Show - 01 [1080p].mkv", 50, 1_000_000_000),
    }
    got := Rank(rs)
    if got[0].Parsed.SubGroup == "" {
        t.Errorf("subgroup-tagged should win, got parsed=%+v", got[0].Parsed)
    }
}

func seedOrder(rs []Result) []int {
    out := make([]int, len(rs))
    for i, r := range rs { out[i] = r.Seeders }
    return out
}
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -v
```

Expected: package doesn't exist yet. Proceed.

- [ ] **Step 3: Implement `rank.go`**

```go
package searchmissing

import (
    "sort"

    "github.com/milmil/api/internal/matcher/fileparse"
)

// Raw is the normalized torrent search hit — the fields our ranking and UI
// care about. Adapted from torrent.SearchResult in search.go.
type Raw struct {
    Title       string `json:"title"`
    Magnet      string `json:"magnet,omitempty"`
    TorrentURL  string `json:"torrent_url,omitempty"`
    SizeBytes   int64  `json:"size_bytes"`
    SizeDisplay string `json:"size_display,omitempty"`
    Seeders     int    `json:"seeders"`
    Leechers    int    `json:"leechers"`
    InfoHash    string `json:"info_hash,omitempty"`
    Provider    string `json:"provider"`
    PublishedAt string `json:"published_at,omitempty"`
}

// Result pairs the Raw torrent data with parsed filename metadata.
type Result struct {
    Raw
    Parsed fileparse.ParsedFilename `json:"parsed"`
}

// Rank orders results best-first:
// 1. Alive torrents (Seeders > 0) before dead.
// 2. Higher resolution wins.
// 3. More seeders.
// 4. Bigger size (at same resolution, bigger = better source).
// 5. Known subgroup beats anonymous.
// Stable on complete tie.
func Rank(rs []Result) []Result {
    out := append([]Result(nil), rs...)
    sort.SliceStable(out, func(i, j int) bool {
        iDead := out[i].Seeders == 0
        jDead := out[j].Seeders == 0
        if iDead != jDead { return !iDead }

        if out[i].Parsed.Resolution != out[j].Parsed.Resolution {
            return out[i].Parsed.Resolution > out[j].Parsed.Resolution
        }
        if out[i].Seeders != out[j].Seeders {
            return out[i].Seeders > out[j].Seeders
        }
        if out[i].SizeBytes != out[j].SizeBytes {
            return out[i].SizeBytes > out[j].SizeBytes
        }
        iSub := out[i].Parsed.SubGroup != ""
        jSub := out[j].Parsed.SubGroup != ""
        if iSub != jSub { return iSub }
        return false
    })
    return out
}

// Suppress unused import when rank.go alone compiles.
var _ = fileparse.Parse
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -v
```

All 5 pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/library/searchmissing/rank.go api/internal/library/searchmissing/rank_test.go
git commit -m "feat(searchmissing): add Rank with seeders-first tiebreak"
```

---

## Task 2: Dedupe by info_hash + title+size fallback

**Files:**
- Create: `api/internal/library/searchmissing/dedupe.go`
- Create: `api/internal/library/searchmissing/dedupe_test.go`

- [ ] **Step 1: Write failing tests**

```go
package searchmissing

import "testing"

func TestDedupe_ByInfoHashAcrossProviders(t *testing.T) {
    raws := []Raw{
        {Title: "A", InfoHash: "abc", Provider: "nyaa"},
        {Title: "A", InfoHash: "ABC", Provider: "mikan"}, // same hash, different casing
        {Title: "B", InfoHash: "xyz", Provider: "nyaa"},
    }
    got := Dedupe(raws)
    if len(got) != 2 {
        t.Errorf("want 2, got %d: %+v", len(got), got)
    }
}

func TestDedupe_FallbackTitleSizeWhenHashMissing(t *testing.T) {
    raws := []Raw{
        {Title: "[G] Show - 01 [1080p].mkv", SizeBytes: 100, Provider: "a"},
        {Title: "[G] Show - 01 [1080p].mkv", SizeBytes: 100, Provider: "b"}, // dupe
        {Title: "[G] Show - 01 [1080p].mkv", SizeBytes: 200, Provider: "c"}, // different size
    }
    got := Dedupe(raws)
    if len(got) != 2 { t.Errorf("want 2, got %d", len(got)) }
}

func TestDedupe_HashWinsWhenMixed(t *testing.T) {
    // Same logical torrent: one entry has hash, another doesn't.
    raws := []Raw{
        {Title: "X", InfoHash: "h1", SizeBytes: 100, Provider: "a"},
        {Title: "X", SizeBytes: 100, Provider: "b"}, // fallback bucket miss
    }
    got := Dedupe(raws)
    // Both slip through because they hash to different buckets. Acceptable.
    if len(got) != 2 { t.Errorf("want 2, got %d", len(got)) }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -run TestDedupe -v
```

- [ ] **Step 3: Implement `dedupe.go`**

```go
package searchmissing

import (
    "regexp"
    "strconv"
    "strings"
)

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeTitle(s string) string {
    s = strings.ToLower(s)
    s = nonAlnum.ReplaceAllString(s, "")
    return s
}

// Dedupe removes duplicate torrents across providers. Primary key is
// info_hash (lowercased). When hash is absent, falls back to
// normalized title + size.
func Dedupe(rs []Raw) []Raw {
    seenHash := make(map[string]struct{}, len(rs))
    seenFallback := make(map[string]struct{}, len(rs))
    out := make([]Raw, 0, len(rs))
    for _, r := range rs {
        if r.InfoHash != "" {
            key := strings.ToLower(r.InfoHash)
            if _, ok := seenHash[key]; ok { continue }
            seenHash[key] = struct{}{}
            out = append(out, r)
            continue
        }
        key := normalizeTitle(r.Title) + "|" + strconv.FormatInt(r.SizeBytes, 10)
        if _, ok := seenFallback[key]; ok { continue }
        seenFallback[key] = struct{}{}
        out = append(out, r)
    }
    return out
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -v
```

All pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/library/searchmissing/dedupe.go api/internal/library/searchmissing/dedupe_test.go
git commit -m "feat(searchmissing): add Dedupe by info_hash with title+size fallback"
```

---

## Task 3: Size-string parser + Search aggregator

**Files:**
- Create: `api/internal/library/searchmissing/search.go`
- Create: `api/internal/library/searchmissing/search_test.go`

- [ ] **Step 1: Tests**

```go
package searchmissing

import (
    "context"
    "testing"
    "time"

    "github.com/milmil/api/internal/torrent"
)

func TestParseSize(t *testing.T) {
    cases := []struct {
        in   string
        want int64
    }{
        {"1.5 GiB", 1_610_612_736},
        {"500 MiB", 524_288_000},
        {"2GB",     2_000_000_000},
        {"123",     123},
        {"",        0},
        {"N/A",     0},
    }
    for _, c := range cases {
        t.Run(c.in, func(t *testing.T) {
            got := parseSizeBytes(c.in)
            // Allow 1% slack for binary vs decimal prefixes.
            diff := got - c.want
            if diff < 0 { diff = -diff }
            tol := c.want / 100
            if tol < 100 { tol = 100 }
            if diff > tol {
                t.Errorf("parseSizeBytes(%q)=%d want ~%d", c.in, got, c.want)
            }
        })
    }
}

func TestBuildQuery(t *testing.T) {
    got := buildQuery("Cowboy Bebop", 3)
    if got != "Cowboy Bebop 03" { t.Errorf("got %q", got) }
}

func TestSearch_DedupesAndRanks(t *testing.T) {
    // Build a stub registry with 2 fake providers returning overlapping results.
    reg := torrent.NewRegistry()
    reg.Register(&stubProvider{name: "a", results: []torrent.SearchResult{
        {Title: "[G] Show - 03 [1080p].mkv", Seeders: 10, Size: "1.5 GiB", InfoHash: "h1", SourceSite: "a"},
        {Title: "[G] Show - 03 [720p].mkv",  Seeders: 50, Size: "500 MiB", InfoHash: "h2", SourceSite: "a"},
    }})
    reg.Register(&stubProvider{name: "b", results: []torrent.SearchResult{
        {Title: "[G] Show - 03 [1080p].mkv", Seeders: 10, Size: "1.5 GiB", InfoHash: "H1", SourceSite: "b"}, // dup
    }})

    agg := NewAggregator(reg)
    results, err := agg.Search(context.Background(), "Show", 3)
    if err != nil { t.Fatal(err) }
    if len(results) != 2 { t.Errorf("want 2 after dedupe, got %d", len(results)) }
    if results[0].Parsed.Resolution != 1080 {
        t.Errorf("expected 1080p first (higher res wins), got %d", results[0].Parsed.Resolution)
    }
}

type stubProvider struct {
    name    string
    results []torrent.SearchResult
}

func (s *stubProvider) Name() string { return s.name }
func (s *stubProvider) Search(ctx context.Context, q string) ([]torrent.SearchResult, error) {
    return s.results, nil
}

// silence unused import
var _ = time.Second
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -run 'TestParseSize|TestBuildQuery|TestSearch' -v
```

- [ ] **Step 3: Implement `search.go`**

```go
package searchmissing

import (
    "context"
    "fmt"
    "regexp"
    "strconv"
    "strings"
    "time"

    "github.com/milmil/api/internal/matcher/fileparse"
    "github.com/milmil/api/internal/torrent"
)

type Aggregator struct {
    registry *torrent.Registry
}

func NewAggregator(r *torrent.Registry) *Aggregator {
    return &Aggregator{registry: r}
}

// Search queries every registered torrent provider in parallel for this
// anime/episode combination, dedupes, ranks, and returns.
func (a *Aggregator) Search(ctx context.Context, animeTitle string, episodeNumber int) ([]Result, error) {
    if a.registry == nil { return nil, fmt.Errorf("no torrent registry") }
    query := buildQuery(animeTitle, episodeNumber)

    ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
    defer cancel()
    raw := a.registry.SearchAll(ctx, query)

    // Convert torrent.SearchResult → Raw with parsed size.
    raws := make([]Raw, 0, len(raw))
    for _, r := range raw {
        raws = append(raws, Raw{
            Title:       r.Title,
            Magnet:      r.Magnet,
            TorrentURL:  r.TorrentURL,
            SizeBytes:   parseSizeBytes(r.Size),
            SizeDisplay: r.Size,
            Seeders:     r.Seeders,
            Leechers:    r.Leechers,
            InfoHash:    r.InfoHash,
            Provider:    r.SourceSite,
            PublishedAt: r.PublishDate.UTC().Format(time.RFC3339),
        })
    }

    deduped := Dedupe(raws)
    results := make([]Result, len(deduped))
    for i, r := range deduped {
        results[i] = Result{Raw: r, Parsed: fileparse.Parse(r.Title)}
    }
    return Rank(results), nil
}

func buildQuery(title string, ep int) string {
    return fmt.Sprintf("%s %02d", strings.TrimSpace(title), ep)
}

var sizeRe = regexp.MustCompile(`(?i)^\s*([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?\s*$`)

// parseSizeBytes converts a human-readable size ("1.5 GiB", "500 MB") to
// bytes. Returns 0 when unparseable.
func parseSizeBytes(s string) int64 {
    if s == "" { return 0 }
    m := sizeRe.FindStringSubmatch(s)
    if m == nil { return 0 }
    v, err := strconv.ParseFloat(m[1], 64)
    if err != nil { return 0 }
    unit := strings.ToLower(m[2])
    mul := int64(1)
    switch unit {
    case "", "b":     mul = 1
    case "kb":        mul = 1_000
    case "kib":       mul = 1024
    case "mb":        mul = 1_000_000
    case "mib":       mul = 1024 * 1024
    case "gb":        mul = 1_000_000_000
    case "gib":       mul = 1024 * 1024 * 1024
    case "tb":        mul = 1_000_000_000_000
    case "tib":       mul = 1024 * 1024 * 1024 * 1024
    }
    return int64(v * float64(mul))
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/library/searchmissing/ -v
```

All tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/library/searchmissing/search.go api/internal/library/searchmissing/search_test.go
git commit -m "feat(searchmissing): add Aggregator with parallel provider fanout"
```

---

## Task 4: API handlers

**Files:**
- Create: `api/internal/api/missing_search_handler.go`
- Modify: `api/internal/api/router.go`
- Possibly: `api/internal/store/queries/download_rules.sql` (add `ListDownloadRulesByBangumiID` if missing)

- [ ] **Step 1: Check existing queries**

```bash
grep -n "ListDownloadRulesByBangumiID\|GetDownloadRuleByBangumi" api/internal/store/queries/download_rules.sql api/internal/store/download_rules.sql.go 2>/dev/null | head
```

If `ListDownloadRulesByBangumiID` doesn't exist, add to `download_rules.sql`:

```sql
-- name: ListDownloadRulesByBangumiID :many
SELECT * FROM download_rules WHERE bangumi_id = ? AND enabled = 1 ORDER BY created_at DESC;
```

Regenerate with `cd api && sqlc generate`.

- [ ] **Step 2: Write `missing_search_handler.go`**

```go
package api

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"
    "sort"
    "strconv"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/milmil/api/internal/library/searchmissing"
    "github.com/milmil/api/internal/store"
)

type missingSearchReq struct {
    EpisodeNumber int `json:"episode_number"`
}

func (h *handler) handleMissingSearch(c echo.Context) error {
    ctx := c.Request().Context()
    bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
    if err != nil { return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId") }

    anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) { return echo.ErrNotFound }
        return echo.ErrInternalServerError
    }

    var req missingSearchReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }
    if req.EpisodeNumber <= 0 {
        return echo.NewHTTPError(http.StatusBadRequest, "episode_number required")
    }
    if anime.TotalEpisodes.Valid && req.EpisodeNumber > int(anime.TotalEpisodes.Int64) {
        return echo.NewHTTPError(http.StatusBadRequest, "episode_number beyond total")
    }

    agg := searchmissing.NewAggregator(h.torrentRegistry)
    results, err := agg.Search(ctx, anime.Title, req.EpisodeNumber)
    if err != nil { return echo.ErrInternalServerError }
    if results == nil { results = []searchmissing.Result{} }
    return c.JSON(http.StatusOK, map[string]any{"results": results})
}

type missingDownloadReq struct {
    Magnet     string `json:"magnet"`
    TorrentURL string `json:"torrent_url"`
    Title      string `json:"title"`
}

func (h *handler) handleMissingDownload(c echo.Context) error {
    ctx := c.Request().Context()
    bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
    if err != nil { return echo.ErrBadRequest }
    anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil { return echo.ErrNotFound }

    var req missingDownloadReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }
    uri := req.Magnet
    if uri == "" { uri = req.TorrentURL }
    if uri == "" { return echo.NewHTTPError(http.StatusBadRequest, "magnet or torrent_url required") }
    if req.Title == "" { req.Title = "missing-ep" }

    if h.downloader == nil {
        return echo.NewHTTPError(http.StatusServiceUnavailable, "downloader not configured")
    }
    if err := h.downloader.Add(ctx, uri); err != nil {
        return echo.NewHTTPError(http.StatusBadGateway, "downloader: "+err.Error())
    }

    id := uuid.NewString()
    _, err = h.queries.CreateDownload(ctx, store.CreateDownloadParams{
        ID: id, Name: req.Title,
        BangumiID: sql.NullInt64{Int64: anime.BangumiID.Int64, Valid: anime.BangumiID.Valid},
        MagnetUri: sql.NullString{String: req.Magnet, Valid: req.Magnet != ""},
        TorrentUrl: sql.NullString{String: req.TorrentURL, Valid: req.TorrentURL != ""},
        Status: "queued",
    })
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, map[string]any{"download_id": id})
}

type missingAutoRuleReq struct {
    EpisodeNumbers []int `json:"episode_numbers"`
}

func (h *handler) handleMissingAutoRule(c echo.Context) error {
    ctx := c.Request().Context()
    bangumiID, err := strconv.ParseInt(c.Param("bangumiId"), 10, 64)
    if err != nil { return echo.ErrBadRequest }
    anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil { return echo.ErrNotFound }

    var req missingAutoRuleReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }
    if len(req.EpisodeNumbers) == 0 {
        return echo.NewHTTPError(http.StatusBadRequest, "episode_numbers required")
    }

    existing, err := h.queries.ListDownloadRulesByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil && !errors.Is(err, sql.ErrNoRows) {
        return echo.ErrInternalServerError
    }
    merged := mergeEpisodes(existing, req.EpisodeNumbers)
    rangeCSV := csvInts(merged)

    if len(existing) > 0 {
        rule := existing[0]
        _, err := h.queries.UpdateDownloadRule(ctx, store.UpdateDownloadRuleParams{
            Name:          rule.Name,
            Enabled:       rule.Enabled,
            RssFeedID:     rule.RssFeedID,
            FilterRegex:   rule.FilterRegex,
            ExcludeRegex:  rule.ExcludeRegex,
            SaveDir:       rule.SaveDir,
            EpisodeOffset: rule.EpisodeOffset,
            ResolutionFilter: rule.ResolutionFilter,
            SubgroupFilter:   rule.SubgroupFilter,
            MinSeeders:       rule.MinSeeders,
            LibraryID:        rule.LibraryID,
            BangumiID:        rule.BangumiID,
            MatchMode:        rule.MatchMode,
            EpisodeFilter:    rule.EpisodeFilter,
            EpisodeRange:     sql.NullString{String: rangeCSV, Valid: true},
            ID: rule.ID,
        })
        if err != nil { return echo.ErrInternalServerError }
        return c.JSON(http.StatusOK, map[string]any{"rule_id": rule.ID, "episode_range": rangeCSV, "action": "merged"})
    }

    id := uuid.NewString()
    _, err = h.queries.CreateDownloadRule(ctx, store.CreateDownloadRuleParams{
        ID: id, Name: anime.Title + " - auto", Enabled: 1,
        FilterRegex: "", ExcludeRegex: "", SaveDir: "",
        EpisodeOffset: 0, ResolutionFilter: "", SubgroupFilter: "", MinSeeders: 0,
        BangumiID: sql.NullInt64{Int64: bangumiID, Valid: true},
        MatchMode: "bangumi",
        EpisodeRange: sql.NullString{String: rangeCSV, Valid: true},
    })
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, map[string]any{"rule_id": id, "episode_range": rangeCSV, "action": "created"})
}

// mergeEpisodes unions existing rule's episode_range with the requested
// numbers, deduped and sorted.
func mergeEpisodes(rules []store.DownloadRule, want []int) []int {
    set := make(map[int]struct{}, len(want)+8)
    for _, n := range want { set[n] = struct{}{} }
    for _, r := range rules {
        if !r.EpisodeRange.Valid { continue }
        for _, piece := range splitCSV(r.EpisodeRange.String) {
            if n, err := strconv.Atoi(piece); err == nil { set[n] = struct{}{} }
        }
    }
    out := make([]int, 0, len(set))
    for n := range set { out = append(out, n) }
    sort.Ints(out)
    return out
}

func splitCSV(s string) []string {
    out := []string{}
    cur := ""
    for _, r := range s {
        if r == ',' || r == ' ' {
            if cur != "" { out = append(out, cur); cur = "" }
        } else {
            cur += string(r)
        }
    }
    if cur != "" { out = append(out, cur) }
    return out
}

func csvInts(xs []int) string {
    parts := make([]string, len(xs))
    for i, n := range xs { parts[i] = strconv.Itoa(n) }
    return stringsJoin(parts, ",")
}

// stringsJoin is here to avoid another import in this file; alias it.
func stringsJoin(parts []string, sep string) string {
    if len(parts) == 0 { return "" }
    out := parts[0]
    for _, p := range parts[1:] { out += sep + p }
    return out
}

// silence unused import
var _ = json.Marshal
```

**Field-name note:** `CreateDownloadRuleParams` has many fields. Inspect `api/internal/store/download_rules.sql.go` and fill in the exact field names the sqlc output uses (e.g., `SaveDir` may be `SaveDir sql.NullString`). Adjust the call to match.

**Handler struct additions:** ensure `h.torrentRegistry *torrent.Registry` and `h.downloader` (some interface with an `Add(ctx, uri) error` method) exist on the handler. Grep `torrentRegistry\|h.downloader` to see current wiring. If absent, add fields and pass through in `main.go` (see Task 5).

- [ ] **Step 3: Register routes**

In `router.go`, find the anime group (where `/:bangumiId/duplicates` etc. live) and add:

```go
animeGroup.POST("/:bangumiId/missing/search", h.handleMissingSearch)
animeGroup.POST("/:bangumiId/missing/download", h.handleMissingDownload)
animeGroup.POST("/:bangumiId/missing/auto-rule", h.handleMissingAutoRule)
```

- [ ] **Step 4: Build**

```bash
cd api && go build ./... && go vet ./...
```

Clean. Adjust any field-name mismatches found during compile.

- [ ] **Step 5: Commit**

```bash
git add api/internal/api/missing_search_handler.go api/internal/api/router.go api/internal/store/queries/download_rules.sql api/internal/store/
git commit -m "feat(api): add missing-episode search/download/auto-rule endpoints"
```

---

## Task 5: Wire torrent registry + downloader into handler

**Files:**
- Modify: `api/internal/api/handler.go` (or wherever `handler` struct is)
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Find handler struct**

```bash
grep -n "^type handler struct\|queries *store.Queries" api/internal/api/*.go | head
```

Identify where the struct is defined. Most likely in a file like `api.go` or `handler.go`.

- [ ] **Step 2: Add fields**

```go
type handler struct {
    // ...existing fields...
    torrentRegistry *torrent.Registry
    downloader      downloaderInterface // name varies; check main.go
}
```

If `downloader` is already a field, good; otherwise add. Inspect `main.go` to see how the downloader is constructed (`downloader.NewManager(...)` returning some interface).

- [ ] **Step 3: main.go wiring**

Find where `handler{...}` is constructed in `main.go`. Ensure `torrentRegistry` (already constructed elsewhere for RSS refresh job — grep for it) is passed in. Same for `downloader`.

- [ ] **Step 4: Build**

```bash
cd api && go build ./... && go vet ./...
```

- [ ] **Step 5: Commit**

```bash
git add api/internal/api/ api/cmd/server/main.go
git commit -m "feat(api): wire torrent registry and downloader into handler"
```

---

## Task 6: Frontend API client

**Files:**
- Create: `web/src/lib/api/missing_search.ts`

- [ ] **Step 1: Write client**

```ts
import { api } from "@/lib/api-client";

export interface MissingSearchResult {
  title: string;
  magnet?: string;
  torrent_url?: string;
  size_bytes: number;
  size_display?: string;
  seeders: number;
  leechers: number;
  info_hash?: string;
  provider: string;
  published_at?: string;
  parsed: {
    Title?: string;
    EpisodeNumber?: number;
    Season?: number;
    SubGroup?: string;
    Year?: number;
    Resolution?: number;
  };
}

export interface AutoRuleResult {
  rule_id: string;
  episode_range: string;
  action: "created" | "merged";
}

export const missingSearchApi = {
  search: (bangumiId: number, episode: number) =>
    api.post<{ results: MissingSearchResult[] }>(
      `/api/v1/anime/${bangumiId}/missing/search`,
      { episode_number: episode }
    ),
  download: (bangumiId: number, magnet: string, title: string) =>
    api.post<{ download_id: string }>(
      `/api/v1/anime/${bangumiId}/missing/download`,
      { magnet, title }
    ),
  autoRule: (bangumiId: number, episodeNumbers: number[]) =>
    api.post<AutoRuleResult>(
      `/api/v1/anime/${bangumiId}/missing/auto-rule`,
      { episode_numbers: episodeNumbers }
    ),
};

export const missingSearchKeys = {
  search: (bangumiId: number, ep: number) =>
    ["missing-search", bangumiId, ep] as const,
};
```

Match the `api.post<T>` signature used by `duplicates.ts` / `completeness.ts`. If the signature differs, adjust.

- [ ] **Step 2: Typecheck + commit**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

```bash
git add web/src/lib/api/missing_search.ts
git commit -m "feat(web): add missing episode search API client"
```

---

## Task 7: MissingSearchModal component

**Files:**
- Create: `web/src/components/anime/MissingSearchModal.tsx`

- [ ] **Step 1: Component**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { toast } from "sonner";
import { missingSearchApi, type MissingSearchResult } from "@/lib/api/missing_search";

interface Props {
  bangumiId: number;
  episodeNumber: number;
  onClose: () => void;
}

export function MissingSearchModal({ bangumiId, episodeNumber, onClose }: Props) {
  const { i18n } = useLingui();

  const search = useMutation({
    mutationFn: () => missingSearchApi.search(bangumiId, episodeNumber),
  });

  const download = useMutation({
    mutationFn: (r: MissingSearchResult) =>
      missingSearchApi.download(bangumiId, r.magnet ?? r.torrent_url ?? "", r.title),
    onSuccess: (res) => {
      toast.success(i18n._(msg`Download queued: ${res.download_id.slice(0, 8)}`));
      onClose();
    },
    onError: (err: unknown) => toast.error(String(err)),
  });

  // Fire search on mount.
  if (search.isIdle) search.mutate();

  const results = search.data?.results ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[min(1000px,90vw)] overflow-auto rounded-lg border border-white/10 bg-black/80 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/80">
            {i18n._(msg`Search missing episode ${episodeNumber}`)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        {search.isPending && (
          <div className="py-8 text-center text-sm text-white/60">
            {i18n._(msg`Searching...`)}
          </div>
        )}

        {!search.isPending && results.length === 0 && (
          <div className="py-8 text-center text-sm text-white/60">
            {i18n._(msg`No results from any provider.`)}
          </div>
        )}

        {results.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-white/50">
              <tr>
                <th className="text-left">{i18n._(msg`Title`)}</th>
                <th className="text-right">{i18n._(msg`Size`)}</th>
                <th className="text-right">{i18n._(msg`Seeders`)}</th>
                <th className="text-left">{i18n._(msg`Subgroup`)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.info_hash || r.title + i} className="border-t border-white/10 align-top">
                  <td className="py-1 pr-2 text-white/80">{r.title}</td>
                  <td className="py-1 pr-2 text-right text-white/60">{r.size_display}</td>
                  <td className="py-1 pr-2 text-right text-white/60">{r.seeders}</td>
                  <td className="py-1 pr-2 text-white/60">{r.parsed.SubGroup}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      disabled={download.isPending}
                      onClick={() => download.mutate(r)}
                      className="rounded bg-white/10 px-2 py-0.5 text-white hover:bg-white/20 disabled:opacity-50"
                    >
                      {i18n._(msg`Download`)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

Use real modal primitive if the repo has one (e.g., `Modal` / `Dialog` from the UI kit) — grep `Modal\|Dialog` in `web/src/components/` to find. If yes, swap the outer `fixed inset-0` wrapper for that. Otherwise the bare fixed-position modal is fine.

- [ ] **Step 2: Typecheck + commit**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
git add web/src/components/anime/MissingSearchModal.tsx
git commit -m "feat(web): add MissingSearchModal component"
```

---

## Task 8: Extend EpisodeStatusCard with Search + Auto-download actions

**Files:**
- Modify: `web/src/components/anime/EpisodeStatusCard.tsx`

- [ ] **Step 1: Replace formatted missing list with clickable numbers**

Find where `formatRanges(data.missing)` is rendered. Replace with individual episode-number buttons that open the modal:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MissingSearchModal } from "@/components/anime/MissingSearchModal";
import { missingSearchApi } from "@/lib/api/missing_search";
// ... existing imports

const [searchEp, setSearchEp] = useState<number | null>(null);
const qc = useQueryClient();

const autoRule = useMutation({
  mutationFn: () => missingSearchApi.autoRule(bangumiId, data.missing),
  onSuccess: (res) => {
    toast.success(
      i18n._(msg`Auto-download rule ${res.action} (${res.episode_range})`)
    );
  },
});

// ... inside render:
{data.missing.length > 0 && (
  <div>
    <div className="flex items-center gap-2">
      <span>{i18n._(msg`Missing`)}:</span>
      <span className="text-white">
        {data.missing.map((n, idx) => (
          <span key={n}>
            <button
              type="button"
              onClick={() => setSearchEp(n)}
              className="underline hover:text-blue-300"
              title={i18n._(msg`Search for this episode`)}
            >
              {n}
            </button>
            {idx < data.missing.length - 1 && <span>, </span>}
          </span>
        ))}
      </span>
    </div>
    <button
      type="button"
      disabled={autoRule.isPending}
      onClick={() => {
        if (confirm(i18n._(msg`Create auto-download rule for ${data.missing.length} missing episodes?`))) {
          autoRule.mutate();
        }
      }}
      className="mt-2 rounded bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20"
    >
      {i18n._(msg`Auto-download missing`)}
    </button>
  </div>
)}

{searchEp !== null && (
  <MissingSearchModal
    bangumiId={bangumiId}
    episodeNumber={searchEp}
    onClose={() => setSearchEp(null)}
  />
)}
```

Note: the plan says not to use accent colors for chrome — the underline + text-blue-300 is a text-link affordance, acceptable. If the project enforces white/opacity for text too, use `text-white/90 hover:text-white`.

- [ ] **Step 2: Typecheck + commit**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
git add web/src/components/anime/EpisodeStatusCard.tsx
git commit -m "feat(web): add search-per-episode + auto-download actions to status card"
```

---

## Task 9: Full validation

- [ ] **Step 1: Backend**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/library/searchmissing/ ./internal/api/...
```

All sync-feature tests pass; pre-existing unrelated failures unchanged.

- [ ] **Step 2: Frontend typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

- [ ] **Step 3: Manual E2E**

1. Open an anime detail page with known missing episodes.
2. Click an episode number in the Missing list → modal opens → results populate within ~5s.
3. Click Download on a result → toast confirms download queued → `downloads` table has new row.
4. Click Auto-download missing → confirm → rule created or merged in `download_rules`.
5. Wait for next RSS refresh tick → observe new download queued automatically when a matching RSS item appears.

- [ ] **Step 4: PR**

```bash
gh pr create --title "feat: missing episode auto-search" --body-file -
```

Reference spec + plan.

---

## Self-review notes

- **Spec coverage:** Aggregator ✓, Dedupe ✓, Rank ✓, 3 API endpoints ✓, auto-rule merge semantics ✓, per-episode Search UI ✓, auto-download button ✓.
- **Scope:** Phase A only. Title aliases, per-provider filters, scheduled re-search deferred.
- **Known follow-ups:** `formatBytes` already exists in `web/src/lib/format.ts` (from duplicates) — `size_display` from backend is already human-readable so no local formatting needed for now.
- **Concurrency:** existing `torrent.Registry.SearchAll` handles parallel fanout and timeout propagation; our wrapper just adds dedupe + rank.
