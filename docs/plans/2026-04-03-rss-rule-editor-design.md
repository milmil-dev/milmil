# RSS Rule Editor & Preview — Design Document

**Date:** 2026-04-03
**Status:** Approved
**Goal:** Enhanced RSS rule management with a rule editor modal and live preview panel, inspired by DanDanPlay + Seanime.

## Problem

Current subscribe flow is one-click with no way to tune filters after creation. Users can't preview what a rule matches, can't set episode ranges, can't add multiple subgroups, and can't see if items are already downloaded.

## User Flow

```
Search → Subscribe (quick, creates rule with defaults)
                ↓
    Subscription card → Click → Rule Editor Modal (tune details)
                                    ↓
                              Preview panel (see what matches)
```

Subscribe is the entry point (simple). Rule Editor is for refining an existing subscription.

## Rule Editor Modal

Opens when clicking a subscription card.

### Header
- Anime cover + title + status badge (airing/completed)
- Enabled toggle (top right)

### Form Sections

| Section | Fields |
|---|---|
| **Destination** | Library selector dropdown + auto-derived save path (read-only) |
| **Title** | Match mode: "Fuzzy" (default, parsed comparison) / "Exact" (case-insensitive contains). Comparison title input field. |
| **Episodes** | "All" / "New only" (skip already downloaded) / "Select range" (e.g. 1-12) |
| **Release Groups** | Multi-tag input — add multiple subgroups with (+), empty = accept all |
| **Resolution** | Chips: All / 1080p / 720p / 4K |
| **RSS Source** | Read-only RSS feed URL with refresh button |

### Footer
- Save / Cancel buttons

## Preview Panel

Below the form, collapsible. Auto-refreshes on filter change (debounced 500ms).

### Preview Header
- "Preview" label with expand/collapse
- Checkbox: "Hide already downloaded" (default checked)
- Item count: "X items matched"

### Preview Table Columns

| Column | Description |
|---|---|
| Title | Full torrent title, truncated |
| EP | Parsed episode number |
| Subgroup | Parsed from `[SubGroup]` prefix |
| Size | From RSS feed |
| Date | Publish date, relative |
| Status | Checkmark icon if already downloaded |

### Behavior
- Fetches live from RSS feed, applies filters client-side
- New (not yet downloaded) items highlighted subtly
- Server provides `already_downloaded` flag per item

## API Changes

### New: RSS Feed Preview

```
GET /api/v1/rss-feeds/:id/preview?rule_id=:id
```

Response:
```json
{
  "items": [
    {
      "title": "[黒ネズミたち] Youzitsu 4th Season - 04 ...",
      "link": "https://mikanani.me/Download/...",
      "episode": "04",
      "subgroup": "黒ネズミたち",
      "size": "227.3 MB",
      "publish_date": "2026-04-01T21:00:00Z",
      "already_downloaded": false
    }
  ],
  "total": 12,
  "matched": 4
}
```

Server logic: fetch RSS feed → apply filter_regex + resolution + subgroup filters → check each URL against downloads table for dedup.

### Modified: Update Download Rule

```
PUT /api/v1/download-rules/:id
```

New fields in payload:
- `match_mode`: `"fuzzy"` | `"exact"` (default fuzzy)
- `episode_filter`: `"all"` | `"new"` | `"range"`
- `episode_range`: `"1-12"` (only when filter=range)
- `subgroup_filter`: comma-separated string supporting multiple groups (backward compatible)

## Database Migration

Add columns to `download_rules` table:

```sql
ALTER TABLE download_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'fuzzy';
ALTER TABLE download_rules ADD COLUMN episode_filter TEXT NOT NULL DEFAULT 'all';
ALTER TABLE download_rules ADD COLUMN episode_range TEXT NOT NULL DEFAULT '';
```

`subgroup_filter` remains TEXT, stores comma-separated values for backward compatibility.

## Frontend Components

| Component | Location |
|---|---|
| `RuleEditorModal` | New component, opened from subscription card click |
| Preview table | Inside RuleEditorModal, below form |
| Multi-tag input | For release groups field |
| Resolution chips | Toggle group for resolution selection |

## Key Design Decisions

- Modal (not drawer) — form-heavy interaction benefits from focused editing
- Preview is part of the modal (not a separate view) — immediate feedback loop
- Subscribe stays simple — rule editor is optional refinement
- Filters applied client-side for instant preview, server only provides RSS items + dedup check
- Backward compatible DB changes (new columns with defaults)
