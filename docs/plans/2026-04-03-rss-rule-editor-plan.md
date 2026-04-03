# RSS Rule Editor & Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Rule Editor modal with live preview panel to the Subscriptions tab, allowing users to tune filters, episode ranges, release groups, and see matched RSS items in real-time.

**Architecture:** New DB columns for match_mode/episode_filter/episode_range on download_rules table. New API endpoint for RSS feed preview with dedup check. Frontend modal component with form sections + collapsible preview table.

**Tech Stack:** Go (API), SQLite (DB), React 19, TanStack Form, Tailwind CSS, Motion

**Design doc:** `docs/plans/2026-04-03-rss-rule-editor-design.md`

---

### Task 1: Database migration — add new columns to download_rules

**Files:**
- Create: `api/migrations/000028_rule_editor_fields.up.sql`
- Create: `api/migrations/000028_rule_editor_fields.down.sql`

**Step 1: Create up migration**

```sql
ALTER TABLE download_rules ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'fuzzy';
ALTER TABLE download_rules ADD COLUMN episode_filter TEXT NOT NULL DEFAULT 'all';
ALTER TABLE download_rules ADD COLUMN episode_range TEXT NOT NULL DEFAULT '';
```

**Step 2: Create down migration**

```sql
-- SQLite doesn't support DROP COLUMN easily, so these are best-effort
-- In practice, rollback would require table recreation
```

**Step 3: Verify migration number**

Check `api/migrations/` for the latest migration number and use the next one.

**Step 4: Commit**

```bash
git add api/migrations/
git commit -m "feat(db): add match_mode, episode_filter, episode_range to download_rules"
```

---

### Task 2: Update sqlc queries and regenerate

**Files:**
- Modify: `api/internal/store/queries/download_rules.sql`
- Regenerate: `api/internal/store/download_rules.sql.go` and `api/internal/store/models.go`

**Step 1: Update CreateDownloadRule query**

Add `match_mode`, `episode_filter`, `episode_range` to the INSERT statement:

```sql
-- name: CreateDownloadRule :one
INSERT INTO download_rules (id, name, enabled, rss_feed_id, filter_regex, exclude_regex, save_dir, episode_offset, resolution_filter, subgroup_filter, min_seeders, library_id, bangumi_id, match_mode, episode_filter, episode_range, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
RETURNING *;
```

**Step 2: Update UpdateDownloadRule query**

Add new columns to the SET clause:

```sql
-- name: UpdateDownloadRule :exec
UPDATE download_rules SET name = ?, enabled = ?, rss_feed_id = ?, filter_regex = ?, exclude_regex = ?, save_dir = ?, episode_offset = ?, resolution_filter = ?, subgroup_filter = ?, min_seeders = ?, library_id = ?, bangumi_id = ?, match_mode = ?, episode_filter = ?, episode_range = ? WHERE id = ?;
```

**Step 3: Regenerate sqlc**

```bash
cd api && go generate ./...
```

Or if using sqlc directly:
```bash
cd api && sqlc generate
```

**Step 4: Verify build**

```bash
cd api && go build ./...
```

**Step 5: Commit**

```bash
git add api/internal/store/
git commit -m "feat(store): add rule editor fields to sqlc queries"
```

---

### Task 3: Update rule handler — accept new fields

**Files:**
- Modify: `api/internal/api/rule_handler.go`

**Step 1: Update `downloadRuleResponse` struct (line 44)**

Add fields:
```go
MatchMode     string `json:"match_mode"`
EpisodeFilter string `json:"episode_filter"`
EpisodeRange  string `json:"episode_range"`
```

**Step 2: Update `toDownloadRuleResponse` conversion**

Map the new fields from `store.DownloadRule` to response.

**Step 3: Update `handleCreateDownloadRule` (line 101)**

Add new fields to the request binding and `CreateDownloadRuleParams`. Default `match_mode` to `"fuzzy"`, `episode_filter` to `"all"`, `episode_range` to `""`.

**Step 4: Update `handleUpdateDownloadRule` (line 134)**

Add new fields to the request binding and `UpdateDownloadRuleParams`.

**Step 5: Verify build**

```bash
cd api && go build ./...
```

**Step 6: Commit**

```bash
git add api/internal/api/rule_handler.go
git commit -m "feat(api): accept match_mode, episode_filter, episode_range in rule endpoints"
```

---

### Task 4: Update subscribe handler — pass new fields

**Files:**
- Modify: `api/internal/api/subscribe_handler.go`

**Step 1: Update CreateDownloadRuleParams in handleSubscribe (line 157)**

Add defaults for new fields:
```go
MatchMode:     "fuzzy",
EpisodeFilter: "all",
EpisodeRange:  "",
```

**Step 2: Update refreshNewSubscription to respect episode_filter**

In the item matching loop (line 198-216), add episode filtering:
- If `episode_filter == "new"`: parse episode number from title, skip if episode already exists in downloads for this rule
- If `episode_filter == "range"`: parse episode number, check if it falls within the specified range

**Step 3: Verify build**

```bash
cd api && go build ./...
```

**Step 4: Commit**

```bash
git add api/internal/api/subscribe_handler.go
git commit -m "feat(api): subscribe handler uses new rule fields"
```

---

### Task 5: Implement RSS feed preview endpoint

**Files:**
- Modify: `api/internal/api/rss_handler.go`
- Modify: `api/internal/api/router.go`

**Step 1: Add preview handler**

In `rss_handler.go`, add:

```go
type previewItem struct {
    Title             string `json:"title"`
    Link              string `json:"link"`
    Episode           string `json:"episode"`
    Subgroup          string `json:"subgroup"`
    Size              string `json:"size"`
    PublishDate       string `json:"publish_date"`
    AlreadyDownloaded bool   `json:"already_downloaded"`
}

type previewResponse struct {
    Items   []previewItem `json:"items"`
    Total   int           `json:"total"`
    Matched int           `json:"matched"`
}

func (h *handler) handlePreviewRSSFeed(c echo.Context) error {
    feedID := c.Param("id")
    ruleID := c.QueryParam("rule_id")
    ctx := c.Request().Context()

    // Get feed
    feed, err := h.queries.GetRSSFeed(ctx, feedID)
    if err != nil {
        return echo.ErrNotFound
    }

    // Parse RSS feed
    items, err := rss.ParseFeed(ctx, feed.Url)
    if err != nil {
        return echo.NewHTTPError(http.StatusBadGateway, "failed to parse feed: "+err.Error())
    }

    // Get rule if specified
    var rule *store.DownloadRule
    if ruleID != "" {
        r, err := h.queries.GetDownloadRule(ctx, ruleID)
        if err == nil {
            rule = &r
        }
    }

    // Build preview
    resp := previewResponse{Total: len(items)}
    for _, item := range items {
        // Apply rule filters if rule provided
        if rule != nil {
            if !rss.MatchRule(item.Title, rule.FilterRegex, rule.ExcludeRegex) {
                continue
            }
            if rule.ResolutionFilter != "" && !strings.Contains(strings.ToLower(item.Title), strings.ToLower(rule.ResolutionFilter)) {
                continue
            }
            // Subgroup filter — support comma-separated
            if rule.SubgroupFilter != "" {
                matched := false
                for _, sg := range strings.Split(rule.SubgroupFilter, ",") {
                    if strings.Contains(item.Title, strings.TrimSpace(sg)) {
                        matched = true
                        break
                    }
                }
                if !matched {
                    continue
                }
            }
        }

        // Parse subgroup and episode from title
        subgroup := parseSubgroup(item.Title)
        episode := parseEpisode(item.Title)

        // Check if already downloaded
        _, dlErr := h.queries.GetDownloadByURL(ctx, item.Link)
        alreadyDownloaded := dlErr == nil

        resp.Items = append(resp.Items, previewItem{
            Title:             item.Title,
            Link:              item.Link,
            Episode:           episode,
            Subgroup:          subgroup,
            Size:              item.Size,
            PublishDate:       item.PubDate,
            AlreadyDownloaded: alreadyDownloaded,
        })
    }
    resp.Matched = len(resp.Items)

    return c.JSON(http.StatusOK, resp)
}

// parseSubgroup extracts [SubGroup] from title
func parseSubgroup(title string) string {
    if len(title) > 0 && title[0] == '[' {
        end := strings.Index(title, "]")
        if end > 0 {
            return title[1:end]
        }
    }
    return ""
}

// parseEpisode extracts episode number from title
func parseEpisode(title string) string {
    // Match patterns: " - 04 " or "- 04 [" or "S01E04"
    re := regexp.MustCompile(`\s-\s(\d{1,3})\b|\[(\d{1,3})\]|S\d{1,2}E(\d{1,3})`)
    m := re.FindStringSubmatch(title)
    if len(m) > 0 {
        for _, g := range m[1:] {
            if g != "" {
                return g
            }
        }
    }
    return ""
}
```

**Step 2: Add `Size` field to `FeedItem`**

Check if `rss.FeedItem` already has a `Size` field. If not, add it in `api/internal/rss/parser.go` by extracting from enclosure length or content length.

**Step 3: Add `GetDownloadRule` query if missing**

Check if `GetDownloadRule` (by ID) query exists. If not, add:
```sql
-- name: GetDownloadRule :one
SELECT * FROM download_rules WHERE id = ?;
```

**Step 4: Add route**

In `router.go`, add to the rssGroup:
```go
rssGroup.GET("/:id/preview", h.handlePreviewRSSFeed)
```

**Step 5: Verify build**

```bash
cd api && go build ./...
```

**Step 6: Commit**

```bash
git add api/internal/api/ api/internal/rss/ api/internal/store/
git commit -m "feat(api): add RSS feed preview endpoint with dedup check"
```

---

### Task 6: Update RSS refresh to respect new fields

**Files:**
- Modify: `api/internal/worker/rss_refresh_job.go`
- Modify: `api/internal/api/rss_handler.go` (handleRefreshRSSFeed)

**Step 1: Update episode filtering logic**

In `rss_refresh_job.go` `refreshFeed()` method, after the existing subgroup/resolution checks, add:

```go
// Episode filter
if rule.EpisodeFilter == "new" {
    // Parse episode from title, skip if already downloaded for this rule
    ep := parseEpisode(item.Title)
    if ep != "" {
        existing, _ := w.queries.ListDownloadsByRuleID(ctx, sql.NullString{String: rule.ID, Valid: true})
        for _, dl := range existing {
            if parseEpisode(dl.Name) == ep {
                continue // skip — episode already downloaded
            }
        }
    }
} else if rule.EpisodeFilter == "range" && rule.EpisodeRange != "" {
    ep := parseEpisode(item.Title)
    if ep != "" && !inEpisodeRange(ep, rule.EpisodeRange) {
        continue
    }
}
```

Add helper:
```go
func inEpisodeRange(ep, rangeStr string) bool {
    // Parse "1-12" format
    parts := strings.SplitN(rangeStr, "-", 2)
    epNum, err := strconv.Atoi(ep)
    if err != nil {
        return true // can't parse, allow
    }
    if len(parts) == 2 {
        start, _ := strconv.Atoi(parts[0])
        end, _ := strconv.Atoi(parts[1])
        return epNum >= start && epNum <= end
    }
    return true
}
```

**Step 2: Update multi-subgroup matching**

Change the single subgroup check to support comma-separated values (same logic as preview endpoint).

**Step 3: Apply same changes to `rss_handler.go` `handleRefreshRSSFeed()`**

**Step 4: Verify build**

```bash
cd api && go build ./...
```

**Step 5: Commit**

```bash
git add api/internal/worker/ api/internal/api/
git commit -m "feat(api): RSS refresh respects episode_filter and multi-subgroup"
```

---

### Task 7: Update frontend types and API client

**Files:**
- Modify: `web/src/lib/api/downloads.ts`

**Step 1: Update DownloadRule interface**

Add:
```typescript
match_mode: string;       // 'fuzzy' | 'exact'
episode_filter: string;   // 'all' | 'new' | 'range'
episode_range: string;    // e.g. '1-12'
```

**Step 2: Add preview API**

```typescript
export interface PreviewItem {
  title: string;
  link: string;
  episode: string;
  subgroup: string;
  size: string;
  publish_date: string;
  already_downloaded: boolean;
}

export interface PreviewResponse {
  items: PreviewItem[];
  total: number;
  matched: number;
}

export const rssFeedApi = {
  // ... existing methods
  preview: (feedId: string, ruleId?: string) =>
    api.get<PreviewResponse>(`/api/v1/rss-feeds/${feedId}/preview${ruleId ? `?rule_id=${ruleId}` : ''}`),
};
```

**Step 3: Verify frontend builds**

```bash
cd web && bun run typecheck
```

**Step 4: Commit**

```bash
git add web/src/lib/api/
git commit -m "feat(web): add preview types and API, update DownloadRule type"
```

---

### Task 8: Build RuleEditorModal component

**Files:**
- Create: `web/src/components/RuleEditorModal.tsx`

**Step 1: Create the modal component**

A modal with these sections:
1. **Header** — anime title + enabled toggle
2. **Destination** — library selector + save path
3. **Title** — match mode toggle (fuzzy/exact) + comparison title input
4. **Episodes** — radio group: All / New only / Range (with range input)
5. **Release Groups** — multi-tag input for subgroups
6. **Resolution** — chip toggles: All / 1080p / 720p / 4K
7. **Preview** — collapsible table with matched RSS items

Use TanStack Form for the form state. Use the existing `Modal` component as the container.

Key features:
- Form pre-populated from existing rule data
- Save mutation calls `ruleApi.update()`
- Preview section auto-fetches `rssFeedApi.preview()` on filter change (debounced 500ms)
- Preview table shows: Title, EP, Subgroup, Size, Date, Already Downloaded (checkmark)

**Step 2: Verify frontend builds**

```bash
cd web && bun run typecheck
```

**Step 3: Commit**

```bash
git add web/src/components/
git commit -m "feat(web): implement RuleEditorModal with preview"
```

---

### Task 9: Integrate RuleEditorModal into SubscriptionsSubTab

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

**Step 1: Replace SubscriptionDetailContent with RuleEditorModal**

In the `SubscriptionsSubTab` component (line 1543), when a subscription card is clicked, open `RuleEditorModal` instead of (or alongside) the current detail view.

Options:
- Replace the current sheet/modal detail view entirely with RuleEditorModal
- Or add a "Edit Rule" button in the existing detail view that opens RuleEditorModal

Recommended: Replace the detail modal entirely — the RuleEditorModal already shows all the same info plus the new features.

**Step 2: Wire up the modal state**

```tsx
const [editingRule, setEditingRule] = useState<DownloadRule | null>(null);

// In the card grid:
onClick={() => setEditingRule(rule)}

// Modal:
{editingRule && (
  <RuleEditorModal
    rule={editingRule}
    feed={feeds.find(f => f.id === editingRule.rss_feed_id)}
    open={!!editingRule}
    onClose={() => setEditingRule(null)}
  />
)}
```

**Step 3: Verify frontend builds**

```bash
cd web && bun run typecheck
```

**Step 4: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(web): integrate RuleEditorModal into subscriptions tab"
```

---

### Task 10: Extract i18n and compile

**Step 1: Extract new translation strings**

```bash
cd web && bun run i18n:extract
```

**Step 2: Add translations for zh-TW and en**

Key new strings:
- `ruleEditor.title` — "Edit Rule" / "編輯規則"
- `ruleEditor.destination` — "Destination" / "儲存位置"
- `ruleEditor.matchMode` — "Match Mode" / "匹配模式"
- `ruleEditor.fuzzy` — "Fuzzy" / "模糊匹配"
- `ruleEditor.exact` — "Exact" / "精確匹配"
- `ruleEditor.episodes` — "Episodes" / "集數"
- `ruleEditor.allEpisodes` — "All" / "全部"
- `ruleEditor.newOnly` — "New Only" / "僅新集"
- `ruleEditor.range` — "Range" / "指定範圍"
- `ruleEditor.releaseGroups` — "Release Groups" / "字幕組"
- `ruleEditor.resolution` — "Resolution" / "解析度"
- `ruleEditor.preview` — "Preview" / "預覽"
- `ruleEditor.matched` — "matched" / "匹配"
- `ruleEditor.downloaded` — "Downloaded" / "已下載"

**Step 3: Compile**

```bash
cd web && bun run i18n:compile
```

**Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add rule editor translations"
```

---

### Task 11: E2E verification

**Step 1: Start API server and web dev server**

**Step 2: Navigate to Downloads → Subscriptions tab**

**Step 3: Click a subscription card → verify Rule Editor Modal opens**

**Step 4: Change filters → verify Preview updates**

**Step 5: Save changes → verify rule is updated**

**Step 6: Trigger refresh → verify new filters are applied**

---
