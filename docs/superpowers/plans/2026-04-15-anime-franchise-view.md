# Anime Franchise View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a franchise endpoint that recursively traverses AniList relations to show the complete anime series (all seasons, OVAs, movies) on the detail page.

**Architecture:** New `GET /api/v1/discover/anime/:id/franchise` endpoint. Backend BFS traversal of AniList relation graph (PREQUEL/SEQUEL/SIDE_STORY/PARENT only), cached 30 days. Frontend replaces the current one-level season tabs with full franchise chain and adds a side stories section.

**Tech Stack:** Go (Echo, golang.org/x/time/rate), React (TanStack Query), existing cache layer.

---

### Task 1: Add rate limiter to AniList client

**Files:**
- Modify: `api/internal/integration/anilist/client.go`

The AniList client currently has no rate limiting. Add a `rate.Limiter` so all queries respect AniList's ~90 req/min limit. This protects both the franchise traversal and existing code.

- [ ] **Step 1: Add rate limiter field and import**

In `api/internal/integration/anilist/client.go`, add the import and limiter field:

```go
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/time/rate"
)
```

Update the `graphqlClient` struct:

```go
type graphqlClient struct {
	http     *http.Client
	endpoint string
	limiter  *rate.Limiter
}
```

- [ ] **Step 2: Initialize limiter in constructors**

Update `NewClient` and `NewClientWithURL`:

```go
func NewClient(c *http.Client) Client {
	return &graphqlClient{
		http:     c,
		endpoint: defaultEndpoint,
		limiter:  rate.NewLimiter(rate.Every(700*time.Millisecond), 1),
	}
}

func NewClientWithURL(c *http.Client, endpoint string) Client {
	return &graphqlClient{
		http:     c,
		endpoint: endpoint,
		limiter:  rate.NewLimiter(rate.Every(700*time.Millisecond), 1),
	}
}
```

Add `"time"` to the imports.

- [ ] **Step 3: Apply limiter in query method**

At the start of the `query` method, add the `Wait` call:

```go
func (c *graphqlClient) query(ctx context.Context, q string, vars map[string]any, target any) error {
	if err := c.limiter.Wait(ctx); err != nil {
		return fmt.Errorf("%w: %v", ErrRateLimited, err)
	}
	body, _ := json.Marshal(graphqlRequest{Query: q, Variables: vars})
	// ... rest unchanged
```

- [ ] **Step 4: Add GetMediaRelations method to Client interface and implementation**

The franchise traversal only needs relations — not reviews, recommendations, or characters. Add a lightweight query method:

Add to `Client` interface:

```go
type Client interface {
	SearchMedia(ctx context.Context, query string, isAdult bool) ([]Media, error)
	GetMedia(ctx context.Context, id int) (*Media, error)
	GetMediaRelations(ctx context.Context, id int) (*Media, error)
	GetTrending(ctx context.Context, page, perPage int) ([]Media, error)
	BrowseByGenre(ctx context.Context, genre string, page, perPage int) ([]Media, error)
	Browse(ctx context.Context, filter BrowseFilter, page, perPage int) ([]Media, error)
	GetAiringSchedule(ctx context.Context, from, to int64) ([]AiringSchedule, error)
}
```

Add the implementation after `GetMedia`:

```go
func (c *graphqlClient) GetMediaRelations(ctx context.Context, id int) (*Media, error) {
	q := `query ($id: Int) {
		Media(id: $id, type: ANIME) {` + mediaFields + `
			relations {
				edges {
					relationType
					node {` + mediaFields + `}
				}
			}
		}
	}`
	var result struct {
		Media Media `json:"Media"`
	}
	if err := c.query(ctx, q, map[string]any{"id": id}, &result); err != nil {
		return nil, err
	}
	return &result.Media, nil
}
```

- [ ] **Step 5: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add api/internal/integration/anilist/client.go
git commit -m "feat(anilist): add rate limiter and GetMediaRelations method"
```

---

### Task 2: Add FranchiseResult type

**Files:**
- Modify: `api/internal/metadata/types.go`

- [ ] **Step 1: Add FranchiseEntry and FranchiseResult structs**

Append to `api/internal/metadata/types.go`:

```go
type FranchiseEntry struct {
	AniListID     int      `json:"anilist_id"`
	BangumiID     int      `json:"bangumi_id"`
	Title         string   `json:"title"`
	TitleOriginal string   `json:"title_original"`
	TitleEN       string   `json:"title_en,omitempty"`
	CoverImage    string   `json:"cover_image"`
	MediaType     string   `json:"media_type,omitempty"`
	AirDate       string   `json:"air_date,omitempty"`
	EpisodeCount  int      `json:"episode_count"`
	Score         float64  `json:"score"`
	RelationType  string   `json:"relation_type,omitempty"`
}

type FranchiseResult struct {
	MainSeries  []FranchiseEntry `json:"main_series"`
	SideStories []FranchiseEntry `json:"side_stories"`
}
```

- [ ] **Step 2: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/internal/metadata/types.go
git commit -m "feat(metadata): add FranchiseEntry and FranchiseResult types"
```

---

### Task 3: Implement franchise BFS traversal

**Files:**
- Create: `api/internal/metadata/franchise.go`

This is the core logic: BFS traversal of AniList relations, splitting into main series chain and side stories.

- [ ] **Step 1: Create franchise.go with GetFranchise method**

Create `api/internal/metadata/franchise.go`:

```go
package metadata

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/milmil/api/internal/integration/anilist"
)

const (
	franchiseCacheTTL = 30 * 24 * time.Hour // 30 days
	maxTraversalDepth = 10
)

// franchiseRelation tracks which relation types to follow during BFS.
var franchiseRelations = map[string]bool{
	"PREQUEL":    true,
	"SEQUEL":     true,
	"SIDE_STORY": true,
	"PARENT":     true,
}

// franchiseNode stores a collected node and its edges during traversal.
type franchiseNode struct {
	media    anilist.Media
	edges    []anilist.MediaEdge // only franchise-relevant edges
}

// GetFranchise returns the full franchise graph for a given Bangumi ID.
func (s *Service) GetFranchise(ctx context.Context, bangumiID int) (*FranchiseResult, error) {
	// Resolve Bangumi ID → AniList ID
	// We need the title for findAniListID, so fetch the detail first (likely cached).
	detail, err := s.GetAnimeDetail(ctx, bangumiID)
	if err != nil {
		return nil, err
	}
	if detail.AniListID == 0 {
		// No AniList match — return just this entry
		return &FranchiseResult{
			MainSeries: []FranchiseEntry{{
				BangumiID:     detail.BangumiID,
				Title:         detail.Title,
				TitleOriginal: detail.TitleOriginal,
				CoverImage:    detail.CoverImage,
				MediaType:     detail.MediaType,
				AirDate:       detail.AirDate,
				EpisodeCount:  detail.EpisodeCount,
				Score:         detail.Score,
			}},
		}, nil
	}

	startID := detail.AniListID

	// Check ref cache: does this AniList ID map to a known franchise root?
	refKey := fmt.Sprintf("meta:franchise:ref:%d", startID)
	var rootID int
	if s.getCache(ctx, refKey, &rootID) && rootID > 0 {
		// Try to load the cached franchise result from the root
		franchiseKey := fmt.Sprintf("meta:franchise:al:%d", rootID)
		var cached FranchiseResult
		if s.getCache(ctx, franchiseKey, &cached) {
			return &cached, nil
		}
	}

	// BFS traversal
	nodes := s.traverseFranchise(ctx, startID)

	// Build the result
	result := s.buildFranchiseResult(ctx, nodes, startID)

	// Determine root (first entry in main series)
	if len(result.MainSeries) > 0 {
		rootID = result.MainSeries[0].AniListID
	} else {
		rootID = startID
	}

	// Cache the result keyed by root
	franchiseKey := fmt.Sprintf("meta:franchise:al:%d", rootID)
	s.setCache(ctx, franchiseKey, result, franchiseCacheTTL)

	// Store ref keys for every node → root
	for _, entry := range result.MainSeries {
		rk := fmt.Sprintf("meta:franchise:ref:%d", entry.AniListID)
		s.setCache(ctx, rk, rootID, franchiseCacheTTL)
	}
	for _, entry := range result.SideStories {
		rk := fmt.Sprintf("meta:franchise:ref:%d", entry.AniListID)
		s.setCache(ctx, rk, rootID, franchiseCacheTTL)
	}

	return result, nil
}

// traverseFranchise does BFS from startID, collecting all franchise nodes.
func (s *Service) traverseFranchise(ctx context.Context, startID int) map[int]*franchiseNode {
	nodes := make(map[int]*franchiseNode)
	queue := []struct {
		id    int
		depth int
	}{{id: startID, depth: 0}}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if _, visited := nodes[current.id]; visited {
			continue
		}
		if current.depth > maxTraversalDepth {
			continue
		}

		media, err := s.anilist.GetMediaRelations(ctx, current.id)
		if err != nil {
			slog.Warn("franchise: failed to fetch media", "anilist_id", current.id, "err", err)
			continue
		}

		node := &franchiseNode{media: *media}
		if media.Relations != nil {
			for _, edge := range media.Relations.Edges {
				if !franchiseRelations[edge.RelationType] {
					continue
				}
				// Only follow anime formats
				if !isAnimeFormat(edge.Node.Format) {
					continue
				}
				node.edges = append(node.edges, edge)
				if _, visited := nodes[edge.Node.ID]; !visited {
					queue = append(queue, struct {
						id    int
						depth int
					}{id: edge.Node.ID, depth: current.depth + 1})
				}
			}
		}
		nodes[current.id] = node
	}

	return nodes
}

// buildFranchiseResult splits collected nodes into main series chain and side stories.
func (s *Service) buildFranchiseResult(ctx context.Context, nodes map[int]*franchiseNode, startID int) *FranchiseResult {
	// Step 1: Find the root of the main series by following PREQUEL edges backward.
	rootID := startID
	visited := map[int]bool{startID: true}
	for {
		node, ok := nodes[rootID]
		if !ok {
			break
		}
		foundPrequel := false
		for _, edge := range node.edges {
			if edge.RelationType == "PREQUEL" && !visited[edge.Node.ID] {
				visited[edge.Node.ID] = true
				rootID = edge.Node.ID
				foundPrequel = true
				break
			}
		}
		if !foundPrequel {
			break
		}
	}

	// Step 2: Build main series chain by following SEQUEL edges forward from root.
	mainIDs := map[int]bool{}
	var mainSeries []FranchiseEntry
	currentID := rootID
	chainVisited := map[int]bool{}
	for {
		node, ok := nodes[currentID]
		if !ok {
			break
		}
		if chainVisited[currentID] {
			break
		}
		chainVisited[currentID] = true
		mainIDs[currentID] = true

		entry := mediaToFranchiseEntry(node.media, "")
		// Try to resolve Bangumi ID
		entry.BangumiID = s.resolveBangumiIDCached(ctx, currentID)
		mainSeries = append(mainSeries, entry)

		// Find sequel
		foundSequel := false
		for _, edge := range node.edges {
			if edge.RelationType == "SEQUEL" && !chainVisited[edge.Node.ID] {
				currentID = edge.Node.ID
				foundSequel = true
				break
			}
		}
		if !foundSequel {
			break
		}
	}

	// Step 3: Everything else is a side story.
	var sideStories []FranchiseEntry
	for id, node := range nodes {
		if mainIDs[id] {
			continue
		}
		// Determine relation type from how this node was reached
		relType := determineRelationType(nodes, id, mainIDs)
		entry := mediaToFranchiseEntry(node.media, relType)
		entry.BangumiID = s.resolveBangumiIDCached(ctx, id)
		sideStories = append(sideStories, entry)
	}

	// Sort side stories by air date
	sort.Slice(sideStories, func(i, j int) bool {
		return sideStories[i].AirDate < sideStories[j].AirDate
	})

	return &FranchiseResult{
		MainSeries:  mainSeries,
		SideStories: sideStories,
	}
}

// resolveBangumiIDCached tries to find the Bangumi ID for an AniList ID using the cross-ref cache.
func (s *Service) resolveBangumiIDCached(ctx context.Context, anilistID int) int {
	reverseKey := fmt.Sprintf("meta:xref:al:%d", anilistID)
	var bangumiID int
	if s.getCache(ctx, reverseKey, &bangumiID) {
		return bangumiID
	}
	return 0
}

// determineRelationType figures out the relation label for a side story node.
func determineRelationType(nodes map[int]*franchiseNode, targetID int, mainIDs map[int]bool) string {
	// Check edges from main series nodes pointing to this target
	for id, node := range nodes {
		if !mainIDs[id] {
			continue
		}
		for _, edge := range node.edges {
			if edge.Node.ID == targetID {
				return edge.RelationType
			}
		}
	}
	// Check edges from any node pointing to this target
	for _, node := range nodes {
		for _, edge := range node.edges {
			if edge.Node.ID == targetID {
				return edge.RelationType
			}
		}
	}
	return "SIDE_STORY"
}

func mediaToFranchiseEntry(m anilist.Media, relationType string) FranchiseEntry {
	title := m.Title.Native
	if title == "" {
		title = m.Title.Romaji
	}
	cover := m.CoverImage.ExtraLarge
	if cover == "" {
		cover = m.CoverImage.Large
	}
	airDate := ""
	if m.SeasonYear > 0 {
		airDate = fmt.Sprintf("%d", m.SeasonYear)
		if m.Season != "" {
			airDate = fmt.Sprintf("%d-%s", m.SeasonYear, m.Season)
		}
	}
	return FranchiseEntry{
		AniListID:     m.ID,
		Title:         title,
		TitleOriginal: m.Title.Romaji,
		TitleEN:       m.Title.English,
		CoverImage:    cover,
		MediaType:     m.Format,
		AirDate:       airDate,
		EpisodeCount:  m.Episodes,
		Score:         float64(m.AverageScore) / 10.0,
		RelationType:  relationType,
	}
}

func isAnimeFormat(format string) bool {
	switch format {
	case "TV", "TV_SHORT", "OVA", "ONA", "MOVIE", "SPECIAL":
		return true
	}
	return false
}
```

- [ ] **Step 2: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/internal/metadata/franchise.go
git commit -m "feat(metadata): implement franchise BFS traversal with caching"
```

---

### Task 4: Add franchise API handler and route

**Files:**
- Modify: `api/internal/api/discover_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Add handler in discover_handler.go**

Add this function after `handleAnimeDetail` (around line 61) in `api/internal/api/discover_handler.go`:

```go
func (h *handler) handleAnimeFranchise(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	result, err := h.metadata.GetFranchise(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, result)
}
```

- [ ] **Step 2: Register route in router.go**

In `api/internal/api/router.go`, add after the `discoverGroup.GET("/anime/:id/torrents", ...)` line (line 146):

```go
discoverGroup.GET("/anime/:id/franchise", h.handleAnimeFranchise)
```

- [ ] **Step 3: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/discover_handler.go api/internal/api/router.go
git commit -m "feat(api): add GET /anime/:id/franchise endpoint"
```

---

### Task 5: Add frontend franchise API and types

**Files:**
- Modify: `web/src/lib/api/discover.ts`

- [ ] **Step 1: Add FranchiseEntry and FranchiseResult types**

Add after the `AnimeDetail` interface in `web/src/lib/api/discover.ts`:

```typescript
export interface FranchiseEntry {
  anilist_id: number;
  bangumi_id: number;
  title: string;
  title_original: string;
  title_en?: string;
  cover_image: string;
  media_type?: string;
  air_date?: string;
  episode_count: number;
  score: number;
  relation_type?: string;
}

export interface FranchiseResult {
  main_series: FranchiseEntry[];
  side_stories: FranchiseEntry[];
}
```

- [ ] **Step 2: Add API function and query key**

In the `discoverApi` object, add after `animeTorrents`:

```typescript
franchise: (bangumiId: number) =>
  api.get<FranchiseResult>(`/api/v1/discover/anime/${bangumiId}/franchise`),
```

In the `discoverKeys` object, add:

```typescript
franchise: (bangumiId: number) => ['discover', 'franchise', bangumiId] as const,
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api/discover.ts
git commit -m "feat(web): add franchise API types and query function"
```

---

### Task 6: Update AnimeDetailPage — franchise season tabs and side stories

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

This task replaces the old `buildSeasonChain` logic with the franchise API and adds a side stories section.

- [ ] **Step 1: Add franchise query**

In `AnimeDetailPage()` function (after the `comments` query around line 235), add:

```typescript
const { data: franchise } = useQuery({
  queryKey: discoverKeys.franchise(numericId),
  queryFn: () => discoverApi.franchise(numericId),
  enabled: !Number.isNaN(numericId),
  staleTime: 24 * 60 * 60 * 1000, // 24h — franchise data is very stable
});
```

- [ ] **Step 2: Replace season tabs with franchise-powered tabs**

Find the season tabs section (lines 563-587). Replace the `buildSeasonChain` IIFE with franchise-powered tabs:

Replace:
```tsx
{/* Season tabs */}
{(() => {
  const seasons = buildSeasonChain(anime.relations, numericId, anime.title);
  if (seasons.length <= 1) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
      {seasons.map((s) => (
        <Link
          key={s.bangumiId}
          to="/anime/$id"
          params={{ id: String(s.bangumiId) }}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
            s.isCurrent
              ? 'bg-mm-accent/20 text-mm-accent'
              : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
          )}
          title={s.title}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
})()}
```

With:
```tsx
{/* Season tabs — franchise-powered */}
{(() => {
  // Use franchise data if available, fall back to old buildSeasonChain
  const franchiseSeasons = franchise?.main_series;
  if (franchiseSeasons && franchiseSeasons.length > 1) {
    return (
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {franchiseSeasons.map((s, idx) => {
          const isCurrent = s.bangumi_id === numericId || s.anilist_id === anime.anilist_id;
          const targetId = s.bangumi_id > 0 ? s.bangumi_id : null;
          return targetId ? (
            <Link
              key={s.anilist_id}
              to="/anime/$id"
              params={{ id: String(targetId) }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
                isCurrent
                  ? 'bg-mm-accent/20 text-mm-accent'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
              )}
              title={s.title}
            >
              {`S${idx + 1}`}
            </Link>
          ) : (
            <span
              key={s.anilist_id}
              className="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] text-white/30 shrink-0"
              title={s.title}
            >
              {`S${idx + 1}`}
            </span>
          );
        })}
      </div>
    );
  }
  // Fallback to old buildSeasonChain
  const seasons = buildSeasonChain(anime.relations, numericId, anime.title);
  if (seasons.length <= 1) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
      {seasons.map((s) => (
        <Link
          key={s.bangumiId}
          to="/anime/$id"
          params={{ id: String(s.bangumiId) }}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
            s.isCurrent
              ? 'bg-mm-accent/20 text-mm-accent'
              : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
          )}
          title={s.title}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
})()}
```

- [ ] **Step 3: Replace relations rail with franchise side stories + fallback**

Find the relations rail section (lines 895-918). Replace with franchise-powered side stories and a fallback:

Replace:
```tsx
{/* Related anime — prequel, sequel, side stories */}
{anime.relations && anime.relations.length > 0 && (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
    className="px-4 md:px-8 py-6"
  >
    <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.relations`)}</h2>
    <MediaRail>
      {anime.relations.map((rel) => (
        <div
          key={`${rel.relation_type}-${rel.anime.anilist_id}`}
          className="shrink-0 w-[150px]"
        >
          <AnimeCard anime={rel.anime} />
          <p className="text-[10px] font-bold uppercase tracking-wider text-mm-accent/60 mt-1">
            {getRelationLabel(rel.relation_type, i18n.locale)}
          </p>
        </div>
      ))}
    </MediaRail>
  </motion.div>
)}
```

With:
```tsx
{/* Side stories — franchise-powered, with fallback to relations */}
{(() => {
  if (franchise?.side_stories && franchise.side_stories.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-4 md:px-8 py-6"
      >
        <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.sideStories`)}</h2>
        <MediaRail>
          {franchise.side_stories.map((entry) => {
            const cardAnime: AnimeSummary = {
              bangumi_id: entry.bangumi_id,
              anilist_id: entry.anilist_id,
              title: entry.title,
              title_original: entry.title_original,
              cover_image: entry.cover_image,
              episode_count: entry.episode_count,
              score: entry.score,
              media_type: entry.media_type,
            };
            return (
              <div key={entry.anilist_id} className="shrink-0 w-[150px]">
                <AnimeCard anime={cardAnime} />
                <p className="text-[10px] font-bold uppercase tracking-wider text-mm-accent/60 mt-1">
                  {entry.media_type || getRelationLabel(entry.relation_type || '', i18n.locale)}
                </p>
              </div>
            );
          })}
        </MediaRail>
      </motion.div>
    );
  }
  // Fallback: show old relations rail if franchise not loaded yet
  if (anime.relations && anime.relations.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-4 md:px-8 py-6"
      >
        <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.relations`)}</h2>
        <MediaRail>
          {anime.relations.map((rel) => (
            <div
              key={`${rel.relation_type}-${rel.anime.anilist_id}`}
              className="shrink-0 w-[150px]"
            >
              <AnimeCard anime={rel.anime} />
              <p className="text-[10px] font-bold uppercase tracking-wider text-mm-accent/60 mt-1">
                {getRelationLabel(rel.relation_type, i18n.locale)}
              </p>
            </div>
          ))}
        </MediaRail>
      </motion.div>
    );
  }
  return null;
})()}
```

- [ ] **Step 4: Add i18n string import for anime.sideStories**

The `anime.sideStories` key needs to be added to translation files. For now it will show the key as fallback. After the feature is working, run `bun run i18n:extract` in the web directory to generate the PO entries, then add translations.

- [ ] **Step 5: Verify typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): replace season tabs and relations rail with franchise data"
```

---

### Task 7: Add i18n translations for side stories label

**Files:**
- Run: `bun run i18n:extract` in `web/`
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`
- Modify any other locale PO files present
- Run: `bun run i18n:compile` in `web/`

- [ ] **Step 1: Extract new i18n strings**

Run: `cd web && bun run i18n:extract`

- [ ] **Step 2: Add translations**

Find the `anime.sideStories` entry in each PO file and add translations:

- `en/messages.po`: `msgstr "Side Stories & Movies"`
- `zh-Hant/messages.po`: `msgstr "番外篇 / 劇場版"`
- `zh-Hans/messages.po`: `msgstr "番外篇 / 剧场版"`
- Other locales: add appropriate translations

- [ ] **Step 3: Compile translations**

Run: `cd web && bun run i18n:compile`

- [ ] **Step 4: Verify typecheck**

Run: `cd web && bun run typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add side stories section translations"
```

---

### Task 8: E2E verification

**Files:** None (manual testing)

- [ ] **Step 1: Build and run backend**

Run: `cd api && go build ./... && go run .`
Verify no startup errors.

- [ ] **Step 2: Test franchise endpoint directly**

Pick an anime with known sequels (e.g., the anime at Bangumi ID 510710 that triggered this feature).

Run: `curl http://localhost:<port>/api/v1/discover/anime/510710/franchise | jq .`

Expected: JSON with `main_series` (multiple entries in order) and `side_stories` (OVAs/movies if any).

- [ ] **Step 3: Verify frontend**

Open `http://localhost:5173/anime/510710` in browser.

Verify:
1. Season tabs at top show all seasons (S1, S2, S3, S4...) not just adjacent ones
2. Clicking a season tab navigates to the correct anime
3. Side stories / OVA section appears at bottom (if the franchise has any)
4. If franchise API is slow on first load, the page still renders with fallback relations

- [ ] **Step 4: Test edge case — single-season anime**

Open a single-season anime detail page.

Verify:
1. No season tabs shown (main_series has only 1 entry)
2. Side stories section only appears if franchise has side stories
3. Falls back gracefully to existing relations rail if franchise has no side stories

- [ ] **Step 5: Commit any fixes**

If any fixes were needed during testing, commit them individually.
