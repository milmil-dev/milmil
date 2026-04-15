# Duplicate File Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect same-episode duplicate media files, auto-rank one as preferred per episode (resolution > size > subgroup > modtime), let users override, and provide per-episode plus library-wide hard-delete cleanup.

**Architecture:** New `api/internal/library/duplicates/` package with pure `Rank` + stateful `Detector` + `AutoRank` job. DB gets `episodes.preferred_media_file_id` (nullable FK, ON DELETE SET NULL) and `preferred_manually_set` flag so auto-rank never stomps user choices. Auto-rank hooks into scan-completion. Storage Provider gets a new `Delete` method. Two REST endpoints feed a per-anime panel + library-wide cleanup page.

**Tech Stack:** Go 1.24, SQLite + sqlc, existing `storage` Provider abstraction, React 19 + TanStack Query + Lingui.

**Spec:** `docs/superpowers/specs/2026-04-15-duplicate-file-management-design.md`

---

## File Structure

Files to create:

- `api/migrations/000035_preferred_media_file.up.sql`
- `api/migrations/000035_preferred_media_file.down.sql`
- `api/internal/library/duplicates/rank.go`
- `api/internal/library/duplicates/rank_test.go`
- `api/internal/library/duplicates/detector.go`
- `api/internal/library/duplicates/detector_test.go`
- `api/internal/library/duplicates/autorank.go`
- `api/internal/library/duplicates/autorank_test.go`
- `api/internal/library/duplicates/cleanup.go`
- `api/internal/library/duplicates/cleanup_test.go`
- `api/internal/library/duplicates/testing_shared_test.go`
- `api/internal/api/duplicates_handler.go`
- `api/internal/api/duplicates_handler_test.go`
- `web/src/lib/api/duplicates.ts`
- `web/src/components/anime/DuplicatesPanel.tsx`
- `web/src/pages/library/LibraryDuplicatesPage.tsx`

Files to modify:

- `api/internal/store/queries/episodes.sql` — add `SetEpisodePreferredAuto`, `SetEpisodePreferredManual`
- `api/internal/store/queries/media_files.sql` — add `ListDuplicateEpisodesByAnime`, `ListDuplicateEpisodesByLibrary`, `ListMediaFilesByEpisode`, `DeleteMediaFileByID`
- `api/internal/matcher/fileparse/parser.go` — add `Resolution` field + regex
- `api/internal/matcher/fileparse/parser_test.go` — resolution tests
- `api/internal/storage/local.go` — implement `Delete`
- `api/internal/storage/rclone.go` — implement `Delete`
- `api/internal/storage/factory.go` or wherever `Provider` interface lives — add `Delete` to interface
- `api/internal/api/library_handler.go` — enqueue `AutoRank(libraryID)` after scan completes
- `api/internal/api/router.go` — register new routes
- `api/cmd/server/main.go` — wire duplicates service if a facade is needed (probably not — functions take `*store.Queries` directly)
- `web/src/pages/AnimeDetailPage.tsx` — render `DuplicatesPanel`
- Library nav / router wiring to add the Duplicates page

---

## Task 1: Migration + queries

**Files:**
- Create: `api/migrations/000035_preferred_media_file.up.sql`
- Create: `api/migrations/000035_preferred_media_file.down.sql`
- Modify: `api/internal/store/queries/episodes.sql`
- Modify: `api/internal/store/queries/media_files.sql`

- [ ] **Step 1: Write migrations**

`000035_preferred_media_file.up.sql`:

```sql
ALTER TABLE episodes ADD COLUMN preferred_media_file_id TEXT
  REFERENCES media_files(id) ON DELETE SET NULL;
ALTER TABLE episodes ADD COLUMN preferred_manually_set INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_episodes_preferred_media_file_id
  ON episodes(preferred_media_file_id);
```

`000035_preferred_media_file.down.sql`:

```sql
DROP INDEX IF EXISTS idx_episodes_preferred_media_file_id;
ALTER TABLE episodes DROP COLUMN preferred_manually_set;
ALTER TABLE episodes DROP COLUMN preferred_media_file_id;
```

- [ ] **Step 2: Append to `episodes.sql`**

```sql
-- name: SetEpisodePreferredAuto :exec
-- Only writes when no manual preference is set yet.
UPDATE episodes
SET preferred_media_file_id = sqlc.arg('file_id'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id') AND preferred_manually_set = 0;

-- name: SetEpisodePreferredManual :exec
UPDATE episodes
SET preferred_media_file_id = sqlc.arg('file_id'),
    preferred_manually_set = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
```

- [ ] **Step 3: Append to `media_files.sql`**

```sql
-- name: ListDuplicateEpisodesByAnime :many
SELECT e.id AS episode_id, e.episode_number,
       e.preferred_media_file_id, e.preferred_manually_set,
       COUNT(mf.id) AS file_count,
       SUM(mf.size_bytes) AS total_bytes
FROM episodes e
JOIN media_files mf ON mf.episode_id = e.id
WHERE e.anime_id = sqlc.arg('anime_id')
GROUP BY e.id
HAVING file_count >= 2;

-- name: ListDuplicateEpisodesByLibrary :many
SELECT a.id AS anime_id, a.title,
       e.id AS episode_id, e.episode_number,
       e.preferred_media_file_id, e.preferred_manually_set,
       COUNT(mf.id) AS file_count,
       SUM(mf.size_bytes) AS total_bytes
FROM episodes e
JOIN anime a ON a.id = e.anime_id
JOIN media_files mf ON mf.episode_id = e.id
WHERE a.library_id = sqlc.arg('library_id')
GROUP BY e.id
HAVING file_count >= 2;

-- name: ListMediaFilesByEpisode :many
SELECT * FROM media_files WHERE episode_id = ? ORDER BY size_bytes DESC;

-- name: DeleteMediaFileByID :exec
DELETE FROM media_files WHERE id = ?;
```

- [ ] **Step 4: Regenerate + build**

```bash
cd api && sqlc generate && go build ./...
```

Expected: clean. `Episode` struct gets `PreferredMediaFileID sql.NullString` and `PreferredManuallySet int64`.

- [ ] **Step 5: Apply migration end-to-end**

The repo has no standalone migrate CLI; migrations run on server boot. The `completeness` package's `testing_shared_test.go` already applies migrations through the embedded FS. Trust that and move on — any issue will surface on the next test run.

- [ ] **Step 6: Commit**

```bash
git add api/migrations/ api/internal/store/queries/ api/internal/store/
git commit -m "feat(db,store): add preferred_media_file_id and duplicate queries"
```

---

## Task 2: Extend `fileparse` with resolution

**Files:**
- Modify: `api/internal/matcher/fileparse/parser.go`
- Modify: `api/internal/matcher/fileparse/parser_test.go`

- [ ] **Step 1: Write failing tests**

Append to `parser_test.go`:

```go
func TestParseExtractsResolution(t *testing.T) {
    cases := []struct {
        in   string
        want int
    }{
        {"[SubGroup] Some Anime - 01 [1080p].mkv", 1080},
        {"[Group] Title S01E05 720p.mkv", 720},
        {"Show.2160p.BDRip.mkv", 2160},
        {"Show.4K.mkv", 2160},
        {"Show 480p.mp4", 480},
        {"Show.mkv", 0},
    }
    for _, tc := range cases {
        t.Run(tc.in, func(t *testing.T) {
            p := Parse(tc.in)
            if p.Resolution != tc.want {
                t.Errorf("got %d want %d", p.Resolution, tc.want)
            }
        })
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd api && go test -count=1 ./internal/matcher/fileparse/ -run TestParseExtractsResolution -v
```

Expected: FAIL — `Resolution` field undefined.

- [ ] **Step 3: Implement**

In `parser.go`:

```go
type ParsedFilename struct {
    Title         string
    EpisodeNumber int
    Season        int
    SubGroup      string
    Year          int
    Resolution    int
}

var reResolution = regexp.MustCompile(`(?i)\b(2160|1080|720|480)p\b`)
var reResolution4K = regexp.MustCompile(`(?i)\b4k\b`)
```

Inside `Parse`, place BEFORE the trailing-tag strip loop (so `[1080p]` is still matchable):

```go
if m := reResolution.FindStringSubmatch(name); m != nil {
    if r, err := strconv.Atoi(m[1]); err == nil {
        result.Resolution = r
    }
} else if reResolution4K.MatchString(name) {
    result.Resolution = 2160
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/matcher/fileparse/ -v
```

All existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/matcher/fileparse/
git commit -m "feat(fileparse): extract resolution from filename"
```

---

## Task 3: Storage Provider `Delete` method

**Files:**
- Modify: `api/internal/storage/` (interface + both impls)

- [ ] **Step 1: Find the `Provider` interface**

```bash
grep -rn "type Provider interface" api/internal/storage/
```

Likely in `factory.go` or a dedicated `provider.go`. Add the new method signature:

```go
type Provider interface {
    Walk(root string, fn filepath.WalkFunc) error
    Stat(path string) (os.FileInfo, error)
    Open(path string) (io.ReadCloser, error)
    ReadDir(path string) ([]os.FileInfo, error)
    Delete(path string) error  // NEW
    Close() error
}
```

- [ ] **Step 2: Implement `Delete` on `LocalProvider`**

Append to `api/internal/storage/local.go`:

```go
func (p *LocalProvider) Delete(path string) error {
    return os.Remove(path)
}
```

- [ ] **Step 3: Implement `Delete` on `RcloneProvider`**

Append to `api/internal/storage/rclone.go`:

```go
// Delete removes a single file via rclone's VFS layer.
func (p *RcloneProvider) Delete(path string) error {
    // vfs provides Remove; if not, fall back to the underlying fs.
    return p.vfs.Remove(path)
}
```

If `p.vfs.Remove` does not exist in the version of rclone this repo pins, use:

```go
func (p *RcloneProvider) Delete(path string) error {
    return operations.Delete(context.Background(), p.fs, path)
}
```

Grep the `RcloneProvider` struct for the field name (`vfs` vs `fs`) and use whatever's there. If both are unavailable, use `os.Remove` on the `localPath` (rclone mount) — the rclone VFS is typically mounted locally. Inspect the file before coding.

- [ ] **Step 4: Write tests**

`api/internal/storage/local_test.go` — append:

```go
func TestLocalProvider_Delete(t *testing.T) {
    dir := t.TempDir()
    path := filepath.Join(dir, "x.txt")
    if err := os.WriteFile(path, []byte("hi"), 0o644); err != nil { t.Fatal(err) }
    p := NewLocalProvider()
    if err := p.Delete(path); err != nil { t.Fatal(err) }
    if _, err := os.Stat(path); !os.IsNotExist(err) {
        t.Errorf("expected file gone, got err=%v", err)
    }
}

func TestLocalProvider_DeleteMissing(t *testing.T) {
    p := NewLocalProvider()
    err := p.Delete(filepath.Join(t.TempDir(), "nope"))
    if !os.IsNotExist(err) { t.Errorf("want IsNotExist, got %v", err) }
}
```

- [ ] **Step 5: Run + build**

```bash
cd api && go build ./... && go test -count=1 ./internal/storage/...
```

All green.

- [ ] **Step 6: Commit**

```bash
git add api/internal/storage/
git commit -m "feat(storage): add Delete method to Provider"
```

---

## Task 4: Duplicates shared test harness

**Files:**
- Create: `api/internal/library/duplicates/testing_shared_test.go`

- [ ] **Step 1: Copy harness pattern from `completeness`**

Look at `api/internal/library/completeness/testing_shared_test.go` — it wires sqlite + migrations. Mirror it in `duplicates`:

```go
package duplicates

import (
    "context"
    "database/sql"
    "testing"
    "time"

    "github.com/milmil/api/internal/db"
    "github.com/milmil/api/internal/migrations"
    "github.com/milmil/api/internal/store"
)

func newTestQueries(t *testing.T) (*store.Queries, func()) {
    t.Helper()
    // Match the pattern in completeness/testing_shared_test.go exactly.
    // Typically:
    //   dsn := "file::memory:?cache=shared"
    //   database, err := db.Open(dsn)
    //   db.MigrateUp(migrations.FS, dsn)
    //   return store.New(database), func() { database.Close() }
    panic("COPY from completeness/testing_shared_test.go")
}

func mustCreateLibrary(t *testing.T, q *store.Queries, id string) {
    t.Helper()
    _, err := q.CreateLibrary(context.Background(), store.CreateLibraryParams{
        ID: id, Name: "lib-" + id, Path: "/tmp/" + id, SourceType: "local",
        ConfigJson: "{}",
    })
    if err != nil { t.Fatal(err) }
}

func mustCreateAnime(t *testing.T, q *store.Queries, id, libraryID string, totalEpisodes int64) {
    t.Helper()
    _, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
        ID: id, Title: "test-" + id,
        LibraryID: sql.NullString{String: libraryID, Valid: libraryID != ""},
        TotalEpisodes: sql.NullInt64{Int64: totalEpisodes, Valid: totalEpisodes > 0},
        // CreateAnime requires WatchStatus / Score / Genres — fill minimally.
        // Grep CreateAnimeParams for the real required fields.
    })
    if err != nil { t.Fatal(err) }
}

func mustCreateEpisode(t *testing.T, q *store.Queries, animeID, episodeID string, num float64) {
    t.Helper()
    _, err := q.CreateEpisode(context.Background(), store.CreateEpisodeParams{
        ID: episodeID, AnimeID: animeID, EpisodeNumber: num,
    })
    if err != nil { t.Fatal(err) }
}

func mustCreateMediaFile(t *testing.T, q *store.Queries, id, libraryID, episodeID, path string, size int64) {
    t.Helper()
    _, err := q.CreateMediaFile(context.Background(), store.CreateMediaFileParams{
        ID: id, LibraryID: libraryID, Path: path, Filename: path, SizeBytes: size,
    })
    if err != nil { t.Fatal(err) }
    // Link to episode. Find the real update query name by grep — likely
    // UpdateMediaFileEpisodeID or similar.
    _ = q.LinkMediaFileToEpisode(context.Background(), store.LinkMediaFileToEpisodeParams{
        ID: id, EpisodeID: sql.NullString{String: episodeID, Valid: true},
    })
}

// Silence unused imports if not all fields are wired.
var _ = time.Now
```

**Important:** `LinkMediaFileToEpisode` may not exist by that exact name. Grep `media_files.sql` for an update that sets `episode_id` (e.g., `UpdateMediaFileBangumiEpisode`, `LinkMediaFile`, `MarkMediaFileManual`). Use the real name.

If a single-file update that just sets `episode_id` doesn't exist, add one to `media_files.sql`:

```sql
-- name: LinkMediaFileToEpisode :exec
UPDATE media_files SET episode_id = sqlc.arg('episode_id'), match_status = 'manual'
WHERE id = sqlc.arg('id');
```

Regenerate sqlc.

- [ ] **Step 2: Commit**

```bash
git add api/internal/library/duplicates/testing_shared_test.go \
        api/internal/store/queries/media_files.sql api/internal/store/
git commit -m "test(duplicates): add shared test harness"
```

---

## Task 5: `Rank` pure function

**Files:**
- Create: `api/internal/library/duplicates/rank.go`
- Create: `api/internal/library/duplicates/rank_test.go`

- [ ] **Step 1: Write tests first**

`rank_test.go`:

```go
package duplicates

import (
    "testing"
    "time"
)

func TestRank_ResolutionDesc(t *testing.T) {
    files := []RankableFile{
        {ID: "a", Resolution: 720, SizeBytes: 1000},
        {ID: "b", Resolution: 1080, SizeBytes: 500},
        {ID: "c", Resolution: 2160, SizeBytes: 100},
    }
    got := Rank(files)
    if got[0].ID != "c" || got[1].ID != "b" || got[2].ID != "a" {
        t.Errorf("order: %v %v %v", got[0].ID, got[1].ID, got[2].ID)
    }
}

func TestRank_SizeTiebreakAtSameResolution(t *testing.T) {
    files := []RankableFile{
        {ID: "a", Resolution: 1080, SizeBytes: 2_000_000_000},
        {ID: "b", Resolution: 1080, SizeBytes: 5_000_000_000},
    }
    got := Rank(files)
    if got[0].ID != "b" { t.Errorf("big wins; got %s", got[0].ID) }
}

func TestRank_SubgroupNonEmptyBeatsEmpty(t *testing.T) {
    files := []RankableFile{
        {ID: "a", Resolution: 1080, SizeBytes: 1000, Subgroup: ""},
        {ID: "b", Resolution: 1080, SizeBytes: 1000, Subgroup: "Erai-raws"},
    }
    got := Rank(files)
    if got[0].ID != "b" { t.Errorf("named subgroup wins; got %s", got[0].ID) }
}

func TestRank_ModTimeNewestWinsWhenAllEqual(t *testing.T) {
    older := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
    newer := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    files := []RankableFile{
        {ID: "a", Resolution: 1080, SizeBytes: 1000, Subgroup: "x", ModTime: older},
        {ID: "b", Resolution: 1080, SizeBytes: 1000, Subgroup: "x", ModTime: newer},
    }
    got := Rank(files)
    if got[0].ID != "b" { t.Errorf("newest wins; got %s", got[0].ID) }
}

func TestRank_StableOnCompleteTie(t *testing.T) {
    t0 := time.Now()
    files := []RankableFile{
        {ID: "a", Resolution: 1080, SizeBytes: 1000, Subgroup: "x", ModTime: t0},
        {ID: "b", Resolution: 1080, SizeBytes: 1000, Subgroup: "x", ModTime: t0},
    }
    got := Rank(files)
    if got[0].ID != "a" { t.Errorf("stable keeps input order on tie; got %s", got[0].ID) }
}

func TestRank_ZeroResolutionLowest(t *testing.T) {
    files := []RankableFile{
        {ID: "a", Resolution: 0, SizeBytes: 9_000_000_000},
        {ID: "b", Resolution: 720, SizeBytes: 1000},
    }
    got := Rank(files)
    if got[0].ID != "b" { t.Errorf("any known res beats unknown; got %s", got[0].ID) }
}
```

- [ ] **Step 2: Verify FAIL**

```bash
cd api && go test -count=1 ./internal/library/duplicates/ -run TestRank -v
```

- [ ] **Step 3: Implement `rank.go`**

```go
package duplicates

import (
    "sort"
    "time"
)

// RankableFile is what Rank consumes. Decoupled from store.MediaFile so
// callers can adapt other shapes (tests, CLI tools) without importing store.
type RankableFile struct {
    ID         string
    Path       string
    SizeBytes  int64
    Resolution int
    Subgroup   string
    ModTime    time.Time
}

// Rank returns files ordered best-first. Stable on complete tie.
// Criteria: resolution desc → size desc → non-empty subgroup wins → newer modtime.
func Rank(files []RankableFile) []RankableFile {
    out := append([]RankableFile(nil), files...)
    sort.SliceStable(out, func(i, j int) bool {
        if out[i].Resolution != out[j].Resolution {
            return out[i].Resolution > out[j].Resolution
        }
        if out[i].SizeBytes != out[j].SizeBytes {
            return out[i].SizeBytes > out[j].SizeBytes
        }
        iHas := out[i].Subgroup != ""
        jHas := out[j].Subgroup != ""
        if iHas != jHas {
            return iHas
        }
        return out[i].ModTime.After(out[j].ModTime)
    })
    return out
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/library/duplicates/ -run TestRank -v
```

All 6 pass.

- [ ] **Step 5: Commit**

```bash
git add api/internal/library/duplicates/rank.go api/internal/library/duplicates/rank_test.go
git commit -m "feat(duplicates): add Rank pure function"
```

---

## Task 6: Detector

**Files:**
- Create: `api/internal/library/duplicates/detector.go`
- Create: `api/internal/library/duplicates/detector_test.go`

- [ ] **Step 1: Write failing tests**

```go
package duplicates

import (
    "context"
    "testing"
)

func TestFindAnimeDuplicates_OnlyEpisodesWithTwoOrMoreFiles(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 3)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-2", 2)
    mustCreateEpisode(t, q, "a1", "a1-ep-3", 3)
    mustCreateMediaFile(t, q, "f1", "lib1", "a1-ep-1", "/tmp/f1.mkv", 1_000_000)
    mustCreateMediaFile(t, q, "f2", "lib1", "a1-ep-1", "/tmp/f2.mkv", 2_000_000)
    mustCreateMediaFile(t, q, "f3", "lib1", "a1-ep-2", "/tmp/f3.mkv", 500_000)
    // ep-3 has zero files; ep-2 has one; ep-1 has two → only ep-1 should appear.

    sets, err := FindAnimeDuplicates(context.Background(), q, "a1")
    if err != nil { t.Fatal(err) }
    if len(sets) != 1 { t.Fatalf("want 1 dupset, got %d", len(sets)) }
    if sets[0].EpisodeID != "a1-ep-1" { t.Errorf("wrong ep: %s", sets[0].EpisodeID) }
    if len(sets[0].Files) != 2 { t.Errorf("want 2 files, got %d", len(sets[0].Files)) }
}

func TestFindLibraryDuplicates_GroupsAcrossAnime(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    for _, a := range []string{"a1", "a2"} {
        mustCreateAnime(t, q, a, "lib1", 2)
        mustCreateEpisode(t, q, a, a+"-ep-1", 1)
        mustCreateMediaFile(t, q, a+"-f1", "lib1", a+"-ep-1", "/tmp/"+a+"-f1", 1_000_000)
        mustCreateMediaFile(t, q, a+"-f2", "lib1", a+"-ep-1", "/tmp/"+a+"-f2", 2_000_000)
    }

    sets, err := FindLibraryDuplicates(context.Background(), q, "lib1")
    if err != nil { t.Fatal(err) }
    if len(sets) != 2 { t.Fatalf("want 2, got %d", len(sets)) }
}
```

- [ ] **Step 2: Implement `detector.go`**

```go
package duplicates

import (
    "context"
    "time"

    "github.com/milmil/api/internal/matcher/fileparse"
    "github.com/milmil/api/internal/store"
)

type FileInfo struct {
    ID         string
    Path       string
    Filename   string
    SizeBytes  int64
    Resolution int
    Subgroup   string
    ModTime    time.Time
}

type DupSet struct {
    AnimeID       string
    AnimeTitle    string
    EpisodeID     string
    EpisodeNumber float64
    PreferredID   string
    ManuallySet   bool
    Files         []FileInfo
    WastedBytes   int64
}

func FindAnimeDuplicates(ctx context.Context, q *store.Queries, animeID string) ([]DupSet, error) {
    rows, err := q.ListDuplicateEpisodesByAnime(ctx, animeID)
    if err != nil { return nil, err }
    out := make([]DupSet, 0, len(rows))
    for _, row := range rows {
        files, err := loadFiles(ctx, q, row.EpisodeID)
        if err != nil { return nil, err }
        set := DupSet{
            AnimeID: animeID, EpisodeID: row.EpisodeID,
            EpisodeNumber: row.EpisodeNumber,
            ManuallySet: row.PreferredManuallySet == 1,
            Files: files,
        }
        if row.PreferredMediaFileID.Valid {
            set.PreferredID = row.PreferredMediaFileID.String
        }
        set.WastedBytes = wastedBytes(files, set.PreferredID)
        out = append(out, set)
    }
    return out, nil
}

func FindLibraryDuplicates(ctx context.Context, q *store.Queries, libraryID string) ([]DupSet, error) {
    rows, err := q.ListDuplicateEpisodesByLibrary(ctx, sqlNullString(libraryID))
    if err != nil { return nil, err }
    out := make([]DupSet, 0, len(rows))
    for _, row := range rows {
        files, err := loadFiles(ctx, q, row.EpisodeID)
        if err != nil { return nil, err }
        set := DupSet{
            AnimeID: row.AnimeID, AnimeTitle: row.Title, EpisodeID: row.EpisodeID,
            EpisodeNumber: row.EpisodeNumber,
            ManuallySet: row.PreferredManuallySet == 1,
            Files: files,
        }
        if row.PreferredMediaFileID.Valid {
            set.PreferredID = row.PreferredMediaFileID.String
        }
        set.WastedBytes = wastedBytes(files, set.PreferredID)
        out = append(out, set)
    }
    return out, nil
}

func loadFiles(ctx context.Context, q *store.Queries, episodeID string) ([]FileInfo, error) {
    rows, err := q.ListMediaFilesByEpisode(ctx, sqlNullString(episodeID))
    if err != nil { return nil, err }
    out := make([]FileInfo, 0, len(rows))
    for _, r := range rows {
        parsed := fileparse.Parse(r.Filename)
        modTime := time.Time{}
        if t, err := time.Parse(time.RFC3339, r.UpdatedAt); err == nil { modTime = t }
        out = append(out, FileInfo{
            ID: r.ID, Path: r.Path, Filename: r.Filename,
            SizeBytes: r.SizeBytes,
            Resolution: parsed.Resolution,
            Subgroup: parsed.SubGroup,
            ModTime: modTime,
        })
    }
    return out, nil
}

func wastedBytes(files []FileInfo, preferredID string) int64 {
    if preferredID == "" { return 0 } // no preferred yet → nothing is "wasted"
    var total int64
    for _, f := range files {
        if f.ID != preferredID { total += f.SizeBytes }
    }
    return total
}

// toRankable converts detector FileInfo to RankableFile for Rank().
func toRankable(files []FileInfo) []RankableFile {
    out := make([]RankableFile, len(files))
    for i, f := range files {
        out[i] = RankableFile{
            ID: f.ID, Path: f.Path, SizeBytes: f.SizeBytes,
            Resolution: f.Resolution, Subgroup: f.Subgroup, ModTime: f.ModTime,
        }
    }
    return out
}
```

Add a `sqlNullString` helper in a small `internal_test.go` or as a package-local function. Also the `ListMediaFilesByEpisode` query takes `sql.NullString`? It takes a plain `string` column comparison but the column is nullable — verify the generated signature and adjust. If sqlc emits a plain `string` arg, drop the wrap.

- [ ] **Step 3: Run tests**

```bash
cd api && go test -count=1 ./internal/library/duplicates/ -v
```

Both new tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/duplicates/detector.go api/internal/library/duplicates/detector_test.go
git commit -m "feat(duplicates): add Detector (anime + library)"
```

---

## Task 7: AutoRank job

**Files:**
- Create: `api/internal/library/duplicates/autorank.go`
- Create: `api/internal/library/duplicates/autorank_test.go`

- [ ] **Step 1: Write failing tests**

```go
package duplicates

import (
    "context"
    "database/sql"
    "testing"
)

func TestAutoRank_SetsPreferredTopRanked(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    // 3 files: different resolutions.
    mustCreateMediaFile(t, q, "f-low", "lib1", "a1-ep-1", "[Group] Show - 01 [720p].mkv", 1_000_000)
    mustCreateMediaFile(t, q, "f-high", "lib1", "a1-ep-1", "[Group] Show - 01 [1080p].mkv", 2_000_000)
    mustCreateMediaFile(t, q, "f-4k",   "lib1", "a1-ep-1", "[Group] Show - 01 [2160p].mkv", 9_000_000)

    if err := AutoRank(context.Background(), q, "lib1"); err != nil { t.Fatal(err) }

    ep, _ := q.GetEpisode(context.Background(), "a1-ep-1")
    if !ep.PreferredMediaFileID.Valid || ep.PreferredMediaFileID.String != "f-4k" {
        t.Errorf("wrong preferred: %+v", ep.PreferredMediaFileID)
    }
    if ep.PreferredManuallySet != 0 {
        t.Error("manual flag should stay 0 after auto")
    }
}

func TestAutoRank_PreservesManualSet(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    mustCreateMediaFile(t, q, "f-a", "lib1", "a1-ep-1", "[G] Show - 01 [720p].mkv", 1_000_000)
    mustCreateMediaFile(t, q, "f-b", "lib1", "a1-ep-1", "[G] Show - 01 [1080p].mkv", 2_000_000)

    // User manually pins the lower-res file.
    _ = q.SetEpisodePreferredManual(context.Background(), store.SetEpisodePreferredManualParams{
        ID: "a1-ep-1",
        FileID: sql.NullString{String: "f-a", Valid: true},
    })

    if err := AutoRank(context.Background(), q, "lib1"); err != nil { t.Fatal(err) }

    ep, _ := q.GetEpisode(context.Background(), "a1-ep-1")
    if ep.PreferredMediaFileID.String != "f-a" {
        t.Errorf("manual choice was overwritten: %+v", ep.PreferredMediaFileID)
    }
}
```

Test imports `store` from `github.com/milmil/api/internal/store`.

- [ ] **Step 2: Implement `autorank.go`**

```go
package duplicates

import (
    "context"
    "database/sql"

    "github.com/milmil/api/internal/store"
)

// AutoRank writes preferred_media_file_id for every episode in libraryID that
// has 2+ files and no manual preference. Skips manually-set episodes.
func AutoRank(ctx context.Context, q *store.Queries, libraryID string) error {
    sets, err := FindLibraryDuplicates(ctx, q, libraryID)
    if err != nil { return err }
    for _, set := range sets {
        if set.ManuallySet { continue }
        if len(set.Files) == 0 { continue }
        ranked := Rank(toRankable(set.Files))
        top := ranked[0]
        if err := q.SetEpisodePreferredAuto(ctx, store.SetEpisodePreferredAutoParams{
            ID: set.EpisodeID,
            FileID: sql.NullString{String: top.ID, Valid: true},
        }); err != nil { return err }
    }
    return nil
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test -count=1 ./internal/library/duplicates/ -v
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/duplicates/autorank.go api/internal/library/duplicates/autorank_test.go
git commit -m "feat(duplicates): add AutoRank job"
```

---

## Task 8: Cleanup

**Files:**
- Create: `api/internal/library/duplicates/cleanup.go`
- Create: `api/internal/library/duplicates/cleanup_test.go`

- [ ] **Step 1: Write tests**

```go
package duplicates

import (
    "context"
    "errors"
    "testing"
)

type fakeStorage struct {
    deleted []string
    failOn  map[string]error
}

func (s *fakeStorage) Delete(path string) error {
    if err, ok := s.failOn[path]; ok { return err }
    s.deleted = append(s.deleted, path)
    return nil
}

func TestDeleteMediaFile_HappyPath(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    mustCreateMediaFile(t, q, "f1", "lib1", "a1-ep-1", "/tmp/f1.mkv", 1000)
    fs := &fakeStorage{}

    err := DeleteMediaFile(context.Background(), q, fs, "f1")
    if err != nil { t.Fatal(err) }
    if len(fs.deleted) != 1 || fs.deleted[0] != "/tmp/f1.mkv" {
        t.Errorf("wrong deletes: %v", fs.deleted)
    }
    if _, err := q.GetMediaFile(context.Background(), "f1"); err == nil {
        t.Error("expected DB row gone")
    }
}

func TestDeleteLibraryNonPreferred_PreservesPreferred(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    mustCreateMediaFile(t, q, "f-low",  "lib1", "a1-ep-1", "/tmp/low.mkv", 1000)
    mustCreateMediaFile(t, q, "f-high", "lib1", "a1-ep-1", "/tmp/high.mkv", 3000)

    _ = AutoRank(context.Background(), q, "lib1")
    ep, _ := q.GetEpisode(context.Background(), "a1-ep-1")
    preferred := ep.PreferredMediaFileID.String

    fs := &fakeStorage{}
    res, err := DeleteLibraryNonPreferred(context.Background(), q, fs, "lib1")
    if err != nil { t.Fatal(err) }
    if res.Deleted != 1 { t.Errorf("deleted=%d want 1", res.Deleted) }
    // Preferred must still exist.
    if _, err := q.GetMediaFile(context.Background(), preferred); err != nil {
        t.Errorf("preferred was deleted: %v", err)
    }
}

func TestDeleteLibraryNonPreferred_CollectsErrors(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    mustCreateLibrary(t, q, "lib1")
    mustCreateAnime(t, q, "a1", "lib1", 1)
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1)
    mustCreateMediaFile(t, q, "f-a", "lib1", "a1-ep-1", "/tmp/a.mkv", 1000)
    mustCreateMediaFile(t, q, "f-b", "lib1", "a1-ep-1", "/tmp/b.mkv", 3000)
    _ = AutoRank(context.Background(), q, "lib1")

    fs := &fakeStorage{failOn: map[string]error{"/tmp/a.mkv": errors.New("disk busy")}}
    res, err := DeleteLibraryNonPreferred(context.Background(), q, fs, "lib1")
    if err != nil { t.Fatal(err) }
    if len(res.Errors) != 1 { t.Errorf("errors=%v", res.Errors) }
    if res.Deleted != 0 { t.Errorf("deleted=%d want 0 on storage fail", res.Deleted) }
}
```

- [ ] **Step 2: Implement `cleanup.go`**

```go
package duplicates

import (
    "context"

    "github.com/milmil/api/internal/store"
)

// Deleter is a minimal storage abstraction for cleanup. Real callers pass
// the library-specific Provider (local or rclone).
type Deleter interface {
    Delete(path string) error
}

type CleanupResult struct {
    Deleted        int     `json:"deleted"`
    ReclaimedBytes int64   `json:"reclaimed_bytes"`
    Skipped        int     `json:"skipped"`
    Errors         []error `json:"-"`
}

// DeleteMediaFile hard-deletes a single media file from disk and DB.
func DeleteMediaFile(ctx context.Context, q *store.Queries, del Deleter, id string) error {
    mf, err := q.GetMediaFile(ctx, id)
    if err != nil { return err }
    if err := del.Delete(mf.Path); err != nil { return err }
    return q.DeleteMediaFileByID(ctx, id)
}

// DeleteLibraryNonPreferred iterates duplicate episodes and deletes every file
// that isn't the preferred one. Episodes with no preferred_media_file_id
// (ambiguous / never ranked) are skipped.
func DeleteLibraryNonPreferred(ctx context.Context, q *store.Queries, del Deleter, libraryID string) (CleanupResult, error) {
    sets, err := FindLibraryDuplicates(ctx, q, libraryID)
    if err != nil { return CleanupResult{}, err }
    res := CleanupResult{}
    for _, set := range sets {
        if set.PreferredID == "" { res.Skipped++; continue }
        for _, f := range set.Files {
            if f.ID == set.PreferredID { continue }
            if err := DeleteMediaFile(ctx, q, del, f.ID); err != nil {
                res.Errors = append(res.Errors, err)
                continue
            }
            res.Deleted++
            res.ReclaimedBytes += f.SizeBytes
        }
    }
    return res, nil
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test -count=1 ./internal/library/duplicates/ -v
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/duplicates/cleanup.go api/internal/library/duplicates/cleanup_test.go
git commit -m "feat(duplicates): add DeleteMediaFile + DeleteLibraryNonPreferred"
```

---

## Task 9: API handlers

**Files:**
- Create: `api/internal/api/duplicates_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Handler**

```go
package api

import (
    "database/sql"
    "errors"
    "net/http"
    "strconv"

    "github.com/labstack/echo/v4"
    "github.com/milmil/api/internal/library/duplicates"
    "github.com/milmil/api/internal/storage"
    "github.com/milmil/api/internal/store"
)

func (h *handler) handleAnimeDuplicates(c echo.Context) error {
    ctx := c.Request().Context()
    idStr := c.Param("bangumiId")
    bangumiID, err := strconv.ParseInt(idStr, 10, 64)
    if err != nil { return echo.NewHTTPError(http.StatusBadRequest, "invalid bangumiId") }
    anime, err := h.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) { return echo.ErrNotFound }
        return echo.ErrInternalServerError
    }
    sets, err := duplicates.FindAnimeDuplicates(ctx, h.queries, anime.ID)
    if err != nil { return echo.ErrInternalServerError }
    if sets == nil { sets = []duplicates.DupSet{} }
    return c.JSON(http.StatusOK, sets)
}

func (h *handler) handleLibraryDuplicates(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    sets, err := duplicates.FindLibraryDuplicates(ctx, h.queries, libraryID)
    if err != nil { return echo.ErrInternalServerError }
    if sets == nil { sets = []duplicates.DupSet{} }
    return c.JSON(http.StatusOK, sets)
}

type setPreferredReq struct {
    MediaFileID string `json:"media_file_id"`
}

func (h *handler) handleSetEpisodePreferred(c echo.Context) error {
    ctx := c.Request().Context()
    episodeID := c.Param("id")
    var req setPreferredReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }
    if req.MediaFileID == "" { return echo.NewHTTPError(http.StatusBadRequest, "media_file_id required") }

    // Validate the file belongs to the episode.
    mf, err := h.queries.GetMediaFile(ctx, req.MediaFileID)
    if err != nil { return echo.ErrNotFound }
    if !mf.EpisodeID.Valid || mf.EpisodeID.String != episodeID {
        return echo.NewHTTPError(http.StatusBadRequest, "file does not belong to this episode")
    }

    if err := h.queries.SetEpisodePreferredManual(ctx, store.SetEpisodePreferredManualParams{
        ID: episodeID,
        FileID: sql.NullString{String: req.MediaFileID, Valid: true},
    }); err != nil { return echo.ErrInternalServerError }
    return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleDeleteMediaFile(c echo.Context) error {
    ctx := c.Request().Context()
    id := c.Param("id")
    mf, err := h.queries.GetMediaFile(ctx, id)
    if err != nil { return echo.ErrNotFound }

    library, err := h.queries.GetLibrary(ctx, mf.LibraryID)
    if err != nil { return echo.ErrInternalServerError }
    provider, err := storage.NewProvider(library.SourceType, library.ConfigJson)
    if err != nil { return echo.ErrInternalServerError }
    defer provider.Close()

    if err := duplicates.DeleteMediaFile(ctx, h.queries, provider, id); err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "delete failed: "+err.Error())
    }
    return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleLibraryDuplicateCleanup(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    library, err := h.queries.GetLibrary(ctx, libraryID)
    if err != nil { return echo.ErrNotFound }
    provider, err := storage.NewProvider(library.SourceType, library.ConfigJson)
    if err != nil { return echo.ErrInternalServerError }
    defer provider.Close()

    res, err := duplicates.DeleteLibraryNonPreferred(ctx, h.queries, provider, libraryID)
    if err != nil { return echo.ErrInternalServerError }
    errStrs := make([]string, 0, len(res.Errors))
    for _, e := range res.Errors { errStrs = append(errStrs, e.Error()) }
    return c.JSON(http.StatusOK, map[string]any{
        "deleted": res.Deleted,
        "reclaimed_bytes": res.ReclaimedBytes,
        "skipped": res.Skipped,
        "errors": errStrs,
    })
}
```

- [ ] **Step 2: Register routes in `router.go`**

Find the existing anime / episodes / libraries / media-files groups. Add:

```go
animeGroup.GET("/:bangumiId/duplicates", h.handleAnimeDuplicates)
librariesGroup.GET("/:id/duplicates", h.handleLibraryDuplicates)
librariesGroup.POST("/:id/duplicates/cleanup", h.handleLibraryDuplicateCleanup)
episodesGroup.PATCH("/:id/preferred", h.handleSetEpisodePreferred)
mediaFilesGroup.DELETE("/:id", h.handleDeleteMediaFile)
```

If `episodesGroup` or `mediaFilesGroup` doesn't exist yet, create them alongside neighbors with the same auth middleware.

- [ ] **Step 3: Build**

```bash
cd api && go build ./... && go vet ./...
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/duplicates_handler.go api/internal/api/router.go
git commit -m "feat(api): add duplicates endpoints"
```

---

## Task 10: Scan-completion hook for AutoRank

**Files:**
- Modify: `api/internal/api/library_handler.go`

- [ ] **Step 1: Find the scan-completion point**

```bash
grep -n "scan:completed\|MatchLibrary\|goroutine\|go func" api/internal/api/library_handler.go
```

Identify the goroutine that runs the scan + match pipeline. It emits `scan:completed` over websocket at the end.

- [ ] **Step 2: Enqueue `AutoRank` after scan success**

Immediately after the scan pipeline finishes successfully (and before the ws completed broadcast, or after — doesn't matter for correctness), add:

```go
if err := duplicates.AutoRank(context.Background(), h.queries, libraryID); err != nil {
    slog.Warn("duplicates: autorank failed", "library", libraryID, "err", err)
}
```

Use `context.Background()` because the HTTP request context is already gone by the time the scan goroutine runs. Log-on-error; never abort the scan on autorank failure.

Import `"github.com/milmil/api/internal/library/duplicates"`.

- [ ] **Step 3: Build + test**

```bash
cd api && go build ./... && go test -count=1 ./internal/api/...
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/library_handler.go
git commit -m "feat(library): run duplicates AutoRank after scan completes"
```

---

## Task 11: Frontend API client

**Files:**
- Create: `web/src/lib/api/duplicates.ts`

- [ ] **Step 1: Write client**

Match the existing `@/lib/api-client` pattern used by `completeness.ts` and `sync.ts`. Sketch:

```ts
import { api } from "@/lib/api-client";

export interface DupFileInfo {
  id: string;
  path: string;
  filename: string;
  size_bytes: number;
  resolution: number;
  subgroup: string;
  mod_time: string;
}

export interface DupSet {
  anime_id: string;
  anime_title?: string;
  episode_id: string;
  episode_number: number;
  preferred_id: string;
  manually_set: boolean;
  files: DupFileInfo[];
  wasted_bytes: number;
}

export interface CleanupResult {
  deleted: number;
  reclaimed_bytes: number;
  skipped: number;
  errors: string[];
}

export const duplicatesApi = {
  anime(bangumiId: number) { return api.get<DupSet[]>(`/api/v1/anime/${bangumiId}/duplicates`); },
  library(libraryId: string) { return api.get<DupSet[]>(`/api/v1/libraries/${libraryId}/duplicates`); },
  setPreferred(episodeId: string, mediaFileId: string) {
    return api.patch<void>(`/api/v1/episodes/${episodeId}/preferred`, { media_file_id: mediaFileId });
  },
  deleteFile(id: string) { return api.delete<void>(`/api/v1/media-files/${id}`); },
  cleanupLibrary(libraryId: string) {
    return api.post<CleanupResult>(`/api/v1/libraries/${libraryId}/duplicates/cleanup`, {});
  },
};

export const duplicatesKeys = {
  anime: (bangumiId: number) => ["duplicates-anime", bangumiId] as const,
  library: (libraryId: string) => ["duplicates-library", libraryId] as const,
};
```

Adjust the `api.get` / `api.post` / `api.patch` / `api.delete` method names to whatever the repo's client exposes. Grep `api.get<` in `sync.ts` / `completeness.ts` for the exact signature.

The Go serialization emits snake_case JSON matching this type.

- [ ] **Step 2: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -10
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/duplicates.ts
git commit -m "feat(web): add duplicates API client"
```

---

## Task 12: DuplicatesPanel component + wire into AnimeDetailPage

**Files:**
- Create: `web/src/components/anime/DuplicatesPanel.tsx`
- Modify: `web/src/pages/AnimeDetailPage.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { duplicatesApi, duplicatesKeys, type DupSet } from "@/lib/api/duplicates";
import { Skeleton } from "@/components/Skeleton";

interface Props { bangumiId: number; }

export function DuplicatesPanel({ bangumiId }: Props) {
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: duplicatesKeys.anime(bangumiId),
    queryFn: () => duplicatesApi.anime(bangumiId),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
  });

  const setPreferred = useMutation({
    mutationFn: ({ episodeId, fileId }: { episodeId: string; fileId: string }) =>
      duplicatesApi.setPreferred(episodeId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: duplicatesKeys.anime(bangumiId) }),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => duplicatesApi.deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: duplicatesKeys.anime(bangumiId) }),
  });

  if (isLoading) return <Skeleton className="h-24" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h3 className="mb-3 text-sm font-semibold text-white/80">
        {i18n._(msg`Duplicate files`)}
      </h3>
      <div className="space-y-3">
        {data.map((s) => (
          <DupRow
            key={s.episode_id}
            set={s}
            onSetPreferred={(fileId) => setPreferred.mutate({ episodeId: s.episode_id, fileId })}
            onDeleteFile={(id) => {
              if (confirm(i18n._(msg`Delete this file permanently?`))) {
                deleteFile.mutate(id);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DupRow({ set, onSetPreferred, onDeleteFile }: {
  set: DupSet;
  onSetPreferred: (fileId: string) => void;
  onDeleteFile: (id: string) => void;
}) {
  const { i18n } = useLingui();
  return (
    <div className="rounded border border-white/10 p-3">
      <div className="mb-2 text-sm text-white/80">
        {i18n._(msg`Episode ${set.episode_number}`)} — {set.files.length} {i18n._(msg`files`)}
      </div>
      <ul className="space-y-1 text-xs">
        {set.files.map((f) => {
          const isPreferred = f.id === set.preferred_id;
          return (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className={isPreferred ? "text-white" : "text-white/60"}>
                {isPreferred && "★ "}
                {f.filename} ({f.resolution > 0 ? `${f.resolution}p` : "?"} · {formatBytes(f.size_bytes)})
              </span>
              <div className="flex gap-2">
                {!isPreferred && (
                  <button
                    className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
                    onClick={() => onSetPreferred(f.id)}
                  >
                    {i18n._(msg`Set preferred`)}
                  </button>
                )}
                <button
                  className="rounded bg-white/10 px-2 py-0.5 text-white/60 hover:bg-red-500/30"
                  onClick={() => onDeleteFile(f.id)}
                >
                  {i18n._(msg`Delete`)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}
```

Adjust Skeleton import to whatever's actually in use (grep `import { Skeleton }`).

- [ ] **Step 2: Wire into AnimeDetailPage**

```tsx
import { DuplicatesPanel } from "@/components/anime/DuplicatesPanel";

// Render near other metadata panels (EpisodeStatusCard area is a good neighbor):
<DuplicatesPanel bangumiId={Number(bangumiId)} />
```

- [ ] **Step 3: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -10
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/anime/DuplicatesPanel.tsx web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): add DuplicatesPanel on anime detail page"
```

---

## Task 13: LibraryDuplicatesPage + route + bulk cleanup

**Files:**
- Create: `web/src/pages/library/LibraryDuplicatesPage.tsx`
- Modify: route registration (wherever library routes are declared — grep `LibraryDetailPage`)

- [ ] **Step 1: Implement page**

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router"; // or whatever router is in use
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { duplicatesApi, duplicatesKeys, type DupSet } from "@/lib/api/duplicates";
import { Skeleton } from "@/components/Skeleton";

export function LibraryDuplicatesPage() {
  const params = useParams({ strict: false }) as { id: string };
  const libraryId = params.id;
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: duplicatesKeys.library(libraryId),
    queryFn: () => duplicatesApi.library(libraryId),
  });

  const cleanup = useMutation({
    mutationFn: () => duplicatesApi.cleanupLibrary(libraryId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: duplicatesKeys.library(libraryId) });
      alert(i18n._(msg`Cleaned up ${res.deleted} files (${res.reclaimed_bytes} bytes)`));
    },
  });

  if (isLoading) return <Skeleton className="h-32" />;
  const sets = data ?? [];
  const totalWaste = sets.reduce((a, s) => a + s.wasted_bytes, 0);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white/90">{i18n._(msg`Duplicate files`)}</h1>
        <button
          disabled={sets.length === 0 || cleanup.isPending}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-red-500/30 disabled:opacity-50"
          onClick={() => {
            if (confirm(i18n._(msg`This will permanently delete ${sets.length} non-preferred files across this library. Continue?`))) {
              cleanup.mutate();
            }
          }}
        >
          {i18n._(msg`Clean non-preferred (${formatBytes(totalWaste)})`)}
        </button>
      </div>

      {sets.length === 0 ? (
        <div className="text-white/60">{i18n._(msg`No duplicates.`)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-white/50">
            <tr>
              <th className="text-left">{i18n._(msg`Anime`)}</th>
              <th className="text-left">{i18n._(msg`Episode`)}</th>
              <th className="text-right">{i18n._(msg`Files`)}</th>
              <th className="text-right">{i18n._(msg`Wasted`)}</th>
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.episode_id} className="border-t border-white/10">
                <td className="py-1 text-white/80">{s.anime_title}</td>
                <td className="py-1 text-white/60">#{s.episode_number}</td>
                <td className="py-1 text-right text-white/60">{s.files.length}</td>
                <td className="py-1 text-right text-white/60">{formatBytes(s.wasted_bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${u[i]}`;
}
```

Extract `formatBytes` into a shared util if you notice the same function in `DuplicatesPanel.tsx` — DRY.

- [ ] **Step 2: Register route**

Find the library router setup (grep `LibraryDetailPage` in router / routes configuration). Add a route `/libraries/:id/duplicates` pointing at `LibraryDuplicatesPage`. Add a link from `LibraryDetailPage` (sidebar or secondary nav).

- [ ] **Step 3: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/library/LibraryDuplicatesPage.tsx web/src/  # adjust to actual route file
git commit -m "feat(web): add LibraryDuplicatesPage with bulk cleanup"
```

---

## Task 14: Full E2E validation

- [ ] **Step 1: Backend**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/library/duplicates/... ./internal/storage/... ./internal/matcher/fileparse/... ./internal/api/...
```

Zero failures.

- [ ] **Step 2: Frontend**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

- [ ] **Step 3: Manual E2E**

1. Scan a library with 2+ files linked to the same episode (e.g., add a duplicate manually in SQLite, then scan).
2. Confirm `preferred_media_file_id` is populated on the episode.
3. Open anime detail page → `DuplicatesPanel` shows the dup set with ★ on the preferred.
4. Click "Set preferred" on another file → UI updates; `preferred_manually_set` flips to 1.
5. Rerun scan → auto-rank does NOT overwrite manual preference.
6. Delete a non-preferred file via the UI → file disappears from disk and DB.
7. Navigate to `/libraries/:id/duplicates` → see table, click "Clean non-preferred", confirm, observe reclaimed bytes count.

- [ ] **Step 4: PR**

```bash
gh pr create --title "feat: duplicate file management" --body-file -
```

Reference spec + plan.

---

## Self-review notes

- **Spec coverage:** migration ✓, ranking formula ✓, autorank-with-manual-guard ✓, scan-completion hook ✓, per-file delete ✓, bulk cleanup ✓, anime panel ✓, library page ✓.
- **Scope:** detection + ranking + cleanup only. Subgroup priority config, soft-delete, hash-based cross-library dedup explicitly deferred.
- **Known follow-ups:** `formatBytes` duplicated across two frontend files — extract if a third consumer appears.
- **Concurrency:** `SetEpisodePreferredAuto WHERE preferred_manually_set = 0` is the atomic guard protecting user choices from autorank race.
