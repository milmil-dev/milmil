# Metadata Integration — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Plan 3 (Library Management) — completed

---

## 1. Overview

Add anime metadata to milmil by integrating Bangumi.tv (primary, Chinese metadata) and AniList (supplementary, cover images and global popularity). This plan covers backend only — API clients, a metadata service layer, and public discover endpoints. Frontend pages come in a later plan.

### Goals
- Bangumi.tv as primary data source — Chinese titles, synopses, episode lists, seasonal calendar
- AniList as supplementary source — high-res cover images, English titles, global trending/popularity
- Discover API endpoints — calendar, trending, search, anime detail, episode list
- Caching via existing `cache.Cache` abstraction (Redis or in-memory)

### Non-goals (later plans)
- DandanPlay integration (file matching + danmaku — separate plan)
- Writing to local `anime`/`episodes` DB tables (requires matching pipeline)
- OAuth flows for Bangumi/AniList/MAL (progress sync — separate plan)
- Frontend discover/detail pages

---

## 2. Architecture

```
internal/integration/bangumi/   ← Bangumi v0 HTTP client (pure API wrapper)
internal/integration/anilist/   ← AniList GraphQL client (pure API wrapper)
internal/metadata/              ← Metadata service (combines clients + caching)
internal/api/discover_handler.go ← Echo handlers calling metadata service
```

Each integration client is a pure API wrapper — no caching, no business logic. The metadata service composes the two clients, handles caching and data merging. Handlers are thin HTTP wrappers over the service.

---

## 3. Bangumi API Client

**Package:** `internal/integration/bangumi/`

**Base URL:** `https://api.bgm.tv`

### Interface

```go
type Client interface {
    SearchSubjects(ctx context.Context, query string) ([]Subject, error)
    GetCalendar(ctx context.Context) ([]CalendarDay, error)
    GetSubject(ctx context.Context, id int) (*Subject, error)
    GetSubjectEpisodes(ctx context.Context, subjectID int) ([]Episode, error)
}
```

### API Endpoints Used

| Method | Bangumi API | Purpose |
|--------|-------------|---------|
| `SearchSubjects` | `POST /v0/search/subjects` | Search anime by keyword |
| `GetCalendar` | `GET /calendar` | Daily airing schedule |
| `GetSubject` | `GET /v0/subjects/{id}` | Anime detail (Chinese title, synopsis, episode count) |
| `GetSubjectEpisodes` | `GET /v0/episodes?subject_id={id}` | Episode list with Chinese titles |

### Types

```go
type Subject struct {
    ID       int       `json:"id"`
    Name     string    `json:"name"`       // Original title (usually Japanese)
    NameCN   string    `json:"name_cn"`    // Chinese title
    Summary  string    `json:"summary"`    // Chinese synopsis
    Images   Images    `json:"images"`
    AirDate  string    `json:"date"`
    Eps      int       `json:"eps"`
    Tags     []Tag     `json:"tags"`
    Rating   Rating    `json:"rating"`
}

type Images struct {
    Large  string `json:"large"`
    Common string `json:"common"`
    Medium string `json:"medium"`
    Small  string `json:"small"`
    Grid   string `json:"grid"`
}

type Tag struct {
    Name  string `json:"name"`
    Count int    `json:"count"`
}

type Rating struct {
    Score float64 `json:"score"`
    Total int     `json:"total"`
}

type Episode struct {
    ID      int     `json:"id"`
    Sort    float64 `json:"sort"`      // Episode number (supports 12.5 for specials)
    Name    string  `json:"name"`      // Japanese title
    NameCN  string  `json:"name_cn"`   // Chinese title
    AirDate string  `json:"airdate"`
    Desc    string  `json:"desc"`
}

type CalendarDay struct {
    Weekday Weekday   `json:"weekday"`
    Items   []Subject `json:"items"`
}

type Weekday struct {
    EN string `json:"en"`
    CN string `json:"cn"`
    JA string `json:"ja"`
    ID int    `json:"id"`
}
```

### Error Handling
- HTTP 429 (rate limit) → return `ErrRateLimited` with retry-after duration
- HTTP 404 → return `ErrNotFound`
- Network/timeout → wrap as `ErrUnavailable`

### HTTP Client
- User-Agent header: `milmil/<version>` (Bangumi requires a meaningful UA)
- Timeout: 10 seconds per request

---

## 4. AniList API Client

**Package:** `internal/integration/anilist/`

**Endpoint:** `https://graphql.anilist.co` (POST, public, no auth required)

### Interface

```go
type Client interface {
    SearchMedia(ctx context.Context, query string) ([]Media, error)
    GetMedia(ctx context.Context, id int) (*Media, error)
    GetTrending(ctx context.Context, page, perPage int) ([]Media, error)
}
```

### GraphQL Queries

**SearchMedia:** Query `Page.media` with `search` argument, `type: ANIME`.

**GetMedia:** Query `Media` by `id`, fetching `coverImage`, `bannerImage`, `title.english`, `title.romaji`, `popularity`, `averageScore`.

**GetTrending:** Query `Page.media` sorted by `TRENDING_DESC`, `type: ANIME`.

### Types

```go
type Media struct {
    ID           int        `json:"id"`
    Title        MediaTitle `json:"title"`
    CoverImage   CoverImage `json:"coverImage"`
    BannerImage  string     `json:"bannerImage"`
    Popularity   int        `json:"popularity"`
    AverageScore int        `json:"averageScore"`
    Episodes     int        `json:"episodes"`
    Status       string     `json:"status"`
    Season       string     `json:"season"`
    SeasonYear   int        `json:"seasonYear"`
    Format       string     `json:"format"`
}

type MediaTitle struct {
    Romaji  string `json:"romaji"`
    English string `json:"english"`
    Native  string `json:"native"`
}

type CoverImage struct {
    ExtraLarge string `json:"extraLarge"`
    Large      string `json:"large"`
}
```

### Data Retrieved From AniList (not available in Bangumi)
- `coverImage.extraLarge` — high-resolution cover art
- `bannerImage` — wide banner for detail page hero
- `title.english` — English title
- `popularity` / `averageScore` — global popularity ranking

### Error Handling
- GraphQL errors → parse `errors` array, return as `ErrQueryFailed`
- HTTP 429 → return `ErrRateLimited` with retry-after
- Network/timeout → wrap as `ErrUnavailable`

---

## 5. Metadata Service

**Package:** `internal/metadata/`

Composes Bangumi + AniList clients with caching. Provides a unified interface for handlers.

### Interface

```go
type Service struct {
    bangumi  bangumi.Client
    anilist  anilist.Client
    cache    cache.Cache
}

func New(bangumi bangumi.Client, anilist anilist.Client, cache cache.Cache) *Service
```

### Methods

```go
// Calendar — Bangumi daily airing schedule
func (s *Service) GetCalendar(ctx context.Context) ([]CalendarDay, error)

// Search — Bangumi search, returns Chinese titles and synopses
func (s *Service) Search(ctx context.Context, query string) ([]AnimeSummary, error)

// Anime detail — Bangumi detail + AniList cover/banner/popularity
func (s *Service) GetAnimeDetail(ctx context.Context, bangumiID int) (*AnimeDetail, error)

// Episode list — Bangumi episodes with Chinese titles
func (s *Service) GetEpisodes(ctx context.Context, bangumiID int) ([]Episode, error)

// Trending — AniList trending, enriched with Bangumi Chinese titles where possible
func (s *Service) GetTrending(ctx context.Context, page int) ([]AnimeSummary, error)
```

### Unified Types

```go
type AnimeSummary struct {
    BangumiID     int     `json:"bangumi_id"`
    AniListID     int     `json:"anilist_id,omitempty"`
    Title         string  `json:"title"`          // Chinese title preferred, fallback Japanese
    TitleOriginal string  `json:"title_original"`  // Japanese original
    TitleEN       string  `json:"title_en,omitempty"`
    CoverImage    string  `json:"cover_image"`     // AniList cover preferred, fallback Bangumi
    AirDate       string  `json:"air_date,omitempty"`
    EpisodeCount  int     `json:"episode_count"`
    Score         float64 `json:"score"`
}

type AnimeDetail struct {
    AnimeSummary
    Synopsis    string   `json:"synopsis"`     // Chinese synopsis from Bangumi
    BannerImage string   `json:"banner_image,omitempty"`
    Tags        []string `json:"tags"`
    Popularity  int      `json:"popularity,omitempty"`
    Rating      Rating   `json:"rating"`
}

type CalendarDay struct {
    Weekday   string         `json:"weekday"`     // Chinese weekday name
    WeekdayEN string         `json:"weekday_en"`
    Items     []AnimeSummary `json:"items"`
}

type Episode struct {
    BangumiEpisodeID int     `json:"bangumi_episode_id"`
    Sort             float64 `json:"sort"`
    Title            string  `json:"title"`       // Chinese title preferred
    TitleOriginal    string  `json:"title_original"`
    AirDate          string  `json:"air_date,omitempty"`
    Synopsis         string  `json:"synopsis,omitempty"`
}

type Rating struct {
    Score float64 `json:"score"`
    Total int     `json:"total"`
}
```

### Caching Strategy

| Data | Cache Key Pattern | TTL |
|------|-------------------|-----|
| Calendar | `meta:calendar` | 2 hours |
| Search results | `meta:search:{query}` | 1 hour |
| Anime detail | `meta:bangumi:{id}` | 24 hours |
| Episodes | `meta:episodes:{id}` | 24 hours |
| AniList media | `meta:anilist:{id}` | 24 hours |
| Trending | `meta:trending:{page}` | 6 hours |

All caching goes through the existing `cache.Cache` interface (Redis in production, in-memory for dev).

### AniList Cross-Matching

When enriching Bangumi data with AniList covers:

1. If the Bangumi subject title matches an AniList result by romaji/native title → use that AniList entry
2. Cache the Bangumi→AniList ID mapping: `meta:xref:bgm:{bangumiID}` → AniList ID (TTL 7 days)
3. On cache miss, search AniList by the Bangumi subject's original title
4. If no match found, use Bangumi's own cover image (lower quality but functional)

For the `GetTrending` method (AniList primary):
1. Fetch AniList trending
2. For each result, try to find Bangumi subject by searching the native/romaji title
3. If found, use Bangumi's Chinese title and synopsis
4. If not found, use AniList's romaji title as-is (no Chinese available)

---

## 6. Discover API Handlers

**File:** `internal/api/discover_handler.go`

### Routes (public, no auth)

```
GET /api/v1/discover/calendar           → Daily airing schedule
GET /api/v1/discover/trending?page=1    → Global trending anime
GET /api/v1/discover/search?q=...       → Search anime
GET /api/v1/discover/anime/:id          → Anime detail (Bangumi ID)
GET /api/v1/discover/anime/:id/episodes → Episode list
```

### Handler Registration

Add to `router.go`:

```go
// Discover — public
discoverGroup := v1.Group("/discover")
discoverGroup.GET("/calendar", h.handleCalendar)
discoverGroup.GET("/trending", h.handleTrending)
discoverGroup.GET("/search", h.handleSearch)
discoverGroup.GET("/anime/:id", h.handleAnimeDetail)
discoverGroup.GET("/anime/:id/episodes", h.handleAnimeEpisodes)
```

### Handler Struct Change

Add `metadata` field to existing `handler` struct:

```go
type handler struct {
    cfg      *config.Config
    db       *sql.DB
    queries  *store.Queries
    cache    cache.Cache
    metadata *metadata.Service  // NEW
}
```

Initialize in `NewRouter`:

```go
bangumiClient := bangumi.NewClient(http.DefaultClient)
anilistClient := anilist.NewClient(http.DefaultClient)
metadataSvc := metadata.New(bangumiClient, anilistClient, cacheClient)
h := &handler{ ..., metadata: metadataSvc }
```

### Response Format

All endpoints return JSON. Errors use Echo's `echo.NewHTTPError`. Handlers are thin — they parse query params, call the metadata service, and return JSON.

---

## 7. Testing Strategy

### Integration Clients (bangumi, anilist)
- Use `httptest.NewServer` to mock external API responses
- Test per method: success response, rate limit (429), not found (404), network error
- Verify JSON → Go struct mapping is correct

### Metadata Service
- Define Bangumi and AniList clients as interfaces (Section 3 & 4)
- Create mock implementations for testing
- Test: caching (second call skips client), data merging (AniList cover fills in), Chinese title fallback logic, cross-matching

### Discover Handlers
- Use existing `newTestApp(t)` pattern
- Need to inject a mock metadata service — make `metadata.Service` accept interfaces (already designed this way)
- Test: HTTP status codes, JSON structure, query parameter parsing, error propagation

---

## 8. File Map

### Created
- `api/internal/integration/bangumi/types.go`
- `api/internal/integration/bangumi/client.go`
- `api/internal/integration/bangumi/client_test.go`
- `api/internal/integration/anilist/types.go`
- `api/internal/integration/anilist/client.go`
- `api/internal/integration/anilist/client_test.go`
- `api/internal/metadata/types.go`
- `api/internal/metadata/service.go`
- `api/internal/metadata/service_test.go`
- `api/internal/api/discover_handler.go`
- `api/internal/api/discover_handler_test.go`

### Modified
- `api/internal/api/router.go` — add discover routes, inject metadata service into handler struct
