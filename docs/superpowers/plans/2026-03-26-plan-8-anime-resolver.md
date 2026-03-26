# Anime Matching Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate local anime/episodes tables from Bangumi after DandanPlay matching, linking media files to episodes.

**Architecture:** New migration adds `dandanplay_anime_id` column. Matcher stores anime ID during matching. AnimeResolver service resolves DandanPlay→Bangumi, creates anime/episode records, links files. Integrated into scan pipeline.

**Tech Stack:** Go 1.26, sqlc, Echo v4, existing Bangumi + DandanPlay clients

**Important:** Use `mise exec -- go` for Go commands. Run `sqlc generate` after SQL changes.

---

## File Map

### Created
- `api/migrations/000015_add_dandanplay_anime_id.up.sql`
- `api/migrations/000015_add_dandanplay_anime_id.down.sql`
- `api/internal/store/queries/anime.sql`
- `api/internal/store/queries/episodes.sql`
- `api/internal/resolver/resolver.go`
- `api/internal/resolver/resolver_test.go`

### Modified
- `api/internal/store/queries/media_files.sql` — add 3 queries
- `api/internal/integration/dandanplay/types.go` — add BangumiInfo
- `api/internal/integration/dandanplay/client.go` — add GetBangumiInfo
- `api/internal/matcher/matcher.go` — store dandanplay_anime_id
- `api/internal/api/router.go` — add resolver to handler
- `api/internal/api/library_handler.go` — call resolver after match
- `api/cmd/server/main.go` — init resolver

---

## Task 1: Migration + sqlc Queries + DandanPlay Client Update

**Files:**
- Create: `api/migrations/000015_add_dandanplay_anime_id.up.sql`
- Create: `api/migrations/000015_add_dandanplay_anime_id.down.sql`
- Create: `api/internal/store/queries/anime.sql`
- Create: `api/internal/store/queries/episodes.sql`
- Modify: `api/internal/store/queries/media_files.sql`
- Modify: `api/internal/integration/dandanplay/types.go`
- Modify: `api/internal/integration/dandanplay/client.go`

- [ ] **Step 1: Create migration files**

```sql
-- api/migrations/000015_add_dandanplay_anime_id.up.sql
ALTER TABLE media_files ADD COLUMN dandanplay_anime_id INTEGER;
```

```sql
-- api/migrations/000015_add_dandanplay_anime_id.down.sql
ALTER TABLE media_files DROP COLUMN dandanplay_anime_id;
```

- [ ] **Step 2: Create anime.sql queries**

```sql
-- api/internal/store/queries/anime.sql

-- name: GetAnimeByBangumiID :one
SELECT * FROM anime WHERE bangumi_id = ? LIMIT 1;

-- name: CreateAnime :one
INSERT INTO anime (id, library_id, title, title_zh, title_en, synopsis, cover_image_url,
    total_episodes, status, air_date, year, season, genres, bangumi_id, dandanplay_bangumi_id,
    created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: ListAnimeByLibraryID :many
SELECT * FROM anime WHERE library_id = ? ORDER BY title;
```

- [ ] **Step 3: Create episodes.sql queries**

```sql
-- api/internal/store/queries/episodes.sql

-- name: GetEpisodeByDandanplayID :one
SELECT * FROM episodes WHERE dandanplay_episode_id = ? LIMIT 1;

-- name: CreateEpisode :one
INSERT INTO episodes (id, anime_id, episode_number, title, title_zh, air_date,
    dandanplay_episode_id, bangumi_episode_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: ListEpisodesByAnimeID :many
SELECT * FROM episodes WHERE anime_id = ? ORDER BY episode_number;
```

- [ ] **Step 4: Add media_files queries**

Append to `api/internal/store/queries/media_files.sql`:

```sql
-- name: UpdateMediaFileDandanplayIDs :exec
UPDATE media_files
SET dandanplay_episode_id = ?, dandanplay_anime_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListMatchedUnlinkedMediaFiles :many
SELECT * FROM media_files
WHERE library_id = ? AND dandanplay_episode_id IS NOT NULL AND episode_id IS NULL;

-- name: UpdateMediaFileEpisodeID :exec
UPDATE media_files
SET episode_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;
```

- [ ] **Step 5: Run sqlc generate**

```bash
cd api && sqlc generate
```

Check for errors. The new `dandanplay_anime_id` column from the migration will appear in the `MediaFile` struct as `sql.NullInt64`.

- [ ] **Step 6: Add DandanPlay GetBangumiInfo**

Add to `api/internal/integration/dandanplay/types.go`:

```go
type BangumiInfo struct {
	AnimeID    int64  `json:"animeId"`
	AnimeTitle string `json:"animeTitle"`
	BangumiID  int64  `json:"bangumiId"`
}

type bangumiInfoResponse struct {
	ErrorCode    int    `json:"errorCode"`
	ErrorMessage string `json:"errorMessage"`
	BangumiID    int64  `json:"bangumiId"`
	AnimeTitle   string `json:"animeTitle"`
}
```

Add to `Client` interface in `client.go`:

```go
GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error)
```

Add implementation:

```go
func (c *httpClient) GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error) {
	path := "/api/v2/bangumi/" + strconv.FormatInt(dandanplayAnimeID, 10)
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	var resp bangumiInfoResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	if resp.ErrorCode != 0 {
		return nil, fmt.Errorf("%w: %s", ErrAPIError, resp.ErrorMessage)
	}
	return &BangumiInfo{
		AnimeID:    dandanplayAnimeID,
		AnimeTitle: resp.AnimeTitle,
		BangumiID:  resp.BangumiID,
	}, nil
}
```

- [ ] **Step 7: Build + commit**

```bash
cd api && go build ./...
git add api/migrations/ api/internal/store/ api/internal/integration/dandanplay/
git commit -m "feat: add migration, sqlc queries, and DandanPlay GetBangumiInfo for anime resolver"
```

---

## Task 2: Update Matcher to Store dandanplay_anime_id

**Files:**
- Modify: `api/internal/matcher/matcher.go`

- [ ] **Step 1: Read and update matcher.go**

Read `api/internal/matcher/matcher.go`. Change `matchSingleFile` to also return the `animeID` from the match result. Update the caller in `MatchLibrary` to use `UpdateMediaFileDandanplayIDs` (stores both episode + anime IDs) instead of `UpdateMediaFileDandanplayID`.

Key changes:
- `matchSingleFile` returns `(episodeID int64, animeID int64, matched bool)`
- Use `store.UpdateMediaFileDandanplayIDsParams` instead of `UpdateMediaFileDandanplayIDParams`
- The match result `result.Matches[0]` has both `EpisodeID` and `AnimeID`

**Important:** Check the actual generated param types for `UpdateMediaFileDandanplayIDsParams` — the `dandanplay_anime_id` column is nullable INTEGER, so the param may be `sql.NullInt64`.

- [ ] **Step 2: Run matcher tests**

```bash
cd api && go test ./internal/matcher/... -v
```

Fix any compilation errors. The existing mock DandanPlay client needs `GetBangumiInfo` method added.

- [ ] **Step 3: Run all tests**

```bash
cd api && go test ./... 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/matcher/
git commit -m "feat: store dandanplay_anime_id during matching"
```

---

## Task 3: AnimeResolver Service

**Files:**
- Create: `api/internal/resolver/resolver.go`
- Create: `api/internal/resolver/resolver_test.go`

- [ ] **Step 1: Create resolver.go**

```go
package resolver

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/store"
)

type ResolveSummary struct {
	AnimeCreated    int `json:"anime_created"`
	EpisodesCreated int `json:"episodes_created"`
	FilesLinked     int `json:"files_linked"`
	Errors          int `json:"errors"`
}

type Resolver struct {
	queries    *store.Queries
	bangumi    bangumi.Client
	dandanplay dandanplay.Client
	cache      cache.Cache
}

func New(q *store.Queries, bgm bangumi.Client, ddp dandanplay.Client, c cache.Cache) *Resolver {
	return &Resolver{queries: q, bangumi: bgm, dandanplay: ddp, cache: c}
}

func (r *Resolver) ResolveLibrary(ctx context.Context, libraryID string) (*ResolveSummary, error) {
	files, err := r.queries.ListMatchedUnlinkedMediaFiles(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	summary := &ResolveSummary{}

	// Group by dandanplay_anime_id to avoid duplicate lookups
	animeGroups := make(map[int64][]store.MediaFile)
	for _, f := range files {
		if !f.DandanplayAnimeID.Valid {
			continue
		}
		animeGroups[f.DandanplayAnimeID.Int64] = append(animeGroups[f.DandanplayAnimeID.Int64], f)
	}

	for ddpAnimeID, groupFiles := range animeGroups {
		if err := r.resolveAnimeGroup(ctx, libraryID, ddpAnimeID, groupFiles, summary); err != nil {
			summary.Errors++
			continue // non-fatal
		}
	}

	return summary, nil
}

func (r *Resolver) resolveAnimeGroup(ctx context.Context, libraryID string, ddpAnimeID int64, files []store.MediaFile, summary *ResolveSummary) error {
	// 1. Resolve DandanPlay animeId → Bangumi subjectId
	bangumiID, err := r.resolveBangumiID(ctx, ddpAnimeID)
	if err != nil || bangumiID == 0 {
		return fmt.Errorf("resolve bangumi ID: %w", err)
	}

	// 2. Get or create anime record
	anime, created, err := r.getOrCreateAnime(ctx, libraryID, bangumiID, ddpAnimeID)
	if err != nil {
		return err
	}
	if created {
		summary.AnimeCreated++
	}

	// 3. Ensure episodes exist
	epsCreated, err := r.ensureEpisodes(ctx, anime.ID, bangumiID)
	if err != nil {
		return err
	}
	summary.EpisodesCreated += epsCreated

	// 4. Link files to episodes
	for _, f := range files {
		if !f.DandanplayEpisodeID.Valid {
			continue
		}
		ep, err := r.queries.GetEpisodeByDandanplayID(ctx, f.DandanplayEpisodeID)
		if err != nil {
			continue // episode not found — skip
		}
		_ = r.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
			EpisodeID: sql.NullString{String: ep.ID, Valid: true},
			ID:        f.ID,
		})
		summary.FilesLinked++
	}

	return nil
}

func (r *Resolver) resolveBangumiID(ctx context.Context, ddpAnimeID int64) (int64, error) {
	cacheKey := fmt.Sprintf("resolve:ddp2bgm:%d", ddpAnimeID)
	if data, err := r.cache.Get(ctx, cacheKey); err == nil {
		var id int64
		if json.Unmarshal(data, &id) == nil {
			return id, nil
		}
	}

	info, err := r.dandanplay.GetBangumiInfo(ctx, ddpAnimeID)
	if err != nil {
		return 0, err
	}

	if data, err := json.Marshal(info.BangumiID); err == nil {
		_ = r.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}

	return info.BangumiID, nil
}

func (r *Resolver) getOrCreateAnime(ctx context.Context, libraryID string, bangumiID, ddpAnimeID int64) (store.Anime, bool, error) {
	existing, err := r.queries.GetAnimeByBangumiID(ctx, sql.NullInt64{Int64: bangumiID, Valid: true})
	if err == nil {
		return existing, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return store.Anime{}, false, err
	}

	// Fetch from Bangumi
	subject, err := r.bangumi.GetSubject(ctx, int(bangumiID))
	if err != nil {
		return store.Anime{}, false, err
	}

	title := subject.NameCN
	if title == "" {
		title = subject.Name
	}

	anime, err := r.queries.CreateAnime(ctx, store.CreateAnimeParams{
		ID:                  uuid.NewString(),
		LibraryID:           sql.NullString{String: libraryID, Valid: true},
		Title:               title,
		TitleZh:             sql.NullString{String: subject.NameCN, Valid: subject.NameCN != ""},
		Synopsis:            sql.NullString{String: subject.Summary, Valid: subject.Summary != ""},
		CoverImageUrl:       sql.NullString{String: subject.Images.Large, Valid: subject.Images.Large != ""},
		TotalEpisodes:       sql.NullInt64{Int64: int64(subject.Eps), Valid: subject.Eps > 0},
		Status:              "unknown",
		AirDate:             sql.NullString{String: subject.AirDate, Valid: subject.AirDate != ""},
		Genres:              "[]",
		BangumiID:           sql.NullInt64{Int64: bangumiID, Valid: true},
		DandanplayBangumiID: sql.NullInt64{Int64: ddpAnimeID, Valid: true},
	})
	if err != nil {
		return store.Anime{}, false, err
	}

	return anime, true, nil
}

func (r *Resolver) ensureEpisodes(ctx context.Context, animeID string, bangumiID int64) (int, error) {
	// Check if episodes already exist
	existing, _ := r.queries.ListEpisodesByAnimeID(ctx, animeID)
	if len(existing) > 0 {
		return 0, nil
	}

	eps, err := r.bangumi.GetSubjectEpisodes(ctx, int(bangumiID))
	if err != nil {
		return 0, err
	}

	created := 0
	for _, ep := range eps {
		title := ep.NameCN
		if title == "" {
			title = ep.Name
		}
		_, err := r.queries.CreateEpisode(ctx, store.CreateEpisodeParams{
			ID:                  uuid.NewString(),
			AnimeID:             animeID,
			EpisodeNumber:       ep.Sort,
			Title:               sql.NullString{String: title, Valid: title != ""},
			TitleZh:             sql.NullString{String: ep.NameCN, Valid: ep.NameCN != ""},
			AirDate:             sql.NullString{String: ep.AirDate, Valid: ep.AirDate != ""},
			DandanplayEpisodeID: sql.NullInt64{Int64: int64(ep.ID), Valid: ep.ID > 0},
			BangumiEpisodeID:    sql.NullInt64{Int64: int64(ep.ID), Valid: false}, // Bangumi episode ID is different from DandanPlay
		})
		if err != nil {
			continue // non-fatal
		}
		created++
	}

	return created, nil
}
```

**IMPORTANT:** The actual `CreateAnimeParams` and `CreateEpisodeParams` field types depend on sqlc generation. Read the generated Go files to confirm nullable types. Adjust `sql.NullString` / `sql.NullInt64` usage accordingly.

- [ ] **Step 2: Create resolver_test.go**

Use a real test DB (same pattern as matcher_test.go). Mock DandanPlay and Bangumi clients. Test:
- `TestResolveLibrary_CreatesAnimeAndEpisodes` — mock DandanPlay returns bangumiId, mock Bangumi returns subject + episodes, verify anime and episode records created
- `TestResolveLibrary_LinksFiles` — verify `media_files.episode_id` gets set
- `TestResolveLibrary_SkipsExistingAnime` — if anime already exists, don't create duplicate

The mock DandanPlay client now needs `GetBangumiInfo` method. The mock Bangumi client needs `GetSubject` and `GetSubjectEpisodes`.

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/resolver/... -v
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/resolver/
git commit -m "feat: add AnimeResolver service for Bangumi data population"
```

---

## Task 4: Integration — Router + Handler + main.go

**Files:**
- Modify: `api/internal/api/router.go`
- Modify: `api/internal/api/library_handler.go`
- Modify: `api/cmd/server/main.go`
- Modify: test files (update NewRouter calls)

- [ ] **Step 1: Update router.go**

Add `resolver *resolver.Resolver` to handler struct. Update `NewRouter` signature:

```go
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver) *echo.Echo
```

Pass resolver to handler init.

- [ ] **Step 2: Update library_handler.go**

In `handleScanLibrary`, after the matcher call, add:

```go
if h.resolver != nil {
    _, _ = h.resolver.ResolveLibrary(c.Request().Context(), lib.ID)
}
```

- [ ] **Step 3: Update main.go**

```go
resolverSvc := resolver.New(store.New(database), bangumiClient, ddpClient, cacheClient)
e := api.NewRouter(cfg, database, cacheClient, metadataSvc, matcherSvc, ddpClient, resolverSvc)
```

- [ ] **Step 4: Update ALL test files**

Find every `NewRouter` call and add `nil` for the resolver param. Files to check:
- `auth_handler_test.go`
- `health_test.go`
- `discover_handler_test.go`
- `stream_handler_test.go`

- [ ] **Step 5: Run all tests**

```bash
cd api && go test ./... -v 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/ api/cmd/server/main.go
git commit -m "feat: integrate AnimeResolver into scan pipeline"
```

---

## Final Verification

- [ ] **All tests pass**

```bash
cd api && go test ./...
```

- [ ] **Build succeeds**

```bash
cd api && go build ./...
```
