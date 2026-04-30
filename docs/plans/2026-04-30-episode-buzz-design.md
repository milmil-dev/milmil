# Episode Buzz and Watch Radar Design

**Date:** 2026-04-30
**Status:** Approved
**Goal:** Make milmil feel like a daily anime radar: users open the app to know what to watch next, while library maintenance actions stay one click away.

## Product Direction

milmil should prioritize "what should I watch today?" while still using its library-management strengths. The home experience should combine airing metadata, local library state, watch progress, missing episodes, and external buzz into a single decision surface.

This is different from a generic AniList or MAL frontend. milmil knows whether an episode is locally playable, missing, downloading, duplicated, or ready for upgrade. That context should turn public trend data into personal recommendations.

## Core Modules

### Today

Today is the first daily-use module. It shows current-season anime airing today, yesterday, and tomorrow, with local state attached to each row.

Each item should answer:

- Is this episode already playable?
- Is it missing from the library?
- Is it downloading?
- Is there a search/download action available?
- Did the user recently watch the previous episode?
- Is the episode gaining buzz?

### Watch Next

Watch Next is a personalized continuation queue, richer than ordinary recent progress.

Ranking should favor:

- Anime with incomplete watch progress.
- The next episode after the user's last watched episode.
- Episodes already available locally.
- Recently aired episodes.
- Episodes with high buzz.
- Series marked as watching or recently active.

Unavailable or low-confidence items can still appear, but they should be labeled clearly and paired with a useful action such as search missing episode.

### Episode Buzz

Episode Buzz is the AnimeBuzzDaily-like surface. The first version should be honest about the available data and call the metric "buzz" instead of "score".

Inputs:

- Bangumi episode comment count as the reliable public episode-level signal.
- Bangumi or AniList anime score as background quality context.
- Air date recency so newly aired episodes can surface while they are active.
- Optional local-library boost when the user has the anime in collection.
- Future AniDB episode rating and vote count when the AniDB metadata client is expanded.

Display should keep the formula hidden and show readable evidence:

```text
Buzz 92 · AniDB 8.7 / 41 votes · 討論 128
```

For the MVP, before AniDB episode ratings exist, use:

```text
Buzz 76 · 討論 128 · 作品 8.4
```

### Library Nudges

Library maintenance should appear as small, contextual actions rather than a heavy dashboard.

Examples:

- Missing episode: `缺 EP07` with search action.
- Duplicate episode: `3 versions` with choose preferred action.
- Low quality: `2160p available` with upgrade action.
- Unmatched file: quick match action.
- No subtitle or danmaku source: source search action.

## Information Architecture

The home page should move toward this order:

1. Today
2. Watch Next
3. Episode Buzz
4. Needs Attention
5. Season Radar

The existing hero and trending grid can remain, but they should no longer dominate the daily-use path once the radar modules are present.

## Data Design

### Episode Buzz Response

```json
{
  "items": [
    {
      "bangumi_id": 425848,
      "bangumi_episode_id": 123456,
      "episode_number": 7,
      "title": "Episode title",
      "anime_title": "Anime title",
      "cover_image": "https://...",
      "air_date": "2026-04-29",
      "anime_score": 8.4,
      "comment_count": 128,
      "buzz_score": 76,
      "source": "bangumi",
      "local_state": {
        "in_collection": true,
        "playable": false,
        "missing": true
      }
    }
  ],
  "generated_at": "2026-04-30T00:00:00Z"
}
```

### Buzz Formula

The first formula should be simple and explainable:

```text
buzz_score =
  normalized_comment_count * 0.65
  + anime_score_normalized * 0.20
  + recency_score * 0.15
```

Later, once AniDB episode ratings are available:

```text
buzz_score =
  anidb_rating_confidence * 0.45
  + normalized_comment_count * 0.35
  + recency_score * 0.15
  + local_relevance * 0.05
```

Use vote confidence so an episode with 9.8 from 3 votes does not outrank an 8.7 episode with 300 votes.

## Backend Architecture

Add a metadata-level Episode Buzz service method that:

1. Determines the requested season or defaults to the current anime season.
2. Uses existing browse metadata to get releasing TV anime.
3. Fetches Bangumi episodes for a bounded number of anime.
4. Filters to aired main episodes.
5. Computes buzz score.
6. Caches the result for a short TTL.

The public API should be:

```text
GET /api/v1/discover/episode-buzz?year=2026&season=SPRING&limit=20
```

Optional parameters:

- `year`
- `season`
- `period=today|week|season`
- `limit`

## Frontend Architecture

Add API wrappers under `web/src/lib/api/discover.ts`, then introduce home modules as separate components:

- `TodayRail`
- `WatchNextRail`
- `EpisodeBuzzRail`
- `LibraryNudges`

The MVP can render these inside `HomePage.tsx` using existing TanStack Query patterns and current card/row visual language.

## Error Handling

- If Episode Buzz fails, the home page still renders calendar and continue watching.
- If a specific anime's episodes fail to load, skip it and continue.
- If no buzz data exists, show the existing today's schedule and trending modules.
- If local state cannot be resolved, show the public buzz item without library badges.

## Testing

Backend:

- Unit-test Bangumi episode comment parsing.
- Unit-test buzz scoring.
- Handler-test `/discover/episode-buzz` with stub metadata.
- Cache-key test for year/season/period/limit.

Frontend:

- API wrapper test for query serialization.
- Component tests for buzz items, empty state, and missing/playable badges.
- Home page smoke test with mocked buzz response.

## Phasing

### Phase 1: Episode Buzz MVP

Use Bangumi episode comment count, anime score, and recency. Add the endpoint and a compact home module.

### Phase 2: Watch Radar

Merge progress, collection, and missing episode state into Watch Next and Today.

### Phase 3: AniDB Episode Rating

Expand the existing AniDB integration into a cached metadata/rating client and blend true episode ratings into the buzz formula.

### Phase 4: Library Nudges

Surface missing, duplicate, quality, subtitle, and matching actions inline on home cards.
