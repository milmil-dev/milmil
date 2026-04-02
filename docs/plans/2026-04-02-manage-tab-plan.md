# Manage Tab Redesign + Mikan Per-Anime RSS — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Manage tab with 3 sub-tabs (Subscriptions/Downloads/Completed), beautiful download cards with anime covers, global summary bar, and Mikan per-anime RSS for accurate subscriptions.

**Architecture:** Frontend-heavy redesign of the ManageTab component in DownloadsPage.tsx, split into sub-components. Backend adds Mikan anime search helper and enhances subscribe handler to use per-anime RSS. Download cards pull anime cover from bangumi_id via cached metadata.

**Tech Stack:** Go (Echo, gofeed), React 19, TanStack Query, Tailwind CSS v4, Lingui i18n, Motion

**Design doc:** `docs/plans/2026-04-02-manage-tab-redesign.md`

---

## Task 1: Backend — Add Mikan anime search and enhance subscribe

**Files:**
- Modify: `api/internal/torrent/mikan.go` (add SearchAnime method)
- Modify: `api/internal/api/subscribe_handler.go` (use per-anime RSS for Mikan)
- Modify: `api/internal/api/router.go` (register route if needed)

**Step 1: Add Mikan anime search method**

In `api/internal/torrent/mikan.go`, add a method that searches Mikan's RSS for a title and extracts the bangumiId from result links. Mikan RSS items link to `/Home/Bangumi/{mikanBangumiId}`.

```go
// MikanAnime represents an anime found on Mikan.
type MikanAnime struct {
	BangumiID string // Mikan's internal bangumi ID
	Title     string
}

// SearchAnime searches Mikan for anime matching the title and extracts bangumi IDs.
func (p *MikanProvider) SearchAnime(ctx context.Context, title string) ([]MikanAnime, error) {
	feedURL := fmt.Sprintf("https://mikanani.me/RSS/Search?searchstr=%s", url.QueryEscape(title))
	fp := gofeed.NewParser()
	feed, err := fp.ParseURLWithContext(feedURL, ctx)
	if err != nil {
		return nil, err
	}

	// Extract unique bangumi IDs from item links
	// Mikan links look like: https://mikanani.me/Home/Episode/{episodeId}
	// The RSS feed itself for per-anime is /RSS/Bangumi?bangumiId=XXX
	// We need to extract from the search results — look at enclosure or link patterns
	seen := make(map[string]bool)
	var animes []MikanAnime
	for _, item := range feed.Items {
		// Try to extract bangumiId from item link
		// Mikan search results often contain /Home/Bangumi/{id} in description or link
		if item.Link != "" {
			// Parse the Mikan link to extract bangumi info
			id := extractMikanBangumiID(item.Link)
			if id != "" && !seen[id] {
				seen[id] = true
				animes = append(animes, MikanAnime{
					BangumiID: id,
					Title:     item.Title,
				})
			}
		}
	}
	return animes, nil
}

func extractMikanBangumiID(link string) string {
	// Mikan episode links: https://mikanani.me/Home/Episode/{epId}
	// We need to fetch the page or use a different approach
	// For now, extract from RSS enclosure patterns
	// The most reliable approach: search RSS returns items, we try to construct
	// the per-anime RSS URL from the title and verify it works
	return "" // Implement based on actual Mikan URL patterns
}
```

**Note:** Mikan's RSS search doesn't directly expose bangumiId in the feed. The most reliable approach is:
1. Search Mikan via RSS
2. If results found, scrape the first result's link to find the anime page
3. Extract bangumiId from the anime page URL
4. OR: Use the DanDanPlay API which can map Bangumi.tv ID → anime title → Mikan search

A simpler alternative: just use the keyword RSS URL but with better regex matching. The per-anime approach requires HTML scraping which is fragile.

**Recommended simplified approach:** Keep keyword-based RSS for now but improve the subscribe handler to build more precise search queries using anime title variants. Add per-anime Mikan RSS as a future enhancement when we can reliably map IDs.

**Step 2: Enhance subscribe handler title resolution**

In `api/internal/api/subscribe_handler.go`, the current title resolution (from Task 2 earlier) already resolves good titles. Enhance it to also try `SearchByBangumiID` if we have a Mikan bangumi ID:

```go
// If source is mikan and we resolved a good query, try to find a more specific feed
if req.Source == "mikan" {
    // Try searching Mikan to verify results exist
    results, err := h.torrentRegistry.Search(ctx, "mikan", req.Query)
    if err == nil && len(results) > 0 {
        // Results found — the keyword search works, use it
        // Log success for monitoring
    }
}
```

**Step 3: Verify build**

Run: `cd api && go build ./...`

**Step 4: Commit**

```
feat: enhance Mikan subscribe with title verification
```

---

## Task 2: Frontend — Restructure ManageTab into 3 sub-tabs

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx` (rewrite ManageTab component)

**Step 1: Split ManageTab into sub-tabs**

Replace the current `ManageTab` component with a new version containing 3 sub-tabs:

```typescript
type ManageSubTab = 'subscriptions' | 'downloads' | 'completed';

function ManageTab({ onSwitchToSearch }: { onSwitchToSearch: () => void }) {
  const [subTab, setSubTab] = useState<ManageSubTab>('subscriptions');
  // ... queries for feeds, rules, grouped downloads ...

  // Compute counts for sub-tab badges
  const activeDownloads = allDownloads.filter(d => ['active', 'waiting', 'paused'].includes(d.status));
  const completedDownloads = allDownloads.filter(d => d.status === 'complete');

  return (
    <>
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-5">
        <SubTabButton active={subTab === 'subscriptions'} onClick={() => setSubTab('subscriptions')}>
          Subscriptions
        </SubTabButton>
        <SubTabButton active={subTab === 'downloads'} onClick={() => setSubTab('downloads')} badge={activeDownloads.length}>
          Downloads
        </SubTabButton>
        <SubTabButton active={subTab === 'completed'} onClick={() => setSubTab('completed')} badge={completedDownloads.length}>
          Completed
        </SubTabButton>
      </div>

      {subTab === 'subscriptions' && <SubscriptionsPanel ... />}
      {subTab === 'downloads' && <DownloadsPanel ... />}
      {subTab === 'completed' && <CompletedPanel ... />}
    </>
  );
}
```

**Step 2: Build SubscriptionsPanel**

Visual subscription cards with anime cover:
- Query anime metadata: `discoverApi.detail(rule.bangumi_id)` for cover image (use TanStack Query with staleTime for caching)
- Card layout: cover (48x68) + title + status dot + filter chips + interval + last match + episode count
- Expandable: last 3 downloads
- Actions: refresh, delete
- Empty state: CTA to Search tab

**Step 3: Build DownloadsPanel**

Global summary bar + download cards with anime context:

```typescript
function DownloadsPanel({ downloads, rules, ... }) {
  // Summary
  const active = downloads.filter(d => d.status === 'active');
  const totalSpeed = active.reduce((s, d) => s + d.speed_bytes, 0);
  const totalRemaining = active.reduce((s, d) => s + (d.total_bytes - d.completed_bytes), 0);
  const etaSeconds = totalSpeed > 0 ? totalRemaining / totalSpeed : 0;

  return (
    <>
      {/* Global summary bar */}
      {active.length > 0 && (
        <div className="sticky top-0 z-10 ...">
          ↓ {active.length} downloading · {formatSpeed(totalSpeed)} · ~{formatETA(etaSeconds)}
          <Button onClick={pauseAll}>Pause All</Button>
        </div>
      )}

      {/* URL add form */}
      <UrlAddForm ... />

      {/* Download cards sorted: active → waiting → paused */}
      {sortedDownloads.map(dl => (
        <DownloadCard key={dl.id} dl={dl} anime={...} />
      ))}
    </>
  );
}
```

**DownloadCard component:**
- Anime cover thumbnail (40px, from bangumi_id lookup)
- Torrent title (primary text)
- Anime name (secondary, muted)
- Progress bar (thin, accent color, pulsing for unknown total)
- Size + speed + ETA line
- Status badge (color-coded)
- Pause/Resume + Delete actions (text labels)

**Step 4: Build CompletedPanel**

- Same card layout, no progress bar
- Show completion date + total size
- "Clear All" button at top
- Sorted by most recent first

**Step 5: Add formatETA helper**

```typescript
function formatETA(seconds: number): string {
  if (seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
```

**Step 6: Verify build**

Run: `cd web && bun run typecheck`

**Step 7: Commit**

```
feat: restructure manage tab with subscriptions/downloads/completed sub-tabs
```

---

## Task 3: Frontend — Anime cover integration for download cards

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`
- Modify: `web/src/lib/api/discover.ts` (may need lightweight metadata fetch)

**Step 1: Create anime metadata cache hook**

Download cards need anime covers from bangumi_id. Create a hook that batch-fetches and caches anime summaries:

```typescript
// Use TanStack Query to cache anime metadata per bangumi_id
function useAnimeMeta(bangumiId: number | undefined) {
  return useQuery({
    queryKey: discoverKeys.detail(bangumiId ?? 0),
    queryFn: () => discoverApi.detail(bangumiId!),
    enabled: !!bangumiId,
    staleTime: 24 * 60 * 60 * 1000, // 24h — anime metadata rarely changes
    gcTime: 24 * 60 * 60 * 1000,
  });
}
```

**Step 2: Use in DownloadCard and SubscriptionCard**

```typescript
function DownloadCard({ dl, bangumiId, animeName, ... }) {
  const { data: anime } = useAnimeMeta(bangumiId);
  const coverUrl = anime?.cover_image;

  return (
    <div className="flex gap-3 p-4 ...">
      {/* Cover thumbnail */}
      <div className="w-10 h-14 rounded overflow-hidden bg-white/[0.04] shrink-0">
        {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" />}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{dl.name}</p>
        <p className="text-[11px] text-white/30 truncate">{animeName}</p>
        {/* Progress bar + stats */}
      </div>
    </div>
  );
}
```

**Step 3: Verify and commit**

Run: `cd web && bun run typecheck`

```
feat: add anime cover thumbnails to download and subscription cards
```

---

## Task 4: i18n — Add translations for new UI elements

**Files:**
- Modify: `web/src/locales/{en,zh-CN,zh-TW,zh-HK,ja,ko}/messages.po`

**New keys:**
- `autoDownload.subtab.subscriptions` — "Subscriptions"
- `autoDownload.subtab.downloads` — "Downloads"
- `autoDownload.subtab.completed` — "Completed"
- `autoDownload.summary` — "{count} downloading · {speed} · ~{eta} left"
- `autoDownload.pauseAll` — "Pause All"
- `autoDownload.resumeAll` — "Resume All"
- `autoDownload.clearAll` — "Clear All"
- `autoDownload.completedAt` — "Completed {date}"
- `autoDownload.episodeProgress` — "{downloaded}/{total} episodes"
- `autoDownload.recentDownloads` — "Recent downloads"

Run: `cd web && bun run i18n:extract && bun run i18n:compile`

```
feat: add i18n translations for manage tab redesign
```

---

## Task 5: E2E Tests — Update auto-download tests

**Files:**
- Modify: `web/e2e/auto-download.spec.ts`

**Add tests for:**
1. Manage tab shows 3 sub-tabs (Subscriptions/Downloads/Completed)
2. Subscriptions sub-tab shows subscription cards with anime cover
3. Downloads sub-tab shows global summary bar when active downloads exist
4. Download cards show progress bar, speed, ETA
5. Completed sub-tab shows completed downloads with date
6. Clear All button removes completed downloads
7. Pause All / Resume All in downloads summary bar
8. Switch between sub-tabs preserves state

**Step 1: Update API mocks**

Add mocked grouped downloads with active, paused, and completed statuses. Add anime metadata mock for cover images.

**Step 2: Write tests**

Follow existing test patterns (setupAuth, setupApiMocks, navigate to /downloads).

**Step 3: Run tests**

Run: `cd web && bunx playwright test e2e/auto-download.spec.ts --reporter=line`

**Step 4: Commit**

```
test: update E2E tests for manage tab redesign
```

---

## Task 6: Final polish and cleanup

**Step 1: Remove old ManageTab code**

Ensure no dead code from the previous ManageTab implementation remains.

**Step 2: Run full checks**

```bash
cd api && go build ./...
cd web && bun run typecheck
cd web && bunx playwright test e2e/auto-download.spec.ts
```

**Step 3: Commit**

```
refactor: clean up old manage tab code
```
