# Completed Tab Redesign — Design Spec

## Overview

Redesign the completed downloads tab from a flat, sparse list into a polished, feature-rich view with two modes: grouped by anime series (default) and flat chronological timeline.

## Current State

- Flat list of completed downloads, each row shows: tiny cover placeholder, parsed title, episode badge, subgroup, file size, date
- Only actions: delete individual item, clear all
- No grouping, no batch operations, no seed status, no file navigation

## Design

### Layout Modes

**Grouped View (default):**
- Downloads grouped by anime series (matched by `bangumi_id`, falling back to parsed title similarity)
- Each group is a bordered card with collapse/expand
- Collapsed state: anime cover (52×72, linked to anime detail page) + series title + subgroup + total size + latest date + episode count pills + seed status indicator + expand chevron
- Expanded state: adds episode list rows + group action bar

**Timeline View (toggle):**
- Flat chronological list, same compact row style
- Date section headers: "Today", "Yesterday", "This Week", "Earlier"
- Each row: small cover (36×48) + title + EP badge + seed status + subgroup/size/time
- Actions appear on hover (same as episode-level actions in grouped view)

### Toolbar

Located above the list, shared by both views:
- **Left side**: Grouped/Timeline segmented toggle + summary stats text ("X series · Y episodes · Z GB")
- **Right side**: "Select All" button + "Clear All" button (red, destructive)
- Stats text updates to reflect current view ("Y episodes · Z GB" in timeline mode)

### Seed Status Indicator

Each group (grouped view) or row (timeline view) shows current torrent seed state:
- **Seeding**: small green dot + "Seeding" label
- **Idle**: grey dot + "Idle" label
- Derived from the download engine status for that torrent

### Per-Episode Actions (on hover)

When hovering an expanded episode row or a timeline row, show icon buttons:
1. **Open folder** — reveals the file in Finder/file explorer
2. **Copy magnet** — copies the magnet link to clipboard
3. **Delete** — removes the download record (with confirmation toast, not modal)

### Group-Level Actions (expanded footer)

When a group is expanded, a footer bar shows:
1. **Open Folder** — opens the series download directory
2. **View Anime** — navigates to `/anime/:id` detail page
3. **Re-download All** — re-queues all episodes in the group
4. **Remove Group** — deletes all download records for this group (red, right-aligned)

### Batch Selection

- "Select All" in toolbar selects all groups/items
- Individual groups can be checked via a checkbox that appears on hover (left of cover)
- Batch actions: delete selected

### Empty State

When no completed downloads exist:
- Centered message with subdued text: "No completed downloads"
- No action buttons shown

### Skeleton Loading

While data loads, show 3 skeleton cards matching the collapsed group layout dimensions.

### Data Shape

The existing download data already has: `id`, `gid`, `name`, `status`, `total_bytes`, `completed_bytes`, `speed_bytes`, `created_at`, `rule_id`, `rule_name`, `bangumi_id`.

Grouping logic:
- Primary: group by `bangumi_id` when present
- Fallback: group by `rule_id` (same subscription rule = same series)
- Last resort: each download is its own group

New data needed from backend:
- **Seed status**: whether a completed torrent is still seeding (available from the download engine)
- **File path**: the local file path for "open folder" functionality (may need a new API field or endpoint)
- **Magnet link**: for "copy magnet" action (may need to be stored or re-derived)

### Animation

- Groups animate in with `motion` (opacity + y offset, staggered)
- Expand/collapse uses `AnimatePresence` with height animation
- Delete uses exit animation (opacity + scale)
- View toggle crossfades between grouped and timeline

## Scope

This spec covers only the `CompletedSubTab` component in `DownloadsPage.tsx`. No backend changes are in scope — if seed status/file path/magnet data isn't available yet, those UI elements render as hidden or disabled gracefully.

## Out of Scope

- Search/filter within completed downloads
- Export download history
- Mobile-specific layout (reuses same responsive patterns as rest of app)
