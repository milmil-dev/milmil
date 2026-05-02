# Episode Buzz Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first version of milmil's daily anime radar by adding an Episode Buzz backend endpoint and a compact home-page module.

**Architecture:** Add episode comment count to Bangumi episode metadata, compute public episode buzz in the metadata service, expose it through `/api/v1/discover/episode-buzz`, and consume it from the web home page. The MVP uses Bangumi episode comments, anime score, and recency; AniDB episode ratings remain a later phase.

**Tech Stack:** Go Echo API, sqlc-backed existing store where needed, Bangumi and AniList metadata clients, React, TanStack Query, Vite/Vitest.

---

### Task 1: Add Episode Comment Count to Metadata Types

**Files:**
- Modify: `api/internal/integration/bangumi/types.go`
- Modify: `api/internal/metadata/types.go`
- Modify: `api/internal/metadata/service.go`
- Test: `api/internal/metadata/service_test.go`

**Step 1: Write the failing test**

Add a test in `api/internal/metadata/service_test.go`:

```go
func TestGetEpisodes_IncludesCommentCount(t *testing.T) {
	bgm := &mockBangumi{
		episodesFn: func(ctx context.Context, id int) ([]bangumi.Episode, error) {
			return []bangumi.Episode{{
				ID: 101, Type: 0, Sort: 1, Name: "Episode 1", AirDate: "2026-04-01", Comment: 42,
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	eps, err := svc.GetEpisodes(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(eps) != 1 {
		t.Fatalf("want 1 episode, got %d", len(eps))
	}
	if eps[0].CommentCount != 42 {
		t.Fatalf("want comment_count 42, got %d", eps[0].CommentCount)
	}
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd api && go test ./internal/metadata -run TestGetEpisodes_IncludesCommentCount -count=1
```

Expected: FAIL because `bangumi.Episode.Comment` or `metadata.Episode.CommentCount` does not exist.

**Step 3: Write minimal implementation**

Add to `api/internal/integration/bangumi/types.go`:

```go
Comment int `json:"comment"`
```

Add to `api/internal/metadata/types.go` `Episode`:

```go
CommentCount int `json:"comment_count,omitempty"`
```

Update `bangumiEpisodeToEpisode` in `api/internal/metadata/service.go`:

```go
CommentCount: e.Comment,
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd api && go test ./internal/metadata -run TestGetEpisodes_IncludesCommentCount -count=1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add api/internal/integration/bangumi/types.go api/internal/metadata/types.go api/internal/metadata/service.go api/internal/metadata/service_test.go
git commit -m "feat: expose bangumi episode comment count"
```

### Task 2: Add Episode Buzz Domain Types and Scoring

**Files:**
- Modify: `api/internal/metadata/types.go`
- Create: `api/internal/metadata/episode_buzz.go`
- Test: `api/internal/metadata/episode_buzz_test.go`

**Step 1: Write the failing scoring test**

Create `api/internal/metadata/episode_buzz_test.go`:

```go
package metadata

import (
	"testing"
	"time"
)

func TestScoreEpisodeBuzz_UsesCommentsScoreAndRecency(t *testing.T) {
	airDate := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	got := scoreEpisodeBuzz(episodeBuzzSignals{
		CommentCount:    100,
		MaxCommentCount: 100,
		AnimeScore:      8.0,
		AirDate:         airDate,
		Now:             time.Now(),
	})
	if got < 80 {
		t.Fatalf("want recent high-comment episode score >= 80, got %d", got)
	}
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd api && go test ./internal/metadata -run TestScoreEpisodeBuzz_UsesCommentsScoreAndRecency -count=1
```

Expected: FAIL because `scoreEpisodeBuzz` is undefined.

**Step 3: Add types and scoring**

Add to `api/internal/metadata/types.go`:

```go
type EpisodeBuzzItem struct {
	BangumiID        int     `json:"bangumi_id"`
	BangumiEpisodeID int     `json:"bangumi_episode_id"`
	EpisodeNumber    float64 `json:"episode_number"`
	Title            string  `json:"title"`
	TitleOriginal    string  `json:"title_original"`
	AnimeTitle       string  `json:"anime_title"`
	CoverImage       string  `json:"cover_image"`
	AirDate          string  `json:"air_date,omitempty"`
	AnimeScore       float64 `json:"anime_score"`
	CommentCount     int     `json:"comment_count"`
	BuzzScore        int     `json:"buzz_score"`
	Source           string  `json:"source"`
}

type EpisodeBuzzResult struct {
	Items       []EpisodeBuzzItem `json:"items"`
	GeneratedAt string            `json:"generated_at"`
}
```

Create `api/internal/metadata/episode_buzz.go` with:

```go
package metadata

import (
	"math"
	"time"
)

type episodeBuzzSignals struct {
	CommentCount    int
	MaxCommentCount int
	AnimeScore      float64
	AirDate         string
	Now             time.Time
}

func scoreEpisodeBuzz(s episodeBuzzSignals) int {
	commentScore := 0.0
	if s.MaxCommentCount > 0 {
		commentScore = math.Sqrt(float64(s.CommentCount)) / math.Sqrt(float64(s.MaxCommentCount))
	}
	animeScore := math.Max(0, math.Min(s.AnimeScore/10.0, 1))
	recencyScore := recencyBuzzScore(s.AirDate, s.Now)
	score := commentScore*0.65 + animeScore*0.20 + recencyScore*0.15
	return int(math.Round(score * 100))
}

func recencyBuzzScore(airDate string, now time.Time) float64 {
	if airDate == "" {
		return 0
	}
	t, err := time.Parse("2006-01-02", airDate)
	if err != nil {
		return 0
	}
	days := now.Sub(t).Hours() / 24
	switch {
	case days < 0:
		return 0
	case days <= 2:
		return 1
	case days <= 7:
		return 0.65
	case days <= 30:
		return 0.25
	default:
		return 0
	}
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd api && go test ./internal/metadata -run TestScoreEpisodeBuzz_UsesCommentsScoreAndRecency -count=1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add api/internal/metadata/types.go api/internal/metadata/episode_buzz.go api/internal/metadata/episode_buzz_test.go
git commit -m "feat: add episode buzz scoring"
```

### Task 3: Build Metadata Service Method

**Files:**
- Modify: `api/internal/metadata/episode_buzz.go`
- Test: `api/internal/metadata/episode_buzz_test.go`

**Step 1: Write the failing service test**

Add a test that stubs AniList `Browse` and Bangumi `GetSubjectEpisodes`:

```go
func TestGetEpisodeBuzz_ReturnsAiredRankedEpisodes(t *testing.T) {
	now := time.Now()
	bgm := &mockBangumi{
		episodesFn: func(ctx context.Context, id int) ([]bangumi.Episode, error) {
			return []bangumi.Episode{
				{ID: 201, Type: 0, Sort: 1, Name: "Low", AirDate: now.AddDate(0, 0, -1).Format("2006-01-02"), Comment: 5},
				{ID: 202, Type: 0, Sort: 2, Name: "High", AirDate: now.AddDate(0, 0, -1).Format("2006-01-02"), Comment: 90},
			}, nil
		},
	}
	al := &mockAniList{
		browseFn: func(ctx context.Context, filter anilist.BrowseFilter, page, perPage int) ([]anilist.Media, error) {
			return []anilist.Media{{
				ID: 1,
				Title: anilist.MediaTitle{Romaji: "Test Anime", Native: "テスト"},
				CoverImage: anilist.CoverImage{Large: "cover.jpg"},
				AverageScore: 80,
			}}, nil
		},
	}
	svc := metadata.New(bgm, al, cache.New(""))

	result, err := svc.GetEpisodeBuzz(context.Background(), EpisodeBuzzFilter{Year: 2026, Season: "SPRING", Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 {
		t.Fatalf("want 2 items, got %d", len(result.Items))
	}
	if result.Items[0].BangumiEpisodeID != 202 {
		t.Fatalf("want highest-comment episode first, got %+v", result.Items[0])
	}
}
```

Update `mockAniList` in this test file with `browseFn` if needed.

**Step 2: Run test to verify it fails**

Run:

```bash
cd api && go test ./internal/metadata -run TestGetEpisodeBuzz_ReturnsAiredRankedEpisodes -count=1
```

Expected: FAIL because `GetEpisodeBuzz` is undefined.

**Step 3: Implement the service method**

Add:

```go
type EpisodeBuzzFilter struct {
	Year   int
	Season string
	Period string
	Limit  int
}
```

Implement `GetEpisodeBuzz` to:

- Default `Limit` to 20 and cap at 50.
- Call `s.Browse(ctx, BrowseFilter{Year: filter.Year, Season: filter.Season, Status: "RELEASING", Format: "TV", Sort: "POPULARITY_DESC"}, 1)`.
- For each result with a Bangumi ID, call `s.GetEpisodes`.
- Keep only main episodes with `AirDate <= today`.
- Score and sort descending.
- Cache by year, season, period, and limit for 30 minutes.

**Step 4: Run focused tests**

Run:

```bash
cd api && go test ./internal/metadata -run 'TestGetEpisodeBuzz|TestScoreEpisodeBuzz' -count=1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add api/internal/metadata/episode_buzz.go api/internal/metadata/episode_buzz_test.go
git commit -m "feat: compute episode buzz rankings"
```

### Task 4: Expose `/discover/episode-buzz`

**Files:**
- Modify: `api/internal/api/router.go`
- Modify: `api/internal/api/discover_handler.go`
- Test: `api/internal/api/discover_handler_test.go`
- Modify: `api/internal/api/openapi.json` if the project keeps this file hand-maintained for public endpoints.

**Step 1: Write the failing handler test**

Add a handler test in `api/internal/api/discover_handler_test.go` that requests:

```text
GET /api/v1/discover/episode-buzz?year=2026&season=SPRING&limit=5
```

Expected:

- HTTP 200.
- JSON contains `items`.
- The first item has `buzz_score`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd api && go test ./internal/api -run TestEpisodeBuzz -count=1
```

Expected: FAIL with 404.

**Step 3: Add route and handler**

In `api/internal/api/router.go`, add near other discover routes:

```go
discoverGroup.GET("/episode-buzz", h.handleEpisodeBuzz)
```

In `api/internal/api/discover_handler.go`, add:

```go
func (h *handler) handleEpisodeBuzz(c echo.Context) error {
	year, _ := strconv.Atoi(c.QueryParam("year"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	filter := metadata.EpisodeBuzzFilter{
		Year:   year,
		Season: c.QueryParam("season"),
		Period: c.QueryParam("period"),
		Limit:  limit,
	}
	result, err := h.metadata.GetEpisodeBuzz(c.Request().Context(), filter)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, result)
}
```

**Step 4: Run tests**

Run:

```bash
cd api && go test ./internal/api ./internal/metadata -count=1
```

Expected: PASS.

**Step 5: Commit**

```bash
git add api/internal/api/router.go api/internal/api/discover_handler.go api/internal/api/discover_handler_test.go api/internal/api/openapi.json
git commit -m "feat: expose episode buzz endpoint"
```

### Task 5: Add Web API Wrapper

**Files:**
- Modify: `web/src/lib/api/discover.ts`
- Test: `web/src/lib/api/discover.test.ts`

**Step 1: Write the failing test**

Create or extend `web/src/lib/api/discover.test.ts` to verify `episodeBuzz` serializes year, season, period, and limit.

**Step 2: Run test to verify it fails**

Run:

```bash
cd web && bun test src/lib/api/discover.test.ts
```

Expected: FAIL because `discoverApi.episodeBuzz` is undefined.

**Step 3: Add types and wrapper**

Add:

```ts
export interface EpisodeBuzzItem {
  bangumi_id: number;
  bangumi_episode_id: number;
  episode_number: number;
  title: string;
  title_original: string;
  anime_title: string;
  cover_image: string;
  air_date?: string;
  anime_score: number;
  comment_count: number;
  buzz_score: number;
  source: string;
}

export interface EpisodeBuzzResult {
  items: EpisodeBuzzItem[];
  generated_at: string;
}
```

Add to `discoverApi`:

```ts
episodeBuzz: (params: { year?: number; season?: string; period?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params.year) qs.set('year', String(params.year));
  if (params.season) qs.set('season', params.season);
  if (params.period) qs.set('period', params.period);
  if (params.limit) qs.set('limit', String(params.limit));
  return api.get<EpisodeBuzzResult>(`/api/v1/discover/episode-buzz?${qs.toString()}`);
},
```

Add to `discoverKeys`:

```ts
episodeBuzz: (params: { year?: number; season?: string; period?: string; limit?: number }) =>
  ['discover', 'episode-buzz', params] as const,
```

**Step 4: Run test**

Run:

```bash
cd web && bun test src/lib/api/discover.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add web/src/lib/api/discover.ts web/src/lib/api/discover.test.ts
git commit -m "feat: add episode buzz web client"
```

### Task 6: Add Episode Buzz Home Module

**Files:**
- Create: `web/src/components/home/EpisodeBuzzRail.tsx`
- Test: `web/src/components/home/EpisodeBuzzRail.test.tsx`
- Modify: `web/src/pages/HomePage.tsx`
- Test: `web/src/pages/HomePage.test.tsx`

**Step 1: Write the failing component test**

Test that the rail renders:

- Buzz score.
- Episode number.
- Comment count.
- Anime title.
- Empty state when `items` is empty.

**Step 2: Run test to verify it fails**

Run:

```bash
cd web && bun test src/components/home/EpisodeBuzzRail.test.tsx
```

Expected: FAIL because the component file does not exist.

**Step 3: Implement the component**

Use existing compact card style. Keep cards stable and scannable:

```tsx
export function EpisodeBuzzRail({ items }: { items: EpisodeBuzzItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight">Episode Buzz</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.slice(0, 6).map((item, index) => (
          <Link
            key={`${item.bangumi_id}-${item.bangumi_episode_id}`}
            to="/anime/$id"
            params={{ id: String(item.bangumi_id) }}
            className="group flex gap-3 rounded-md bg-white/[0.035] hover:bg-white/[0.06] p-3"
          >
            <div className="w-10 text-center text-sm font-bold text-white/70">#{index + 1}</div>
            <img src={item.cover_image} alt="" className="h-16 w-11 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{item.anime_title}</div>
              <div className="truncate text-xs text-white/55">EP {item.episode_number} · {item.title}</div>
              <div className="mt-2 text-xs text-white/45">
                Buzz {item.buzz_score} · 討論 {item.comment_count} · 作品 {item.anime_score.toFixed(1)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

Adjust route syntax to match current TanStack Router route definitions if needed.

**Step 4: Wire into HomePage**

In `web/src/pages/HomePage.tsx`:

- Compute current anime season.
- Query `discoverApi.episodeBuzz({ year, season, period: 'week', limit: 20 })`.
- Render `EpisodeBuzzRail` after today's schedule and before genre chips/trending.

**Step 5: Run tests**

Run:

```bash
cd web && bun test src/components/home/EpisodeBuzzRail.test.tsx src/pages/HomePage.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add web/src/components/home/EpisodeBuzzRail.tsx web/src/components/home/EpisodeBuzzRail.test.tsx web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx
git commit -m "feat: show episode buzz on home"
```

### Task 7: Final Verification

**Files:**
- No source changes expected.

**Step 1: Run backend tests**

Run:

```bash
cd api && go test ./...
```

Expected: PASS.

**Step 2: Run frontend tests**

Run:

```bash
cd web && bun test
```

Expected: PASS.

**Step 3: Run frontend build**

Run:

```bash
cd web && bun run build
```

Expected: PASS.

**Step 4: Manual smoke test**

Start the app as the project normally does, open the home page, and verify:

- Episode Buzz appears when the endpoint returns items.
- The home page still renders if Episode Buzz returns empty.
- Buzz cards link to anime detail.
- No text overlaps on mobile width.

**Step 5: Commit final fixes if any**

```bash
git add <changed-files>
git commit -m "fix: polish episode buzz radar"
```
