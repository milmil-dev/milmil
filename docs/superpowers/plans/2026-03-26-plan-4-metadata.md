# Metadata Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Bangumi.tv and AniList APIs to provide anime metadata (Chinese titles, covers, trending, search) via discover endpoints.

**Architecture:** Two integration clients (Bangumi HTTP, AniList GraphQL) wrapped by a metadata service that handles caching and data merging. Five public discover endpoints expose the service via Echo handlers.

**Tech Stack:** Go 1.26, Echo v4, `net/http`, `encoding/json`, `golang.org/x/sync/errgroup`, existing `cache.Cache` abstraction

---

## File Map

### Created
- `api/internal/integration/bangumi/types.go` — Bangumi API response structs
- `api/internal/integration/bangumi/client.go` — Bangumi HTTP client (interface + implementation)
- `api/internal/integration/bangumi/client_test.go` — httptest-based tests
- `api/internal/integration/anilist/types.go` — AniList GraphQL response structs
- `api/internal/integration/anilist/client.go` — AniList GraphQL client (interface + implementation)
- `api/internal/integration/anilist/client_test.go` — httptest-based tests
- `api/internal/metadata/types.go` — Unified AnimeSummary, AnimeDetail, Episode types
- `api/internal/metadata/service.go` — Metadata service (combines clients + caching)
- `api/internal/metadata/service_test.go` — Mock client tests
- `api/internal/api/discover_handler.go` — 5 discover endpoints
- `api/internal/api/discover_handler_test.go` — Handler tests

### Modified
- `api/internal/api/router.go` — add `metadata` field to handler, discover routes, update `NewRouter` signature

---

## Task 1: Bangumi API Client — Types and Interface

**Files:**
- Create: `api/internal/integration/bangumi/types.go`
- Create: `api/internal/integration/bangumi/client.go`

- [ ] **Step 1: Create types.go**

```go
// api/internal/integration/bangumi/types.go
package bangumi

type Subject struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	NameCN  string  `json:"name_cn"`
	Summary string  `json:"summary"`
	Images  Images  `json:"images"`
	AirDate string  `json:"date"`
	Eps     int     `json:"eps"`
	Tags    []Tag   `json:"tags"`
	Rating  Rating  `json:"rating"`
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
	Sort    float64 `json:"sort"`
	Name    string  `json:"name"`
	NameCN  string  `json:"name_cn"`
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

// SearchResult wraps the POST /v0/search/subjects response.
type SearchResult struct {
	Data  []Subject `json:"data"`
	Total int       `json:"total"`
}

// EpisodeList wraps the GET /v0/episodes response.
type EpisodeList struct {
	Data  []Episode `json:"data"`
	Total int       `json:"total"`
}
```

- [ ] **Step 2: Create client.go with interface and errors**

```go
// api/internal/integration/bangumi/client.go
package bangumi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
)

var (
	ErrNotFound    = errors.New("bangumi: not found")
	ErrRateLimited = errors.New("bangumi: rate limited")
	ErrUnavailable = errors.New("bangumi: service unavailable")
)

const baseURL = "https://api.bgm.tv"

type Client interface {
	SearchSubjects(ctx context.Context, query string) ([]Subject, error)
	GetCalendar(ctx context.Context) ([]CalendarDay, error)
	GetSubject(ctx context.Context, id int) (*Subject, error)
	GetSubjectEpisodes(ctx context.Context, subjectID int) ([]Episode, error)
}

type httpClient struct {
	http *http.Client
	ua   string
}

func NewClient(c *http.Client, userAgent string) Client {
	return &httpClient{http: c, ua: userAgent}
}

func (c *httpClient) do(ctx context.Context, method, path string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.ua)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return data, nil
	case http.StatusNotFound:
		return nil, ErrNotFound
	case http.StatusTooManyRequests:
		return nil, ErrRateLimited
	default:
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}
}

func (c *httpClient) SearchSubjects(ctx context.Context, query string) ([]Subject, error) {
	reqBody, _ := json.Marshal(map[string]any{
		"keyword": query,
		"filter":  map[string]any{"type": []int{2}}, // type 2 = anime
	})
	data, err := c.do(ctx, http.MethodPost, "/v0/search/subjects", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	var result SearchResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

func (c *httpClient) GetCalendar(ctx context.Context) ([]CalendarDay, error) {
	data, err := c.do(ctx, http.MethodGet, "/calendar", nil)
	if err != nil {
		return nil, err
	}
	var days []CalendarDay
	if err := json.Unmarshal(data, &days); err != nil {
		return nil, err
	}
	return days, nil
}

func (c *httpClient) GetSubject(ctx context.Context, id int) (*Subject, error) {
	data, err := c.do(ctx, http.MethodGet, "/v0/subjects/"+strconv.Itoa(id), nil)
	if err != nil {
		return nil, err
	}
	var s Subject
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (c *httpClient) GetSubjectEpisodes(ctx context.Context, subjectID int) ([]Episode, error) {
	data, err := c.do(ctx, http.MethodGet, "/v0/episodes?subject_id="+strconv.Itoa(subjectID), nil)
	if err != nil {
		return nil, err
	}
	var result EpisodeList
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd api && go build ./internal/integration/bangumi/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/internal/integration/bangumi/
git commit -m "feat: add Bangumi.tv API client with types and interface"
```

---

## Task 2: Bangumi API Client — Tests

**Files:**
- Create: `api/internal/integration/bangumi/client_test.go`

- [ ] **Step 1: Write tests using httptest**

```go
// api/internal/integration/bangumi/client_test.go
package bangumi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/bangumi"
)

func TestSearchSubjects_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v0/search/subjects" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":[{"id":425848,"name":"Frieren","name_cn":"葬送的芙莉蓮","summary":"勇者一行人","eps":28,"rating":{"score":9.1,"total":5000}}],"total":1}`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	subjects, err := c.SearchSubjects(context.Background(), "Frieren")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(subjects) != 1 {
		t.Fatalf("want 1 subject, got %d", len(subjects))
	}
	if subjects[0].NameCN != "葬送的芙莉蓮" {
		t.Errorf("want name_cn=葬送的芙莉蓮, got %s", subjects[0].NameCN)
	}
}

func TestGetCalendar_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/calendar" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"weekday":{"en":"Mon","cn":"星期一","ja":"月曜日","id":1},"items":[{"id":1,"name":"Test","name_cn":"測試","eps":12}]}]`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	days, err := c.GetCalendar(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(days) != 1 {
		t.Fatalf("want 1 day, got %d", len(days))
	}
	if days[0].Weekday.CN != "星期一" {
		t.Errorf("want weekday cn=星期一, got %s", days[0].Weekday.CN)
	}
}

func TestGetSubject_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	_, err := c.GetSubject(context.Background(), 99999)
	if err == nil {
		t.Fatal("expected error for 404")
	}
}

func TestGetSubject_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	_, err := c.GetSubject(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestGetSubjectEpisodes_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":[{"id":100,"sort":1,"name":"はじまり","name_cn":"開始","airdate":"2024-01-01"}],"total":1}`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	eps, err := c.GetSubjectEpisodes(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(eps) != 1 {
		t.Fatalf("want 1 episode, got %d", len(eps))
	}
	if eps[0].NameCN != "開始" {
		t.Errorf("want name_cn=開始, got %s", eps[0].NameCN)
	}
}
```

- [ ] **Step 2: Add `NewClientWithURL` to client.go for testability**

Add this constructor to `client.go` (after `NewClient`):

```go
// NewClientWithURL creates a client with a custom base URL (for testing).
func NewClientWithURL(c *http.Client, userAgent string, url string) Client {
	return &httpClient{http: c, ua: userAgent, baseURL: url}
}
```

Also change the `httpClient` struct and `do` method to use `c.baseURL` instead of the `baseURL` const:

```go
type httpClient struct {
	http    *http.Client
	ua      string
	baseURL string
}

func NewClient(c *http.Client, userAgent string) Client {
	return &httpClient{http: c, ua: userAgent, baseURL: baseURL}
}
```

In the `do` method, replace `baseURL+path` with `c.baseURL+path`.

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/integration/bangumi/... -v
```

Expected: all 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add api/internal/integration/bangumi/
git commit -m "test: add Bangumi API client tests with httptest mocks"
```

---

## Task 3: AniList GraphQL Client

**Files:**
- Create: `api/internal/integration/anilist/types.go`
- Create: `api/internal/integration/anilist/client.go`
- Create: `api/internal/integration/anilist/client_test.go`

- [ ] **Step 1: Create types.go**

```go
// api/internal/integration/anilist/types.go
package anilist

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

- [ ] **Step 2: Create client.go**

```go
// api/internal/integration/anilist/client.go
package anilist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

var (
	ErrQueryFailed = errors.New("anilist: query failed")
	ErrRateLimited = errors.New("anilist: rate limited")
	ErrUnavailable = errors.New("anilist: service unavailable")
)

const defaultEndpoint = "https://graphql.anilist.co"

const mediaFields = `
	id
	title { romaji english native }
	coverImage { extraLarge large }
	bannerImage
	popularity averageScore episodes status season seasonYear format
`

type Client interface {
	SearchMedia(ctx context.Context, query string) ([]Media, error)
	GetMedia(ctx context.Context, id int) (*Media, error)
	GetTrending(ctx context.Context, page, perPage int) ([]Media, error)
}

type graphqlClient struct {
	http     *http.Client
	endpoint string
}

func NewClient(c *http.Client) Client {
	return &graphqlClient{http: c, endpoint: defaultEndpoint}
}

func NewClientWithURL(c *http.Client, endpoint string) Client {
	return &graphqlClient{http: c, endpoint: endpoint}
}

type graphqlRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

type graphqlResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func (c *graphqlClient) query(ctx context.Context, q string, vars map[string]any, target any) error {
	body, _ := json.Marshal(graphqlRequest{Query: q, Variables: vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return ErrRateLimited
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}

	var gqlResp graphqlResponse
	if err := json.Unmarshal(data, &gqlResp); err != nil {
		return err
	}
	if len(gqlResp.Errors) > 0 {
		return fmt.Errorf("%w: %s", ErrQueryFailed, gqlResp.Errors[0].Message)
	}

	return json.Unmarshal(gqlResp.Data, target)
}

func (c *graphqlClient) SearchMedia(ctx context.Context, search string) ([]Media, error) {
	q := `query ($search: String) {
		Page(perPage: 20) {
			media(search: $search, type: ANIME, sort: SEARCH_MATCH) {` + mediaFields + `}
		}
	}`
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, map[string]any{"search": search}, &result); err != nil {
		return nil, err
	}
	return result.Page.Media, nil
}

func (c *graphqlClient) GetMedia(ctx context.Context, id int) (*Media, error) {
	q := `query ($id: Int) {
		Media(id: $id, type: ANIME) {` + mediaFields + `}
	}`
	var result struct {
		Media Media `json:"Media"`
	}
	if err := c.query(ctx, q, map[string]any{"id": id}, &result); err != nil {
		return nil, err
	}
	return &result.Media, nil
}

func (c *graphqlClient) GetTrending(ctx context.Context, page, perPage int) ([]Media, error) {
	q := `query ($page: Int, $perPage: Int) {
		Page(page: $page, perPage: $perPage) {
			media(type: ANIME, sort: TRENDING_DESC) {` + mediaFields + `}
		}
	}`
	var result struct {
		Page struct {
			Media []Media `json:"media"`
		} `json:"Page"`
	}
	if err := c.query(ctx, q, map[string]any{"page": page, "perPage": perPage}, &result); err != nil {
		return nil, err
	}
	return result.Page.Media, nil
}
```

- [ ] **Step 3: Write tests**

```go
// api/internal/integration/anilist/client_test.go
package anilist_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/anilist"
)

func TestSearchMedia_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"Page":{"media":[{"id":154587,"title":{"romaji":"Sousou no Frieren","english":"Frieren: Beyond Journey's End","native":"葬送のフリーレン"},"coverImage":{"extraLarge":"https://img.jpg","large":"https://img-s.jpg"},"bannerImage":"https://banner.jpg","popularity":200000,"averageScore":92,"episodes":28,"status":"FINISHED","season":"FALL","seasonYear":2023,"format":"TV"}]}}}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	media, err := c.SearchMedia(context.Background(), "Frieren")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(media) != 1 {
		t.Fatalf("want 1 media, got %d", len(media))
	}
	if media[0].Title.English != "Frieren: Beyond Journey's End" {
		t.Errorf("want English title, got %s", media[0].Title.English)
	}
}

func TestGetTrending_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"Page":{"media":[{"id":1,"title":{"romaji":"Test"},"coverImage":{"extraLarge":"https://img.jpg"},"popularity":100,"episodes":12,"status":"RELEASING","format":"TV"}]}}}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	media, err := c.GetTrending(context.Background(), 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(media) != 1 {
		t.Fatalf("want 1 media, got %d", len(media))
	}
}

func TestGetMedia_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	_, err := c.GetMedia(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestSearchMedia_GraphQLError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":null,"errors":[{"message":"validation error"}]}`))
	}))
	defer srv.Close()

	c := anilist.NewClientWithURL(srv.Client(), srv.URL)
	_, err := c.SearchMedia(context.Background(), "test")
	if err == nil {
		t.Fatal("expected error for GraphQL error response")
	}
}
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test ./internal/integration/anilist/... -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/internal/integration/anilist/
git commit -m "feat: add AniList GraphQL client with types and tests"
```

---

## Task 4: Metadata Service — Types and Core Methods

**Files:**
- Create: `api/internal/metadata/types.go`
- Create: `api/internal/metadata/service.go`

- [ ] **Step 1: Create types.go**

```go
// api/internal/metadata/types.go
package metadata

type AnimeSummary struct {
	BangumiID     int     `json:"bangumi_id"`
	AniListID     int     `json:"anilist_id,omitempty"`
	Title         string  `json:"title"`
	TitleOriginal string  `json:"title_original"`
	TitleEN       string  `json:"title_en,omitempty"`
	CoverImage    string  `json:"cover_image"`
	AirDate       string  `json:"air_date,omitempty"`
	EpisodeCount  int     `json:"episode_count"`
	Score         float64 `json:"score"`
}

type AnimeDetail struct {
	AnimeSummary
	Synopsis    string   `json:"synopsis"`
	BannerImage string   `json:"banner_image,omitempty"`
	Tags        []string `json:"tags"`
	Popularity  int      `json:"popularity,omitempty"`
	Rating      Rating   `json:"rating"`
}

type CalendarDay struct {
	Weekday   string         `json:"weekday"`
	WeekdayEN string         `json:"weekday_en"`
	Items     []AnimeSummary `json:"items"`
}

type Episode struct {
	BangumiEpisodeID int     `json:"bangumi_episode_id"`
	Sort             float64 `json:"sort"`
	Title            string  `json:"title"`
	TitleOriginal    string  `json:"title_original"`
	AirDate          string  `json:"air_date,omitempty"`
	Synopsis         string  `json:"synopsis,omitempty"`
}

type Rating struct {
	Score float64 `json:"score"`
	Total int     `json:"total"`
}
```

- [ ] **Step 2: Create service.go with GetCalendar, Search, GetEpisodes**

```go
// api/internal/metadata/service.go
package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
)

type Service struct {
	bangumi bangumi.Client
	anilist anilist.Client
	cache   cache.Cache
}

func New(bgm bangumi.Client, al anilist.Client, c cache.Cache) *Service {
	return &Service{bangumi: bgm, anilist: al, cache: c}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (s *Service) getCache(ctx context.Context, key string, target any) bool {
	data, err := s.cache.Get(ctx, key)
	if err != nil {
		return false
	}
	return json.Unmarshal(data, target) == nil
}

func (s *Service) setCache(ctx context.Context, key string, value any, ttl time.Duration) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	_ = s.cache.Set(ctx, key, data, ttl)
}

func subjectToSummary(s bangumi.Subject) AnimeSummary {
	title := s.NameCN
	if title == "" {
		title = s.Name
	}
	cover := s.Images.Large
	if cover == "" {
		cover = s.Images.Common
	}
	return AnimeSummary{
		BangumiID:     s.ID,
		Title:         title,
		TitleOriginal: s.Name,
		CoverImage:    cover,
		AirDate:       s.AirDate,
		EpisodeCount:  s.Eps,
		Score:         s.Rating.Score,
	}
}

func bangumiEpisodeToEpisode(e bangumi.Episode) Episode {
	title := e.NameCN
	if title == "" {
		title = e.Name
	}
	return Episode{
		BangumiEpisodeID: e.ID,
		Sort:             e.Sort,
		Title:            title,
		TitleOriginal:    e.Name,
		AirDate:          e.AirDate,
		Synopsis:         e.Desc,
	}
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

func (s *Service) GetCalendar(ctx context.Context) ([]CalendarDay, error) {
	cacheKey := "meta:calendar"
	var cached []CalendarDay
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	days, err := s.bangumi.GetCalendar(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]CalendarDay, 0, len(days))
	for _, d := range days {
		items := make([]AnimeSummary, 0, len(d.Items))
		for _, item := range d.Items {
			items = append(items, subjectToSummary(item))
		}
		result = append(result, CalendarDay{
			Weekday:   d.Weekday.CN,
			WeekdayEN: d.Weekday.EN,
			Items:     items,
		})
	}

	s.setCache(ctx, cacheKey, result, 2*time.Hour)
	return result, nil
}

// ─── Search ───────────────────────────────────────────────────────────────────

func (s *Service) Search(ctx context.Context, query string) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:search:%s", query)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	subjects, err := s.bangumi.SearchSubjects(ctx, query)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, 0, len(subjects))
	for _, sub := range subjects {
		result = append(result, subjectToSummary(sub))
	}

	s.setCache(ctx, cacheKey, result, 1*time.Hour)
	return result, nil
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

func (s *Service) GetEpisodes(ctx context.Context, bangumiID int) ([]Episode, error) {
	cacheKey := fmt.Sprintf("meta:episodes:%d", bangumiID)
	var cached []Episode
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	eps, err := s.bangumi.GetSubjectEpisodes(ctx, bangumiID)
	if err != nil {
		return nil, err
	}

	result := make([]Episode, 0, len(eps))
	for _, e := range eps {
		result = append(result, bangumiEpisodeToEpisode(e))
	}

	s.setCache(ctx, cacheKey, result, 24*time.Hour)
	return result, nil
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd api && go build ./internal/metadata/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/internal/metadata/
git commit -m "feat: add metadata service with calendar, search, and episodes"
```

---

## Task 5: Metadata Service — GetAnimeDetail and GetTrending (with cross-matching)

**Files:**
- Modify: `api/internal/metadata/service.go`

- [ ] **Step 1: Add GetAnimeDetail**

Append to `service.go`:

```go
// ─── Anime Detail ─────────────────────────────────────────────────────────────

func (s *Service) GetAnimeDetail(ctx context.Context, bangumiID int) (*AnimeDetail, error) {
	cacheKey := fmt.Sprintf("meta:bangumi:%d", bangumiID)
	var cached AnimeDetail
	if s.getCache(ctx, cacheKey, &cached) {
		return &cached, nil
	}

	sub, err := s.bangumi.GetSubject(ctx, bangumiID)
	if err != nil {
		return nil, err
	}

	summary := subjectToSummary(*sub)

	tags := make([]string, 0, len(sub.Tags))
	for _, t := range sub.Tags {
		tags = append(tags, t.Name)
	}

	detail := &AnimeDetail{
		AnimeSummary: summary,
		Synopsis:     sub.Summary,
		Tags:         tags,
		Rating: Rating{
			Score: sub.Rating.Score,
			Total: sub.Rating.Total,
		},
	}

	// Enrich with AniList data (cover, banner, popularity, English title)
	if alID := s.findAniListID(ctx, bangumiID, sub.Name); alID > 0 {
		if media, err := s.anilist.GetMedia(ctx, alID); err == nil {
			detail.AniListID = media.ID
			if media.CoverImage.ExtraLarge != "" {
				detail.CoverImage = media.CoverImage.ExtraLarge
			}
			detail.BannerImage = media.BannerImage
			detail.TitleEN = media.Title.English
			detail.Popularity = media.Popularity
		}
	}

	s.setCache(ctx, cacheKey, detail, 24*time.Hour)
	return detail, nil
}

// findAniListID resolves a Bangumi subject to an AniList ID via xref cache or search.
func (s *Service) findAniListID(ctx context.Context, bangumiID int, title string) int {
	// Check xref cache
	xrefKey := fmt.Sprintf("meta:xref:bgm:%d", bangumiID)
	var alID int
	if s.getCache(ctx, xrefKey, &alID) {
		return alID
	}

	// Search AniList by title
	results, err := s.anilist.SearchMedia(ctx, title)
	if err != nil || len(results) == 0 {
		return 0
	}

	// Use first result (best match)
	alID = results[0].ID
	s.setCache(ctx, xrefKey, alID, 7*24*time.Hour)
	// Cache reverse direction too
	reverseKey := fmt.Sprintf("meta:xref:al:%d", alID)
	s.setCache(ctx, reverseKey, bangumiID, 7*24*time.Hour)

	return alID
}
```

- [ ] **Step 2: Add GetTrending with concurrent Bangumi enrichment**

Append to `service.go` (also add `"golang.org/x/sync/errgroup"` to imports):

```go
// ─── Trending ─────────────────────────────────────────────────────────────────

func (s *Service) GetTrending(ctx context.Context, page int) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:trending:%d", page)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	media, err := s.anilist.GetTrending(ctx, page, 20)
	if err != nil {
		return nil, err
	}

	result := make([]AnimeSummary, len(media))
	for i, m := range media {
		result[i] = AnimeSummary{
			AniListID:     m.ID,
			Title:         m.Title.Romaji, // will be overwritten if Bangumi match found
			TitleOriginal: m.Title.Native,
			TitleEN:       m.Title.English,
			CoverImage:    m.CoverImage.ExtraLarge,
			EpisodeCount:  m.Episodes,
			Score:         float64(m.AverageScore) / 10.0,
		}
	}

	// Enrich with Bangumi Chinese titles concurrently
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(5) // max 5 concurrent Bangumi searches

	for i := range result {
		i := i
		g.Go(func() error {
			bgmID := s.findBangumiID(gctx, result[i].AniListID, result[i].Title)
			if bgmID > 0 {
				result[i].BangumiID = bgmID
				if sub, err := s.bangumi.GetSubject(gctx, bgmID); err == nil {
					if sub.NameCN != "" {
						result[i].Title = sub.NameCN
					}
					result[i].TitleOriginal = sub.Name
					if result[i].Score == 0 {
						result[i].Score = sub.Rating.Score
					}
				}
			}
			return nil // enrichment failures are non-fatal
		})
	}
	_ = g.Wait()

	s.setCache(ctx, cacheKey, result, 6*time.Hour)
	return result, nil
}

// findBangumiID resolves an AniList ID to a Bangumi subject ID via xref cache or search.
func (s *Service) findBangumiID(ctx context.Context, anilistID int, title string) int {
	reverseKey := fmt.Sprintf("meta:xref:al:%d", anilistID)
	var bgmID int
	if s.getCache(ctx, reverseKey, &bgmID) {
		return bgmID
	}

	results, err := s.bangumi.SearchSubjects(ctx, title)
	if err != nil || len(results) == 0 {
		return 0
	}

	bgmID = results[0].ID
	s.setCache(ctx, reverseKey, bgmID, 7*24*time.Hour)
	xrefKey := fmt.Sprintf("meta:xref:bgm:%d", bgmID)
	s.setCache(ctx, xrefKey, anilistID, 7*24*time.Hour)

	return bgmID
}
```

Add `"golang.org/x/sync/errgroup"` to the imports at the top of `service.go`.

- [ ] **Step 3: Update go.mod and verify compilation**

```bash
cd api && go get golang.org/x/sync/errgroup && go mod tidy && go build ./internal/metadata/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/internal/metadata/service.go
git commit -m "feat: add anime detail and trending with AniList cross-matching"
```

---

## Task 6: Metadata Service — Tests

**Files:**
- Create: `api/internal/metadata/service_test.go`

- [ ] **Step 1: Write tests with mock clients**

```go
// api/internal/metadata/service_test.go
package metadata_test

import (
	"context"
	"testing"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
)

// ─── Mock Bangumi Client ──────────────────────────────────────────────────────

type mockBangumi struct {
	searchFn   func(ctx context.Context, query string) ([]bangumi.Subject, error)
	calendarFn func(ctx context.Context) ([]bangumi.CalendarDay, error)
	subjectFn  func(ctx context.Context, id int) (*bangumi.Subject, error)
	episodesFn func(ctx context.Context, id int) ([]bangumi.Episode, error)
}

func (m *mockBangumi) SearchSubjects(ctx context.Context, query string) ([]bangumi.Subject, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query)
	}
	return nil, nil
}
func (m *mockBangumi) GetCalendar(ctx context.Context) ([]bangumi.CalendarDay, error) {
	if m.calendarFn != nil {
		return m.calendarFn(ctx)
	}
	return nil, nil
}
func (m *mockBangumi) GetSubject(ctx context.Context, id int) (*bangumi.Subject, error) {
	if m.subjectFn != nil {
		return m.subjectFn(ctx, id)
	}
	return nil, bangumi.ErrNotFound
}
func (m *mockBangumi) GetSubjectEpisodes(ctx context.Context, id int) ([]bangumi.Episode, error) {
	if m.episodesFn != nil {
		return m.episodesFn(ctx, id)
	}
	return nil, nil
}

// ─── Mock AniList Client ──────────────────────────────────────────────────────

type mockAniList struct {
	searchFn   func(ctx context.Context, query string) ([]anilist.Media, error)
	mediaFn    func(ctx context.Context, id int) (*anilist.Media, error)
	trendingFn func(ctx context.Context, page, perPage int) ([]anilist.Media, error)
}

func (m *mockAniList) SearchMedia(ctx context.Context, query string) ([]anilist.Media, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query)
	}
	return nil, nil
}
func (m *mockAniList) GetMedia(ctx context.Context, id int) (*anilist.Media, error) {
	if m.mediaFn != nil {
		return m.mediaFn(ctx, id)
	}
	return nil, nil
}
func (m *mockAniList) GetTrending(ctx context.Context, page, perPage int) ([]anilist.Media, error) {
	if m.trendingFn != nil {
		return m.trendingFn(ctx, page, perPage)
	}
	return nil, nil
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestGetCalendar_ReturnsChinese(t *testing.T) {
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items: []bangumi.Subject{{
					ID: 1, Name: "テスト", NameCN: "測試", Eps: 12,
					Rating: bangumi.Rating{Score: 8.5},
				}},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	days, err := svc.GetCalendar(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].Weekday != "星期一" {
		t.Errorf("want 星期一, got %v", days)
	}
	if days[0].Items[0].Title != "測試" {
		t.Errorf("want Chinese title 測試, got %s", days[0].Items[0].Title)
	}
}

func TestGetCalendar_CacheHit(t *testing.T) {
	callCount := 0
	bgm := &mockBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			callCount++
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items:   []bangumi.Subject{},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	// First call
	svc.GetCalendar(context.Background())
	// Second call — should hit cache
	svc.GetCalendar(context.Background())

	if callCount != 1 {
		t.Errorf("want 1 API call (cached), got %d", callCount)
	}
}

func TestSearch_ReturnsBangumiResults(t *testing.T) {
	bgm := &mockBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{
				ID: 425848, Name: "Frieren", NameCN: "葬送的芙莉蓮", Eps: 28,
				Rating: bangumi.Rating{Score: 9.1},
			}}, nil
		},
	}
	svc := metadata.New(bgm, &mockAniList{}, cache.New(""))

	results, err := svc.Search(context.Background(), "Frieren")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("want 1 result, got %d", len(results))
	}
	if results[0].Title != "葬送的芙莉蓮" {
		t.Errorf("want Chinese title, got %s", results[0].Title)
	}
}

func TestGetAnimeDetail_EnrichesWithAniList(t *testing.T) {
	bgm := &mockBangumi{
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return &bangumi.Subject{
				ID: 425848, Name: "Frieren", NameCN: "葬送的芙莉蓮",
				Summary: "勇者一行人打倒了魔王",
				Tags:    []bangumi.Tag{{Name: "奇幻"}},
				Rating:  bangumi.Rating{Score: 9.1, Total: 5000},
			}, nil
		},
	}
	al := &mockAniList{
		searchFn: func(ctx context.Context, query string) ([]anilist.Media, error) {
			return []anilist.Media{{
				ID:         154587,
				Title:      anilist.MediaTitle{English: "Frieren: Beyond Journey's End"},
				CoverImage: anilist.CoverImage{ExtraLarge: "https://cover.jpg"},
				BannerImage: "https://banner.jpg",
				Popularity:  200000,
			}}, nil
		},
		mediaFn: func(ctx context.Context, id int) (*anilist.Media, error) {
			return &anilist.Media{
				ID:          154587,
				Title:       anilist.MediaTitle{English: "Frieren: Beyond Journey's End"},
				CoverImage:  anilist.CoverImage{ExtraLarge: "https://cover.jpg"},
				BannerImage: "https://banner.jpg",
				Popularity:  200000,
			}, nil
		},
	}
	svc := metadata.New(bgm, al, cache.New(""))

	detail, err := svc.GetAnimeDetail(context.Background(), 425848)
	if err != nil {
		t.Fatal(err)
	}
	if detail.CoverImage != "https://cover.jpg" {
		t.Errorf("want AniList cover, got %s", detail.CoverImage)
	}
	if detail.BannerImage != "https://banner.jpg" {
		t.Errorf("want AniList banner, got %s", detail.BannerImage)
	}
	if detail.Synopsis != "勇者一行人打倒了魔王" {
		t.Errorf("want Chinese synopsis, got %s", detail.Synopsis)
	}
}

func TestGetTrending_EnrichesWithBangumi(t *testing.T) {
	bgm := &mockBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{ID: 1, Name: "Test", NameCN: "測試動畫"}}, nil
		},
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return &bangumi.Subject{ID: 1, Name: "Test", NameCN: "測試動畫", Rating: bangumi.Rating{Score: 8.0}}, nil
		},
	}
	al := &mockAniList{
		trendingFn: func(ctx context.Context, page, perPage int) ([]anilist.Media, error) {
			return []anilist.Media{{
				ID:           100,
				Title:        anilist.MediaTitle{Romaji: "Test", Native: "テスト"},
				CoverImage:   anilist.CoverImage{ExtraLarge: "https://img.jpg"},
				AverageScore: 80,
				Episodes:     12,
			}}, nil
		},
	}
	svc := metadata.New(bgm, al, cache.New(""))

	results, err := svc.GetTrending(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("want 1, got %d", len(results))
	}
	if results[0].Title != "測試動畫" {
		t.Errorf("want Chinese title from Bangumi enrichment, got %s", results[0].Title)
	}
	if results[0].BangumiID != 1 {
		t.Errorf("want BangumiID=1, got %d", results[0].BangumiID)
	}
}
```

- [ ] **Step 2: Run tests**

```bash
cd api && go test ./internal/metadata/... -v
```

Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add api/internal/metadata/service_test.go
git commit -m "test: add metadata service tests with mock clients"
```

---

## Task 7: Discover API Handlers

**Files:**
- Create: `api/internal/api/discover_handler.go`
- Create: `api/internal/api/discover_handler_test.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Modify router.go — add metadata to handler struct and NewRouter**

Update `handler` struct:

```go
type handler struct {
	cfg      *config.Config
	db       *sql.DB
	queries  *store.Queries
	cache    cache.Cache
	metadata *metadata.Service
}
```

Update `NewRouter` signature and body:

```go
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service) *echo.Echo {
```

Update handler initialization:

```go
h := &handler{
	cfg:      cfg,
	db:       db,
	queries:  store.New(db),
	cache:    cacheClient,
	metadata: metadataSvc,
}
```

Add discover routes after the library routes:

```go
// Discover — public
discoverGroup := v1.Group("/discover")
discoverGroup.GET("/calendar", h.handleCalendar)
discoverGroup.GET("/trending", h.handleTrending)
discoverGroup.GET("/search", h.handleSearch)
discoverGroup.GET("/anime/:id", h.handleAnimeDetail)
discoverGroup.GET("/anime/:id/episodes", h.handleAnimeEpisodes)
```

Add imports for `"github.com/milmil/api/internal/metadata"`.

- [ ] **Step 2: Update newTestApp in auth_handler_test.go**

Since `NewRouter` now requires a `*metadata.Service`, update `newTestApp`:

```go
func newTestApp(t *testing.T) *echo.Echo {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(nil, nil, c) // nil clients — discover tests use their own
	return api.NewRouter(cfg, database, c, metadataSvc)
}
```

Add import for `"github.com/milmil/api/internal/metadata"`.

- [ ] **Step 3: Update cmd/server/main.go**

Read `api/cmd/server/main.go` to find where `NewRouter` is called, and add the metadata service parameter. Create the Bangumi and AniList clients:

```go
import (
	"net/http"
	// ... existing imports
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
)

// In main(), before NewRouter:
httpClient := &http.Client{Timeout: 10 * time.Second}
bangumiClient := bangumi.NewClient(httpClient, "milmil/1.0")
anilistClient := anilist.NewClient(httpClient)
metadataSvc := metadata.New(bangumiClient, anilistClient, cacheClient)

// Update NewRouter call:
e := api.NewRouter(cfg, database, cacheClient, metadataSvc)
```

- [ ] **Step 4: Create discover_handler.go**

```go
// api/internal/api/discover_handler.go
package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
)

func (h *handler) handleCalendar(c echo.Context) error {
	days, err := h.metadata.GetCalendar(c.Request().Context())
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, days)
}

func (h *handler) handleTrending(c echo.Context) error {
	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	results, err := h.metadata.GetTrending(c.Request().Context(), page)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleSearch(c echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q parameter required")
	}
	results, err := h.metadata.Search(c.Request().Context(), q)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleAnimeDetail(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	detail, err := h.metadata.GetAnimeDetail(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, detail)
}

func (h *handler) handleAnimeEpisodes(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	eps, err := h.metadata.GetEpisodes(c.Request().Context(), id)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, eps)
}

func mapMetadataError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, bangumi.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "anime not found")
	case errors.Is(err, bangumi.ErrRateLimited), errors.Is(err, anilist.ErrRateLimited):
		return echo.NewHTTPError(http.StatusTooManyRequests, "upstream rate limited")
	case errors.Is(err, bangumi.ErrUnavailable), errors.Is(err, anilist.ErrUnavailable), errors.Is(err, anilist.ErrQueryFailed):
		return echo.NewHTTPError(http.StatusBadGateway, "external service unavailable")
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal error")
	}
}
```

- [ ] **Step 5: Verify all existing tests still pass**

```bash
cd api && go test ./... 2>&1 | tail -15
```

Expected: all existing tests PASS (auth, cache, config, scanner, library handler tests).

- [ ] **Step 6: Write discover handler tests**

```go
// api/internal/api/discover_handler_test.go
package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/config"
	"github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/integration/anilist"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/migrations"
	"github.com/labstack/echo/v4"
	_ "modernc.org/sqlite"
)

// newTestAppWithMetadata creates a test app with custom mock metadata clients.
func newTestAppWithMetadata(t *testing.T, bgm bangumi.Client, al anilist.Client) *echo.Echo {
	t.Helper()
	dsn := "sqlite://" + t.TempDir() + "/test.db"
	database, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.MigrateUp(migrations.FS, dsn); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTSecret: "testsecret32chars!!!", DatabaseURL: dsn}
	c := cache.New("")
	metadataSvc := metadata.New(bgm, al, c)
	return api.NewRouter(cfg, database, c, metadataSvc)
}
```

Then add test functions:

```go
func TestCalendar_Success(t *testing.T) {
	bgm := &stubBangumi{
		calendarFn: func(ctx context.Context) ([]bangumi.CalendarDay, error) {
			return []bangumi.CalendarDay{{
				Weekday: bangumi.Weekday{CN: "星期一", EN: "Mon"},
				Items: []bangumi.Subject{{ID: 1, Name: "Test", NameCN: "測試", Eps: 12}},
			}}, nil
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/calendar", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSearch_MissingQuery(t *testing.T) {
	e := newTestAppWithMetadata(t, &stubBangumi{}, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/search", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestSearch_Success(t *testing.T) {
	bgm := &stubBangumi{
		searchFn: func(ctx context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{ID: 1, Name: "Frieren", NameCN: "芙莉蓮", Eps: 28}}, nil
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/search?q=Frieren", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnimeDetail_NotFound(t *testing.T) {
	bgm := &stubBangumi{
		subjectFn: func(ctx context.Context, id int) (*bangumi.Subject, error) {
			return nil, bangumi.ErrNotFound
		},
	}
	e := newTestAppWithMetadata(t, bgm, &stubAniList{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/discover/anime/99999", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}
```

Also add the stub types (same pattern as metadata test mocks but in `api_test` package):

```go
type stubBangumi struct {
	searchFn   func(ctx context.Context, query string) ([]bangumi.Subject, error)
	calendarFn func(ctx context.Context) ([]bangumi.CalendarDay, error)
	subjectFn  func(ctx context.Context, id int) (*bangumi.Subject, error)
	episodesFn func(ctx context.Context, id int) ([]bangumi.Episode, error)
}

func (m *stubBangumi) SearchSubjects(ctx context.Context, q string) ([]bangumi.Subject, error) {
	if m.searchFn != nil { return m.searchFn(ctx, q) }
	return nil, nil
}
func (m *stubBangumi) GetCalendar(ctx context.Context) ([]bangumi.CalendarDay, error) {
	if m.calendarFn != nil { return m.calendarFn(ctx) }
	return nil, nil
}
func (m *stubBangumi) GetSubject(ctx context.Context, id int) (*bangumi.Subject, error) {
	if m.subjectFn != nil { return m.subjectFn(ctx, id) }
	return nil, bangumi.ErrNotFound
}
func (m *stubBangumi) GetSubjectEpisodes(ctx context.Context, id int) ([]bangumi.Episode, error) {
	if m.episodesFn != nil { return m.episodesFn(ctx, id) }
	return nil, nil
}

type stubAniList struct {
	searchFn   func(ctx context.Context, query string) ([]anilist.Media, error)
	mediaFn    func(ctx context.Context, id int) (*anilist.Media, error)
	trendingFn func(ctx context.Context, page, perPage int) ([]anilist.Media, error)
}

func (m *stubAniList) SearchMedia(ctx context.Context, q string) ([]anilist.Media, error) {
	if m.searchFn != nil { return m.searchFn(ctx, q) }
	return nil, nil
}
func (m *stubAniList) GetMedia(ctx context.Context, id int) (*anilist.Media, error) {
	if m.mediaFn != nil { return m.mediaFn(ctx, id) }
	return nil, nil
}
func (m *stubAniList) GetTrending(ctx context.Context, p, pp int) ([]anilist.Media, error) {
	if m.trendingFn != nil { return m.trendingFn(ctx, p, pp) }
	return nil, nil
}
```

- [ ] **Step 7: Run all tests**

```bash
cd api && go test ./... -v 2>&1 | tail -20
```

Expected: all tests PASS (auth + library + scanner + bangumi + anilist + metadata + discover).

- [ ] **Step 8: Commit**

```bash
git add api/internal/api/ api/cmd/server/main.go
git commit -m "feat: add discover API handlers with calendar, trending, search, and anime detail"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
cd api && go test ./... -v
```

Expected: all tests PASS.

- [ ] **Run go build**

```bash
cd api && go build ./...
```

Expected: no errors.
