# AniList Fallback for Anime Detail Pages — Design Spec

## Problem

Anime detail pages require a Bangumi ID. When an anime exists on AniList but not on Bangumi (e.g., certain OVAs, specials), milmil cannot show a detail page. This was exposed by the franchise feature where side stories with `bangumi_id: 0` are unclickable.

## Solution

Extend the existing `/anime/:id` route to accept AniList IDs with an `al-` prefix. When the ID has this prefix, the backend constructs the detail page from AniList data alone.

## URL Format

- `/anime/266301` — Bangumi ID (existing behavior)
- `/anime/al-114622` — AniList ID (new fallback)

## Backend

### Handler Change (`discover_handler.go`)

Modify `handleAnimeDetail` to parse the `:id` parameter:
- If `id` starts with `al-`, extract the numeric AniList ID and call `metadata.GetAnimeDetailByAniList(ctx, anilistID)`
- Otherwise, parse as integer and call existing `metadata.GetAnimeDetail(ctx, bangumiID)`

### New Method: `GetAnimeDetailByAniList(ctx, anilistID)` (`service.go`)

1. Check cache: key `meta:anilist:<anilistID>`, TTL 24 hours.
2. Call `anilist.GetMedia(ctx, anilistID)` to fetch full media data (with relations, recommendations, characters, reviews).
3. Build `AnimeDetail` from AniList data:
   - `AnimeSummary` fields via existing `anilistMediaToSummary()`
   - `Synopsis` from `media.Description`
   - `BannerImage` from `media.BannerImage`
   - `TrailerURL` from `media.Trailer`
   - `Popularity` from `media.Popularity`
   - `Rating` from `media.AverageScore` (no Bangumi rating available)
   - `Relations` — same mapping as existing enrichment in `GetAnimeDetail`
   - `Recommendations` — same mapping
   - `Reviews` — same mapping
   - `Characters` — same mapping
   - `Tags` from `media.Genres` (AniList genres as tags, since Bangumi tags aren't available)
4. Cache the result.

### What's NOT Available for AniList-only Pages

- Episodes list (Bangumi-sourced)
- Comments (Bangumi-sourced)
- Torrents (requires Bangumi ID for search)
- Collection/watch status (keyed by Bangumi ID)
- Playable episodes (keyed by Bangumi ID)

These endpoints will return 404 or empty results gracefully — the frontend already handles missing data.

## Frontend

### Route Handling (`AnimeDetailPage.tsx`)

- `useParams` returns `id` as string
- If `id` starts with `al-`, extract the AniList ID number
- Pass the full `id` string (including `al-` prefix) to `discoverApi.detail()`
- Disable queries that require Bangumi ID (episodes, comments, playable-episodes, torrents) when `id` starts with `al-`

### API Types (`discover.ts`)

- `discoverApi.detail(id)` parameter changes from `number` to `number | string`
- `discoverKeys.detail(id)` same change

### Franchise Side Stories Link (`AnimeDetailPage.tsx`)

In the side stories section, when `entry.bangumi_id === 0`:
- Link to `/anime/al-${entry.anilist_id}` instead of `/anime/${entry.bangumi_id}`

### Season Tabs Link

In the franchise season tabs, when `s.bangumi_id === 0`:
- Link to `/anime/al-${s.anilist_id}` (currently renders a non-clickable `<span>`)

## Edge Cases

- **AniList API failure:** Return 502 (same as existing behavior for upstream errors)
- **Invalid AniList ID:** Return 404
- **AniList-only page with no relations:** Show empty relations section (already handled)
- **User tries to add AniList-only anime to collection:** Not supported — collection requires Bangumi ID. Hide collection buttons on AniList-only pages.
