# Custom Rules (Without RSS) — Design TODO

**Status:** Not yet designed
**Priority:** Next feature after RSS rule editor

## Concept

Two rule systems:
1. **RSS Rules** (current) — subscribes to an RSS feed URL, polls for new items, matches with filters
2. **Custom Rules** (new) — no RSS URL, periodically searches torrent providers (Nyaa/Mikan/DMHY) with a keyword query, matches with filters

## Key Differences

| | RSS Rule | Custom Rule |
|---|---|---|
| Source | RSS feed URL | Torrent search query |
| Trigger | RSS poll (every 5 min) | Scheduled search (configurable interval) |
| Matching | Filter regex on RSS item titles | Filter regex on search result titles |
| Use case | Subscribe to specific anime/bangumi | Broad keyword monitoring |

## Backend Changes Needed

- `download_rules.rss_feed_id` needs to be nullable (custom rules have no feed)
- New `rule_type` column: `'rss'` | `'custom'`
- New `search_query` column for custom rules
- New `search_source` column: `'nyaa'` | `'mikan'` | `'dmhy'` | `'all'`
- New worker job: `CustomRuleSearchJob` that periodically runs torrent searches
- Update rule handler to support creating rules without feed

## Frontend Changes Needed

- Separate "New Custom Rule" modal with: search query, source, filters
- Custom rules shown with different icon/badge in subscriptions tab

## To Design

Run brainstorming skill to fully design this feature before implementation.
