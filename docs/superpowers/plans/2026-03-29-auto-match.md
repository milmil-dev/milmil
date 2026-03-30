# Auto-Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-strategy auto-match system that chains dandanplay hash, Bangumi search, AniList search, and TMDB search to match library media files to anime episodes, with TMDB episode metadata enrichment for Chinese synopses.

**Architecture:** A filename parser extracts anime title + episode number. The matcher runs 4 strategies in priority order (dandanplay hash → Bangumi → AniList → TMDB). A new standalone `POST /libraries/:id/match` endpoint triggers matching without re-scanning. TMDB enriches episodes with Chinese descriptions post-match.

**Tech Stack:** Go (backend), SQLite (via sqlc), TMDB API v3, React/TypeScript (frontend), Zustand (WebSocket state)

**Spec:** `docs/superpowers/specs/2026-03-29-auto-match-design.md`

---

### Task 1: Filename Parser Package

**Files:**
- Create: `api/internal/matcher/fileparse/parser.go`
- Create: `api/internal/matcher/fileparse/parser_test.go`

- [ ] **Step 1: Write test file with table-driven tests**

```go
// api/internal/matcher/fileparse/parser_test.go
package fileparse

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		wantTitle   string
		wantEpisode int
		wantSeason  int
		wantGroup   string
	}{
		{
			name:     "subgroup dash episode",
			filename: "[SubGroup] Anime Title - 01 [1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "SubGroup",
		},
		{
			name:     "subgroup dash episode v2",
			filename: "[Sakurato] Sousou no Frieren - 01v2 [1080p][HEVC].mkv",
			wantTitle: "Sousou no Frieren", wantEpisode: 1, wantSeason: 0, wantGroup: "Sakurato",
		},
		{
			name:     "EP prefix",
			filename: "[SubGroup] My Anime EP01 [720p].mkv",
			wantTitle: "My Anime", wantEpisode: 1, wantSeason: 0, wantGroup: "SubGroup",
		},
		{
			name:     "S01E01 format",
			filename: "Anime Title S01E01 [1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 1, wantGroup: "",
		},
		{
			name:     "S01E01 with dash",
			filename: "Anime Title - S02E05.mkv",
			wantTitle: "Anime Title", wantEpisode: 5, wantSeason: 2, wantGroup: "",
		},
		{
			name:     "chinese episode marker 話",
			filename: "葬送のフリーレン 第01話.mkv",
			wantTitle: "葬送のフリーレン", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "chinese episode marker 集",
			filename: "我的动漫 第3集.mkv",
			wantTitle: "我的动漫", wantEpisode: 3, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "bracketed episode number",
			filename: "[Group] Anime Title [01][1080p].mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "Group",
		},
		{
			name:     "dot separated",
			filename: "Anime.Title.S01E01.1080p.BluRay.mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 1, wantGroup: "",
		},
		{
			name:     "double digit episode",
			filename: "[Fansub] Great Anime - 12 [1080p].mkv",
			wantTitle: "Great Anime", wantEpisode: 12, wantSeason: 0, wantGroup: "Fansub",
		},
		{
			name:     "no group simple dash",
			filename: "Anime Title - 05.mkv",
			wantTitle: "Anime Title", wantEpisode: 5, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "three digit episode",
			filename: "[Sub] Long Running Anime - 145 [720p].mkv",
			wantTitle: "Long Running Anime", wantEpisode: 145, wantSeason: 0, wantGroup: "Sub",
		},
		{
			name:     "no episode number",
			filename: "[Sub] Movie Title [1080p].mkv",
			wantTitle: "Movie Title", wantEpisode: 0, wantSeason: 0, wantGroup: "Sub",
		},
		{
			name:     "bare number filename",
			filename: "01.mkv",
			wantTitle: "", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
		{
			name:     "EP uppercase with space",
			filename: "Anime Title EP 01.mkv",
			wantTitle: "Anime Title", wantEpisode: 1, wantSeason: 0, wantGroup: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Parse(tt.filename)
			if got.Title != tt.wantTitle {
				t.Errorf("Title = %q, want %q", got.Title, tt.wantTitle)
			}
			if got.EpisodeNumber != tt.wantEpisode {
				t.Errorf("EpisodeNumber = %d, want %d", got.EpisodeNumber, tt.wantEpisode)
			}
			if got.Season != tt.wantSeason {
				t.Errorf("Season = %d, want %d", got.Season, tt.wantSeason)
			}
			if got.SubGroup != tt.wantGroup {
				t.Errorf("SubGroup = %q, want %q", got.SubGroup, tt.wantGroup)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/matcher/fileparse/ -v -run TestParse`
Expected: FAIL — package does not exist yet

- [ ] **Step 3: Implement the parser**

```go
// api/internal/matcher/fileparse/parser.go
package fileparse

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// ParsedFilename holds components extracted from an anime media filename.
type ParsedFilename struct {
	Title         string
	EpisodeNumber int
	Season        int
	SubGroup      string
}

var (
	// Leading [Group] tag
	reLeadingGroup = regexp.MustCompile(`^\[([^\]]+)\]\s*`)
	// Trailing [tags] — resolution, codec, hash, etc.
	reTrailingTags = regexp.MustCompile(`\s*\[[^\]]*\]\s*$`)
	// S01E05 or S1E5
	reSxxExx = regexp.MustCompile(`(?i)\bS(\d{1,2})E(\d{1,3})\b`)
	// EP01 or EP 01
	reEP = regexp.MustCompile(`(?i)\bEP\s*(\d{1,3})\b`)
	// " - 01" or " - 01v2"
	reDashEp = regexp.MustCompile(`\s+-\s+(\d{1,3})(?:v\d+)?\s*$`)
	// 第01話 or 第1集
	reChinese = regexp.MustCompile(`第(\d{1,3})[話集话]`)
	// [01] bracketed episode (after group extraction)
	reBracketEp = regexp.MustCompile(`\[(\d{1,3})\]`)
	// Bare number as entire filename stem
	reBareNumber = regexp.MustCompile(`^(\d{1,3})$`)
)

// Parse extracts anime title, episode number, season, and subgroup from a media filename.
func Parse(filename string) ParsedFilename {
	result := ParsedFilename{}

	// Strip extension
	name := strings.TrimSuffix(filename, filepath.Ext(filename))

	// Extract leading [Group]
	if m := reLeadingGroup.FindStringSubmatch(name); m != nil {
		result.SubGroup = m[1]
		name = name[len(m[0]):]
	}

	// Strip trailing [tags] repeatedly
	for reTrailingTags.MatchString(name) {
		// But first check if any trailing tag is a bracketed episode number
		// We'll handle that below after other patterns fail
		name = reTrailingTags.ReplaceAllString(name, "")
	}

	name = strings.TrimSpace(name)

	// Try SxxExx first (most specific)
	if m := reSxxExx.FindStringSubmatch(name); m != nil {
		result.Season, _ = strconv.Atoi(m[1])
		result.EpisodeNumber, _ = strconv.Atoi(m[2])
		title := reSxxExx.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	// Try " - 01" pattern
	if m := reDashEp.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reDashEp.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	// Try EP01
	if m := reEP.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reEP.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	// Try Chinese 第01話 / 第1集
	if m := reChinese.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		title := reChinese.ReplaceAllString(name, "")
		result.Title = cleanTitle(title)
		return result
	}

	// Try bracketed episode [01] — re-parse original without trailing tag stripping
	origName := strings.TrimSuffix(filename, filepath.Ext(filename))
	if result.SubGroup != "" {
		origName = reLeadingGroup.ReplaceAllString(origName, "")
	}
	if matches := reBracketEp.FindAllStringSubmatch(origName, -1); len(matches) > 0 {
		// First bracketed number after group extraction is the episode
		result.EpisodeNumber, _ = strconv.Atoi(matches[0][1])
		title := reBracketEp.ReplaceAllString(origName, "")
		// Also strip remaining trailing tags
		for reTrailingTags.MatchString(title) {
			title = reTrailingTags.ReplaceAllString(title, "")
		}
		result.Title = cleanTitle(title)
		return result
	}

	// Bare number
	if m := reBareNumber.FindStringSubmatch(name); m != nil {
		result.EpisodeNumber, _ = strconv.Atoi(m[1])
		result.Title = ""
		return result
	}

	// No episode found — title is whatever remains
	result.Title = cleanTitle(name)
	return result
}

// cleanTitle normalizes a raw title string.
func cleanTitle(raw string) string {
	// Replace dots with spaces (for "Anime.Title.1080p" patterns)
	s := strings.ReplaceAll(raw, ".", " ")
	// Replace underscores with spaces
	s = strings.ReplaceAll(s, "_", " ")
	// Trim dashes at edges
	s = strings.Trim(s, "- ")
	// Collapse multiple spaces
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/matcher/fileparse/ -v -run TestParse`
Expected: all 15 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/matcher/fileparse/
git commit -m "feat(matcher): add anime filename parser with episode/title extraction"
```

---

### Task 2: TMDB Client Package

**Files:**
- Create: `api/internal/integration/tmdb/types.go`
- Create: `api/internal/integration/tmdb/client.go`
- Create: `api/internal/integration/tmdb/client_test.go`

- [ ] **Step 1: Create types file**

```go
// api/internal/integration/tmdb/types.go
package tmdb

type TVShow struct {
	ID            int      `json:"id"`
	Name          string   `json:"name"`
	OriginalName  string   `json:"original_name"`
	Overview      string   `json:"overview"`
	PosterPath    string   `json:"poster_path"`
	FirstAirDate  string   `json:"first_air_date"`
	OriginCountry []string `json:"origin_country"`
}

type ExternalIDs struct {
	IMDBID string `json:"imdb_id"`
	TVDBID int    `json:"tvdb_id"`
}

type Season struct {
	SeasonNumber int         `json:"season_number"`
	Episodes     []TVEpisode `json:"episodes"`
}

type TVEpisode struct {
	EpisodeNumber int    `json:"episode_number"`
	Name          string `json:"name"`
	Overview      string `json:"overview"`
	AirDate       string `json:"air_date"`
	StillPath     string `json:"still_path"`
}

type FindResult struct {
	TVResults []TVShow `json:"tv_results"`
}

type searchResponse struct {
	Results    []TVShow `json:"results"`
	TotalPages int      `json:"total_pages"`
}
```

- [ ] **Step 2: Write client test**

```go
// api/internal/integration/tmdb/client_test.go
package tmdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchTV(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/search/tv" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "test-key" {
			t.Fatal("missing api_key")
		}
		if r.URL.Query().Get("language") != "zh-CN" {
			t.Fatal("expected language=zh-CN")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"results":[{"id":100,"name":"葬送的芙莉莲","original_name":"葬送のフリーレン","overview":"中文简介"}],"total_pages":1}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	results, err := c.SearchTV(context.Background(), "Frieren", "zh-CN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 || results[0].ID != 100 {
		t.Errorf("want 1 result with id=100, got %+v", results)
	}
	if results[0].Name != "葬送的芙莉莲" {
		t.Errorf("want Chinese name, got %q", results[0].Name)
	}
}

func TestGetTVSeason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/tv/100/season/1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"season_number":1,"episodes":[{"episode_number":1,"name":"旅の仲間","overview":"中文剧情简介","air_date":"2023-09-29","still_path":"/ep1.jpg"}]}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	season, err := c.GetTVSeason(context.Background(), 100, 1, "zh-CN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(season.Episodes) != 1 {
		t.Fatalf("want 1 episode, got %d", len(season.Episodes))
	}
	if season.Episodes[0].Overview != "中文剧情简介" {
		t.Errorf("want Chinese overview, got %q", season.Episodes[0].Overview)
	}
}

func TestGetTVExternalIDs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/3/tv/100/external_ids" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"imdb_id":"tt12345","tvdb_id":999}`))
	}))
	defer srv.Close()

	c := NewClientWithURL(srv.Client(), "test-key", srv.URL)
	ids, err := c.GetTVExternalIDs(context.Background(), 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ids.TVDBID != 999 {
		t.Errorf("want tvdb_id=999, got %d", ids.TVDBID)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/integration/tmdb/ -v`
Expected: FAIL — NewClientWithURL not defined

- [ ] **Step 4: Implement the client**

```go
// api/internal/integration/tmdb/client.go
package tmdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

var (
	ErrNotFound    = errors.New("tmdb: not found")
	ErrRateLimited = errors.New("tmdb: rate limited")
	ErrUnavailable = errors.New("tmdb: service unavailable")
)

const defaultBaseURL = "https://api.themoviedb.org"

type Client interface {
	SearchTV(ctx context.Context, query string, language string) ([]TVShow, error)
	GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error)
	GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error)
}

type httpClient struct {
	http    *http.Client
	apiKey  string
	baseURL string
}

func NewClient(c *http.Client, apiKey string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: defaultBaseURL}
}

func NewClientWithURL(c *http.Client, apiKey string, baseURL string) Client {
	return &httpClient{http: c, apiKey: apiKey, baseURL: baseURL}
}

func (c *httpClient) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	if params == nil {
		params = url.Values{}
	}
	params.Set("api_key", c.apiKey)

	reqURL := c.baseURL + path + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
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

func (c *httpClient) SearchTV(ctx context.Context, query string, language string) ([]TVShow, error) {
	params := url.Values{
		"query":    {query},
		"language": {language},
	}
	data, err := c.get(ctx, "/3/search/tv", params)
	if err != nil {
		return nil, err
	}
	var resp searchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Results, nil
}

func (c *httpClient) GetTVExternalIDs(ctx context.Context, tvID int) (*ExternalIDs, error) {
	data, err := c.get(ctx, "/3/tv/"+strconv.Itoa(tvID)+"/external_ids", nil)
	if err != nil {
		return nil, err
	}
	var ids ExternalIDs
	if err := json.Unmarshal(data, &ids); err != nil {
		return nil, err
	}
	return &ids, nil
}

func (c *httpClient) GetTVSeason(ctx context.Context, tvID int, seasonNumber int, language string) (*Season, error) {
	params := url.Values{"language": {language}}
	path := "/3/tv/" + strconv.Itoa(tvID) + "/season/" + strconv.Itoa(seasonNumber)
	data, err := c.get(ctx, path, params)
	if err != nil {
		return nil, err
	}
	var season Season
	if err := json.Unmarshal(data, &season); err != nil {
		return nil, err
	}
	return &season, nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/integration/tmdb/ -v`
Expected: all 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/integration/tmdb/
git commit -m "feat(tmdb): add TMDB API v3 client with search, season, and external IDs"
```

---

### Task 3: Database Migrations + sqlc Queries

**Files:**
- Create: `api/migrations/000017_add_bangumi_ids_to_media_files.up.sql`
- Create: `api/migrations/000017_add_bangumi_ids_to_media_files.down.sql`
- Create: `api/migrations/000018_add_synopsis_zh_to_episodes.up.sql`
- Create: `api/migrations/000018_add_synopsis_zh_to_episodes.down.sql`
- Modify: `api/internal/store/queries/media_files.sql`
- Modify: `api/internal/store/queries/episodes.sql`
- Regenerate: `api/internal/store/*.go` (via sqlc)

- [ ] **Step 1: Create migration 000017 — bangumi IDs on media_files**

```sql
-- api/migrations/000017_add_bangumi_ids_to_media_files.up.sql
ALTER TABLE media_files ADD COLUMN bangumi_subject_id INTEGER;
ALTER TABLE media_files ADD COLUMN bangumi_episode_id INTEGER;
```

```sql
-- api/migrations/000017_add_bangumi_ids_to_media_files.down.sql
ALTER TABLE media_files DROP COLUMN bangumi_subject_id;
ALTER TABLE media_files DROP COLUMN bangumi_episode_id;
```

- [ ] **Step 2: Create migration 000018 — synopsis_zh on episodes**

```sql
-- api/migrations/000018_add_synopsis_zh_to_episodes.up.sql
ALTER TABLE episodes ADD COLUMN synopsis_zh TEXT;
```

```sql
-- api/migrations/000018_add_synopsis_zh_to_episodes.down.sql
ALTER TABLE episodes DROP COLUMN synopsis_zh;
```

- [ ] **Step 3: Add new SQL queries to media_files.sql**

Append to `api/internal/store/queries/media_files.sql`:

```sql
-- name: ListAllUnmatchedMediaFilesByLibrary :many
SELECT * FROM media_files
WHERE library_id = ? AND match_status = 'unmatched';

-- name: UpdateMediaFileBangumiIDs :exec
UPDATE media_files
SET bangumi_subject_id = ?, bangumi_episode_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListBangumiMatchedUnlinkedMediaFiles :many
SELECT * FROM media_files
WHERE library_id = ? AND bangumi_subject_id IS NOT NULL AND episode_id IS NULL;
```

- [ ] **Step 4: Add new SQL queries to episodes.sql**

Append to `api/internal/store/queries/episodes.sql`:

```sql
-- name: UpdateEpisodeTMDBMetadata :exec
UPDATE episodes
SET synopsis_zh = COALESCE(NULLIF(?, ''), synopsis_zh),
    title_zh = COALESCE(NULLIF(?, ''), title_zh),
    thumbnail_url = COALESCE(NULLIF(?, ''), thumbnail_url),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: GetEpisodeByAnimeAndNumber :one
SELECT * FROM episodes WHERE anime_id = ? AND episode_number = ? LIMIT 1;
```

- [ ] **Step 5: Regenerate sqlc**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && sqlc generate`
Expected: regenerates all `api/internal/store/*.go` files without errors

- [ ] **Step 6: Verify compilation**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...`
Expected: compiles successfully

- [ ] **Step 7: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/migrations/000017_* api/migrations/000018_* api/internal/store/
git commit -m "feat(db): add bangumi_subject_id, bangumi_episode_id, synopsis_zh columns + queries"
```

---

### Task 4: Extend Matcher with Multi-Strategy Chain

**Files:**
- Modify: `api/internal/matcher/matcher.go`
- Modify: `api/internal/matcher/matcher_test.go`

- [ ] **Step 1: Write test for Bangumi strategy fallback**

Add to `api/internal/matcher/matcher_test.go`:

```go
// Add mock types for bangumi and anilist at package level
type mockBangumi struct {
	searchFn   func(ctx context.Context, query string) ([]bangumi.Subject, error)
	episodesFn func(ctx context.Context, subjectID int) ([]bangumi.Episode, error)
}

func (m *mockBangumi) SearchSubjects(ctx context.Context, query string) ([]bangumi.Subject, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query)
	}
	return nil, nil
}
func (m *mockBangumi) GetCalendar(_ context.Context) ([]bangumi.CalendarDay, error) { return nil, nil }
func (m *mockBangumi) GetSubject(_ context.Context, _ int) (*bangumi.Subject, error) { return nil, nil }
func (m *mockBangumi) GetSubjectEpisodes(ctx context.Context, id int) ([]bangumi.Episode, error) {
	if m.episodesFn != nil {
		return m.episodesFn(ctx, id)
	}
	return nil, nil
}
func (m *mockBangumi) GetSubjectComments(_ context.Context, _ int, _ int) ([]bangumi.SubjectComment, error) {
	return nil, nil
}

func TestMatchLibrary_BangumiSearchFallback(t *testing.T) {
	// Setup: create a library + one unmatched file with NO hash (dandanplay can't match it)
	db := setupTestDB(t) // reuse existing test helper
	q := store.New(db)

	lib := createTestLibrary(t, q) // reuse existing test helper

	// Insert file without hash
	_, err := q.UpsertMediaFile(context.Background(), store.UpsertMediaFileParams{
		ID: "file-no-hash", LibraryID: lib.ID, Path: "/anime/[Sub] Frieren - 01 [1080p].mkv",
		Filename: "[Sub] Frieren - 01 [1080p].mkv", SizeBytes: 1000,
	})
	if err != nil {
		t.Fatal(err)
	}

	// DandanPlay mock that always returns no match
	ddpMock := &mockDandanplay{
		matchFn: func(_ context.Context, _, _ string, _ int64, _ int) (*dandanplay.MatchResult, error) {
			return &dandanplay.MatchResult{IsMatched: false}, nil
		},
	}

	// Bangumi mock that returns a result for "Frieren"
	bgmMock := &mockBangumi{
		searchFn: func(_ context.Context, query string) ([]bangumi.Subject, error) {
			return []bangumi.Subject{{ID: 400602, Name: "Sousou no Frieren", NameCN: "葬送的芙莉莲", Eps: 28}}, nil
		},
		episodesFn: func(_ context.Context, _ int) ([]bangumi.Episode, error) {
			return []bangumi.Episode{{ID: 1001, Sort: 1, Name: "旅の仲間", NameCN: "旅伴"}}, nil
		},
	}

	c := cache.New("")
	defer c.Close()

	m := matcher.NewMulti(q, ddpMock, bgmMock, nil, nil, c)
	summary, err := m.MatchLibrary(context.Background(), lib.ID)
	if err != nil {
		t.Fatalf("MatchLibrary: %v", err)
	}

	if summary.Matched != 1 {
		t.Errorf("want 1 matched, got %d", summary.Matched)
	}
	if summary.ByBangumi != 1 {
		t.Errorf("want 1 by_bangumi, got %d", summary.ByBangumi)
	}
}
```

Note: The test references `matcher.NewMulti` — the new constructor. The exact mock types and test helpers depend on what already exists in `matcher_test.go`. Adapt the mock types to avoid conflicts with existing ones. Use `setupTestDB` and `createTestLibrary` from the existing test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/matcher/ -v -run TestMatchLibrary_BangumiSearchFallback`
Expected: FAIL — `NewMulti` not defined

- [ ] **Step 3: Implement multi-strategy matcher**

Update `api/internal/matcher/matcher.go`:

```go
package matcher

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/bangumi"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher/fileparse"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
)

type MatchSummary struct {
	Matched      int `json:"matched"`
	Unmatched    int `json:"unmatched"`
	Errors       int `json:"errors"`
	ByDandanplay int `json:"by_dandanplay"`
	ByBangumi    int `json:"by_bangumi"`
	ByAniList    int `json:"by_anilist"`
	ByTMDB       int `json:"by_tmdb"`
}

type Matcher struct {
	queries    *store.Queries
	dandanplay dandanplay.Client
	bangumi    bangumi.Client
	tmdb       tmdb.Client // nil if no API key
	cache      cache.Cache
}

// New creates a matcher with only dandanplay (backwards compatible).
func New(q *store.Queries, ddp dandanplay.Client, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, cache: c}
}

// NewMulti creates a matcher with all strategy providers.
func NewMulti(q *store.Queries, ddp dandanplay.Client, bgm bangumi.Client, tmdbClient tmdb.Client, _ interface{}, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, bangumi: bgm, tmdb: tmdbClient, cache: c}
}

func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string, onProgress ...scanner.ProgressFunc) (*MatchSummary, error) {
	// Get ALL unmatched files (with and without hashes)
	allFiles, err := m.queries.ListAllUnmatchedMediaFilesByLibrary(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	emit := func(e scanner.ProgressEvent) {
		if len(onProgress) > 0 && onProgress[0] != nil {
			onProgress[0](e)
		}
	}

	summary := &MatchSummary{}
	processed := 0
	total := len(allFiles)

	// Track which files are still unmatched after each pass
	unmatched := make(map[string]store.MediaFile, len(allFiles))
	for _, f := range allFiles {
		unmatched[f.ID] = f
	}

	// Pass 1: dandanplay hash match (files with hashes only)
	for id, f := range unmatched {
		if !f.FileHash.Valid || f.FileHash.String == "" {
			continue
		}
		episodeID, animeID, ok, matchErr := m.matchDandanplay(ctx, f)
		if matchErr != nil {
			summary.Errors++
			continue
		}
		if ok {
			summary.Matched++
			summary.ByDandanplay++
			_ = m.queries.UpdateMediaFileDandanplayIDs(ctx, store.UpdateMediaFileDandanplayIDsParams{
				DandanplayEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
				DandanplayAnimeID:   sql.NullInt64{Int64: animeID, Valid: true},
				ID:                  f.ID,
			})
			delete(unmatched, id)
		}
		processed++
		emit(scanner.ProgressEvent{
			Type: "match:progress", LibraryID: libraryID,
			FilesMatched: summary.Matched, FilesTotal: total, CurrentFile: f.Filename,
		})
	}

	// Pass 2: filename parse + Bangumi search
	if m.bangumi != nil {
		for id, f := range unmatched {
			parsed := fileparse.Parse(f.Filename)
			if parsed.Title == "" || parsed.EpisodeNumber == 0 {
				continue
			}
			bangumiID, episodeID, ok := m.matchBangumi(ctx, parsed)
			if ok {
				summary.Matched++
				summary.ByBangumi++
				_ = m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{
					BangumiSubjectID: sql.NullInt64{Int64: bangumiID, Valid: true},
					BangumiEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
					ID:               f.ID,
				})
				delete(unmatched, id)
			}
			processed++
			emit(scanner.ProgressEvent{
				Type: "match:progress", LibraryID: libraryID,
				FilesMatched: summary.Matched, FilesTotal: total, CurrentFile: f.Filename,
			})
		}
	}

	// Pass 3: filename parse + TMDB search
	if m.tmdb != nil {
		for id, f := range unmatched {
			parsed := fileparse.Parse(f.Filename)
			if parsed.Title == "" || parsed.EpisodeNumber == 0 {
				continue
			}
			bangumiID, episodeID, ok := m.matchTMDB(ctx, parsed)
			if ok {
				summary.Matched++
				summary.ByTMDB++
				_ = m.queries.UpdateMediaFileBangumiIDs(ctx, store.UpdateMediaFileBangumiIDsParams{
					BangumiSubjectID: sql.NullInt64{Int64: bangumiID, Valid: true},
					BangumiEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
					ID:               f.ID,
				})
				delete(unmatched, id)
			}
			processed++
			emit(scanner.ProgressEvent{
				Type: "match:progress", LibraryID: libraryID,
				FilesMatched: summary.Matched, FilesTotal: total, CurrentFile: f.Filename,
			})
		}
	}

	summary.Unmatched = len(unmatched)
	return summary, nil
}

// matchDandanplay tries dandanplay hash-based matching (existing logic).
func (m *Matcher) matchDandanplay(ctx context.Context, f store.MediaFile) (episodeID int64, animeID int64, matched bool, err error) {
	cacheKey := fmt.Sprintf("danmaku:match:%s", f.FileHash.String)
	if data, cacheErr := m.cache.Get(ctx, cacheKey); cacheErr == nil {
		var cached [2]int64
		if json.Unmarshal(data, &cached) == nil && cached[0] > 0 {
			return cached[0], cached[1], true, nil
		}
	}

	duration := 0
	if f.DurationSeconds.Valid {
		duration = int(f.DurationSeconds.Int64)
	}

	result, err := m.dandanplay.MatchFile(ctx, f.Filename, f.FileHash.String, f.SizeBytes, duration)
	if err != nil {
		return 0, 0, false, err
	}
	if !result.IsMatched || len(result.Matches) == 0 {
		return 0, 0, false, nil
	}

	episodeID = result.Matches[0].EpisodeID
	animeID = result.Matches[0].AnimeID
	if data, marshalErr := json.Marshal([2]int64{episodeID, animeID}); marshalErr == nil {
		_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}
	return episodeID, animeID, true, nil
}

// matchBangumi searches Bangumi by parsed title, then matches episode by number.
func (m *Matcher) matchBangumi(ctx context.Context, parsed fileparse.ParsedFilename) (bangumiID int64, episodeID int64, matched bool) {
	cacheKey := fmt.Sprintf("match:bgm:%s:%d", parsed.Title, parsed.EpisodeNumber)
	if data, err := m.cache.Get(ctx, cacheKey); err == nil {
		var cached [2]int64
		if json.Unmarshal(data, &cached) == nil && cached[0] > 0 {
			return cached[0], cached[1], true
		}
	}

	subjects, err := m.bangumi.SearchSubjects(ctx, parsed.Title)
	if err != nil || len(subjects) == 0 {
		return 0, 0, false
	}

	// Use the first result (best match)
	subject := subjects[0]
	episodes, err := m.bangumi.GetSubjectEpisodes(ctx, subject.ID)
	if err != nil || len(episodes) == 0 {
		return 0, 0, false
	}

	for _, ep := range episodes {
		if int(ep.Sort) == parsed.EpisodeNumber {
			if data, marshalErr := json.Marshal([2]int64{int64(subject.ID), int64(ep.ID)}); marshalErr == nil {
				_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
			}
			return int64(subject.ID), int64(ep.ID), true
		}
	}

	return 0, 0, false
}

// matchTMDB searches TMDB by title, cross-references to Bangumi via MAL ID or title search.
func (m *Matcher) matchTMDB(ctx context.Context, parsed fileparse.ParsedFilename) (bangumiID int64, episodeID int64, matched bool) {
	shows, err := m.tmdb.SearchTV(ctx, parsed.Title, "zh-CN")
	if err != nil || len(shows) == 0 {
		return 0, 0, false
	}

	show := shows[0]

	// Try to find Bangumi ID via title search on Bangumi
	if m.bangumi == nil {
		return 0, 0, false
	}
	subjects, err := m.bangumi.SearchSubjects(ctx, show.OriginalName)
	if err != nil || len(subjects) == 0 {
		// Fallback: try with TMDB Chinese name
		subjects, err = m.bangumi.SearchSubjects(ctx, show.Name)
		if err != nil || len(subjects) == 0 {
			return 0, 0, false
		}
	}

	subject := subjects[0]
	episodes, err := m.bangumi.GetSubjectEpisodes(ctx, subject.ID)
	if err != nil || len(episodes) == 0 {
		return 0, 0, false
	}

	for _, ep := range episodes {
		if int(ep.Sort) == parsed.EpisodeNumber {
			return int64(subject.ID), int64(ep.ID), true
		}
	}

	return 0, 0, false
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/matcher/ -v`
Expected: all tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/matcher/matcher.go api/internal/matcher/matcher_test.go
git commit -m "feat(matcher): multi-strategy match chain — dandanplay, Bangumi, TMDB"
```

---

### Task 5: Update Resolver for Bangumi-Matched Files

**Files:**
- Modify: `api/internal/resolver/resolver.go`

- [ ] **Step 1: Add method to resolve Bangumi-matched files**

Add to `api/internal/resolver/resolver.go`, after the existing `ResolveLibrary` method:

```go
// ResolveBangumiMatched processes files that were matched via Bangumi/AniList/TMDB strategies.
// These files have bangumi_subject_id set but no episode_id yet.
func (r *Resolver) ResolveBangumiMatched(ctx context.Context, libraryID string) (*ResolveSummary, error) {
	files, err := r.queries.ListBangumiMatchedUnlinkedMediaFiles(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	summary := &ResolveSummary{}

	// Group by bangumi_subject_id
	groups := make(map[int64][]store.MediaFile)
	for _, f := range files {
		if !f.BangumiSubjectID.Valid {
			continue
		}
		groups[f.BangumiSubjectID.Int64] = append(groups[f.BangumiSubjectID.Int64], f)
	}

	for bangumiID, groupFiles := range groups {
		anime, created, err := r.getOrCreateAnime(ctx, libraryID, bangumiID, 0)
		if err != nil {
			summary.Errors++
			continue
		}
		if created {
			summary.AnimeCreated++
		}

		epsCreated, err := r.ensureEpisodes(ctx, anime.ID, bangumiID)
		if err != nil {
			summary.Errors++
			continue
		}
		summary.EpisodesCreated += epsCreated

		// Link files by bangumi_episode_id
		for _, f := range groupFiles {
			if !f.BangumiEpisodeID.Valid {
				continue
			}
			// Find episode by bangumi episode ID in this anime's episodes
			eps, _ := r.queries.ListEpisodesByAnimeID(ctx, anime.ID)
			for _, ep := range eps {
				if ep.BangumiEpisodeID.Valid && ep.BangumiEpisodeID.Int64 == f.BangumiEpisodeID.Int64 {
					_ = r.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
						EpisodeID: sql.NullString{String: ep.ID, Valid: true},
						ID:        f.ID,
					})
					summary.FilesLinked++
					break
				}
				// Also match by dandanplay_episode_id (Bangumi search returns bangumi ep IDs stored in dandanplay_episode_id field of episode)
				if ep.DandanplayEpisodeID.Valid && ep.DandanplayEpisodeID.Int64 == f.BangumiEpisodeID.Int64 {
					_ = r.queries.UpdateMediaFileEpisodeID(ctx, store.UpdateMediaFileEpisodeIDParams{
						EpisodeID: sql.NullString{String: ep.ID, Valid: true},
						ID:        f.ID,
					})
					summary.FilesLinked++
					break
				}
			}
		}
	}

	return summary, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/resolver/resolver.go
git commit -m "feat(resolver): add ResolveBangumiMatched for filename-strategy matched files"
```

---

### Task 6: TMDB Episode Enrichment

**Files:**
- Create: `api/internal/matcher/enrichment.go`

- [ ] **Step 1: Implement enrichment module**

```go
// api/internal/matcher/enrichment.go
package matcher

import (
	"context"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/store"
)

const tmdbImageBase = "https://image.tmdb.org/t/p/w300"

// EnrichEpisodesFromTMDB fetches Chinese synopses from TMDB and updates episode records.
func EnrichEpisodesFromTMDB(ctx context.Context, q *store.Queries, tmdbClient tmdb.Client, c cache.Cache, libraryID string) (int, error) {
	if tmdbClient == nil {
		return 0, nil
	}

	// Get all anime in this library that have episodes
	animeList, err := q.ListAnimeByLibrary(ctx, libraryID)
	if err != nil {
		return 0, err
	}

	enriched := 0
	for _, anime := range animeList {
		tmdbID := int(anime.TmdbID.Int64)

		// If no TMDB ID, try to find it by title
		if !anime.TmdbID.Valid || anime.TmdbID.Int64 == 0 {
			searchTitle := anime.TitleZh.String
			if searchTitle == "" {
				searchTitle = anime.Title
			}
			shows, searchErr := tmdbClient.SearchTV(ctx, searchTitle, "zh-CN")
			if searchErr != nil || len(shows) == 0 {
				continue
			}
			tmdbID = shows[0].ID
			// Save TMDB ID for future lookups
			_ = q.UpdateAnimeTMDBID(ctx, store.UpdateAnimeTMDBIDParams{
				TmdbID: sql.NullInt64{Int64: int64(tmdbID), Valid: true},
				ID:     anime.ID,
			})
		}

		// Fetch season 1 episodes with Chinese language
		cacheKey := fmt.Sprintf("tmdb:season:%d:1:zh-CN", tmdbID)
		var season *tmdb.Season

		if data, cacheErr := c.Get(ctx, cacheKey); cacheErr == nil {
			var cached tmdb.Season
			if json.Unmarshal(data, &cached) == nil {
				season = &cached
			}
		}

		if season == nil {
			fetched, fetchErr := tmdbClient.GetTVSeason(ctx, tmdbID, 1, "zh-CN")
			if fetchErr != nil {
				continue
			}
			season = fetched
			if data, marshalErr := json.Marshal(season); marshalErr == nil {
				_ = c.Set(ctx, cacheKey, data, 24*time.Hour)
			}
		}

		// Update episodes
		episodes, _ := q.ListEpisodesByAnimeID(ctx, anime.ID)
		for _, ep := range episodes {
			for _, tmdbEp := range season.Episodes {
				if int(ep.EpisodeNumber) == tmdbEp.EpisodeNumber {
					thumbnailURL := ""
					if tmdbEp.StillPath != "" {
						thumbnailURL = tmdbImageBase + tmdbEp.StillPath
					}
					err := q.UpdateEpisodeTMDBMetadata(ctx, store.UpdateEpisodeTMDBMetadataParams{
						SynopsisZh:   sql.NullString{String: tmdbEp.Overview, Valid: tmdbEp.Overview != ""},
						TitleZh:      sql.NullString{String: tmdbEp.Name, Valid: tmdbEp.Name != ""},
						ThumbnailUrl: sql.NullString{String: thumbnailURL, Valid: thumbnailURL != ""},
						ID:           ep.ID,
					})
					if err == nil {
						enriched++
					}
					break
				}
			}
		}
	}

	return enriched, nil
}
```

Note: This needs two additional SQL queries that may not exist yet:
- `ListAnimeByLibrary` — list all anime records for a given library
- `UpdateAnimeTMDBID` — update the `tmdb_id` column on anime

- [ ] **Step 2: Add missing SQL queries**

Append to `api/internal/store/queries/anime.sql` (check actual filename — may be in a different query file):

```sql
-- name: ListAnimeByLibrary :many
SELECT * FROM anime WHERE library_id = ?;

-- name: UpdateAnimeTMDBID :exec
UPDATE anime SET tmdb_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;
```

- [ ] **Step 3: Regenerate sqlc and add missing import**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && sqlc generate`

Add the missing `encoding/json` and `database/sql` imports to `enrichment.go`:

```go
import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/store"
)
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...`
Expected: compiles successfully

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/matcher/enrichment.go api/internal/store/
git commit -m "feat(matcher): add TMDB episode enrichment for Chinese synopses"
```

---

### Task 7: API Endpoint + Wire Up in main.go

**Files:**
- Modify: `api/internal/api/library_handler.go`
- Modify: `api/internal/api/router.go`
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Add handler to library_handler.go**

Add to `api/internal/api/library_handler.go`, after `handleScanLibrary`:

```go
func (h *handler) handleMatchLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.ErrNotFound
		}
		return echo.ErrInternalServerError
	}

	go func() {
		onProgress := func(event scanner.ProgressEvent) {
			event.LibraryName = lib.Name
			if h.wsHub != nil {
				h.wsHub.Broadcast(ws.Event{Type: event.Type, Data: event})
			}
		}

		onProgress(scanner.ProgressEvent{Type: "match:started", LibraryID: lib.ID})

		if h.matcher != nil {
			_, _ = h.matcher.MatchLibrary(context.Background(), lib.ID, onProgress)
		}

		// Resolve dandanplay-matched files
		if h.resolver != nil {
			_, _ = h.resolver.ResolveLibrary(context.Background(), lib.ID)
		}

		// Resolve Bangumi-matched files (from filename strategies)
		if h.resolver != nil {
			_, _ = h.resolver.ResolveBangumiMatched(context.Background(), lib.ID)
		}

		// Enrich episodes with TMDB Chinese metadata
		if h.tmdb != nil {
			_, _ = matcher.EnrichEpisodesFromTMDB(context.Background(), h.queries, h.tmdb, h.cache, lib.ID)
		}

		onProgress(scanner.ProgressEvent{Type: "match:completed", LibraryID: lib.ID})
	}()

	return c.JSON(http.StatusAccepted, map[string]string{
		"status":     "matching",
		"library_id": lib.ID,
	})
}
```

- [ ] **Step 2: Add `tmdb` field to handler struct in router.go**

In `api/internal/api/router.go`, add `tmdb` field to handler struct:

```go
type handler struct {
	cfg           *config.Config
	db            *sql.DB
	queries       *store.Queries
	cache         cache.Cache
	metadata      *metadata.Service
	matcher       *matcher.Matcher
	dandanplay    dandanplay.Client
	resolver      *resolver.Resolver
	aria2         aria2.Client
	wsHub         *ws.Hub
	encryptionKey []byte
	tmdb          tmdb.Client // nil if no API key
}
```

Add import for `tmdb` package. Update `NewRouter` signature to accept `tmdb.Client`:

```go
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver, aria2Client aria2.Client, wsHub *ws.Hub, tmdbClient tmdb.Client) *echo.Echo {
```

Set `tmdb: tmdbClient` in the handler init.

- [ ] **Step 3: Register route in router.go**

Add the new route after the existing `POST /:id/scan` line:

```go
libGroup.POST("/:id/match", h.handleMatchLibrary)
```

- [ ] **Step 4: Wire up in main.go**

In `api/cmd/server/main.go`, after the existing `matcherSvc` and `resolverSvc` creation:

```go
// TMDB client (optional — only if API key is configured)
var tmdbClient tmdb.Client
tmdbKey, tmdbErr := store.New(database).GetSetting(context.Background(), "tmdb_api_key")
if tmdbErr == nil && tmdbKey.Value != "" {
	tmdbClient = tmdb.NewClient(&http.Client{Timeout: 10 * time.Second}, tmdbKey.Value)
}

// Update matcher to use multi-strategy
matcherSvc := matcher.NewMulti(store.New(database), ddpClient, bangumiClient, tmdbClient, nil, cacheClient)
```

Remove the old `matcherSvc := matcher.New(...)` line.

Update the `NewRouter` call to pass `tmdbClient`:

```go
e := api.NewRouter(cfg, database, cacheClient, metadataSvc, matcherSvc, ddpClient, resolverSvc, aria2Client, wsHub, tmdbClient)
```

Add import: `"github.com/milmil/api/internal/integration/tmdb"`

- [ ] **Step 5: Add matcher import to library_handler.go**

Add to imports in `library_handler.go`:
```go
"github.com/milmil/api/internal/matcher"
```

- [ ] **Step 6: Verify compilation**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...`
Expected: compiles successfully

- [ ] **Step 7: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/api/library_handler.go api/internal/api/router.go api/cmd/server/main.go
git commit -m "feat(api): add POST /libraries/:id/match endpoint with TMDB enrichment"
```

---

### Task 8: Frontend — API Client + Scan Store

**Files:**
- Modify: `web/src/lib/api/library.ts`
- Modify: `web/src/store/scan-store.ts`

- [ ] **Step 1: Add matchLibrary to API client**

In `web/src/lib/api/library.ts`, add to `libraryApi` object after the `scan` method:

```typescript
matchLibrary: (id: string) => api.post<void>(`/api/v1/libraries/${id}/match`),
```

- [ ] **Step 2: Handle match:started and match:completed in scan store**

In `web/src/store/scan-store.ts`, add two new cases inside the `switch (type)` block, after the existing `match:progress` case:

```typescript
case 'match:started': {
  set(
    (state) => ({
      scans: {
        ...state.scans,
        [libraryId]: {
          ...(state.scans[libraryId] ?? createInitialProgress(
            libraryId,
            getStringField(data, 'libraryName', 'library_name') ?? ''
          )),
          phase: 'matching',
        },
      },
    }),
    false,
    'match/started'
  );
  break;
}
case 'match:completed': {
  set(
    (state) => {
      const existing = state.scans[libraryId];
      if (!existing) return state;
      return {
        scans: {
          ...state.scans,
          [libraryId]: {
            ...existing,
            phase: 'completed',
            currentFile: '',
          },
        },
      };
    },
    false,
    'match/completed'
  );
  break;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/lib/api/library.ts web/src/store/scan-store.ts
git commit -m "feat(web): add matchLibrary API + handle match:started/completed events"
```

---

### Task 9: Frontend — Auto Match Button + i18n

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add match mutation and button to LibraryDetailPage**

In `web/src/pages/LibraryDetailPage.tsx`, inside `LibraryDetailPage()`, after the existing `scanMutation`:

```typescript
const matchMutation = useMutation({
  mutationFn: () => libraryApi.matchLibrary(id),
  onSuccess: () => {
    toast.success(i18n._(msg`library.toast.matchStarted`))
  },
  onError: (err: Error) => {
    toast.error(`${i18n._(msg`library.toast.matchFailed`)}: ${err.message}`)
  },
})
```

In the button group (the `<div className="flex gap-2 shrink-0">` section), add the Auto Match button before the Scan Now button:

```tsx
<motion.button
  whileTap={{ scale: 0.95 }}
  type="button"
  onClick={() => matchMutation.mutate()}
  disabled={isScanning || matchMutation.isPending}
  className="px-5 py-2.5 text-sm font-bold rounded-lg border border-mm-accent/40 text-mm-accent hover:bg-mm-accent/10 transition-colors disabled:opacity-50 cursor-pointer"
>
  {isScanning && scanProgress?.phase === 'matching'
    ? i18n._(msg`library.matching`)
    : i18n._(msg`library.detail.autoMatch`)}
</motion.button>
```

- [ ] **Step 2: Add i18n strings to English**

Append to `web/src/locales/en/messages.po`:

```po
msgid "library.detail.autoMatch"
msgstr "Auto Match"

msgid "library.matching"
msgstr "Matching..."

msgid "library.toast.matchStarted"
msgstr "Auto matching started"

msgid "library.toast.matchFailed"
msgstr "Auto matching failed"
```

- [ ] **Step 3: Add i18n strings to Traditional Chinese**

Append to `web/src/locales/zh-Hant/messages.po`:

```po
msgid "library.detail.autoMatch"
msgstr "自動匹配"

msgid "library.matching"
msgstr "匹配中..."

msgid "library.toast.matchStarted"
msgstr "開始自動匹配"

msgid "library.toast.matchFailed"
msgstr "自動匹配失敗"
```

- [ ] **Step 4: Add i18n strings to Simplified Chinese**

Append to `web/src/locales/zh-Hans/messages.po`:

```po
msgid "library.detail.autoMatch"
msgstr "自动匹配"

msgid "library.matching"
msgstr "匹配中..."

msgid "library.toast.matchStarted"
msgstr "开始自动匹配"

msgid "library.toast.matchFailed"
msgstr "自动匹配失败"
```

- [ ] **Step 5: Compile translations**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract && bun run i18n:compile`

- [ ] **Step 6: Verify frontend builds**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run build`
Expected: builds successfully

- [ ] **Step 7: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/LibraryDetailPage.tsx web/src/locales/
git commit -m "feat(web): add Auto Match button with i18n support"
```

---

### Task 10: Also Run Match Strategies During Scan

**Files:**
- Modify: `api/internal/api/library_handler.go`

- [ ] **Step 1: Update handleScanLibrary to run Bangumi resolver and TMDB enrichment**

In `handleScanLibrary`, the existing background goroutine already calls `h.matcher.MatchLibrary()` and `h.resolver.ResolveLibrary()`. Add the new steps after them:

```go
// After existing resolver call, add:

// Resolve Bangumi-matched files (from filename strategies)
if h.resolver != nil {
    _, _ = h.resolver.ResolveBangumiMatched(context.Background(), lib.ID)
}

// Enrich episodes with TMDB Chinese metadata
if h.tmdb != nil {
    _, _ = matcher.EnrichEpisodesFromTMDB(context.Background(), h.queries, h.tmdb, h.cache, lib.ID)
}
```

Add the `matcher` import if not already present.

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./...`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/api/library_handler.go
git commit -m "feat(scan): run Bangumi resolver + TMDB enrichment after scan"
```
