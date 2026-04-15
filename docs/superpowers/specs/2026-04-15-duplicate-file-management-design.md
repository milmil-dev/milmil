# Duplicate / Multi-Version File Management

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Follow-ups:** Custom rename + move rules (separate spec); subgroup-preference config UI; soft-delete / trash folder

## Goals

Make it cheap for users to resolve same-episode duplicates (1080p BDRip vs. 1080p WEB vs. 720p) with a sane default. Milmil auto-ranks and marks one file as "preferred" per episode after every scan. Users can override. A confirmed per-episode or library-wide cleanup hard-deletes the non-preferred files.

### In scope

- New `episodes.preferred_media_file_id` FK plus `preferred_manually_set` flag so auto-rank never overwrites user choices.
- Ranking helper in a new `api/internal/library/duplicates/` package: resolution > size > subgroup > modtime.
- Extend `fileparse.ParsedFilename` with `Resolution int` (2160, 1080, 720, 480, 0 unknown).
- Auto-rank scheduler job triggered after scan completion; skips episodes with manual preference set.
- APIs:
  - `GET /api/v1/anime/:bangumiId/duplicates`
  - `GET /api/v1/libraries/:id/duplicates`
  - `PATCH /api/v1/episodes/:id/preferred` (body: `{media_file_id}`)
  - `DELETE /api/v1/media-files/:id` (hard delete, confirm at caller)
  - `POST /api/v1/libraries/:id/duplicates/cleanup` (bulk delete non-preferred)
- UI:
  - `DuplicatesPanel` embedded in anime detail page when any episode has 2+ files.
  - Standalone `LibraryDuplicatesPage` listing all dup episodes with a "Clean non-preferred" bulk action.
  - Confirm dialogs (reuse existing primitive).

### Out of scope (deferred)

- Soft-delete / trash folder. Hard delete only. Cloud storage (rclone) providers' own recycle bin is the safety net; re-scan recovers DB state if files reappear.
- Subgroup preference configuration UI. Auto-rank's default subgroup tiebreaker falls back to modtime; user override via manual preference works today.
- Cross-library duplicates (same hash in two libraries). Same-library only.
- Duplicate-detection by file hash alone. Detection is per `episode_id`; unmatched files aren't flagged as dups.

## Non-goals

- Hooking into download decisions to avoid grabbing a lower-ranked variant. That's a future download-rule improvement.
- Auto-delete without an explicit user action.

## Architecture

### New package — `api/internal/library/duplicates/`

| File | Responsibility |
|---|---|
| `rank.go` | Pure ranking. `Rank(files []RankableFile) []RankableFile` returns the input ordered from best to worst. |
| `detector.go` | `FindAnimeDuplicates(ctx, q, animeID)` and `FindLibraryDuplicates(ctx, q, libraryID)` return `[]DupSet`. |
| `cleanup.go` | `DeleteMediaFile(ctx, q, storage, id)` removes from disk + DB. `DeleteLibraryNonPreferred(ctx, q, storage, libraryID)` iterates. |
| `autorank.go` | `AutoRank(ctx, q, libraryID)` scheduler job. Writes `preferred_media_file_id` where it's `NULL` AND `preferred_manually_set = 0`. |

Types (in `rank.go`):

```go
type RankableFile struct {
    ID         string
    Path       string
    SizeBytes  int64
    Resolution int    // 2160, 1080, 720, 480, 0 = unknown
    Subgroup   string
    ModTime    time.Time
}
```

`DupSet` (in `detector.go`):

```go
type DupSet struct {
    AnimeID        string
    AnimeTitle     string
    EpisodeID      string
    EpisodeNumber  float64
    PreferredID    string   // may be empty if never ranked
    ManuallySet    bool
    Files          []FileInfo
    WastedBytes    int64    // sum of non-preferred sizes
}
```

### DB migration

`api/migrations/000035_preferred_media_file.up.sql`:

```sql
ALTER TABLE episodes ADD COLUMN preferred_media_file_id TEXT
  REFERENCES media_files(id) ON DELETE SET NULL;
ALTER TABLE episodes ADD COLUMN preferred_manually_set INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_episodes_preferred_media_file_id
  ON episodes(preferred_media_file_id);
```

`.down.sql`:

```sql
DROP INDEX IF EXISTS idx_episodes_preferred_media_file_id;
ALTER TABLE episodes DROP COLUMN preferred_manually_set;
ALTER TABLE episodes DROP COLUMN preferred_media_file_id;
```

### Queries

`api/internal/store/queries/episodes.sql` appendix:

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

`api/internal/store/queries/media_files.sql` appendix:

```sql
-- name: ListDuplicateEpisodesByAnime :many
-- Episodes under this anime that have 2+ media_files.
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

### `fileparse` extension

`api/internal/matcher/fileparse/parser.go`:

```go
type ParsedFilename struct {
    Title         string
    EpisodeNumber int
    Season        int
    SubGroup      string
    Year          int
    Resolution    int   // NEW — 2160, 1080, 720, 480, 0
}

var reResolution = regexp.MustCompile(`(?i)\b(2160|1080|720|480)p\b|\b4k\b`)
```

In `Parse`, scan for the regex and set `Resolution` (4K → 2160). Apply BEFORE trailing-bracket stripping so `[1080p]` or `.1080p.` both hit.

Add two tests:

```go
func TestParseExtractsResolution(t *testing.T)
func TestParseResolution4kAlias(t *testing.T)
```

### Ranking

```go
// Rank returns files ordered best-first. Pure function, no side effects.
func Rank(files []RankableFile) []RankableFile {
    out := append([]RankableFile(nil), files...)
    sort.SliceStable(out, func(i, j int) bool {
        // Resolution desc (0 is worst).
        if out[i].Resolution != out[j].Resolution {
            return out[i].Resolution > out[j].Resolution
        }
        // Size desc (bigger usually means better source at same resolution).
        if out[i].SizeBytes != out[j].SizeBytes {
            return out[i].SizeBytes > out[j].SizeBytes
        }
        // Subgroup: non-empty wins over empty (known source > anonymous).
        if (out[i].Subgroup != "") != (out[j].Subgroup != "") {
            return out[i].Subgroup != ""
        }
        // ModTime desc (newest wins).
        return out[i].ModTime.After(out[j].ModTime)
    })
    return out
}
```

### Auto-rank job

`AutoRank(ctx, q, libraryID)`:

```
dupSets := ListDuplicateEpisodesByLibrary(libraryID)
for each dupSet:
    if dupSet.ManuallySet: continue
    files := ListMediaFilesByEpisode(dupSet.EpisodeID)
    ranked := Rank(filesAsRankable(files))  // map store.MediaFile → RankableFile
    top := ranked[0]
    SetEpisodePreferredAuto(episodeID=dupSet.EpisodeID, fileID=top.ID)
broadcast ws "duplicates:ranked" { library_id, ranked_count }
```

Hook: extend the existing scan-completion handler in `api/internal/api/library_handler.go` (where scan emits `scan:completed`) to enqueue `AutoRank(libraryID)` in a goroutine after the scan goroutine finishes.

Alternative: add a new ticker job `duplicates_autorank` that runs every 30 min and on-start. Simpler wiring but delayed. Prefer scan-completion hook.

### Handlers

`api/internal/api/duplicates_handler.go`:

- `handleAnimeDuplicates` — resolve bangumi_id → anime, call `FindAnimeDuplicates`, return JSON.
- `handleLibraryDuplicates` — library id, call `FindLibraryDuplicates`, return JSON with totals.
- `handleSetEpisodePreferred` — PATCH `/episodes/:id/preferred` body `{media_file_id}`. Validate file belongs to episode. Call `SetEpisodePreferredManual`.
- `handleDeleteMediaFile` — DELETE. Look up file row, call `storage.Delete(path)`, then `DeleteMediaFileByID`. Return 204 on success, 500 on storage error (keep DB row in that case? see edge cases).
- `handleLibraryDuplicateCleanup` — POST `/libraries/:id/duplicates/cleanup`. Iterate dup episodes, for each: preserve preferred, call `DeleteMediaFile` on the rest. Return `{deleted, reclaimed_bytes, errors: [...]}`.

All under the authenticated middleware, matching existing patterns.

### Storage delete

Reuse existing `storage` package. Before implementing, grep `storage.Delete`, `storage.Remove`, or similar. If none exists, add a minimal method on the existing rclone/file driver:

```go
type Driver interface {
    // ...existing...
    Delete(ctx context.Context, path string) error
}
```

Implement for local FS (`os.Remove`) and rclone (`rclone delete {remote}:{path}`). Abort the spec if no driver abstraction exists and flag it.

### Frontend

- `web/src/lib/api/duplicates.ts` — typed client:
  - `anime(bangumiId) → AnimeDuplicates`
  - `library(libraryId) → LibraryDuplicates`
  - `setPreferred(episodeId, mediaFileId) → void`
  - `deleteFile(id) → void`
  - `cleanupLibrary(libraryId) → CleanupResult`
- `web/src/components/anime/DuplicatesPanel.tsx` — per-anime. Shows each dup episode as a collapsible row listing all files with resolution, size, subgroup, path. "Set preferred" + "Delete" buttons per file. "Delete non-preferred" shortcut per episode.
- `web/src/pages/library/LibraryDuplicatesPage.tsx` — library-wide table. Columns: anime, episode, file count, wasted bytes. Click row expands. Top-right "Clean non-preferred" button with confirm dialog showing the total cleanup size.
- Route added to the library nav (wherever existing library tabs are registered).
- All confirms use existing `ConfirmDialog` / `AlertDialog`. Delete buttons use white/opacity + red hint (matches project rules: no accent for chrome, but a destructive confirm is visually distinct via text).

## Data flow

### Scan → auto-rank

```
POST /libraries/:id/scan
  → existing scan goroutine
  → ws "scan:completed"
  → goroutine: duplicates.AutoRank(ctx, q, libraryID)
    → ListDuplicateEpisodesByLibrary
    → for each dupSet (ManuallySet == false):
        ListMediaFilesByEpisode
        Rank
        SetEpisodePreferredAuto(episode_id, top.id)
    → ws "duplicates:ranked"
```

### User sets preferred

```
PATCH /episodes/:id/preferred  body {media_file_id}
  → validate file.episode_id == :id
  → SetEpisodePreferredManual (sets preferred_manually_set = 1)
  → TanStack Query invalidates ["anime-duplicates"] and ["library-duplicates"]
```

### Per-file delete

```
DELETE /media-files/:id
  → Get(file) → library → storage driver for library
  → storage.Delete(file.Path)
  → DeleteMediaFileByID(file.id)
  → invalidate queries
```

If the file was the preferred one, the `ON DELETE SET NULL` FK drops `episodes.preferred_media_file_id` automatically. Next auto-rank picks a new best.

### Bulk cleanup

```
POST /libraries/:id/duplicates/cleanup
  → FindLibraryDuplicates
  → for each dupSet:
      preferred := dupSet.PreferredID (skip deletion if empty — no clear winner, don't risk)
      for each file != preferred:
        storage.Delete
        DeleteMediaFileByID
        totals.deleted++; totals.reclaimed_bytes += file.size
        on error: totals.errors.append({id, err})
  → return totals
```

## Edge cases

| Case | Behavior |
|---|---|
| `preferred_manually_set=1` but the preferred file gets deleted elsewhere | FK ON DELETE SET NULL clears the pointer; `preferred_manually_set` stays 1 to signal "user expressed intent" (nothing to promote automatically — next manual action or user re-set). |
| Episode has 2+ files but no resolution info on any | All rank 0; tiebreak by size → bigger wins. Still deterministic. |
| Two files identical on all rank dimensions | StableSort keeps input order; arbitrary but stable. |
| User sets preferred for an episode with 1 file | Allowed; harmless (just records intent). Detection view won't list it since dup = file_count >= 2. |
| Bulk cleanup on library where some episodes have NO preferred set yet (ambiguous ranking never ran) | Skip those episodes. Log skip count in `{skipped: N}`. |
| Storage delete fails (network) | Leave DB row in place, record error, continue with next. User retries cleanup later. |
| rclone storage + bulk cleanup of 500 files | Each call is a separate rclone invocation; 500 calls is slow. Acceptable for Phase A. If it becomes a problem add a batched `storage.DeleteMany(paths)`. |
| User deletes the one file left on an episode | `episode.preferred_media_file_id` becomes NULL. Missing-episode detection flags it. Expected. |
| Scan adds a new file higher-ranked than manual preferred | `preferred_manually_set` guards. No auto-promotion. UI can show a banner suggesting "New best: {filename}" (future). |
| Auto-rank runs concurrently with user setting preferred manually | SetEpisodePreferredAuto `WHERE preferred_manually_set = 0` is the guard; if the manual set happens first, the auto update is a no-op. Safe. |

## Testing

### Unit
- `rank_test.go`
  - `TestRank_ResolutionDesc`
  - `TestRank_SizeTiebreakAtSameResolution`
  - `TestRank_SubgroupNonEmptyBeatsEmpty`
  - `TestRank_ModTimeNewestWinsWhenAllEqual`
  - `TestRank_StableOnCompleteTie`
  - `TestRank_ZeroResolutionLowest`

### Integration against real sqlite
- `detector_test.go`: `FindAnimeDuplicates` returns only episodes with ≥2 files; singletons excluded.
- `autorank_test.go`:
  - Fresh episode with 3 files → top ranked becomes preferred.
  - Episode with `preferred_manually_set=1` → autorank is a no-op.
  - Subsequent autorank on a library where new file is added to an already-ranked episode (auto path) → preferred updates to new best IF no manual.
- `cleanup_test.go`:
  - `DeleteMediaFile` removes row and calls storage.Delete.
  - `DeleteLibraryNonPreferred` preserves preferred, reports counts, surfaces partial errors.

### Handler tests
- `duplicates_handler_test.go`:
  - `PATCH preferred` rejects file_id not belonging to episode.
  - `DELETE media-files/:id` 204 on success.
  - `POST cleanup` returns `reclaimed_bytes` summing non-preferred sizes.

### Frontend
- Typecheck only. Manual sanity in dev.

## Rollout

1. Migration + queries + `fileparse` resolution extension — no user-facing change.
2. Ranking + detector + autorank job + scan hook — starts populating `preferred_media_file_id` on every scan.
3. API handlers.
4. Frontend: per-anime panel.
5. Frontend: library-wide page + bulk cleanup.

Each stage is independently revertable.

## Open questions

- **Subgroup priority list.** Some users strongly prefer specific fansubs. We could ship a `settings.preferred_subgroups` comma-separated list and inject it into the ranking. Phase B — today's manual override + per-file "Set preferred" covers it.
- **Auto-promotion on new best.** When scan adds a file that ranks higher than the current preferred, should we auto-promote if `preferred_manually_set = 0`? **Yes, by default** — `SetEpisodePreferredAuto` runs unconditionally on non-manual episodes each scan, so a new BDRip arriving replaces the current WEB preferred. Document this prominently.
- **Hash-based cross-library duplicate detection.** Deferred; separate feature.
