# Manage Tab Redesign + Mikan Per-Anime RSS

## Problem

The Manage tab combines subscription management and download monitoring into one flat view, making it confusing. Downloads lack visual context (no anime cover, no ETA). Mikan subscriptions use keyword-based RSS which is less accurate than per-anime feeds.

## Design

### Manage Tab: 3 Sub-tabs

**Subscriptions | Downloads (N) | Completed (N)**

Sub-tab badges show active counts. URL paste form moves to Downloads sub-tab.

### Subscription Cards

Visual cards with anime poster:
- Anime cover thumbnail (48x68)
- Title + enabled status (green/gray dot)
- Source badge, resolution, subgroup filter chips
- Interval + last match timestamp
- Episode progress: "Downloaded: 8/28 episodes" (from Bangumi metadata episode_count)
- Expandable: last 3 downloads inline
- Actions: refresh, delete
- "No subscriptions" CTA to Search tab (already built)

### Downloads Sub-tab

**Global summary bar** (sticky):
- "N downloading - X MB/s - ~Y min left" + Pause All / Resume All button

**Download cards** with anime context:
- Anime cover thumbnail (40px, from subscription's bangumi_id)
- Torrent title (primary) + anime name (secondary, muted)
- Thin progress bar with percentage
- Size progress + speed + ETA in one line
- Status badge: green=active, yellow=paused/waiting, red=error, blue=complete
- Pause/Resume + Delete actions (text labels, appear on hover on desktop)
- Pulsing progress bar for waiting/connecting state (no total_bytes yet)
- Sorted: active first, waiting, paused

### Completed Sub-tab

- Same card layout, no progress bar
- Shows completion date + total size
- "Clear All" button at top
- Sorted by completion date descending

### Mikan Per-Anime RSS

Backend enhancement in `handleSubscribe` when `source=mikan`:
1. Search Mikan site for anime by title
2. Extract Mikan's internal bangumiId from search results
3. Build per-anime RSS URL: `https://mikanani.me/RSS/Bangumi?bangumiId={mikanId}`
4. If subgroup filter specified, append `&subgroupid={id}`
5. Fallback: if Mikan ID not found, use keyword search URL (current behavior)

New helpers in `torrent/mikan.go`:
- `SearchAnime(ctx, title) -> []MikanAnime` — search Mikan for anime entries
- `GetSubgroups(ctx, mikanBangumiId) -> []MikanSubgroup` — list subgroups for an anime

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Manage tab structure | 3 sub-tabs | Separates subscription management from download monitoring |
| Subscription card style | Visual with anime cover | Differentiates from generic RSS manager |
| Download card info | Medium detail | Cover + title + progress + speed + ETA at a glance |
| Global summary bar | Yes | Single-glance overall download state |
| Mikan RSS strategy | Per-anime feed with keyword fallback | Accuracy improvement without breaking fallback |
| Completed tab | Separate sub-tab | Clean separation of active vs history |

## UI Patterns (from Dribbble research)

- Thin progress bars (2-4px) with accent color
- Color-coded status badges (pills)
- Progressive disclosure (expand for details)
- Hover-revealed actions on desktop
- Anime cover thumbnails for visual identification
- Global bandwidth summary in sticky header
