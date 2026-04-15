# Missing Episode Auto-Search

**Date:** 2026-04-15
**Status:** Draft → awaiting user review
**Depends on:** Missing Episode Detection (merged). Existing torrent provider infrastructure and download_rules system.
**Follow-ups:** Per-provider search filters, title alias search (EN/ZH), scheduled re-search of missing episodes.

## Goals

Bridge the gap between "Missing Episode Detection shows ⚠ 3 missing" and "one of these torrent candidates is the right file." Two user flows: manual per-episode search (immediate result, user picks), and per-anime auto-rule (hands-off for ongoing seasons, reuses existing download_rules + RSS refresh job).

### In scope

- New `api/internal/library/searchmissing/` package:
  - `Aggregator.Search(ctx, anime, episodeNumber) ([]Result, error)` fans out to all enabled torrent providers in parallel with a 10-second timeout, aggregates + dedupes + ranks.
  - `Dedupe([]RawResult)` by `info_hash`, fallback `title+size`.
  - `Rank([]Result)` reuses duplicates package's resolution/size/subgroup logic and prepends a seeders-desc tiebreaker (dead torrents sink to the bottom).
- Normalized `TorrentProvider` interface wrapping the existing 6 providers (`Nyaa`, `Mikan`, `DMHY`, `BangumiMoe`, `AcgRip`, `DandanPlay`).
- Three REST endpoints scoped to `/api/v1/anime/:bangumiId/missing`:
  - `POST .../search` body `{episode_number}` → `[]Result` JSON
  - `POST .../download` body `{magnet, title}` → creates `downloads` row via existing `downloader.Manager`
  - `POST .../auto-rule` body `{episode_numbers: [3,7,8]}` → creates or merges a `download_rule`
- UI additions:
  - Per-missing-episode "Search" icon in `EpisodeStatusCard`; opens a modal with a results table.
  - "Auto-download missing X episodes" button beside the missing counts.
- ws event `search:progress` to narrate the 10-second fanout (optional; ship without if UI ergonomics survive).

### Out of scope (deferred)

- Custom per-provider filters beyond `{title, episode_number, resolution}`.
- Scheduled periodic re-search of still-missing episodes. Auto-rule already covers the ongoing-series case; one-shot backfill is manual.
- New torrent provider implementations.
- Batch search across multiple episodes simultaneously (Phase A is per-episode).
- Search history / result caching.

## Non-goals

- Replacing `download_rules` — this feature *produces* download rules and individual downloads, nothing more.
- Reimplementing the RSS-refresh scheduler — existing infrastructure picks up new rules naturally.

## Architecture

### New package — `api/internal/library/searchmissing/`

| File | Responsibility |
|---|---|
| `provider.go` | `TorrentProvider` interface, `SearchQuery`, `RawResult` types. Adapters wrapping existing providers live here. |
| `aggregator.go` | `Aggregator.Search(ctx, anime, episode) ([]Result, error)` — parallel fanout + merge. |
| `dedupe.go` | `Dedupe([]RawResult) []RawResult` — info_hash primary, title+size fallback. |
| `rank.go` | `Rank([]Result) []Result` — seeders → resolution → size → subgroup. |
| `result.go` | `Result` struct combining RawResult + parsed filename metadata. |

```go
// provider.go
type TorrentProvider interface {
    Name() string
    Search(ctx context.Context, q SearchQuery) ([]RawResult, error)
}

type SearchQuery struct {
    Title         string
    EpisodeNumber int
    Resolution    int // optional filter; 0 = no preference
}

type RawResult struct {
    Title    string
    Magnet   string
    InfoHash string
    Size     int64
    Seeders  int
    Leechers int
    Provider string
    Published time.Time
}

// result.go
type Result struct {
    RawResult
    Parsed    fileparse.ParsedFilename
    RankScore float64
}
```

Adapters wrap each existing provider (`Nyaa`, `Mikan`, etc.) to this interface. Most already have a `Search(query string)` method; adapter translates our `SearchQuery` → provider-native query string (`"{title} {episodeNumber}"` as baseline) and normalizes their result structs into `RawResult`.

### Aggregator

```go
func (a *Aggregator) Search(ctx context.Context, anime store.Anime, episodeNumber int) ([]Result, error) {
    query := SearchQuery{Title: anime.Title, EpisodeNumber: episodeNumber}
    ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
    defer cancel()

    ch := make(chan providerResp, len(a.providers))
    for _, p := range a.providers {
        go func(p TorrentProvider) {
            res, err := p.Search(ctx, query)
            ch <- providerResp{results: res, err: err, provider: p.Name()}
        }(p)
    }

    var all []RawResult
    for i := 0; i < len(a.providers); i++ {
        r := <-ch
        if r.err != nil {
            slog.Warn("search: provider failed", "provider", r.provider, "err", r.err)
            continue
        }
        all = append(all, r.results...)
    }
    deduped := Dedupe(all)
    parsed := make([]Result, len(deduped))
    for i, r := range deduped {
        parsed[i] = Result{RawResult: r, Parsed: fileparse.Parse(r.Title)}
    }
    return Rank(parsed), nil
}
```

### Dedupe

```go
func Dedupe(rs []RawResult) []RawResult {
    byHash := make(map[string]RawResult, len(rs))
    byTitleSize := make(map[string]RawResult, len(rs))
    out := make([]RawResult, 0, len(rs))
    for _, r := range rs {
        if r.InfoHash != "" {
            key := strings.ToLower(r.InfoHash)
            if _, ok := byHash[key]; ok { continue }
            byHash[key] = r
            out = append(out, r)
            continue
        }
        key := normalizeTitle(r.Title) + "|" + strconv.FormatInt(r.Size, 10)
        if _, ok := byTitleSize[key]; ok { continue }
        byTitleSize[key] = r
        out = append(out, r)
    }
    return out
}
```

### Rank

```go
func Rank(results []Result) []Result {
    out := append([]Result(nil), results...)
    sort.SliceStable(out, func(i, j int) bool {
        if (out[i].Seeders == 0) != (out[j].Seeders == 0) {
            return out[i].Seeders > 0 // dead torrents last
        }
        if out[i].Parsed.Resolution != out[j].Parsed.Resolution {
            return out[i].Parsed.Resolution > out[j].Parsed.Resolution
        }
        if out[i].Seeders != out[j].Seeders {
            return out[i].Seeders > out[j].Seeders
        }
        if out[i].Size != out[j].Size {
            return out[i].Size > out[j].Size
        }
        iSub := out[i].Parsed.SubGroup != ""
        jSub := out[j].Parsed.SubGroup != ""
        if iSub != jSub { return iSub }
        return false
    })
    return out
}
```

### Handlers

`api/internal/api/missing_search_handler.go`:

- `handleMissingSearch` — resolve `bangumiId` → `anime`; call `Aggregator.Search(ctx, anime, episodeNumber)`; return JSON `{results: [...]}`.
- `handleMissingDownload` — validate `magnet` non-empty; call `downloader.Manager.Add(magnet)`; `CreateDownload(bangumi_id=anime.BangumiID, magnet_uri=magnet, title=title)`. Return `{download_id}`.
- `handleMissingAutoRule` — query existing `download_rules` for `bangumi_id`; if present, merge `episode_range` (union of old + new, deduped, sorted); else create new rule with `name = <anime.title> - auto`, `bangumi_id`, `episode_range = strings.Join(nums, ",")`, `enabled = 1`, `filter_regex = ""`. Return the rule ID.

Routes under `/api/v1/anime/:bangumiId/missing/...` in the existing authenticated group.

### Frontend

- `web/src/lib/api/missing_search.ts` — typed client for all three endpoints.
- `web/src/components/anime/MissingSearchModal.tsx` — opens when Search icon is clicked on an episode number. Renders results table with columns: resolution, title (truncated), subgroup, size (human), seeders, Download button. Sortable (respects server ranking by default). Empty state: "No results from any provider."
- `web/src/components/anime/MissingActions.tsx` — button block shown when `EpisodeStatusCard` has >0 missing: "Auto-download missing N episodes" + confirm dialog.
- `EpisodeStatusCard.tsx` — inline Search icon beside each episode number in `Missing: ...`.

Use existing Skeleton loaders + white/opacity styling. Confirms for destructive/download actions.

## Data flow

### Manual search → download

```
User clicks Search on episode 5 of anime (bangumi_id=23)
  → POST /api/v1/anime/23/missing/search body {episode_number: 5}
  → handler resolves anime via GetAnimeByBangumiID
  → Aggregator.Search(anime, 5)
    → 6 goroutines query providers with title + episode
    → 10s timeout; log failures, skip
    → dedupe by info_hash or title+size
    → Rank
  → JSON {results: [...]}
  → modal renders ranked table
  → User clicks Download on their pick
  → POST /api/v1/anime/23/missing/download body {magnet, title}
    → downloader.Manager.Add(magnet)
    → q.CreateDownload({bangumi_id: 23, magnet_uri: magnet, title: title, status: "queued"})
  → toast: "Download queued"
```

### Auto-rule

```
User clicks "Auto-download missing 3 episodes" on anime (bangumi_id=23, missing=[3,7,8])
  → POST /api/v1/anime/23/missing/auto-rule body {episode_numbers: [3,7,8]}
  → handler checks ListDownloadRulesByBangumiID(23)
    → if exists: merge episode_range, UpdateDownloadRule
    → else: CreateDownloadRule
  → existing rss_refresh job on next tick (5 min default) matches the rule
  → any RSS item matching bangumi_id + episode_range triggers existing download flow
```

## Edge cases

| Case | Behavior |
|---|---|
| All providers fail / timeout | Return empty list; UI shows "No results" + per-provider failure list in debug toast. |
| Info hash missing on some results | Dedupe falls back to normalized `title + size`. |
| Same anime name, different language | Phase A: use `anime.Title` only. Titles in EN/ZH land in a follow-up. |
| Magnet URI malformed | 400 with error from `downloader.Manager`. |
| User double-clicks Download | aria2/qbt dedupe by info hash; milmil creates second `downloads` row (small cost; consider UNIQUE constraint in follow-up). |
| Auto-rule exists for this bangumi | Merge episode_range via union+sort. Name stays as-is. |
| Rule matches episode not in list (e.g., aired ep 4 between creations) | Acceptable — user can edit rule manually. |
| Episode number > total_episodes | Handler returns 400 "episode beyond total". |
| Provider returns 50+ results | Keep top 50 per provider BEFORE dedupe. |
| No tmdb_id / metadata | Search still works (uses title only). |
| User on LAN without internet | All providers fail; list empty. Expected. |

## Testing

### Unit
- `aggregator_test.go`: 3 stub providers, 1 failing → returns other 2's results. 1 provider blocking 20s → timeout kicks in.
- `dedupe_test.go`: same info_hash across providers → one. Missing hash → dedup by title+size.
- `rank_test.go`: seeders=0 last, resolution desc, seeders tiebreak, size tiebreak, subgroup tiebreak, StableSort behavior.

### Handler
- `missing_search_handler_test.go`: happy-path search returns ranked JSON.
- Auto-rule: fresh create + existing merge.
- Bad bangumi_id → 404.
- Episode > total → 400.

### Frontend
- Typecheck + manual: search modal opens, table renders, Download button triggers download.

## Rollout

1. Package + aggregator + rank + dedupe — unit tests green.
2. Adapters for each of 6 existing providers.
3. Handlers + routes.
4. Frontend modal + auto-rule button.
5. ws `search:progress` event (if time allows).

Each stage revertable.

## Open questions

- **Title aliases for search** — anime with multiple names often has better hit rates on Japanese-name providers. Phase B: query provider-appropriate title (EN for Nyaa, ZH for DMHY/Mikan).
- **Cached search history** — would speed up re-search but adds DB state. Skip for Phase A.
- **Provider priority / weights** — user may prefer Nyaa results over BangumiMoe. Out of scope; ranking by seeders usually surfaces the right pick.
