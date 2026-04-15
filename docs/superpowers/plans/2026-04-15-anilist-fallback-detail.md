# AniList Fallback Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow anime detail pages to render from AniList data when no Bangumi entry exists, using an `al-` prefix in the URL.

**Architecture:** Extend the existing `/anime/:id` handler to detect `al-` prefix, add a new `GetAnimeDetailByAniList()` method that constructs `AnimeDetail` purely from AniList API data, and update the frontend to use `al-{anilistId}` links for franchise entries with `bangumi_id === 0`.

**Tech Stack:** Go (Echo), React (TanStack Query/Router), existing metadata service + AniList client.

---

### Task 1: Add `GetAnimeDetailByAniList` method

**Files:**
- Modify: `api/internal/metadata/service.go`

- [ ] **Step 1: Add the method**

Add after `GetAnimeDetail` (around line 516) in `api/internal/metadata/service.go`:

```go
// GetAnimeDetailByAniList constructs an AnimeDetail purely from AniList data.
// Used when no Bangumi entry exists for an anime (e.g., certain OVAs, specials).
func (s *Service) GetAnimeDetailByAniList(ctx context.Context, anilistID int) (*AnimeDetail, error) {
	cacheKey := fmt.Sprintf("meta:anilist:%d", anilistID)
	var cached AnimeDetail
	if s.getCache(ctx, cacheKey, &cached) {
		return &cached, nil
	}

	media, err := s.anilist.GetMedia(ctx, anilistID)
	if err != nil {
		return nil, err
	}

	summary := anilistMediaToSummary(*media)
	detail := &AnimeDetail{
		AnimeSummary: summary,
		Synopsis:     media.Description,
		BannerImage:  media.BannerImage,
		Popularity:   media.Popularity,
		Tags:         media.Genres,
		Rating: Rating{
			Score: float64(media.AverageScore) / 10.0,
		},
	}

	if media.Trailer != nil && media.Trailer.ID != "" && media.Trailer.Site == "youtube" {
		detail.TrailerURL = "https://www.youtube.com/embed/" + media.Trailer.ID
	}

	// Relations
	if media.Relations != nil {
		for _, edge := range media.Relations.Edges {
			if edge.Node.Format != "ANIME" && edge.Node.Format != "OVA" && edge.Node.Format != "ONA" && edge.Node.Format != "MOVIE" && edge.Node.Format != "SPECIAL" {
				continue
			}
			detail.Relations = append(detail.Relations, RelatedAnime{
				RelationType: edge.RelationType,
				Anime:        anilistMediaToSummary(edge.Node),
			})
		}
	}

	// Recommendations
	if media.Recommendations != nil {
		for _, rec := range media.Recommendations.Nodes {
			if rec.MediaRecommendation != nil && rec.MediaRecommendation.Format != "MANGA" {
				detail.Recommendations = append(detail.Recommendations, anilistMediaToSummary(*rec.MediaRecommendation))
			}
		}
	}

	// Reviews
	if media.Reviews != nil {
		for _, r := range media.Reviews.Nodes {
			detail.Reviews = append(detail.Reviews, UserReview{
				ID:       r.ID,
				Summary:  r.Summary,
				Score:    r.Score,
				Username: r.User.Name,
				Avatar:   r.User.Avatar.Medium,
			})
		}
	}

	// Characters
	if media.Characters != nil {
		for _, edge := range media.Characters.Edges {
			char := AnimeCharacter{
				Role: edge.Role,
				Character: CharacterPerson{
					ID:         edge.Node.ID,
					Name:       edge.Node.Name.Full,
					NameNative: edge.Node.Name.Native,
					Image:      edge.Node.Image.Medium,
				},
			}
			if len(edge.VoiceActors) > 0 {
				va := edge.VoiceActors[0]
				char.VoiceActor = &CharacterPerson{
					ID:         va.ID,
					Name:       va.Name.Full,
					NameNative: va.Name.Native,
					Image:      va.Image.Medium,
				}
			}
			detail.Characters = append(detail.Characters, char)
		}
	}

	s.setCache(ctx, cacheKey, detail, 24*time.Hour)
	return detail, nil
}
```

- [ ] **Step 2: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/internal/metadata/service.go
git commit -m "feat(metadata): add GetAnimeDetailByAniList for AniList-only detail pages"
```

---

### Task 2: Update handler to support `al-` prefix

**Files:**
- Modify: `api/internal/api/discover_handler.go`

- [ ] **Step 1: Update handleAnimeDetail**

Replace the existing `handleAnimeDetail` function (lines 51-61) with:

```go
func (h *handler) handleAnimeDetail(c echo.Context) error {
	rawID := c.Param("id")
	ctx := c.Request().Context()

	// AniList-only: id starts with "al-"
	if after, ok := strings.CutPrefix(rawID, "al-"); ok {
		alID, err := strconv.Atoi(after)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid anilist id")
		}
		detail, err := h.metadata.GetAnimeDetailByAniList(ctx, alID)
		if err != nil {
			return mapMetadataError(err)
		}
		return c.JSON(http.StatusOK, detail)
	}

	id, err := strconv.Atoi(rawID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	detail, err := h.metadata.GetAnimeDetail(ctx, id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, detail)
}
```

Ensure `"strings"` is in the imports at the top of the file (it's already imported).

- [ ] **Step 2: Verify build**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add api/internal/api/discover_handler.go
git commit -m "feat(api): support al- prefix in anime detail handler"
```

---

### Task 3: Update frontend API types and functions

**Files:**
- Modify: `web/src/lib/api/discover.ts`

- [ ] **Step 1: Update detail function and query key types**

Change the `detail` function in `discoverApi` from:
```typescript
detail: (id: number) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
```
To:
```typescript
detail: (id: number | string) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
```

Change the `detail` key in `discoverKeys` from:
```typescript
detail: (id: number) => ['discover', 'detail', id] as const,
```
To:
```typescript
detail: (id: number | string) => ['discover', 'detail', id] as const,
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && bun run typecheck`
Expected: No new errors (pre-existing errors in other files are fine).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/discover.ts
git commit -m "feat(web): support string IDs in detail API for al- prefix"
```

---

### Task 4: Update AnimeDetailPage for AniList-only pages

**Files:**
- Modify: `web/src/pages/AnimeDetailPage.tsx`

This task updates the page component to handle `al-` prefixed IDs — disabling Bangumi-only features and using string IDs for queries.

- [ ] **Step 1: Update ID parsing and query logic**

At the top of `AnimeDetailPage()` (around lines 200-243), replace:

```typescript
const { id } = useParams({ strict: false });
const numericId = Number(id);
const navigate = useNavigate();
const setImage = useBgStore((s) => s.setImage);

const {
  data: anime,
  isLoading,
  isError,
} = useQuery({
  queryKey: discoverKeys.detail(numericId),
  queryFn: () => discoverApi.detail(numericId),
  enabled: !Number.isNaN(numericId),
});

useDocumentTitle(anime?.title ?? 'Anime');

const { data: episodes = [] } = useQuery({
  queryKey: discoverKeys.episodes(numericId),
  queryFn: () => discoverApi.episodes(numericId),
  enabled: !Number.isNaN(numericId),
});

const { isAuthenticated } = useAuth();

const { data: playableData } = useQuery({
  queryKey: animeKeys.playableEpisodes(numericId),
  queryFn: () => animeApi.playableEpisodes(numericId),
  enabled: !Number.isNaN(numericId) && isAuthenticated,
});

const { data: comments = [] } = useQuery({
  queryKey: discoverKeys.comments(numericId),
  queryFn: () => discoverApi.comments(numericId),
  enabled: !Number.isNaN(numericId),
});

const { data: franchise } = useQuery({
  queryKey: discoverKeys.franchise(numericId),
  queryFn: () => discoverApi.franchise(numericId),
  enabled: !Number.isNaN(numericId),
  staleTime: 24 * 60 * 60 * 1000,
});
```

With:

```typescript
const { id } = useParams({ strict: false });
const isAniListOnly = id?.startsWith('al-') ?? false;
const numericId = isAniListOnly ? Number(id!.slice(3)) : Number(id);
const detailId = isAniListOnly ? id! : numericId;
const navigate = useNavigate();
const setImage = useBgStore((s) => s.setImage);

const {
  data: anime,
  isLoading,
  isError,
} = useQuery({
  queryKey: discoverKeys.detail(detailId),
  queryFn: () => discoverApi.detail(detailId),
  enabled: isAniListOnly || !Number.isNaN(numericId),
});

useDocumentTitle(anime?.title ?? 'Anime');

const { data: episodes = [] } = useQuery({
  queryKey: discoverKeys.episodes(numericId),
  queryFn: () => discoverApi.episodes(numericId),
  enabled: !isAniListOnly && !Number.isNaN(numericId),
});

const { isAuthenticated } = useAuth();

const { data: playableData } = useQuery({
  queryKey: animeKeys.playableEpisodes(numericId),
  queryFn: () => animeApi.playableEpisodes(numericId),
  enabled: !isAniListOnly && !Number.isNaN(numericId) && isAuthenticated,
});

const { data: comments = [] } = useQuery({
  queryKey: discoverKeys.comments(numericId),
  queryFn: () => discoverApi.comments(numericId),
  enabled: !isAniListOnly && !Number.isNaN(numericId),
});

const { data: franchise } = useQuery({
  queryKey: discoverKeys.franchise(numericId),
  queryFn: () => discoverApi.franchise(numericId),
  enabled: !isAniListOnly && !Number.isNaN(numericId),
  staleTime: 24 * 60 * 60 * 1000,
});
```

- [ ] **Step 2: Update franchise season tabs — make `bangumi_id === 0` entries clickable**

Find the season tabs section (around line 576). Find the `<span>` fallback for entries without bangumi_id:

```tsx
) : (
  <span
    key={s.anilist_id}
    className="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] text-white/30 shrink-0"
    title={s.title}
  >
    {`S${idx + 1}`}
  </span>
);
```

Replace with:

```tsx
) : (
  <Link
    key={s.anilist_id}
    to="/anime/$id"
    params={{ id: `al-${s.anilist_id}` }}
    className={cn(
      'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
      'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
    )}
    title={s.title}
  >
    {`S${idx + 1}`}
  </Link>
);
```

- [ ] **Step 3: Update franchise side stories — make `bangumi_id === 0` entries clickable**

Find the side stories section (around line 1013). Find the `bangumi_id > 0` check:

```tsx
{entry.bangumi_id > 0 ? (
  <AnimeCard anime={cardAnime} />
) : (
  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/[0.05]">
    <img src={entry.cover_image} alt={entry.title} className="w-full h-full object-cover" />
  </div>
)}
```

Replace with:

```tsx
{entry.bangumi_id > 0 ? (
  <AnimeCard anime={cardAnime} />
) : (
  <Link to="/anime/$id" params={{ id: `al-${entry.anilist_id}` }}>
    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/[0.05] hover:opacity-80 transition-opacity">
      <img src={entry.cover_image} alt={entry.title} className="w-full h-full object-cover" />
    </div>
  </Link>
)}
```

- [ ] **Step 4: Hide Bangumi-only UI on AniList pages**

Find the subscription check (around line 253):
```typescript
const hasSubscription = rules.some((r) => r.bangumi_id === numericId && r.enabled);
```

Replace with:
```typescript
const hasSubscription = !isAniListOnly && rules.some((r) => r.bangumi_id === numericId && r.enabled);
```

Also, anywhere the page renders collection buttons, score selector, or "搵資源" (torrent search) button, wrap them with `!isAniListOnly &&` to hide on AniList-only pages. Search for `hasSubscription`, `statusMutation`, `scoreMutation`, `搵資源` or `anime.findTorrents` in the file. The key spots are:

1. The "加入收藏" / collection button — add `!isAniListOnly &&` before the button JSX
2. The "搵資源" button — add `!isAniListOnly &&` before the button JSX
3. The score selector — add `!isAniListOnly &&` before the `<ScoreSelector>` JSX

- [ ] **Step 5: Verify typecheck**

Run: `cd web && bun run typecheck`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/AnimeDetailPage.tsx
git commit -m "feat(web): support AniList-only anime detail pages with al- prefix"
```

---

### Task 5: E2E verification

- [ ] **Step 1: Build and verify backend**

Run: `cd api && go build ./...`
Expected: No errors.

- [ ] **Step 2: Test AniList-only endpoint**

Test the Dorohedoro OVA (AniList ID 114622 — has no Bangumi entry):

Run: `curl -s http://localhost:8080/api/v1/discover/anime/al-114622 | python3 -m json.tool | head -20`

Expected: JSON with `AnimeDetail` data — title, cover_image, synopsis, characters, etc. populated from AniList. `bangumi_id` should be 0.

- [ ] **Step 3: Test existing Bangumi endpoint still works**

Run: `curl -s http://localhost:8080/api/v1/discover/anime/266301 | python3 -m json.tool | head -5`

Expected: Normal response with `bangumi_id: 266301`.

- [ ] **Step 4: Verify frontend**

Open `http://localhost:5173/anime/266301` (Dorohedoro).

Verify:
1. Scroll to 番外篇 section
2. OVA card should now be clickable
3. Click OVA → navigates to `/anime/al-114622`
4. AniList-only page shows: cover, title, synopsis, characters, relations
5. No collection buttons, no episode list, no torrent search on AniList-only page

- [ ] **Step 5: Commit any fixes**

If any fixes were needed during testing, commit them individually.
