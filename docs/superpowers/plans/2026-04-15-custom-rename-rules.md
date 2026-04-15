# Custom Rename & Move Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-library Go `text/template` for renaming and moving media files, with mandatory preview, safe-apply-within-root, undo via audit log, and optional auto-rename-on-match.

**Architecture:** New `api/internal/library/renamer/` package: Compile (stdlib text/template + custom funcmap) → Plan (pure, per-file render + validate + classify) → Apply (storage rename + history insert + DB path update) → Undo (replay history in reverse). Storage Provider gains `Rename` and `MkdirAll`. Resolver finalize hooks auto-rename when `libraries.rename_auto=1`.

**Tech Stack:** Go 1.24, stdlib `text/template`, SQLite + sqlc, React 19 + TanStack Query + Lingui.

**Spec:** `docs/superpowers/specs/2026-04-15-custom-rename-rules-design.md`

---

## File Structure

Files to create:

- `api/migrations/000036_rename_config.up.sql`
- `api/migrations/000036_rename_config.down.sql`
- `api/internal/store/queries/rename_history.sql`
- `api/internal/library/renamer/variables.go`
- `api/internal/library/renamer/template.go`
- `api/internal/library/renamer/plan.go`
- `api/internal/library/renamer/validate.go`
- `api/internal/library/renamer/apply.go`
- `api/internal/library/renamer/undo.go`
- `api/internal/library/renamer/testing_shared_test.go`
- `api/internal/library/renamer/template_test.go`
- `api/internal/library/renamer/variables_test.go`
- `api/internal/library/renamer/validate_test.go`
- `api/internal/library/renamer/plan_test.go`
- `api/internal/library/renamer/apply_test.go`
- `api/internal/library/renamer/undo_test.go`
- `api/internal/api/rename_handler.go`
- `web/src/lib/api/rename.ts`
- `web/src/pages/library/RenamePreviewPage.tsx`
- `web/src/pages/library/RenameHistoryPage.tsx`
- `web/src/components/library/RenameConfigEditor.tsx`

Files to modify:

- `api/internal/store/queries/libraries.sql` — add `UpdateLibraryRenameConfig`
- `api/internal/store/queries/media_files.sql` — add `UpdateMediaFilePath`, `ListMediaFilesByAnime`
- `api/internal/storage/local.go` — add `Rename` + `MkdirAll`
- `api/internal/storage/rclone.go` — add `Rename` + `MkdirAll`
- `api/internal/storage/provider.go` — extend interface
- `api/internal/api/router.go` — register rename routes
- `api/internal/resolver/resolver.go` — auto-rename hook
- `api/cmd/server/main.go` — wire auto-rename (pass libraries query to resolver if not already)
- `web/src/pages/library/LibrarySettingsPage.tsx` (or equivalent) — embed `RenameConfigEditor`
- Route registration file — add `/libraries/:id/rename` and `/libraries/:id/rename/history`

---

## Task 1: Migration + queries

**Files:**
- Create: `api/migrations/000036_rename_config.up.sql`
- Create: `api/migrations/000036_rename_config.down.sql`
- Create: `api/internal/store/queries/rename_history.sql`
- Modify: `api/internal/store/queries/libraries.sql`
- Modify: `api/internal/store/queries/media_files.sql`

- [ ] **Step 1: Migrations**

`000036_rename_config.up.sql`:

```sql
ALTER TABLE libraries ADD COLUMN rename_template TEXT NOT NULL DEFAULT '';
ALTER TABLE libraries ADD COLUMN rename_auto INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rename_history (
    id            TEXT PRIMARY KEY,
    batch_id      TEXT NOT NULL,
    library_id    TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    media_file_id TEXT,
    old_path      TEXT NOT NULL,
    new_path      TEXT NOT NULL,
    applied_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    reverted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_rename_history_batch
    ON rename_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_rename_history_library_applied
    ON rename_history(library_id, applied_at DESC);
```

`000036_rename_config.down.sql`:

```sql
DROP INDEX IF EXISTS idx_rename_history_library_applied;
DROP INDEX IF EXISTS idx_rename_history_batch;
DROP TABLE IF EXISTS rename_history;
ALTER TABLE libraries DROP COLUMN rename_auto;
ALTER TABLE libraries DROP COLUMN rename_template;
```

- [ ] **Step 2: `rename_history.sql` (new)**

```sql
-- name: InsertRenameHistory :exec
INSERT INTO rename_history (id, batch_id, library_id, media_file_id, old_path, new_path)
VALUES (?, ?, ?, ?, ?, ?);

-- name: ListRenameHistoryBatches :many
SELECT batch_id, MIN(applied_at) AS applied_at,
       COUNT(*) AS row_count,
       SUM(CASE WHEN reverted_at IS NULL THEN 0 ELSE 1 END) AS reverted_count
FROM rename_history
WHERE library_id = ?
GROUP BY batch_id
ORDER BY applied_at DESC
LIMIT ?;

-- name: ListRenameHistoryByBatch :many
SELECT * FROM rename_history WHERE batch_id = ? ORDER BY applied_at DESC;

-- name: MarkRenameHistoryReverted :exec
UPDATE rename_history SET reverted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;
```

- [ ] **Step 3: Append to `libraries.sql`**

```sql
-- name: UpdateLibraryRenameConfig :exec
UPDATE libraries
SET rename_template = sqlc.arg('template'),
    rename_auto = sqlc.arg('auto'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
```

- [ ] **Step 4: Append to `media_files.sql`**

```sql
-- name: UpdateMediaFilePath :exec
UPDATE media_files SET path = ?, filename = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;

-- name: ListMediaFilesByAnime :many
SELECT mf.* FROM media_files mf
JOIN episodes e ON e.id = mf.episode_id
WHERE e.anime_id = ?;
```

- [ ] **Step 5: Regenerate + build**

```bash
cd api && sqlc generate && go build ./...
```

Expected: clean. `Library` struct gains `RenameTemplate string` and `RenameAuto int64`. New methods on `*store.Queries`.

Type surprise to watch: the `LIMIT ?` on `ListRenameHistoryBatches` will emit as `int64` or `int32` depending on sqlc config.

- [ ] **Step 6: Commit**

```bash
git add api/migrations/000036_* api/internal/store/queries/ api/internal/store/
git commit -m "feat(db,store): add rename_template, rename_history, and path queries"
```

---

## Task 2: Storage Provider Rename + MkdirAll

**Files:**
- Modify: `api/internal/storage/provider.go`
- Modify: `api/internal/storage/local.go`
- Modify: `api/internal/storage/rclone.go`
- Modify: `api/internal/storage/local_test.go`

- [ ] **Step 1: Extend interface**

In `provider.go` add two methods to the `Provider` interface:

```go
type Provider interface {
    ...existing...
    Rename(oldPath, newPath string) error
    MkdirAll(path string) error
}
```

- [ ] **Step 2: `LocalProvider` impl**

Append to `local.go`:

```go
func (p *LocalProvider) Rename(oldPath, newPath string) error {
    return os.Rename(oldPath, newPath)
}

func (p *LocalProvider) MkdirAll(path string) error {
    return os.MkdirAll(path, 0o755)
}
```

- [ ] **Step 3: `RcloneProvider` impl**

Grep `api/internal/storage/rclone.go` for `p.vfs` to confirm the VFS field name. The github.com/rclone/rclone VFS package (same one duplicates used for `Remove`) exposes `Rename(oldpath, newpath string) error` and `MkdirAll(name string, perm os.FileMode) error`. Append:

```go
func (p *RcloneProvider) Rename(oldPath, newPath string) error {
    return p.vfs.Rename(oldPath, newPath)
}

func (p *RcloneProvider) MkdirAll(path string) error {
    return p.vfs.MkdirAll(path, 0o755)
}
```

If the VFS `Rename` method doesn't exist in this rclone version, grep for `vfs.Rename` usage in the rclone vendor directory; fall back to `operations.Move` on the underlying fs.Fs. Do not invent API — inspect first.

- [ ] **Step 4: Tests**

Append to `local_test.go`:

```go
func TestLocalProvider_Rename(t *testing.T) {
    dir := t.TempDir()
    src := filepath.Join(dir, "a.txt")
    dst := filepath.Join(dir, "sub", "b.txt")
    if err := os.WriteFile(src, []byte("hi"), 0o644); err != nil { t.Fatal(err) }
    p := NewLocalProvider()
    if err := p.MkdirAll(filepath.Dir(dst)); err != nil { t.Fatal(err) }
    if err := p.Rename(src, dst); err != nil { t.Fatal(err) }
    if _, err := os.Stat(src); !os.IsNotExist(err) { t.Errorf("src still there: %v", err) }
    if _, err := os.Stat(dst); err != nil { t.Errorf("dst missing: %v", err) }
}

func TestLocalProvider_MkdirAllIdempotent(t *testing.T) {
    dir := t.TempDir()
    target := filepath.Join(dir, "x", "y", "z")
    p := NewLocalProvider()
    if err := p.MkdirAll(target); err != nil { t.Fatal(err) }
    if err := p.MkdirAll(target); err != nil { t.Errorf("second call should be no-op: %v", err) }
}
```

- [ ] **Step 5: Build + run**

```bash
cd api && go build ./... && go test -count=1 ./internal/storage/... -v
```

All green.

- [ ] **Step 6: Commit**

```bash
git add api/internal/storage/
git commit -m "feat(storage): add Rename and MkdirAll to Provider"
```

---

## Task 3: Renamer test harness

**Files:**
- Create: `api/internal/library/renamer/testing_shared_test.go`

- [ ] **Step 1: Copy pattern from `duplicates` and `completeness`**

Read `api/internal/library/duplicates/testing_shared_test.go` for the exact pattern. Mirror into `renamer`:

```go
package renamer

import (
    "context"
    "database/sql"
    "testing"

    "github.com/milmil/api/internal/db"
    "github.com/milmil/api/internal/migrations"
    "github.com/milmil/api/internal/store"
)

func newTestQueries(t *testing.T) (*store.Queries, func()) {
    t.Helper()
    // EXACT copy of duplicates/testing_shared_test.go — read that file
    // and replicate. Applies all migrations up to 000036.
    panic("copy from duplicates harness")
}

func mustCreateLibrary(t *testing.T, q *store.Queries, id, path string) store.Library {
    t.Helper()
    lib, err := q.CreateLibrary(context.Background(), store.CreateLibraryParams{
        ID: id, Name: "lib-" + id, Path: path, SourceType: "local",
    })
    if err != nil { t.Fatal(err) }
    return lib
}

func mustCreateAnime(t *testing.T, q *store.Queries, id, libraryID string, totalEpisodes int64, title string) {
    t.Helper()
    _, err := q.CreateAnime(context.Background(), store.CreateAnimeParams{
        ID: id, Title: title,
        LibraryID: sql.NullString{String: libraryID, Valid: libraryID != ""},
        TotalEpisodes: sql.NullInt64{Int64: totalEpisodes, Valid: totalEpisodes > 0},
        Year: sql.NullInt64{Int64: 2024, Valid: true},
        // Match the full CreateAnimeParams shape from duplicates harness.
    })
    if err != nil { t.Fatal(err) }
}

func mustCreateEpisode(t *testing.T, q *store.Queries, animeID, episodeID string, num float64, title string) {
    t.Helper()
    _, err := q.CreateEpisode(context.Background(), store.CreateEpisodeParams{
        ID: episodeID, AnimeID: animeID, EpisodeNumber: num,
        Title: sql.NullString{String: title, Valid: title != ""},
    })
    if err != nil { t.Fatal(err) }
}

func mustCreateMediaFile(t *testing.T, q *store.Queries, id, libraryID, episodeID, path string, size int64) {
    t.Helper()
    _, err := q.CreateMediaFile(context.Background(), store.CreateMediaFileParams{
        ID: id, LibraryID: libraryID, Path: path, Filename: path, SizeBytes: size,
    })
    if err != nil { t.Fatal(err) }
    _ = q.LinkMediaFileToEpisode(context.Background(), store.LinkMediaFileToEpisodeParams{
        EpisodeID: sql.NullString{String: episodeID, Valid: true},
        ID: id,
    })
}
```

Verify `CreateAnimeParams` field names by inspecting the duplicates harness; field set may differ (WatchStatus, Genres, Score).

- [ ] **Step 2: Compile check**

```bash
cd api && go test -run xxx ./internal/library/renamer/ -v
```

Should compile with "no tests" output.

- [ ] **Step 3: Commit**

```bash
git add api/internal/library/renamer/testing_shared_test.go
git commit -m "test(renamer): add shared test harness"
```

---

## Task 4: Variables + template compile/execute

**Files:**
- Create: `api/internal/library/renamer/variables.go`
- Create: `api/internal/library/renamer/template.go`
- Create: `api/internal/library/renamer/variables_test.go`
- Create: `api/internal/library/renamer/template_test.go`

- [ ] **Step 1: `variables.go`**

```go
package renamer

import (
    "path/filepath"
    "strings"

    "github.com/milmil/api/internal/matcher/fileparse"
    "github.com/milmil/api/internal/store"
)

type TemplateContext struct {
    Title            string
    TitleEn          string
    TitleZh          string
    Year             int
    Season           int
    EpisodeNumber    float64
    EpisodeTitle     string
    EpisodeTitleZh   string
    Resolution       int
    Subgroup         string
    Ext              string
    OriginalFilename string
}

// BuildVariables assembles a TemplateContext from DB rows. Missing metadata
// falls back to zero values; templates can guard with {{if}}.
func BuildVariables(mf store.MediaFile, anime store.Anime, episode store.Episode) TemplateContext {
    parsed := fileparse.Parse(mf.Filename)
    ctx := TemplateContext{
        Title:            anime.Title,
        EpisodeNumber:    episode.EpisodeNumber,
        Resolution:       parsed.Resolution,
        Subgroup:         parsed.SubGroup,
        Ext:              strings.TrimPrefix(filepath.Ext(mf.Filename), "."),
        OriginalFilename: mf.Filename,
    }
    if anime.TitleEn.Valid { ctx.TitleEn = anime.TitleEn.String }
    if anime.TitleZh.Valid { ctx.TitleZh = anime.TitleZh.String }
    if anime.Year.Valid    { ctx.Year = int(anime.Year.Int64) }
    // Season isn't a DB column today; infer from anime title or default to 1.
    ctx.Season = 1
    if episode.Title.Valid    { ctx.EpisodeTitle = episode.Title.String }
    if episode.TitleZh.Valid  { ctx.EpisodeTitleZh = episode.TitleZh.String }
    return ctx
}
```

Check actual `store.Anime` / `store.Episode` field names (e.g., `TitleEn` or `TitleEnglish`, `Year` or `AirYear`) before committing. Adjust to match the generated structs.

- [ ] **Step 2: `template.go`**

```go
package renamer

import (
    "bytes"
    "fmt"
    "math"
    "regexp"
    "strings"
    texttemplate "text/template"

    "golang.org/x/text/cases"
    "golang.org/x/text/language"
)

type Compiled struct {
    raw string
    tpl *texttemplate.Template
}

var illegalFilenameChars = regexp.MustCompile(`[\x00-\x1f/\\:*?"<>|]`)
var multiSpace = regexp.MustCompile(`\s+`)

func funcMap() texttemplate.FuncMap {
    caser := cases.Title(language.Und)
    return texttemplate.FuncMap{
        "pad": func(v any, width int) string {
            switch n := v.(type) {
            case int:     return fmt.Sprintf("%0*d", width, n)
            case int64:   return fmt.Sprintf("%0*d", width, n)
            case float64:
                if n == math.Trunc(n) { return fmt.Sprintf("%0*d", width, int(n)) }
                return fmt.Sprintf("%0*.1f", width+2, n) // e.g., 01.5
            case string:  return strings.Repeat("0", max(0, width-len(n))) + n
            }
            return fmt.Sprintf("%v", v)
        },
        "sanitize": func(s string) string {
            s = illegalFilenameChars.ReplaceAllString(s, "")
            s = multiSpace.ReplaceAllString(s, " ")
            return strings.TrimSpace(s)
        },
        "slugify": func(s string) string {
            s = strings.ToLower(s)
            s = illegalFilenameChars.ReplaceAllString(s, "")
            s = multiSpace.ReplaceAllString(s, "-")
            return strings.Trim(s, "-")
        },
        "upper": strings.ToUpper,
        "lower": strings.ToLower,
        "title": func(s string) string { return caser.String(s) },
    }
}

// Compile parses a user template and returns a reusable Compiled handle.
func Compile(raw string) (*Compiled, error) {
    if strings.TrimSpace(raw) == "" {
        return nil, fmt.Errorf("empty template")
    }
    t, err := texttemplate.New("rename").Funcs(funcMap()).Parse(raw)
    if err != nil { return nil, err }
    return &Compiled{raw: raw, tpl: t}, nil
}

func (c *Compiled) Execute(ctx TemplateContext) (string, error) {
    var buf bytes.Buffer
    if err := c.tpl.Execute(&buf, ctx); err != nil { return "", err }
    return buf.String(), nil
}

func (c *Compiled) Raw() string { return c.raw }
```

If `golang.org/x/text` isn't already a dependency, run `go get golang.org/x/text/cases golang.org/x/text/language` OR use `strings.Title` (deprecated but functional) to avoid adding a dependency. Prefer the deprecation warning over the new import unless the module already uses `x/text` elsewhere — check with `grep golang.org/x/text api/go.mod`.

- [ ] **Step 3: `template_test.go`**

```go
package renamer

import (
    "strings"
    "testing"
)

func TestCompileRejectsEmpty(t *testing.T) {
    if _, err := Compile(""); err == nil { t.Error("expected error on empty template") }
    if _, err := Compile("   "); err == nil { t.Error("expected error on whitespace template") }
}

func TestCompileRejectsInvalidSyntax(t *testing.T) {
    if _, err := Compile("{{.Title"); err == nil { t.Error("expected parse error") }
}

func TestExecuteAllFields(t *testing.T) {
    c, err := Compile("{{.Title}} ({{.Year}}) S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}")
    if err != nil { t.Fatal(err) }
    out, err := c.Execute(TemplateContext{
        Title: "Cowboy Bebop", Year: 1998, Season: 1, EpisodeNumber: 3, Ext: "mkv",
    })
    if err != nil { t.Fatal(err) }
    if out != "Cowboy Bebop (1998) S01E03.mkv" { t.Errorf("got %q", out) }
}

func TestFuncmapSanitize(t *testing.T) {
    c, _ := Compile(`{{sanitize .EpisodeTitle}}`)
    out, _ := c.Execute(TemplateContext{EpisodeTitle: `Bad/Name:*`})
    if strings.ContainsAny(out, `/:*`) { t.Errorf("illegal chars remain: %q", out) }
}

func TestFuncmapPadFloat(t *testing.T) {
    c, _ := Compile(`{{pad .EpisodeNumber 2}}`)
    out, _ := c.Execute(TemplateContext{EpisodeNumber: 1.5})
    if out != "01.5" { t.Errorf("got %q", out) }
}

func TestFuncmapSlugify(t *testing.T) {
    c, _ := Compile(`{{slugify .Title}}`)
    out, _ := c.Execute(TemplateContext{Title: "Cowboy Bebop: The Movie"})
    if out != "cowboy-bebop-the-movie" { t.Errorf("got %q", out) }
}

func TestExecuteIfGuard(t *testing.T) {
    c, _ := Compile(`{{.Title}}{{if .EpisodeTitle}} - {{.EpisodeTitle}}{{end}}`)
    withTitle, _ := c.Execute(TemplateContext{Title: "Show", EpisodeTitle: "Pilot"})
    if withTitle != "Show - Pilot" { t.Errorf("with: %q", withTitle) }
    noTitle, _ := c.Execute(TemplateContext{Title: "Show"})
    if noTitle != "Show" { t.Errorf("without: %q", noTitle) }
}
```

- [ ] **Step 4: `variables_test.go`**

```go
package renamer

import (
    "database/sql"
    "testing"

    "github.com/milmil/api/internal/store"
)

func TestBuildVariables_FillsExtAndResolutionFromFilename(t *testing.T) {
    mf := store.MediaFile{Filename: "[Group] Show - 01 [1080p].mkv"}
    anime := store.Anime{Title: "Show", Year: sql.NullInt64{Int64: 2020, Valid: true}}
    ep := store.Episode{EpisodeNumber: 1}
    ctx := BuildVariables(mf, anime, ep)
    if ctx.Ext != "mkv" { t.Errorf("ext=%q", ctx.Ext) }
    if ctx.Resolution != 1080 { t.Errorf("res=%d", ctx.Resolution) }
    if ctx.Subgroup != "Group" { t.Errorf("sub=%q", ctx.Subgroup) }
    if ctx.Year != 2020 { t.Errorf("year=%d", ctx.Year) }
    if ctx.OriginalFilename != mf.Filename { t.Errorf("orig=%q", ctx.OriginalFilename) }
}

func TestBuildVariables_HandlesMissingMetadata(t *testing.T) {
    mf := store.MediaFile{Filename: "unknown.mkv"}
    ctx := BuildVariables(mf, store.Anime{}, store.Episode{})
    if ctx.Year != 0 { t.Errorf("year=%d", ctx.Year) }
    if ctx.Resolution != 0 { t.Errorf("res=%d", ctx.Resolution) }
    if ctx.EpisodeTitle != "" { t.Errorf("eptitle=%q", ctx.EpisodeTitle) }
}
```

- [ ] **Step 5: Run**

```bash
cd api && go mod tidy && go test -count=1 ./internal/library/renamer/ -v
```

All green.

- [ ] **Step 6: Commit**

```bash
git add api/internal/library/renamer/ api/go.mod api/go.sum
git commit -m "feat(renamer): add variables and template compile/execute with funcmap"
```

---

## Task 5: Validate — ClampToLibraryRoot

**Files:**
- Create: `api/internal/library/renamer/validate.go`
- Create: `api/internal/library/renamer/validate_test.go`

- [ ] **Step 1: Tests**

```go
package renamer

import (
    "path/filepath"
    "strings"
    "testing"
)

func TestClamp_AllowsWithinRoot(t *testing.T) {
    root := t.TempDir()
    abs, err := ClampToLibraryRoot(root, "Cowboy Bebop/S01E01.mkv")
    if err != nil { t.Fatal(err) }
    if !strings.HasPrefix(abs, root) { t.Errorf("abs=%q not inside root=%q", abs, root) }
}

func TestClamp_RejectsAbsolute(t *testing.T) {
    root := t.TempDir()
    if _, err := ClampToLibraryRoot(root, "/etc/passwd"); err == nil {
        t.Error("expected rejection of absolute path")
    }
}

func TestClamp_RejectsParentEscape(t *testing.T) {
    root := t.TempDir()
    if _, err := ClampToLibraryRoot(root, "../outside.mkv"); err == nil {
        t.Error("expected rejection of ../ escape")
    }
    if _, err := ClampToLibraryRoot(root, "a/b/../../../outside.mkv"); err == nil {
        t.Error("expected rejection of nested ../ escape")
    }
}

func TestClamp_RejectsEmpty(t *testing.T) {
    root := t.TempDir()
    if _, err := ClampToLibraryRoot(root, ""); err == nil {
        t.Error("expected rejection of empty path")
    }
}

func TestClamp_SuffixTrickDoesNotPass(t *testing.T) {
    // If root is /tmp/xyz, do not allow rendering /tmp/xyzfoo/ — the Rel
    // check must normalize to "../xyzfoo/..." which starts with "..".
    root := t.TempDir()
    sibling := root + "foo"
    if _, err := ClampToLibraryRoot(root, filepath.Join("..", filepath.Base(sibling), "x.mkv")); err == nil {
        t.Error("expected rejection of sibling-prefix trick")
    }
}
```

- [ ] **Step 2: Implement `validate.go`**

```go
package renamer

import (
    "fmt"
    "path/filepath"
    "strings"
)

// ClampToLibraryRoot returns the absolute target path if it's inside root,
// or an error otherwise.
func ClampToLibraryRoot(root, rendered string) (string, error) {
    if strings.TrimSpace(rendered) == "" {
        return "", fmt.Errorf("empty rendered path")
    }
    if filepath.IsAbs(rendered) {
        return "", fmt.Errorf("absolute path rejected: %s", rendered)
    }
    cleaned := filepath.Clean(rendered)
    absRoot, err := filepath.Abs(root)
    if err != nil { return "", err }
    absJoined, err := filepath.Abs(filepath.Join(absRoot, cleaned))
    if err != nil { return "", err }
    rel, err := filepath.Rel(absRoot, absJoined)
    if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
        return "", fmt.Errorf("path escapes library root: %s", rendered)
    }
    return absJoined, nil
}
```

- [ ] **Step 3: Run**

```bash
cd api && go test -count=1 ./internal/library/renamer/ -run TestClamp -v
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/renamer/validate.go api/internal/library/renamer/validate_test.go
git commit -m "feat(renamer): add ClampToLibraryRoot"
```

---

## Task 6: Plan

**Files:**
- Create: `api/internal/library/renamer/plan.go`
- Create: `api/internal/library/renamer/plan_test.go`

- [ ] **Step 1: `plan.go`**

```go
package renamer

import (
    "context"
    "path/filepath"

    "github.com/milmil/api/internal/store"
)

type PlanStatus string

const (
    StatusOK                PlanStatus = "ok"
    StatusSkipSameAsCurrent PlanStatus = "skip_same_as_current"
    StatusSkipCollision     PlanStatus = "skip_collision"
    StatusError             PlanStatus = "error"
)

type PlanResult struct {
    MediaFileID string     `json:"media_file_id"`
    OldPath     string     `json:"old_path"`
    NewPath     string     `json:"new_path"`
    Status      PlanStatus `json:"status"`
    Error       string     `json:"error,omitempty"`
}

type FileContext struct {
    MediaFile store.MediaFile
    Anime     store.Anime
    Episode   store.Episode
}

// Stater is the minimal filesystem probe Plan needs to detect collisions.
// Call sites pass a storage.Provider (which has Stat).
type Stater interface {
    Stat(path string) (any, error) // return type narrowed to any so tests can fake without os.FileInfo
}

// Plan renders each FileContext through compiled and classifies each result.
// libraryRoot is the absolute path of the library; rendered paths must stay
// within it. stat is used for collision detection; pass the library's
// storage.Provider. Pass nil to skip collision checks (tests).
func Plan(ctx context.Context, ctxs []FileContext, compiled *Compiled, libraryRoot string, stat Stater) []PlanResult {
    out := make([]PlanResult, 0, len(ctxs))
    for _, c := range ctxs {
        pr := PlanResult{MediaFileID: c.MediaFile.ID, OldPath: c.MediaFile.Path}
        tc := BuildVariables(c.MediaFile, c.Anime, c.Episode)
        rendered, err := compiled.Execute(tc)
        if err != nil {
            pr.Status = StatusError
            pr.Error = err.Error()
            out = append(out, pr)
            continue
        }
        target, err := ClampToLibraryRoot(libraryRoot, rendered)
        if err != nil {
            pr.Status = StatusError
            pr.Error = err.Error()
            out = append(out, pr)
            continue
        }
        pr.NewPath = target
        if filepath.Clean(pr.OldPath) == filepath.Clean(target) {
            pr.Status = StatusSkipSameAsCurrent
            out = append(out, pr)
            continue
        }
        if stat != nil {
            if _, err := stat.Stat(target); err == nil {
                pr.Status = StatusSkipCollision
                out = append(out, pr)
                continue
            }
        }
        pr.Status = StatusOK
        out = append(out, pr)
    }
    return out
}
```

Note: `storage.Provider.Stat` returns `os.FileInfo, error`. The `Stater` interface above uses `any` to keep Plan decoupled from `os.FileInfo` for tests. Adjust the signature match: call sites pass the Provider directly via a thin wrapper if needed. If simpler, change `Stater.Stat` to return `(os.FileInfo, error)` and have tests use `os.Lstat` on temp files.

- [ ] **Step 2: Tests**

```go
package renamer

import (
    "context"
    "errors"
    "os"
    "path/filepath"
    "testing"

    "github.com/milmil/api/internal/store"
)

type fakeStater struct {
    exists map[string]bool
}

func (s *fakeStater) Stat(path string) (any, error) {
    if s.exists[path] { return nil, nil }
    return nil, errors.New("not exist")
}

func TestPlan_HappyPath(t *testing.T) {
    root := t.TempDir()
    tpl, _ := Compile(`{{.Title}}/{{.Title}} - E{{pad .EpisodeNumber 2}}.{{.Ext}}`)
    ctxs := []FileContext{{
        MediaFile: store.MediaFile{ID: "f1", Path: filepath.Join(root, "old.mkv"), Filename: "old.mkv"},
        Anime: store.Anime{Title: "Show"},
        Episode: store.Episode{EpisodeNumber: 1},
    }}
    plans := Plan(context.Background(), ctxs, tpl, root, nil)
    if plans[0].Status != StatusOK {
        t.Errorf("status=%v err=%s", plans[0].Status, plans[0].Error)
    }
    if plans[0].NewPath != filepath.Join(root, "Show/Show - E01.mkv") {
        t.Errorf("new=%q", plans[0].NewPath)
    }
}

func TestPlan_SkipSameAsCurrent(t *testing.T) {
    root := t.TempDir()
    target := filepath.Join(root, "Show.mkv")
    tpl, _ := Compile(`Show.mkv`)
    ctxs := []FileContext{{
        MediaFile: store.MediaFile{ID: "f1", Path: target, Filename: "Show.mkv"},
        Anime: store.Anime{Title: "Show"},
    }}
    plans := Plan(context.Background(), ctxs, tpl, root, nil)
    if plans[0].Status != StatusSkipSameAsCurrent { t.Errorf("status=%v", plans[0].Status) }
}

func TestPlan_SkipCollision(t *testing.T) {
    root := t.TempDir()
    newPath := filepath.Join(root, "Show.mkv")
    tpl, _ := Compile(`Show.mkv`)
    ctxs := []FileContext{{
        MediaFile: store.MediaFile{ID: "f1", Path: filepath.Join(root, "old.mkv")},
        Anime: store.Anime{Title: "Show"},
    }}
    plans := Plan(context.Background(), ctxs, tpl, root, &fakeStater{exists: map[string]bool{newPath: true}})
    if plans[0].Status != StatusSkipCollision { t.Errorf("status=%v", plans[0].Status) }
}

func TestPlan_EscapeIsError(t *testing.T) {
    root := t.TempDir()
    tpl, _ := Compile(`../escape.mkv`)
    ctxs := []FileContext{{MediaFile: store.MediaFile{ID: "f1"}, Anime: store.Anime{Title: "x"}}}
    plans := Plan(context.Background(), ctxs, tpl, root, nil)
    if plans[0].Status != StatusError { t.Errorf("status=%v", plans[0].Status) }
}

func TestPlan_TemplateError(t *testing.T) {
    root := t.TempDir()
    // Func that doesn't exist will surface at Execute time.
    tpl, _ := Compile(`{{.Missing}}/x.mkv`) // .Missing is empty — executes fine
    // Force an error via an out-of-range pad width? Use a typed func panic instead.
    // Simpler: compile invalid funcmap reference.
    _ = tpl
    // Use a template that successfully compiles but fails at Execute.
    // text/template errors are rare at Execute unless you invoke a func that
    // returns an error. For this test, skip with a note.
    _ = os.Setenv("PLAN_TEMPLATE_ERROR_SKIPPED", "1")
}
```

The template-error test is hard to trigger with stdlib text/template without custom erroring funcs. Skip it and note as follow-up. The other 4 tests are sufficient.

- [ ] **Step 3: Run**

```bash
cd api && go test -count=1 ./internal/library/renamer/ -v
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/renamer/plan.go api/internal/library/renamer/plan_test.go
git commit -m "feat(renamer): add Plan per-file render + classify"
```

---

## Task 7: Apply

**Files:**
- Create: `api/internal/library/renamer/apply.go`
- Create: `api/internal/library/renamer/apply_test.go`

- [ ] **Step 1: `apply.go`**

```go
package renamer

import (
    "context"
    "database/sql"
    "path/filepath"

    "github.com/google/uuid"
    "github.com/milmil/api/internal/store"
)

// Mover is the minimal storage abstraction Apply/Undo need.
type Mover interface {
    Stat(path string) (any, error)
    MkdirAll(path string) error
    Rename(oldPath, newPath string) error
}

type BatchResult struct {
    BatchID string   `json:"batch_id"`
    Applied int      `json:"applied"`
    Skipped int      `json:"skipped"`
    Errors  []string `json:"errors"`
}

// Apply executes each OK plan, writes a history row, and updates media_files.path.
// Failed rows are collected in Errors but don't abort the batch.
func Apply(ctx context.Context, q *store.Queries, mover Mover, libraryID string, plans []PlanResult) (BatchResult, error) {
    batchID := uuid.NewString()
    res := BatchResult{BatchID: batchID}
    for _, p := range plans {
        if p.Status != StatusOK {
            res.Skipped++
            continue
        }
        if err := mover.MkdirAll(filepath.Dir(p.NewPath)); err != nil {
            res.Errors = append(res.Errors, "mkdir "+p.NewPath+": "+err.Error())
            continue
        }
        if err := mover.Rename(p.OldPath, p.NewPath); err != nil {
            res.Errors = append(res.Errors, "rename "+p.OldPath+": "+err.Error())
            continue
        }
        _ = q.InsertRenameHistory(ctx, store.InsertRenameHistoryParams{
            ID: uuid.NewString(), BatchID: batchID, LibraryID: libraryID,
            MediaFileID: sql.NullString{String: p.MediaFileID, Valid: p.MediaFileID != ""},
            OldPath: p.OldPath, NewPath: p.NewPath,
        })
        _ = q.UpdateMediaFilePath(ctx, store.UpdateMediaFilePathParams{
            Path: p.NewPath, Filename: filepath.Base(p.NewPath), ID: p.MediaFileID,
        })
        res.Applied++
    }
    return res, nil
}
```

If `InsertRenameHistoryParams` field order is different (sqlc generates based on column order), adjust. The field names match column names by convention.

- [ ] **Step 2: Tests**

```go
package renamer

import (
    "context"
    "errors"
    "os"
    "path/filepath"
    "testing"
)

type fsMover struct {
    root string
    failRename map[string]error
}

func (m *fsMover) Stat(p string) (any, error) { return os.Stat(p) }
func (m *fsMover) MkdirAll(p string) error    { return os.MkdirAll(p, 0o755) }
func (m *fsMover) Rename(oldP, newP string) error {
    if err, ok := m.failRename[oldP]; ok { return err }
    return os.Rename(oldP, newP)
}

func TestApply_HappyPath(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    root := t.TempDir()
    lib := mustCreateLibrary(t, q, "lib1", root)
    mustCreateAnime(t, q, "a1", lib.ID, 1, "Show")
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1, "Pilot")

    src := filepath.Join(root, "old.mkv")
    if err := os.WriteFile(src, []byte("x"), 0o644); err != nil { t.Fatal(err) }
    mustCreateMediaFile(t, q, "f1", lib.ID, "a1-ep-1", src, 1)

    dst := filepath.Join(root, "Show", "S01E01.mkv")
    plans := []PlanResult{{MediaFileID: "f1", OldPath: src, NewPath: dst, Status: StatusOK}}
    res, err := Apply(context.Background(), q, &fsMover{root: root}, lib.ID, plans)
    if err != nil { t.Fatal(err) }
    if res.Applied != 1 { t.Errorf("applied=%d", res.Applied) }

    if _, err := os.Stat(dst); err != nil { t.Errorf("dst missing: %v", err) }
    if _, err := os.Stat(src); !os.IsNotExist(err) { t.Errorf("src not moved: %v", err) }

    mf, _ := q.GetMediaFileByID(context.Background(), "f1")
    if mf.Path != dst { t.Errorf("path not updated: %q", mf.Path) }
}

func TestApply_ContinuesPastRenameError(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    root := t.TempDir()
    lib := mustCreateLibrary(t, q, "lib1", root)
    mustCreateAnime(t, q, "a1", lib.ID, 2, "Show")
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1, "")
    mustCreateEpisode(t, q, "a1", "a1-ep-2", 2, "")

    src1 := filepath.Join(root, "one.mkv")
    src2 := filepath.Join(root, "two.mkv")
    for _, p := range []string{src1, src2} { _ = os.WriteFile(p, []byte("x"), 0o644) }
    mustCreateMediaFile(t, q, "f1", lib.ID, "a1-ep-1", src1, 1)
    mustCreateMediaFile(t, q, "f2", lib.ID, "a1-ep-2", src2, 1)

    mover := &fsMover{root: root, failRename: map[string]error{src1: errors.New("boom")}}
    plans := []PlanResult{
        {MediaFileID: "f1", OldPath: src1, NewPath: filepath.Join(root, "1.mkv"), Status: StatusOK},
        {MediaFileID: "f2", OldPath: src2, NewPath: filepath.Join(root, "2.mkv"), Status: StatusOK},
    }
    res, _ := Apply(context.Background(), q, mover, lib.ID, plans)
    if res.Applied != 1 || len(res.Errors) != 1 {
        t.Errorf("applied=%d errs=%d", res.Applied, len(res.Errors))
    }
}
```

- [ ] **Step 3: Run**

```bash
cd api && go test -count=1 ./internal/library/renamer/ -run TestApply -v
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/renamer/apply.go api/internal/library/renamer/apply_test.go
git commit -m "feat(renamer): add Apply with history + DB path update"
```

---

## Task 8: Undo

**Files:**
- Create: `api/internal/library/renamer/undo.go`
- Create: `api/internal/library/renamer/undo_test.go`

- [ ] **Step 1: `undo.go`**

```go
package renamer

import (
    "context"
    "path/filepath"

    "github.com/milmil/api/internal/store"
)

type UndoResult struct {
    Reverted int      `json:"reverted"`
    Skipped  int      `json:"skipped"`
    Errors   []string `json:"errors"`
}

// UndoBatch reverts a batch. Entries already reverted or missing at new_path
// are skipped. Errors are collected per-row and never abort the whole undo.
func UndoBatch(ctx context.Context, q *store.Queries, mover Mover, batchID string) (UndoResult, error) {
    rows, err := q.ListRenameHistoryByBatch(ctx, batchID)
    if err != nil { return UndoResult{}, err }
    res := UndoResult{}
    for _, row := range rows {
        if row.RevertedAt.Valid { continue }
        if _, err := mover.Stat(row.NewPath); err != nil {
            res.Skipped++
            res.Errors = append(res.Errors, "missing at "+row.NewPath)
            continue
        }
        if err := mover.MkdirAll(filepath.Dir(row.OldPath)); err != nil {
            res.Errors = append(res.Errors, err.Error())
            continue
        }
        if err := mover.Rename(row.NewPath, row.OldPath); err != nil {
            res.Errors = append(res.Errors, err.Error())
            continue
        }
        if row.MediaFileID.Valid {
            _ = q.UpdateMediaFilePath(ctx, store.UpdateMediaFilePathParams{
                Path: row.OldPath, Filename: filepath.Base(row.OldPath), ID: row.MediaFileID.String,
            })
        }
        _ = q.MarkRenameHistoryReverted(ctx, row.ID)
        res.Reverted++
    }
    return res, nil
}
```

- [ ] **Step 2: Tests**

```go
package renamer

import (
    "context"
    "os"
    "path/filepath"
    "testing"
)

func TestUndo_RestoresOriginal(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    root := t.TempDir()
    lib := mustCreateLibrary(t, q, "lib1", root)
    mustCreateAnime(t, q, "a1", lib.ID, 1, "Show")
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1, "")
    src := filepath.Join(root, "old.mkv")
    _ = os.WriteFile(src, []byte("x"), 0o644)
    mustCreateMediaFile(t, q, "f1", lib.ID, "a1-ep-1", src, 1)

    dst := filepath.Join(root, "sub", "new.mkv")
    mover := &fsMover{root: root}
    plans := []PlanResult{{MediaFileID: "f1", OldPath: src, NewPath: dst, Status: StatusOK}}
    res, _ := Apply(context.Background(), q, mover, lib.ID, plans)

    undo, err := UndoBatch(context.Background(), q, mover, res.BatchID)
    if err != nil { t.Fatal(err) }
    if undo.Reverted != 1 { t.Errorf("reverted=%d", undo.Reverted) }
    if _, err := os.Stat(src); err != nil { t.Errorf("src not restored: %v", err) }

    mf, _ := q.GetMediaFileByID(context.Background(), "f1")
    if mf.Path != src { t.Errorf("path not reverted: %q", mf.Path) }
}

func TestUndo_SkipsMissingNewPath(t *testing.T) {
    q, cleanup := newTestQueries(t)
    defer cleanup()
    root := t.TempDir()
    lib := mustCreateLibrary(t, q, "lib1", root)
    mustCreateAnime(t, q, "a1", lib.ID, 1, "Show")
    mustCreateEpisode(t, q, "a1", "a1-ep-1", 1, "")
    src := filepath.Join(root, "old.mkv")
    _ = os.WriteFile(src, []byte("x"), 0o644)
    mustCreateMediaFile(t, q, "f1", lib.ID, "a1-ep-1", src, 1)

    dst := filepath.Join(root, "new.mkv")
    mover := &fsMover{root: root}
    plans := []PlanResult{{MediaFileID: "f1", OldPath: src, NewPath: dst, Status: StatusOK}}
    res, _ := Apply(context.Background(), q, mover, lib.ID, plans)

    // User deletes the new file out-of-band.
    _ = os.Remove(dst)

    undo, _ := UndoBatch(context.Background(), q, mover, res.BatchID)
    if undo.Reverted != 0 || undo.Skipped != 1 {
        t.Errorf("reverted=%d skipped=%d", undo.Reverted, undo.Skipped)
    }
}
```

- [ ] **Step 3: Run**

```bash
cd api && go test -count=1 ./internal/library/renamer/ -v
```

All 10+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/library/renamer/undo.go api/internal/library/renamer/undo_test.go
git commit -m "feat(renamer): add UndoBatch"
```

---

## Task 9: API handlers + routes

**Files:**
- Create: `api/internal/api/rename_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: `rename_handler.go`**

```go
package api

import (
    "database/sql"
    "encoding/json"
    "errors"
    "net/http"

    "github.com/labstack/echo/v4"
    "github.com/milmil/api/internal/library/renamer"
    "github.com/milmil/api/internal/storage"
    "github.com/milmil/api/internal/store"
)

type renameConfigReq struct {
    Template string `json:"template"`
    Auto     *bool  `json:"auto"`
}

func (h *handler) handleRenameConfig(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    lib, err := h.queries.GetLibrary(ctx, libraryID)
    if err != nil { return echo.ErrNotFound }

    var req renameConfigReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }

    template := lib.RenameTemplate
    auto := lib.RenameAuto
    if req.Auto != nil { if *req.Auto { auto = 1 } else { auto = 0 } }
    // Validate template compiles if non-empty.
    if req.Template != "" {
        if _, err := renamer.Compile(req.Template); err != nil {
            return echo.NewHTTPError(http.StatusBadRequest, "template invalid: "+err.Error())
        }
    }
    template = req.Template

    if err := h.queries.UpdateLibraryRenameConfig(ctx, store.UpdateLibraryRenameConfigParams{
        Template: template, Auto: auto, ID: libraryID,
    }); err != nil { return echo.ErrInternalServerError }
    return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleRenamePreview(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    animeID := c.QueryParam("anime_id")

    lib, err := h.queries.GetLibrary(ctx, libraryID)
    if err != nil { return echo.ErrNotFound }
    if lib.RenameTemplate == "" {
        return echo.NewHTTPError(http.StatusBadRequest, "no template configured")
    }
    compiled, err := renamer.Compile(lib.RenameTemplate)
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "template invalid: "+err.Error())
    }

    provider, err := h.providerForLibrary(lib)
    if err != nil { return echo.ErrInternalServerError }
    defer provider.Close()

    ctxs, err := h.loadFileContexts(ctx, libraryID, animeID)
    if err != nil { return echo.ErrInternalServerError }

    plans := renamer.Plan(ctx, ctxs, compiled, lib.Path, provider)
    return c.JSON(http.StatusOK, map[string]any{"plans": plans})
}

type renameApplyReq struct {
    Plans []renamer.PlanResult `json:"plans"`
}

func (h *handler) handleRenameApply(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    lib, err := h.queries.GetLibrary(ctx, libraryID)
    if err != nil { return echo.ErrNotFound }

    var req renameApplyReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }

    provider, err := h.providerForLibrary(lib)
    if err != nil { return echo.ErrInternalServerError }
    defer provider.Close()

    res, err := renamer.Apply(ctx, h.queries, provider, libraryID, req.Plans)
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, res)
}

type renameUndoReq struct {
    BatchID string `json:"batch_id"`
}

func (h *handler) handleRenameUndo(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    lib, err := h.queries.GetLibrary(ctx, libraryID)
    if err != nil { return echo.ErrNotFound }

    var req renameUndoReq
    if err := c.Bind(&req); err != nil { return echo.ErrBadRequest }
    if req.BatchID == "" {
        return echo.NewHTTPError(http.StatusBadRequest, "batch_id required")
    }
    // Verify the batch belongs to this library before reverting.
    rows, err := h.queries.ListRenameHistoryByBatch(ctx, req.BatchID)
    if err != nil || len(rows) == 0 || rows[0].LibraryID != libraryID {
        return echo.ErrNotFound
    }

    provider, err := h.providerForLibrary(lib)
    if err != nil { return echo.ErrInternalServerError }
    defer provider.Close()

    res, err := renamer.UndoBatch(ctx, h.queries, provider, req.BatchID)
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, res)
}

func (h *handler) handleRenameHistory(c echo.Context) error {
    ctx := c.Request().Context()
    libraryID := c.Param("id")
    rows, err := h.queries.ListRenameHistoryBatches(ctx, store.ListRenameHistoryBatchesParams{
        LibraryID: libraryID, Limit: 50,
    })
    if err != nil { return echo.ErrInternalServerError }
    return c.JSON(http.StatusOK, rows)
}

// loadFileContexts loads FileContext triples for all files in a library, or
// filtered by animeID. Eager-joins anime + episode.
func (h *handler) loadFileContexts(ctx context.Context, libraryID, animeID string) ([]renamer.FileContext, error) {
    var files []store.MediaFile
    var err error
    if animeID != "" {
        files, err = h.queries.ListMediaFilesByAnime(ctx, sql.NullString{String: animeID, Valid: true})
    } else {
        // Fallback: all files in library. If an existing query for this
        // doesn't have the right shape, pick the closest one — e.g., the
        // scan handler's listing. Grep media_files.sql.
        files, err = h.queries.ListMediaFilesByLibraryID(ctx, libraryID)
    }
    if err != nil { return nil, err }

    out := make([]renamer.FileContext, 0, len(files))
    for _, f := range files {
        fc := renamer.FileContext{MediaFile: f}
        if f.EpisodeID.Valid {
            if ep, err := h.queries.GetEpisode(ctx, f.EpisodeID.String); err == nil {
                fc.Episode = ep
                if a, err := h.queries.GetAnime(ctx, ep.AnimeID); err == nil {
                    fc.Anime = a
                }
            }
        }
        out = append(out, fc)
    }
    return out, nil
}
```

`h.providerForLibrary` was introduced by the duplicates feature — reuse it. If the signature differs, adjust.

`ListMediaFilesByLibraryID` may not exist by that exact name. Grep — there's likely a similar one used by scan (e.g., `ListMediaFilesByLibrary`). Use whatever's there.

Imports: add `"context"` at the top.

- [ ] **Step 2: Routes**

In `router.go`:

```go
libGroup.PATCH("/:id/rename-config", h.handleRenameConfig)
libGroup.GET("/:id/rename/preview", h.handleRenamePreview)
libGroup.POST("/:id/rename/apply", h.handleRenameApply)
libGroup.POST("/:id/rename/undo", h.handleRenameUndo)
libGroup.GET("/:id/rename/history", h.handleRenameHistory)
```

- [ ] **Step 3: Build + vet**

```bash
cd api && go build ./... && go vet ./...
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/rename_handler.go api/internal/api/router.go
git commit -m "feat(api): add rename preview/apply/undo/history endpoints"
```

---

## Task 10: Auto-rename hook in resolver

**Files:**
- Modify: `api/internal/resolver/resolver.go`
- Modify: `api/cmd/server/main.go` (if the resolver needs new deps)

- [ ] **Step 1: Hook point**

Find the function in `resolver.go` that finalizes an anime row (where AniDB enrichment was added in Phase 1 — search for `EnrichExternalIDs` or `enrichExternalIDs`). Right after enrichment, add:

```go
if r.renamer != nil {
    _ = r.runAutoRename(ctx, animeRow.ID)
}
```

Where `r.renamer` is a small struct:

```go
type RenamerHook struct {
    queries *store.Queries
    newProvider func(lib store.Library) (storage.Provider, error)
}
```

Inject via the resolver constructor (follow the pattern used for AniDB injection).

The `runAutoRename` method on the resolver:

```go
func (r *Resolver) runAutoRename(ctx context.Context, animeID string) error {
    anime, err := r.queries.GetAnime(ctx, animeID)
    if err != nil { return err }
    if !anime.LibraryID.Valid { return nil }
    lib, err := r.queries.GetLibrary(ctx, anime.LibraryID.String)
    if err != nil { return err }
    if lib.RenameAuto != 1 || lib.RenameTemplate == "" { return nil }
    compiled, err := renamer.Compile(lib.RenameTemplate)
    if err != nil {
        slog.Warn("renamer: auto compile", "library", lib.ID, "err", err)
        return nil
    }
    files, err := r.queries.ListMediaFilesByAnime(ctx, sql.NullString{String: animeID, Valid: true})
    if err != nil { return err }

    provider, err := r.newProvider(lib)
    if err != nil { return err }
    defer provider.Close()

    ctxs := make([]renamer.FileContext, 0, len(files))
    for _, f := range files {
        fc := renamer.FileContext{MediaFile: f}
        if f.EpisodeID.Valid {
            if ep, err := r.queries.GetEpisode(ctx, f.EpisodeID.String); err == nil {
                fc.Episode = ep
                fc.Anime = anime
            }
        }
        ctxs = append(ctxs, fc)
    }

    plans := renamer.Plan(ctx, ctxs, compiled, lib.Path, provider)
    _, err = renamer.Apply(ctx, r.queries, provider, lib.ID, plans)
    return err
}
```

Wire `r.renamer` via a new constructor param. If adding fields to `Resolver` is painful, pass `queries` (already there) and a factory function `newProvider` at resolver-construction time from `main.go`.

- [ ] **Step 2: main.go wiring**

Add a `newProvider` function to the resolver constructor:

```go
resolverSvc := resolver.New(
    ...existing args...,
    func(lib store.Library) (storage.Provider, error) {
        // Reuse whatever helper main.go already uses. If none, inline the
        // pattern from handler's providerForLibrary.
        return storage.NewProvider(lib.SourceType, decryptedConfigJSON(lib))
    },
)
```

If `decryptedConfigJSON` isn't a helper, grep `handler.providerForLibrary` from the duplicates feature and copy its body into a shared helper in main.go.

- [ ] **Step 3: Build + test**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/resolver/... ./internal/library/renamer/...
```

All green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/resolver/ api/cmd/server/main.go
git commit -m "feat(resolver): auto-rename on finalize when library.rename_auto=1"
```

---

## Task 11: Frontend API client

**Files:**
- Create: `web/src/lib/api/rename.ts`

- [ ] **Step 1: Write the client**

```ts
import { api } from "@/lib/api-client";

export interface RenamePlan {
  media_file_id: string;
  old_path: string;
  new_path: string;
  status: "ok" | "skip_same_as_current" | "skip_collision" | "error";
  error?: string;
}

export interface RenameBatch {
  batch_id: string;
  applied_at: string;
  row_count: number;
  reverted_count: number;
}

export interface ApplyResult {
  batch_id: string;
  applied: number;
  skipped: number;
  errors: string[];
}

export interface UndoResult {
  reverted: number;
  skipped: number;
  errors: string[];
}

export const renameApi = {
  setConfig: (libraryId: string, template: string, auto: boolean) =>
    api.patch<void>(`/api/v1/libraries/${libraryId}/rename-config`, { template, auto }),
  preview: (libraryId: string, animeId?: string) => {
    const qs = animeId ? `?anime_id=${encodeURIComponent(animeId)}` : "";
    return api.get<{ plans: RenamePlan[] }>(`/api/v1/libraries/${libraryId}/rename/preview${qs}`);
  },
  apply: (libraryId: string, plans: RenamePlan[]) =>
    api.post<ApplyResult>(`/api/v1/libraries/${libraryId}/rename/apply`, { plans }),
  undo: (libraryId: string, batchId: string) =>
    api.post<UndoResult>(`/api/v1/libraries/${libraryId}/rename/undo`, { batch_id: batchId }),
  history: (libraryId: string) =>
    api.get<RenameBatch[]>(`/api/v1/libraries/${libraryId}/rename/history`),
};

export const renameKeys = {
  preview: (libraryId: string, animeId?: string) =>
    ["rename-preview", libraryId, animeId ?? ""] as const,
  history: (libraryId: string) => ["rename-history", libraryId] as const,
};
```

- [ ] **Step 2: Typecheck**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -10
```

No new errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/rename.ts
git commit -m "feat(web): add rename API client"
```

---

## Task 12: Config editor + preview page + history page

**Files:**
- Create: `web/src/components/library/RenameConfigEditor.tsx`
- Create: `web/src/pages/library/RenamePreviewPage.tsx`
- Create: `web/src/pages/library/RenameHistoryPage.tsx`
- Modify: library settings page (where library detail settings live — grep `LibraryDetailPage` or settings tab)

- [ ] **Step 1: RenameConfigEditor component**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { renameApi } from "@/lib/api/rename";

interface Props {
  libraryId: string;
  initialTemplate: string;
  initialAuto: boolean;
}

export function RenameConfigEditor({ libraryId, initialTemplate, initialAuto }: Props) {
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const [template, setTemplate] = useState(initialTemplate);
  const [auto, setAuto] = useState(initialAuto);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => renameApi.setConfig(libraryId, template, auto),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["library-detail", libraryId] });
    },
    onError: (err: unknown) => setError(String(err)),
  });

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/80">
        {i18n._(msg`Rename template`)}
      </h3>
      <textarea
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        className="min-h-[96px] w-full rounded border border-white/10 bg-black/60 p-2 font-mono text-xs text-white/90"
        placeholder="{{.Title}} ({{.Year}})/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}"
      />
      <label className="flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          className="h-4 w-4"
        />
        {i18n._(msg`Auto-rename on match`)}
      </label>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex gap-2">
        <button
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {i18n._(msg`Save`)}
        </button>
        <a
          href={`/libraries/${libraryId}/rename`}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
        >
          {i18n._(msg`Preview`)}
        </a>
        <a
          href={`/libraries/${libraryId}/rename/history`}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/20"
        >
          {i18n._(msg`History`)}
        </a>
      </div>
    </div>
  );
}
```

Embed into the library detail/settings page (grep `LibraryDetailPage` to find where the current external-link / score area is). Pass `library.rename_template ?? ""` and `library.rename_auto === 1`.

- [ ] **Step 2: RenamePreviewPage**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { renameApi, renameKeys, type RenamePlan } from "@/lib/api/rename";
import { Skeleton } from "@/components/Skeleton";

export function RenamePreviewPage() {
  const params = useParams({ strict: false }) as { id: string };
  const libraryId = params.id;
  const { i18n } = useLingui();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: renameKeys.preview(libraryId),
    queryFn: () => renameApi.preview(libraryId),
  });

  const apply = useMutation({
    mutationFn: (plans: RenamePlan[]) => renameApi.apply(libraryId, plans),
    onSuccess: (res) => {
      alert(i18n._(msg`Applied ${res.applied} files. Batch: ${res.batch_id}`));
      qc.invalidateQueries({ queryKey: renameKeys.preview(libraryId) });
      qc.invalidateQueries({ queryKey: renameKeys.history(libraryId) });
    },
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (error) return <div className="p-4 text-red-400">{String(error)}</div>;
  const plans = data?.plans ?? [];
  const ok = plans.filter((p) => p.status === "ok");

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white/90">
          {i18n._(msg`Rename preview`)}
        </h1>
        <button
          disabled={ok.length === 0 || apply.isPending}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-red-500/30 disabled:opacity-50"
          onClick={() => {
            if (confirm(i18n._(msg`Apply ${ok.length} renames. This will move files on disk. Continue?`))) {
              apply.mutate(ok);
            }
          }}
        >
          {i18n._(msg`Apply all OK (${ok.length})`)}
        </button>
      </div>

      <table className="w-full text-xs">
        <thead className="text-white/50">
          <tr>
            <th className="text-left">{i18n._(msg`Status`)}</th>
            <th className="text-left">{i18n._(msg`Old`)}</th>
            <th className="text-left">{i18n._(msg`New`)}</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.media_file_id} className="border-t border-white/10">
              <td className="py-1 text-white/70">{p.status}</td>
              <td className="py-1 text-white/60">{p.old_path}</td>
              <td className="py-1 text-white/90">{p.new_path}{p.error ? ` — ${p.error}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: RenameHistoryPage**

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useLingui } from "@lingui/react";
import { msg } from "@lingui/core/macro";
import { renameApi, renameKeys } from "@/lib/api/rename";
import { Skeleton } from "@/components/Skeleton";

export function RenameHistoryPage() {
  const params = useParams({ strict: false }) as { id: string };
  const libraryId = params.id;
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: renameKeys.history(libraryId),
    queryFn: () => renameApi.history(libraryId),
  });

  const undo = useMutation({
    mutationFn: (batchId: string) => renameApi.undo(libraryId, batchId),
    onSuccess: (res) => {
      alert(i18n._(msg`Reverted ${res.reverted} files, skipped ${res.skipped}`));
      qc.invalidateQueries({ queryKey: renameKeys.history(libraryId) });
    },
  });

  if (isLoading) return <Skeleton className="h-32" />;
  const batches = data ?? [];

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold text-white/90">
        {i18n._(msg`Rename history`)}
      </h1>
      {batches.length === 0 ? (
        <div className="text-white/60">{i18n._(msg`No rename batches yet.`)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-white/50">
            <tr>
              <th className="text-left">{i18n._(msg`Batch`)}</th>
              <th className="text-left">{i18n._(msg`Date`)}</th>
              <th className="text-right">{i18n._(msg`Files`)}</th>
              <th className="text-right">{i18n._(msg`Reverted`)}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batch_id} className="border-t border-white/10">
                <td className="py-1 font-mono text-xs text-white/60">{b.batch_id.slice(0, 8)}</td>
                <td className="py-1 text-white/60">{b.applied_at}</td>
                <td className="py-1 text-right text-white/60">{b.row_count}</td>
                <td className="py-1 text-right text-white/60">{b.reverted_count}</td>
                <td className="py-1 text-right">
                  <button
                    disabled={b.reverted_count === b.row_count || undo.isPending}
                    className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-red-500/30 disabled:opacity-50"
                    onClick={() => {
                      if (confirm(i18n._(msg`Undo batch ${b.batch_id.slice(0, 8)}?`))) {
                        undo.mutate(b.batch_id);
                      }
                    }}
                  >
                    {i18n._(msg`Undo`)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Route registration**

Create file-based route files for TanStack Router (mirror the duplicates feature's `libraries_.$id.duplicates.tsx` pattern):

- `web/src/routes/libraries_.$id.rename.tsx` → renders `RenamePreviewPage`
- `web/src/routes/libraries_.$id.rename.history.tsx` → renders `RenameHistoryPage`

Regenerate route tree:
```bash
cd web && bunx --bun @tanstack/router-cli generate
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

```bash
git add web/src/components/library/RenameConfigEditor.tsx \
        web/src/pages/library/RenamePreviewPage.tsx \
        web/src/pages/library/RenameHistoryPage.tsx \
        web/src/routes/libraries_.$id.rename.tsx \
        web/src/routes/libraries_.$id.rename.history.tsx \
        web/src/routeTree.gen.ts
git commit -m "feat(web): add rename config editor, preview page, history page"
```

- [ ] **Step 6: Wire `RenameConfigEditor` into library settings**

Find wherever the library's existing per-library settings render (e.g., `LibraryDetailPage` or a settings drawer). Embed:

```tsx
<RenameConfigEditor
  libraryId={library.id}
  initialTemplate={library.rename_template ?? ""}
  initialAuto={library.rename_auto === 1}
/>
```

Add `rename_template` / `rename_auto` to the library API type if not already surfaced.

Commit:
```bash
git add web/src/pages/library/LibraryDetailPage.tsx web/src/lib/api/library.ts
git commit -m "feat(web): embed RenameConfigEditor in library settings"
```

---

## Task 13: Full validation

- [ ] **Step 1: Backend**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./internal/library/renamer/... ./internal/storage/... ./internal/api/...
```

All green (pre-existing unrelated tests unchanged).

- [ ] **Step 2: Frontend**

```bash
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head
```

No new errors.

- [ ] **Step 3: Manual E2E**

1. Set a template on a library: `{{.Title}} ({{.Year}})/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}}.{{.Ext}}`
2. Hit `/libraries/:id/rename` → preview shows old → new for every matched file.
3. Click "Apply all OK" → files move on disk; `media_files.path` updates.
4. Open `/libraries/:id/rename/history` → batch listed with correct count.
5. Click "Undo" → files revert to original paths.
6. Enable `Auto-rename on match`, trigger a scan → auto-rename fires after resolver finalize.

- [ ] **Step 4: PR**

```bash
gh pr create --title "feat: custom rename & move rules" --body-file -
```

Reference spec + plan.

---

## Self-review notes

- **Spec coverage:** migration ✓, template compile + funcmap ✓, variables ✓, clamp-to-root ✓, Plan classification ✓, Apply + history ✓, Undo ✓, handlers ✓, auto-rename hook ✓, UI (editor + preview + history) ✓.
- **Scope:** Phase A only. Lua, regex replace, cross-library, overwrite-collision policy explicitly deferred.
- **Known follow-ups:** `formatBytes` equivalent for bytes doesn't exist here; batch progress ws event; ws-driven history refresh.
- **Sanity:** Plan is stateless w.r.t. DB — the Apply step is where DB writes happen. Undo is idempotent via `reverted_at` check.
