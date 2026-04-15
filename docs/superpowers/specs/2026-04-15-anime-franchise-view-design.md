# Anime Franchise View — Design Spec

## Problem

The anime detail page treats each AniList entry as an isolated unit. When viewing a 4th season, users cannot see the full series (S1–S3) or related OVAs/movies because AniList relations are only one level deep. Users need a complete franchise view showing all seasons, OVAs, movies, and specials.

## Solution

Add a backend franchise endpoint that recursively traverses AniList relations to build a complete franchise graph, and update the frontend to display the results in two groups: main series chain and side stories.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Relation types to traverse | PREQUEL, SEQUEL, SIDE_STORY, PARENT | Keeps franchise focused; excludes CHARACTER, SPIN_OFF, ALTERNATIVE, OTHER which pull in unrelated works |
| UI layout | Grouped: main series + side stories | Main series chain is the primary use case; side stories are supplementary |
| Trigger | Independent endpoint (`/anime/:id/franchise`) | Does not block anime detail page load |
| Cache TTL | 30 days | Franchise structure rarely changes |

## Backend

### New Endpoint

```
GET /api/v1/discover/anime/:id/franchise
```

`:id` is a Bangumi ID (consistent with existing discover routes).

### Traversal Algorithm

1. Resolve Bangumi ID → AniList ID (reuse existing `findAniListID`).
2. BFS from the current AniList ID, following only `PREQUEL`, `SEQUEL`, `SIDE_STORY`, `PARENT` edges.
3. For each unvisited node, call `anilist.GetMedia()` to fetch its relations.
4. Deduplicate by AniList ID (visited set).
5. Max depth: 10 levels (safety limit).
6. Rate limit: respect AniList's ~90 req/min limit via a rate limiter (~700ms minimum interval between requests).

### Franchise Graph → Response Mapping

After traversal, the collected nodes are split into two groups:

**Main series (`main_series`):**
- Start from the current node.
- Follow PREQUEL edges backward to find the root (earliest entry).
- Follow SEQUEL edges forward from root to build the ordered chain.
- Sort: chain order (root first, newest last).

**Side stories (`side_stories`):**
- All nodes NOT in the main series chain.
- These are entries reached via SIDE_STORY or PARENT edges, or SIDE_STORY/PARENT edges from main series nodes.
- Sort: by `air_date` ascending.

### Response Schema

```json
{
  "main_series": [
    {
      "anilist_id": 100,
      "bangumi_id": 200,
      "title": "Anime Title S1",
      "title_original": "アニメタイトル",
      "cover_image": "https://...",
      "media_type": "TV",
      "air_date": "2020-01",
      "episode_count": 12,
      "score": 8.1
    }
  ],
  "side_stories": [
    {
      "anilist_id": 101,
      "bangumi_id": 201,
      "title": "Anime OVA",
      "title_original": "アニメOVA",
      "cover_image": "https://...",
      "media_type": "OVA",
      "air_date": "2020-07",
      "episode_count": 2,
      "score": 7.5,
      "relation_type": "SIDE_STORY"
    }
  ]
}
```

Each entry is an `AnimeSummary`-like struct with `relation_type` added for side stories.

### Caching

- Key: `meta:franchise:al:<rootAniListID>` where root is the first node in the main series chain.
- TTL: 30 days.
- On cache hit from any node in the franchise, the response is the same (all nodes resolve to the same root).
- Implementation: after full BFS traversal, compute root (first node in main series chain). Cache the result keyed by root AniList ID. Additionally, store a mapping key `meta:franchise:ref:<anilistID>` → `<rootAniListID>` for every node in the franchise (same 30-day TTL). On subsequent requests for any node, look up the ref key first to find the root, then fetch the cached franchise result directly — no API calls needed.

### Rate Limiter

Add a rate limiter to the AniList client:
- Use `golang.org/x/time/rate` with `rate.Every(700 * time.Millisecond)` and burst of 1.
- Applied per-process (single limiter instance on the `graphqlClient`).
- All `GetMedia` calls go through this limiter, not just franchise traversal.
- This protects against rate limiting across all AniList API usage.

### New Code Locations

| File | Change |
|---|---|
| `api/internal/integration/anilist/client.go` | Add `rate.Limiter` field to `graphqlClient`, apply in `query()` |
| `api/internal/metadata/types.go` | Add `FranchiseResult` struct |
| `api/internal/metadata/franchise.go` | New file: `GetFranchise()` method on `Service` — BFS traversal, caching, response mapping |
| `api/internal/api/discover_handler.go` | Add `handleAnimeFranchise` handler |
| `api/internal/api/router.go` | Register `GET /anime/:id/franchise` route |

## Frontend

### Season Tabs Upgrade (top of detail page)

Current `buildSeasonChain()` uses one-level PREQUEL/SEQUEL from `anime.relations`. Replace with:

- Call `GET /api/v1/discover/anime/:id/franchise` via TanStack Query.
- Use `main_series` array to render season tabs (S1, S2, S3...).
- The current entry is highlighted.
- Skeleton loader while franchise loads; season tabs appear when ready.
- If franchise request fails or returns empty, fall back to current `buildSeasonChain` behavior.

### Side Stories Section (bottom of detail page)

- New section titled "番外篇 / 劇場版" (i18n: `anime.sideStories`).
- Renders `side_stories` array using existing `MediaRail` + `AnimeCard`.
- Each card shows `media_type` label below (OVA / Movie / Special) instead of relation_type.
- Only shown when `side_stories` is non-empty.

### Relations Rail Update

- The existing "Related" relations rail is replaced by the franchise-powered sections above.
- If franchise data is unavailable (error/loading), fall back to existing `anime.relations` rail.

### New Code Locations

| File | Change |
|---|---|
| `web/src/lib/api/discover.ts` | Add `FranchiseResult` type and `discoverApi.franchise(id)` function |
| `web/src/pages/AnimeDetailPage.tsx` | Replace `buildSeasonChain` with franchise query; add side stories section; update relations rail fallback |

## Edge Cases

- **Single-season anime with no relations:** Franchise endpoint returns `main_series: [self]`, `side_stories: []`. Frontend hides season tabs (length ≤ 1) and side stories section (empty).
- **Circular relations:** Visited set prevents infinite loops.
- **AniList rate limit hit during traversal:** Return partial results (whatever was collected before the error) with the data cached. Next request after TTL will retry.
- **Missing Bangumi ID for related entries:** Include them with `bangumi_id: 0`. Frontend links to AniList page or hides them.
- **Very large franchises (e.g., Gundam):** Max depth of 10 and the restricted relation types (no CHARACTER/OTHER) keep the graph bounded. Worst case ~20–30 nodes.
