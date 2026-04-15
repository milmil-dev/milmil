# Custom Rename & Move Rules

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Follow-ups:** Regex replace in template values, conflict policy per-library (append vs overwrite vs skip), cross-library move

## Goals

Let users define a per-library rename/move template using Go `text/template` syntax. Preview the results before applying, apply safely within the library root, and undo a batch if something looks wrong. Optional auto-rename-on-match for users who want Sonarr/Shoko-style continuous organization.

### In scope

- `libraries.rename_template TEXT` (Go template) and `libraries.rename_auto INTEGER` columns.
- `rename_history` table for per-batch operation log and undo.
- New `api/internal/library/renamer/` package with Compile / Plan / Apply / Undo pipeline.
- `storage.Provider.Rename` and `storage.Provider.MkdirAll` methods (local + rclone impls).
- Safety: all target paths clamped inside library root; collision policy defaults to skip (don't overwrite).
- Manual flow:
  - `GET /api/v1/libraries/:id/rename/preview?anime_id=<opt>` → dry-run plans
  - `POST /api/v1/libraries/:id/rename/apply` → execute, return `batch_id`
  - `POST /api/v1/libraries/:id/rename/undo` body `{batch_id}` → best-effort revert
  - `PATCH /api/v1/libraries/:id/rename-config` body `{template, auto}` → set template + flag
- Auto flow: when `rename_auto = 1`, resolver-finalized anime triggers `Apply` for its files.
- UI:
  - Library settings: template textarea with live preview against 3 sample files, auto-rename toggle.
  - `/libraries/:id/rename` page: full preview table (old → new, per-row status), "Apply all OK" button with confirm.
  - `/libraries/:id/rename/history` page: batch list with Undo per batch.
- Starter funcmap: `printf`, `pad`, `sanitize`, `slugify`, `upper`, `lower`, `title`.

### Out of scope (deferred)

- Lua or other scripting runtime. Only Go text/template.
- Cross-library move (template can produce paths within one library root only).
- Regex-based substitution in template values.
- Overwrite / append-numbered collision policy. Phase A always skips.
- File checksum re-verification after rename.
- Notifications on auto-rename completion.

## Non-goals

- Writing a generic scripting environment.
- Mirroring Shoko's LuaRenamer API one-for-one.

## Architecture

### New package — `api/internal/library/renamer/`

| File | Responsibility |
|---|---|
| `variables.go` | `BuildVariables(file, anime, episode, library) TemplateContext` — pure, returns struct + map. |
| `template.go` | `Compile(template string) (*Compiled, error)`; wraps `text/template` with the funcmap. |
| `plan.go` | `Plan(ctxs []FileContext, compiled *Compiled) []PlanResult` — per-file render + validate. |
| `apply.go` | `Apply(plans []PlanResult, storage Mover, q *store.Queries) (BatchResult, error)`. |
| `undo.go` | `UndoBatch(ctx, q, storage, batchID) (UndoResult, error)`. |
| `validate.go` | `ClampToLibraryRoot(root, rendered) (string, error)`. |
| `testing_shared_test.go` | Harness mirroring completeness/duplicates. |

Types:

```go
type PlanResult struct {
    MediaFileID string
    OldPath     string
    NewPath     string
    Status      PlanStatus    // OK | SkipSameAsCurrent | SkipCollision | Error
    Error       string
}

type BatchResult struct {
    BatchID       string
    Applied       int
    Skipped       int
    Errors        []string
}

type UndoResult struct {
    Reverted int
    Skipped  int
    Errors   []string
}
```

### DB migration — `000036_rename_config.up.sql`

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

`.down.sql` drops the table and columns in reverse.

### New sqlc queries

In `libraries.sql`:

```sql
-- name: UpdateLibraryRenameConfig :exec
UPDATE libraries
SET rename_template = sqlc.arg('template'),
    rename_auto = sqlc.arg('auto'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = sqlc.arg('id');
```

New `rename_history.sql`:

```sql
-- name: InsertRenameHistory :exec
INSERT INTO rename_history (id, batch_id, library_id, media_file_id, old_path, new_path)
VALUES (?, ?, ?, ?, ?, ?);

-- name: ListRenameHistoryBatches :many
-- Returns distinct batches in a library, newest first, limited.
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

Also add `UpdateMediaFilePath` to `media_files.sql`:

```sql
-- name: UpdateMediaFilePath :exec
UPDATE media_files SET path = ?, filename = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = ?;
```

### Storage Provider extension

```go
type Provider interface {
    ...existing...
    Delete(path string) error     // already added in duplicates feature
    Rename(oldPath, newPath string) error  // NEW
    MkdirAll(path string) error    // NEW — creates parent dir chain
}
```

- Local: `os.Rename`, `os.MkdirAll(dir, 0o755)`.
- Rclone: `p.vfs.Rename`, `p.vfs.MkdirAll` (confirm exact method names against pinned rclone version before coding).

### Template variables and funcmap

Starter context struct:

```go
type TemplateContext struct {
    Title            string
    TitleEn          string
    TitleZh          string
    Year             int
    Season           int
    EpisodeNumber    float64
    EpisodeTitle     string
    Resolution       int
    Subgroup         string
    Ext              string
    OriginalFilename string
}
```

Funcmap:

| Func | Signature | Purpose |
|---|---|---|
| `printf` | stdlib | formatted string |
| `pad` | `pad(v any, width int) string` | zero-pad integer / rounded float |
| `sanitize` | `sanitize(s string) string` | strip `/\:*?"<>|` and control chars, collapse spaces |
| `slugify` | `slugify(s string) string` | lowercase ASCII slug |
| `upper`, `lower`, `title` | self-explanatory | case conversion |

### Clamp logic

```go
// ClampToLibraryRoot returns the absolute target path if it's inside root,
// or an error otherwise. Rejects absolute rendered paths, parent traversal,
// and symlink escapes.
func ClampToLibraryRoot(root, rendered string) (string, error) {
    cleaned := filepath.Clean(rendered)
    if filepath.IsAbs(cleaned) {
        return "", fmt.Errorf("absolute path rejected: %s", cleaned)
    }
    joined := filepath.Join(root, cleaned)
    absRoot, err := filepath.Abs(root)
    if err != nil { return "", err }
    absJoined, err := filepath.Abs(joined)
    if err != nil { return "", err }
    // Ensure absJoined starts with absRoot + separator (or equals absRoot).
    rel, err := filepath.Rel(absRoot, absJoined)
    if err != nil || strings.HasPrefix(rel, "..") {
        return "", fmt.Errorf("path escapes library root: %s", rendered)
    }
    return absJoined, nil
}
```

### Apply pipeline

```
Apply(plans, storage, q):
    batchID := uuid.NewString()
    res := BatchResult{BatchID: batchID}
    for p in plans:
        if p.Status != OK:
            res.Skipped++
            continue
        // MkdirAll on target parent (harmless if exists).
        if err := storage.MkdirAll(filepath.Dir(p.NewPath)); err != nil:
            res.Errors = append(res.Errors, err.Error())
            continue
        if err := storage.Rename(p.OldPath, p.NewPath); err != nil:
            res.Errors = append(res.Errors, err.Error())
            continue
        q.InsertRenameHistory(batchID, libraryID, mediaFileID, p.OldPath, p.NewPath)
        q.UpdateMediaFilePath(p.MediaFileID, p.NewPath, filepath.Base(p.NewPath))
        res.Applied++
    return res, nil
```

### Undo

```
UndoBatch(batchID):
    rows := ListRenameHistoryByBatch(batchID) where reverted_at IS NULL
    // Revert newest-first so files moved in chains don't collide.
    sort rows by applied_at desc
    res := UndoResult{}
    for row in rows:
        if storage.Stat(row.NewPath) errors / missing:
            res.Skipped++
            res.Errors = append("file no longer at expected path: " + row.NewPath)
            continue
        if err := storage.Rename(row.NewPath, row.OldPath); err != nil:
            res.Errors = append(err.Error())
            continue
        q.UpdateMediaFilePath(row.MediaFileID, row.OldPath, filepath.Base(row.OldPath))
        q.MarkRenameHistoryReverted(row.id)
        res.Reverted++
    return res
```

### Auto-rename hook

In the resolver's post-finalize block (where AniDB enrichment fires), add:

```go
if library.RenameAuto == 1 && library.RenameTemplate != "" {
    files := listMediaFilesForAnime(ctx, q, animeID)
    plans := renamer.Plan(buildContexts(files, anime, episodes, library), compiled)
    _, err := renamer.Apply(ctx, plans, storage, q)
    // log warn on error; never fail the resolver
}
```

Compile the template on library load; cache per library. On `PATCH /libraries/:id/rename-config`, invalidate the cache entry.

## Data flow

### Preview

```
GET /libraries/:id/rename/preview?anime_id=?
  → load library (400 if template empty)
  → query media_files, join episodes + anime (filtered by anime_id if provided)
  → for each:
      ctx := BuildVariables(...)
      rendered := compiled.Execute(ctx)
      target := ClampToLibraryRoot(library.Path, rendered)
      status := classify(target, existing paths)
  → response: { plans: [...] }
```

### Apply (manual)

```
POST /libraries/:id/rename/apply body { plans: [...] }
  → sanity-check incoming plans against a fresh server-side Preview
    (defend against stale client state) — re-render, compare new_path;
    if mismatched, mark as Error in response and skip
  → Apply(plans, storage, q)
  → response: BatchResult { batch_id, applied, skipped, errors }
```

### Undo (manual)

```
POST /libraries/:id/rename/undo body { batch_id }
  → verify batch belongs to this library
  → UndoBatch(batchID)
  → response: UndoResult
```

### Auto

```
resolver.ResolveBangumiMatched → existing AniDB enrichment → NEW renamer hook
```

## Edge cases

| Case | Behavior |
|---|---|
| Empty template | Preview returns 400; Apply/Undo no-op if ever called. Auto path skipped silently. |
| Template compile error on save | `PATCH /rename-config` returns 400 with parse error. Never stored. |
| Template execution error (`{{.MissingField}}`) | Per-file `Status=Error`. Apply skips. |
| Rendered `../escape` or absolute path | `Status=Error` via ClampToLibraryRoot. Never writes. |
| Rendered == current path | `Status=SkipSameAsCurrent`. |
| Target exists (different file) | `Status=SkipCollision`. Skipped. |
| Target exists because earlier plan in same batch just wrote there | Plan order matters. Apply processes plans in filename-sort order; same-batch collisions report SkipCollision if we detect at Apply time via Stat. |
| `storage.MkdirAll` fails | Per-file error; Apply continues. |
| `storage.Rename` fails mid-batch | Per-file error; already-renamed rows stay applied; user can Undo partial batch. |
| Undo: new_path no longer exists | Skip, log "file no longer at expected path". |
| Undo: old_path already occupied | Apply returns error; skip that row. User can resolve manually. |
| Auto-rename infinite loop | `Status=SkipSameAsCurrent` breaks the loop after first successful apply. |
| Rclone + large batch | Slow but correct; UI shows progress via ws event `rename:progress` (cheap to add; nice to have, drop if UI-burdensome). |
| Scan racing auto-rename | After rename succeeds, `media_files.path` is updated; next scan sees new path. No conflict. |
| User deletes file before Undo | Undo returns `Skipped`. History row still there for audit; `reverted_at` stays null. |

## Testing

### Unit
- `template_test.go`: each field renders, each funcmap entry, `{{if}}` branch, error on unknown func, error on invalid syntax.
- `variables_test.go`: builds context with all fields populated; falls back to zero values when anime/episode metadata is missing; extracts extension correctly.
- `validate_test.go`: ClampToLibraryRoot accepts within-root, rejects `../`, absolute, empty.
- `plan_test.go`: per-file statuses with a stub filesystem (Stat-only); SkipSameAsCurrent + SkipCollision + Error branches.

### Integration (real sqlite + temp filesystem)
- `apply_test.go`: happy path rename, MkdirAll creates intermediate dirs, history row inserted, `media_files.path` updated.
- `apply_test.go`: partial error path — one rename fails, batch_id still valid, successful rows applied.
- `undo_test.go`: undo restores original path, history row `reverted_at` set.
- `undo_test.go`: undo with file missing at new_path → Skipped + error recorded.
- `auto_rename_test.go`: resolver hook fires when flag on, no-op when off.

### Handler
- Preview with `anime_id` filter returns only that anime's files.
- Preview returns 400 on empty template.
- Apply rejects plan whose server re-render mismatches client-supplied new_path.
- Undo restricted to the batch's library.

### Frontend
- Typecheck + manual: template textarea + 3-file live preview; full-library preview page with per-row skip toggle; history page with Undo.

## Rollout

1. Migration + queries + storage Provider extension (Rename + MkdirAll) — dormant.
2. Template + variables + validate — unit tests only.
3. Plan — works in isolation.
4. Apply + Undo — integration tests only.
5. Handlers + routes — API usable by manual Apply.
6. Resolver hook for auto-rename — off by default via `rename_auto=0`.
7. Frontend: settings editor → preview page → history page.

Each stage revertable independently.

## Open questions

- **Episode title language preference.** Template uses `.EpisodeTitle` (whatever `episodes.title` contains). If a user wants `title_zh`, we can expose `EpisodeTitleZh` similarly. Phase A exposes both.
- **Subgroup preference ordering.** Duplicates spec mentioned this as Phase B for that feature; it remains Phase B here too (rename template has access to `.Subgroup` string, users can filter via `{{if eq .Subgroup "Erai-raws"}}...{{end}}` for now).
- **ws events during long Apply.** Phase A uses HTTP polling on the status page. If users complain about no progress feedback on thousand-file batches, add `rename:progress` ws event.
