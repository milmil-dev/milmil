# DandanPlay Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate DandanPlay API for file-to-episode matching and danmaku retrieval/submission.

**Architecture:** DandanPlay HTTP client → Matcher service (uses client + cache + DB) → Scanner computes file hashes → Danmaku handler exposes endpoints. All behind JWT auth.

**Tech Stack:** Go 1.26, Echo v4, sqlc, `crypto/md5`, existing `cache.Cache`

**Important:** Use `mise exec -- go` for all Go commands. Use `sqlc generate` (or `$(go env GOPATH)/bin/sqlc generate`) after adding SQL queries.

**Key types from existing code:**
- `store.MediaFile.FileHash` is `sql.NullString`
- `store.MediaFile.DandanplayEpisodeID` is `sql.NullInt64`
- `store.MediaFile.DurationSeconds` is `sql.NullInt64`
- `store.MediaFile.SizeBytes` is `int64`

---

## File Map

### Created
- `api/internal/integration/dandanplay/types.go`
- `api/internal/integration/dandanplay/client.go`
- `api/internal/integration/dandanplay/client_test.go`
- `api/internal/scanner/hash.go`
- `api/internal/scanner/hash_test.go`
- `api/internal/matcher/matcher.go`
- `api/internal/matcher/matcher_test.go`
- `api/internal/api/danmaku_handler.go`
- `api/internal/api/danmaku_handler_test.go`

### Modified
- `api/internal/store/queries/media_files.sql` — add 4 queries + `sqlc generate`
- `api/internal/scanner/scanner.go` — compute hash during scan
- `api/internal/api/router.go` — add danmaku routes, matcher + dandanplay in handler struct
- `api/internal/api/auth_handler_test.go` — update `newTestApp` for new `NewRouter` signature
- `api/cmd/server/main.go` — initialize dandanplay client + matcher

---

## Task 1: sqlc Queries + DandanPlay Client Types

**Files:**
- Modify: `api/internal/store/queries/media_files.sql`
- Create: `api/internal/integration/dandanplay/types.go`
- Create: `api/internal/integration/dandanplay/client.go`

- [ ] **Step 1: Append queries to media_files.sql**

Add to the end of `api/internal/store/queries/media_files.sql`:

```sql
-- name: UpdateMediaFileHash :exec
UPDATE media_files
SET file_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: UpdateMediaFileDandanplayID :exec
UPDATE media_files
SET dandanplay_episode_id = ?, match_status = 'auto',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?;

-- name: ListUnmatchedMediaFilesByLibrary :many
SELECT * FROM media_files
WHERE library_id = ? AND match_status = 'unmatched' AND file_hash IS NOT NULL;

-- name: GetMediaFileByID :one
SELECT * FROM media_files WHERE id = ? LIMIT 1;
```

- [ ] **Step 2: Run sqlc generate**

```bash
cd api && sqlc generate
```

- [ ] **Step 3: Create types.go**

```go
// api/internal/integration/dandanplay/types.go
package dandanplay

type MatchResult struct {
	IsMatched bool    `json:"isMatched"`
	Matches   []Match `json:"matches"`
}

type Match struct {
	EpisodeID    int64   `json:"episodeId"`
	AnimeID      int64   `json:"animeId"`
	AnimeTitle   string  `json:"animeTitle"`
	EpisodeTitle string  `json:"episodeTitle"`
	Type         string  `json:"type"`
	Shift        float64 `json:"shift"`
}

type Comment struct {
	CID int64  `json:"cid"`
	P   string `json:"p"`
	M   string `json:"m"`
}

type PostCommentReq struct {
	Time    float64 `json:"time"`
	Mode    int     `json:"mode"`
	Color   int     `json:"color"`
	Comment string  `json:"comment"`
}

type matchRequest struct {
	FileName      string `json:"fileName"`
	FileHash      string `json:"fileHash"`
	FileSize      int64  `json:"fileSize"`
	VideoDuration int    `json:"videoDuration"`
	MatchMode     string `json:"matchMode"`
}

type matchResponse struct {
	ErrorCode    int     `json:"errorCode"`
	ErrorMessage string  `json:"errorMessage"`
	IsMatched    bool    `json:"isMatched"`
	Matches      []Match `json:"matches"`
}

type commentResponse struct {
	Count    int       `json:"count"`
	Comments []Comment `json:"comments"`
}
```

- [ ] **Step 4: Create client.go**

```go
// api/internal/integration/dandanplay/client.go
package dandanplay

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
	ErrNoCredentials = errors.New("dandanplay: no credentials configured")
	ErrAPIError      = errors.New("dandanplay: API error")
	ErrRateLimited   = errors.New("dandanplay: rate limited")
	ErrUnavailable   = errors.New("dandanplay: service unavailable")
)

const defaultBaseURL = "https://api.dandanplay.net"

type CredentialsFn func(ctx context.Context) (appID, appSecret string, err error)

type Client interface {
	MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error)
	GetComments(ctx context.Context, episodeID int64) ([]Comment, error)
	PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error
}

type httpClient struct {
	http    *http.Client
	credFn  CredentialsFn
	baseURL string
}

func NewClient(c *http.Client, credFn CredentialsFn) Client {
	return &httpClient{http: c, credFn: credFn, baseURL: defaultBaseURL}
}

func NewClientWithURL(c *http.Client, credFn CredentialsFn, url string) Client {
	return &httpClient{http: c, credFn: credFn, baseURL: url}
}

func (c *httpClient) do(ctx context.Context, method, path string, body io.Reader) ([]byte, error) {
	appID, appSecret, err := c.credFn(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNoCredentials, err)
	}
	if appID == "" || appSecret == "" {
		return nil, ErrNoCredentials
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-AppId", appID)
	req.Header.Set("X-AppSecret", appSecret)
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

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}

	return data, nil
}

func (c *httpClient) MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error) {
	reqBody, _ := json.Marshal(matchRequest{
		FileName:      fileName,
		FileHash:      fileHash,
		FileSize:      fileSize,
		VideoDuration: videoDuration,
		MatchMode:     "hashAndFileName",
	})
	data, err := c.do(ctx, http.MethodPost, "/api/v2/match", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	var resp matchResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	if resp.ErrorCode != 0 {
		return nil, fmt.Errorf("%w: %s", ErrAPIError, resp.ErrorMessage)
	}
	return &MatchResult{IsMatched: resp.IsMatched, Matches: resp.Matches}, nil
}

func (c *httpClient) GetComments(ctx context.Context, episodeID int64) ([]Comment, error) {
	path := "/api/v2/comment/" + strconv.FormatInt(episodeID, 10) + "?withRelated=true"
	data, err := c.do(ctx, http.MethodGet, path, nil)
	if err != nil {
		return nil, err
	}
	var resp commentResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Comments, nil
}

func (c *httpClient) PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error {
	body, _ := json.Marshal(req)
	path := "/api/v2/comment/" + strconv.FormatInt(episodeID, 10)
	_, err := c.do(ctx, http.MethodPost, path, bytes.NewReader(body))
	return err
}
```

- [ ] **Step 5: Verify compilation**

```bash
cd api && go build ./...
```

- [ ] **Step 6: Commit**

```bash
git add api/internal/store/queries/media_files.sql api/internal/store/media_files.sql.go api/internal/store/querier.go api/internal/integration/dandanplay/
git commit -m "feat: add DandanPlay API client and sqlc queries for file matching"
```

---

## Task 2: DandanPlay Client Tests

**Files:**
- Create: `api/internal/integration/dandanplay/client_test.go`

- [ ] **Step 1: Write tests**

```go
package dandanplay_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/dandanplay"
)

func mockCredentials(_ context.Context) (string, string, error) {
	return "test-app-id", "test-secret", nil
}

func emptyCredentials(_ context.Context) (string, string, error) {
	return "", "", nil
}

func TestMatchFile_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/match" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("X-AppId") != "test-app-id" {
			t.Fatalf("missing X-AppId header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errorCode":0,"isMatched":true,"matches":[{"episodeId":12345,"animeId":100,"animeTitle":"Test Anime","episodeTitle":"Episode 1"}]}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	result, err := c.MatchFile(context.Background(), "test.mkv", "abc123hash", 1000000, 1440)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.IsMatched {
		t.Error("want matched=true")
	}
	if len(result.Matches) != 1 || result.Matches[0].EpisodeID != 12345 {
		t.Errorf("want episodeId=12345, got %v", result.Matches)
	}
}

func TestMatchFile_NoCredentials(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("should not reach server with no credentials")
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), emptyCredentials, srv.URL)
	_, err := c.MatchFile(context.Background(), "test.mkv", "abc", 100, 0)
	if err == nil {
		t.Fatal("expected error for missing credentials")
	}
}

func TestGetComments_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/comment/12345" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"count":1,"comments":[{"cid":1,"p":"12.5,1,16777215","m":"test danmaku"}]}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	comments, err := c.GetComments(context.Background(), 12345)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 1 || comments[0].M != "test danmaku" {
		t.Errorf("unexpected comments: %v", comments)
	}
}

func TestGetComments_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	_, err := c.GetComments(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestMatchFile_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"errorCode":1,"errorMessage":"invalid hash"}`))
	}))
	defer srv.Close()

	c := dandanplay.NewClientWithURL(srv.Client(), mockCredentials, srv.URL)
	_, err := c.MatchFile(context.Background(), "test.mkv", "bad", 100, 0)
	if err == nil {
		t.Fatal("expected error for API error response")
	}
}
```

- [ ] **Step 2: Run tests**

```bash
cd api && go test ./internal/integration/dandanplay/... -v
```

Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add api/internal/integration/dandanplay/client_test.go
git commit -m "test: add DandanPlay API client tests"
```

---

## Task 3: File Hash Computation

**Files:**
- Create: `api/internal/scanner/hash.go`
- Create: `api/internal/scanner/hash_test.go`

- [ ] **Step 1: Write hash_test.go**

```go
package scanner_test

import (
	"crypto/md5"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/milmil/api/internal/scanner"
)

func TestComputeFileHash_SmallFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "small.mkv")
	content := []byte("hello world video content")
	os.WriteFile(path, content, 0644)

	hash, err := scanner.ComputeFileHash(path)
	if err != nil {
		t.Fatal(err)
	}

	expected := md5.Sum(content)
	expectedHex := hex.EncodeToString(expected[:])
	if hash != expectedHex {
		t.Errorf("want %s, got %s", expectedHex, hash)
	}
}

func TestComputeFileHash_LargeFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.mkv")
	// Create 20MB file — hash should only use first 16MB
	content := []byte(strings.Repeat("A", 20*1024*1024))
	os.WriteFile(path, content, 0644)

	hash, err := scanner.ComputeFileHash(path)
	if err != nil {
		t.Fatal(err)
	}

	// Expected: MD5 of first 16MB
	first16MB := content[:16*1024*1024]
	expected := md5.Sum(first16MB)
	expectedHex := hex.EncodeToString(expected[:])
	if hash != expectedHex {
		t.Errorf("want %s, got %s", expectedHex, hash)
	}
}

func TestComputeFileHash_NonExistent(t *testing.T) {
	_, err := scanner.ComputeFileHash("/nonexistent/file.mkv")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}
```

- [ ] **Step 2: Write hash.go**

```go
// api/internal/scanner/hash.go
package scanner

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"os"
)

const hashReadSize = 16 * 1024 * 1024 // 16MB

// ComputeFileHash computes MD5 hash of the first 16MB of a file.
func ComputeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.CopyN(h, f, hashReadSize); err != nil && err != io.EOF {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/scanner/... -v
```

Expected: all tests PASS (existing scanner tests + 3 new hash tests).

- [ ] **Step 4: Commit**

```bash
git add api/internal/scanner/hash.go api/internal/scanner/hash_test.go
git commit -m "feat: add MD5 file hash computation (first 16MB)"
```

---

## Task 4: Scanner Integration — Hash During Scan

**Files:**
- Modify: `api/internal/scanner/scanner.go`

- [ ] **Step 1: Read existing scanner.go and modify**

After the `UpsertMediaFile` call in the `filepath.Walk` callback, add hash computation. The upserted file returns a `MediaFile` — check if `FileHash` is empty, compute hash, update DB.

Add after the `upsertErr` check (inside the walk callback):

```go
// Compute file hash if not already set
if upsertedFile.FileHash.String == "" || !upsertedFile.FileHash.Valid {
    if hash, hashErr := ComputeFileHash(path); hashErr == nil {
        _ = s.queries.UpdateMediaFileHash(ctx, store.UpdateMediaFileHashParams{
            FileHash: hash,
            ID:       upsertedFile.ID,
        })
    }
}
```

**Important:** The `UpsertMediaFile` returns a `MediaFile` (`:one` query). The current variable name is `_` — change it to `upsertedFile`:

```go
upsertedFile, upsertErr := s.queries.UpsertMediaFile(ctx, store.UpsertMediaFileParams{...})
```

Also check that `UpdateMediaFileHashParams` has `FileHash string` and `ID string` — verify against sqlc generated code.

**Note on `UpdateMediaFileHashParams`:** The sqlc query `UPDATE media_files SET file_hash = ?, ... WHERE id = ?` will generate params in the order `(FileHash, ID)`. The Go type for `file_hash` in the SET clause will be `string` (not `sql.NullString`) because the `?` placeholder infers from the override in `sqlc.yaml`.

Check the generated code. If `FileHash` is `sql.NullString`, use:
```go
store.UpdateMediaFileHashParams{
    FileHash: sql.NullString{String: hash, Valid: true},
    ID:       upsertedFile.ID,
}
```

- [ ] **Step 2: Run all scanner tests**

```bash
cd api && go test ./internal/scanner/... -v
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/scanner/scanner.go
git commit -m "feat: compute file hash during library scan"
```

---

## Task 5: Matcher Service

**Files:**
- Create: `api/internal/matcher/matcher.go`
- Create: `api/internal/matcher/matcher_test.go`

- [ ] **Step 1: Create matcher.go**

```go
package matcher

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/dandanplay"
	"github.com/milmil/api/internal/store"
)

type MatchSummary struct {
	Matched   int `json:"matched"`
	Unmatched int `json:"unmatched"`
	Errors    int `json:"errors"`
}

type Matcher struct {
	queries    *store.Queries
	dandanplay dandanplay.Client
	cache      cache.Cache
}

func New(q *store.Queries, ddp dandanplay.Client, c cache.Cache) *Matcher {
	return &Matcher{queries: q, dandanplay: ddp, cache: c}
}

func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string) (*MatchSummary, error) {
	files, err := m.queries.ListUnmatchedMediaFilesByLibrary(ctx, libraryID)
	if err != nil {
		return nil, err
	}

	summary := &MatchSummary{}

	for _, f := range files {
		if !f.FileHash.Valid || f.FileHash.String == "" {
			summary.Unmatched++
			continue
		}

		episodeID, matched := m.matchSingleFile(ctx, f)
		if matched {
			summary.Matched++
			_ = m.queries.UpdateMediaFileDandanplayID(ctx, store.UpdateMediaFileDandanplayIDParams{
				DandanplayEpisodeID: episodeID,
				ID:                  f.ID,
			})
		} else {
			summary.Unmatched++
		}
	}

	return summary, nil
}

func (m *Matcher) matchSingleFile(ctx context.Context, f store.MediaFile) (int64, bool) {
	cacheKey := fmt.Sprintf("danmaku:match:%s", f.FileHash.String)

	// Check cache
	if data, err := m.cache.Get(ctx, cacheKey); err == nil {
		var episodeID int64
		if json.Unmarshal(data, &episodeID) == nil && episodeID > 0 {
			return episodeID, true
		}
	}

	// Call DandanPlay
	duration := 0
	if f.DurationSeconds.Valid {
		duration = int(f.DurationSeconds.Int64)
	}

	result, err := m.dandanplay.MatchFile(ctx, f.Filename, f.FileHash.String, f.SizeBytes, duration)
	if err != nil || !result.IsMatched || len(result.Matches) == 0 {
		return 0, false
	}

	episodeID := result.Matches[0].EpisodeID

	// Cache the match
	if data, err := json.Marshal(episodeID); err == nil {
		_ = m.cache.Set(ctx, cacheKey, data, 7*24*time.Hour)
	}

	return episodeID, true
}
```

**Note:** The `UpdateMediaFileDandanplayIDParams` may have `DandanplayEpisodeID` as `int64` or `sql.NullInt64` depending on sqlc generation. Check the generated code and adjust. If it's `sql.NullInt64`:

```go
store.UpdateMediaFileDandanplayIDParams{
    DandanplayEpisodeID: sql.NullInt64{Int64: episodeID, Valid: true},
    ID:                  f.ID,
}
```

- [ ] **Step 2: Write matcher_test.go**

Create tests with mock DandanPlay client interface. Test: successful match, no match found, cached match skips API call, and partial errors in batch.

Use the same mock pattern as the metadata service tests — define a `mockDandanplay` struct implementing `dandanplay.Client`.

Key tests:
- `TestMatchLibrary_MatchesFile` — mock DandanPlay returns a match, verify DB update params
- `TestMatchLibrary_NoMatch` — mock returns `IsMatched: false`, summary shows unmatched
- `TestMatchLibrary_ContinuesOnError` — mock returns error for one file, matcher continues

Since the matcher calls `store.Queries` methods, you'll need either a real test DB (like scanner tests use) or to refactor to use an interface. **Use a real test DB** — follow the `newTestDB` pattern from `scanner_test.go`.

- [ ] **Step 3: Run tests**

```bash
cd api && go test ./internal/matcher/... -v
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/matcher/
git commit -m "feat: add matcher service for DandanPlay file matching"
```

---

## Task 6: Danmaku Handler + Router Update

**Files:**
- Create: `api/internal/api/danmaku_handler.go`
- Create: `api/internal/api/danmaku_handler_test.go`
- Modify: `api/internal/api/router.go`
- Modify: `api/internal/api/auth_handler_test.go` (update `newTestApp`)
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Update router.go**

Add `matcher` and `dandanplay` to handler struct:

```go
type handler struct {
	cfg        *config.Config
	db         *sql.DB
	queries    *store.Queries
	cache      cache.Cache
	metadata   *metadata.Service
	matcher    *matcher.Matcher
	dandanplay dandanplay.Client
}
```

Update `NewRouter` signature:

```go
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client) *echo.Echo {
```

Update handler init:

```go
h := &handler{
	cfg:        cfg,
	db:         db,
	queries:    store.New(db),
	cache:      cacheClient,
	metadata:   metadataSvc,
	matcher:    matcherSvc,
	dandanplay: ddpClient,
}
```

Add danmaku routes after discover group:

```go
// Danmaku — protected
danmakuGroup := v1.Group("/danmaku", jwtMiddleware(cfg.JWTSecret))
danmakuGroup.GET("/:mediaFileId", h.handleGetDanmaku)
danmakuGroup.POST("/:mediaFileId", h.handlePostDanmaku)
```

Add imports for `"github.com/milmil/api/internal/matcher"` and `"github.com/milmil/api/internal/integration/dandanplay"`.

- [ ] **Step 2: Update handleScanLibrary**

In `library_handler.go`, update `handleScanLibrary` to also call `matcher.MatchLibrary` after scanning:

```go
func (h *handler) handleScanLibrary(c echo.Context) error {
	lib, err := h.queries.GetLibrary(c.Request().Context(), c.Param("id"))
	if err != nil {
		// ... existing error handling
	}
	sc := scanner.New(h.queries)
	if err := sc.ScanLibrary(c.Request().Context(), lib); err != nil {
		return echo.ErrInternalServerError
	}
	// Auto-match after scan (non-fatal if matcher is nil or fails)
	if h.matcher != nil {
		_, _ = h.matcher.MatchLibrary(c.Request().Context(), lib.ID)
	}
	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 3: Create danmaku_handler.go**

```go
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/integration/dandanplay"
)

func (h *handler) handleGetDanmaku(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("mediaFileId")

	file, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	if !file.DandanplayEpisodeID.Valid || file.DandanplayEpisodeID.Int64 == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "file not matched")
	}

	episodeID := file.DandanplayEpisodeID.Int64
	cacheKey := fmt.Sprintf("danmaku:ddp:%d", episodeID)

	// Check cache
	if data, cacheErr := h.cache.Get(ctx, cacheKey); cacheErr == nil {
		var comments []dandanplay.Comment
		if json.Unmarshal(data, &comments) == nil {
			return c.JSON(http.StatusOK, map[string]any{
				"count":    len(comments),
				"comments": comments,
			})
		}
	}

	// Fetch from DandanPlay
	comments, err := h.dandanplay.GetComments(ctx, episodeID)
	if err != nil {
		return mapDandanplayError(err)
	}

	// Cache
	if data, marshalErr := json.Marshal(comments); marshalErr == nil {
		_ = h.cache.Set(ctx, cacheKey, data, 6*time.Hour)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"count":    len(comments),
		"comments": comments,
	})
}

func (h *handler) handlePostDanmaku(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("mediaFileId")

	file, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	if !file.DandanplayEpisodeID.Valid || file.DandanplayEpisodeID.Int64 == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "file not matched")
	}

	var req dandanplay.PostCommentReq
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}

	episodeID := file.DandanplayEpisodeID.Int64
	if err := h.dandanplay.PostComment(ctx, episodeID, req); err != nil {
		return mapDandanplayError(err)
	}

	// Invalidate cache
	cacheKey := fmt.Sprintf("danmaku:ddp:%d", episodeID)
	_ = h.cache.Del(ctx, cacheKey)

	return c.NoContent(http.StatusNoContent)
}

func mapDandanplayError(err error) *echo.HTTPError {
	switch {
	case errors.Is(err, dandanplay.ErrNoCredentials):
		return echo.NewHTTPError(http.StatusServiceUnavailable, "DandanPlay credentials not configured")
	case errors.Is(err, dandanplay.ErrRateLimited):
		return echo.NewHTTPError(http.StatusTooManyRequests, "DandanPlay rate limited")
	case errors.Is(err, dandanplay.ErrUnavailable), errors.Is(err, dandanplay.ErrAPIError):
		return echo.NewHTTPError(http.StatusBadGateway, "DandanPlay unavailable")
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal error")
	}
}
```

- [ ] **Step 4: Update newTestApp and main.go**

Update `auth_handler_test.go` `newTestApp`:
```go
return api.NewRouter(cfg, database, c, metadataSvc, nil, nil)
```

Update all other test helpers that call `NewRouter` (`health_test.go`, `discover_handler_test.go`) — add `nil, nil` for matcher and dandanplay.

Update `cmd/server/main.go`:
```go
// Before NewRouter:
ddpCredFn := func(ctx context.Context) (string, string, error) {
	// Read from settings table
	setting, err := store.New(database).GetSetting(ctx, "dandanplay")
	if err != nil {
		return "", "", err
	}
	var creds struct {
		AppID     string `json:"app_id"`
		AppSecret string `json:"app_secret"`
	}
	json.Unmarshal([]byte(setting.Value), &creds)
	return creds.AppID, creds.AppSecret, nil
}
ddpClient := dandanplay.NewClient(&http.Client{Timeout: 10 * time.Second}, ddpCredFn)
matcherSvc := matcher.New(store.New(database), ddpClient, cacheClient)

e := api.NewRouter(cfg, database, cacheClient, metadataSvc, matcherSvc, ddpClient)
```

**Note:** You need a `GetSetting` sqlc query. Check if it already exists. If not, add to `api/internal/store/queries/settings.sql`:
```sql
-- name: GetSetting :one
SELECT * FROM settings WHERE key = ? LIMIT 1;
```
And run `sqlc generate` again.

- [ ] **Step 5: Run all tests**

```bash
cd api && go test ./... -v 2>&1 | tail -20
```

Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/ api/cmd/server/main.go api/internal/store/
git commit -m "feat: add danmaku API handlers with scan+match integration"
```

---

## Final Verification

- [ ] **Run all tests**

```bash
cd api && go test ./... -v
```

- [ ] **Build**

```bash
cd api && go build ./...
```
