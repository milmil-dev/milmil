# AniDB Integration — Phase 1 (HTTP)

**Date:** 2026-04-14
**Status:** Draft → awaiting user review
**Owner:** milmil
**Follow-up:** Phase 2 (UDP + ED2K file hash matching) — separate spec

## Goals

Teach milmil to recognize AniDB anime IDs and use AniDB as a cross-site metadata ID hub, providing automatic ID enrichment across Bangumi / AniList / MAL / TMDB / Kitsu and a title-based fallback matcher. Phase 1 lays groundwork for Phase 2 UDP hash matching.

### In scope

- Add `anidb_id` to the `anime` table (nullable, unique when set).
- Periodic download + local cache of two data sources:
  - **Manami** `anime-offline-database.json` — cross-site ID mapping.
  - **AniDB** `anime-titles.xml.gz` — title index for fallback search.
- Automatic ID enrichment after every successful match: given any external ID the row has, fill whatever is still NULL.
- New fallback matching pass that runs only when all existing passes fail.
- UI: show an AniDB external link on the anime detail page alongside the existing Bangumi / AniList links.

### Out of scope (deferred to Phase 2+)

- AniDB UDP client, ED2K hash computation, `FILE` command, session/keepalive.
- MyList sync, watch state upload to AniDB.
- Per-anime AniDB HTTP API calls (`httpapi?request=anime&aid=X`). Bangumi + TMDB continue to supply episode / tag / staff metadata.

## Non-goals

- Replacing or reordering any existing matcher pass.
- Changing existing frontend match/unmatch flows.
- Offering a manual "search AniDB" UI (the fallback pass is automatic; manual link UI already exists for other sources).

## Architecture

### New Go package — `api/internal/integration/anidb/`

| File | Responsibility |
|---|---|
| `client.go` | HTTP client: download Manami JSON and `anime-titles.xml.gz`. Honors AniDB's ≥24h minimum refresh interval via persisted timestamp. |
| `mapping.go` | Loads Manami JSON into memory; exposes `Resolve(source Source, id int64) (IDSet, bool)` returning all known cross-site IDs for a given seed ID. |
| `titles.go` | Loads `anime-titles.xml`; exposes `Search(query string, year int) ([]Candidate, error)`. Normalizes (lowercase / NFKC / strip punctuation) and indexes prefix + exact buckets. |
| `refresh.go` | Coordinates scheduled refresh — download → verify → atomic rename → swap in-memory indexes under an `RWMutex`. |
| `service.go` | Thin facade injected into matcher + handlers; hides loading state (indexes may be empty on cold start). |

### Data files

Stored under `{data_dir}/anidb/`:

- `manami.json`
- `titles.xml`
- `last-fetch.json` — `{ "manami": RFC3339, "titles": RFC3339 }` to enforce rate limit across restarts.

### Scheduler job

Add one entry to `worker.Scheduler.Start()` in `api/internal/worker/worker.go`:

- `anidb_refresh_job` — runs every 24 hours.
- On first boot if `last-fetch.json` is missing or older than 24h, run immediately in a goroutine (non-blocking).
- Failures log `warn` and leave any existing cache in place. The next tick retries.
- Successful refresh broadcasts a WebSocket event `anidb:refreshed` so the frontend can revalidate dependent queries if needed.

### Matcher changes — `api/internal/matcher/matcher.go`

1. **ID enrichment hook.** After any pass writes or updates an `anime` row, call `anidb.EnrichIDs(ctx, anime)`. The helper:
   - Reads every non-NULL external ID on the row.
   - Calls `mapping.Resolve()` for each source in priority order: `bangumi → anilist → mal → tmdb → anidb`.
   - Fills only columns that are still NULL. Never overwrites existing values (even if Manami disagrees — log `info` on conflict).
   - Writes back via a single `UPDATE ... WHERE id = ? AND <col> IS NULL` per field.
2. **New Pass 4 — AniDB titles fallback.** Runs only if Pass 0–3 leave the file unmatched.
   - `fileparse.Parse(filename)` → `{title, year, episode}` (existing parser).
   - `titles.Search(title, year)` → top candidate.
   - Accept only if `top.score − second.score ≥ 5 %` of `top.score`; otherwise skip (ambiguous).
   - Accept only if `top.score ≥ threshold` (tune during implementation; start at 0.75).
   - If accepted: record `anidb_id`, then `mapping.Resolve("anidb", id)` to derive `bangumi_id` / `tmdb_id`, then **re-run Pass 2 / Pass 3 starting from those IDs** to pull proper episode metadata. If that yields an episode match, the file is matched; otherwise the anime is linked but the file remains `unmatched` pending manual episode pick.

### Database migration

`api/migrations/000xxx_add_anidb_id.up.sql`:

```sql
ALTER TABLE anime ADD COLUMN anidb_id INTEGER;
CREATE UNIQUE INDEX idx_anime_anidb_id ON anime(anidb_id) WHERE anidb_id IS NOT NULL;
```

Corresponding `.down.sql` drops the index and column. Regenerate sqlc queries for any `SELECT anime.*` sites (verify after generation — no query needs to filter on `anidb_id` in Phase 1).

### Frontend

- `web/src/pages/AnimeDetailPage.tsx` — add an AniDB icon button linking to `https://anidb.net/anime/{anidb_id}`, styled identically to the existing Bangumi / AniList external links. Hidden when `anidb_id` is null.
- No new frontend API calls or stores. The existing anime detail query already returns all external IDs.

## Data Flow

### Refresh

```
tick (24h)
  → client.DownloadManami() → verify SHA or JSON parse → atomic rename
  → client.DownloadTitles()  → gunzip → verify root element → atomic rename
  → service.ReloadIndexes() under RWMutex write
  → ws.Broadcast("anidb:refreshed")
  → persist last-fetch.json
```

### ID enrichment (after any pass)

```
matcher writes/updates anime row (any external ID)
  → defer anidb.EnrichIDs(ctx, anime)
  → for src in [bangumi, anilist, mal, tmdb, anidb]:
      if anime.<src>_id != NULL:
        IDSet := mapping.Resolve(src, id)
        UPDATE anime SET <col> = IDSet.<col> WHERE id = ? AND <col> IS NULL
```

### Fallback Pass 4

```
file still unmatched after Pass 0–3
  → parsed := fileparse.Parse(filename)
  → candidates := titles.Search(parsed.title, parsed.year)
  → pick top if score ≥ 0.75 and top.score − second.score ≥ 0.05 * top.score
  → write anime.anidb_id
  → IDSet := mapping.Resolve("anidb", anidb_id)
  → re-run Pass 2 (Bangumi by ID) / Pass 3 (TMDB by ID) using IDSet
  → if episode resolved, file matched; else anime linked, file unmatched
```

## Edge cases

| Case | Behavior |
|---|---|
| Manami / AniDB download fails | Keep existing cache; log `warn`; retry next tick. |
| Cold start with no cache | Enrichment and Pass 4 become no-ops; log `info` once. No blocking. |
| Manami maps an ID that differs from the existing row (e.g. `bangumi_id` mismatch) | DB value wins. Log `info` with both values; never overwrite. |
| Multiple titles with near-equal scores | Skip; keep file unmatched. |
| User manually edits `anidb_id` via existing UI | Treat as authoritative; future enrichment still fills other NULL columns but never overwrites. |
| Rate limit on AniDB titles endpoint | Enforced via persisted `last-fetch.json`; refresh path refuses to download if < 24h since last success. |
| `anime-titles.xml` size / RAM | File is ~5 MB gzipped, ~50 MB in-memory indexed. Build once on load; swap under `RWMutex` to avoid mid-search churn. |
| Concurrent scan during refresh | `RWMutex` read during searches; swap happens atomically between searches. |
| Two files in one scan both resolving to the same new anime | Enrichment is idempotent; DB UNIQUE index on `anidb_id` guards against duplicate rows. |

## Testing

- `anidb/mapping_test.go` — fixtures covering each source type and missing-ID combinations.
- `anidb/titles_test.go` — fuzzy search cases: casing, punctuation, romaji vs kanji vs Chinese, year disambiguation.
- `anidb/refresh_test.go` — `httptest` server; verify rate-limit respected, atomic rename, index swap.
- `matcher_test.go` — new cases:
  - Pass 4 picks a candidate and triggers Pass 2 rerun.
  - Pass 4 skips on ambiguous candidates.
  - Enrichment fills NULL columns but never overwrites.
  - Enrichment no-ops when indexes are unloaded.

## Rollout

1. Ship migration + empty package + scheduler job (feature effectively dormant until first successful download).
2. Verify production first refresh; inspect cached file sizes.
3. Enable enrichment hook.
4. Enable Pass 4 once enrichment is observed working.

Each stage is independently revertable.

## Open questions

- Threshold (0.75) for Pass 4 acceptance is a starting guess; tune with real unmatched samples once running.
- Whether to expose a manual "Refresh AniDB data" button in settings (probably yes, but not required for Phase 1).
