# Download System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full download management with aria2, RSS feed subscriptions, and auto-download rules.

**Architecture:** aria2 JSON-RPC client → download handlers. RSS parser + rule matcher → auto-download flow. Frontend download/RSS pages.

**Tech Stack:** Go (Echo v4, sqlc, `github.com/mmcdole/gofeed`), aria2 JSON-RPC, React 19, TanStack Query

---

## Task 1: sqlc Queries + aria2 Client + RSS Parser

**Create:**
- `api/internal/store/queries/downloads.sql`
- `api/internal/store/queries/rss_feeds.sql`
- `api/internal/store/queries/download_rules.sql`
- `api/internal/integration/aria2/types.go`
- `api/internal/integration/aria2/client.go`
- `api/internal/rss/parser.go`
- `api/internal/rss/matcher.go`

Steps:
1. Create all 3 SQL query files (from spec §7)
2. Run `sqlc generate`
3. `go get github.com/mmcdole/gofeed`
4. Create aria2 client — JSON-RPC over HTTP, methods: AddURI, Pause, Resume, Remove, GetStatus, ListActive, ListWaiting, ListStopped. Use configurable base URL and token.
5. Create RSS parser using gofeed — `ParseFeed(ctx, url) ([]FeedItem, error)`
6. Create rule matcher — `MatchRule(item FeedItem, rule DownloadRule) bool` using `regexp.MatchString`
7. Add `Aria2RPCURL` and `Aria2Secret` to config.go
8. `go build ./...`
9. Commit

---

## Task 2: aria2 Client Tests + RSS Parser Tests

1. aria2 client tests — httptest mock JSON-RPC responses (AddURI success, GetStatus, error)
2. RSS parser test — use a local XML string, verify parsing
3. Rule matcher tests — test regex match, exclude, no match
4. Run tests, commit

---

## Task 3: Download + RSS + Rule API Handlers

**Create:**
- `api/internal/api/download_handler.go`
- `api/internal/api/rss_handler.go`
- `api/internal/api/rule_handler.go`

**Modify:**
- `api/internal/api/router.go` — add all routes + aria2 client to handler

Endpoints from spec §5. The RSS refresh handler includes the auto-download flow:
1. Parse feed
2. For each item, check rules
3. If match + not already downloaded → aria2.AddURI + create download record

Update `NewRouter` signature to accept aria2 client. Update ALL test files.

Run all tests, commit.

---

## Task 4: Frontend — API Client + Downloads Page

**Create:**
- `web/src/lib/api/downloads.ts` — download/rss/rule API client + types + query keys
- `web/src/pages/DownloadsPage.tsx` — download list with progress, add/pause/resume/delete
- `web/src/routes/downloads.tsx`

Steps:
1. Install no new deps (all exist)
2. Create API client with interfaces for Download, RSSFeed, DownloadRule
3. Create DownloadsPage — list downloads with status badges, progress bars, action buttons. Auto-refresh every 5s. "Add Download" input for magnet/URL.
4. Create route file
5. Update sidebar — add Downloads icon (use `Download04Icon` or similar from Hugeicons)
6. Regenerate route tree
7. Typecheck + lint + commit

---

## Task 5: Frontend — RSS Feeds Management Page

**Create:**
- `web/src/pages/RSSPage.tsx`
- `web/src/routes/rss.tsx`

Steps:
1. Create RSSPage — list feeds, add/edit/delete, list rules per feed, add/edit/delete rules, refresh button
2. Create route file
3. Update sidebar — add RSS icon
4. Regenerate route tree
5. Typecheck + lint + commit
