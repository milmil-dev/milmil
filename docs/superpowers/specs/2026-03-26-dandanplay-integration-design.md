# DandanPlay Integration — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Plan 3 (Library Management) — scanner and media_files table

---

## 1. Overview

Integrate the DandanPlay API for file-to-episode matching and danmaku (bullet comment) retrieval. Backend only — the frontend danmaku renderer and video player come in a later plan.

### Goals
- DandanPlay API client — file matching, danmaku fetch, danmaku submit
- MD5 hash computation of first 16MB of each video file
- Matcher service — links scanned media files to DandanPlay episodes
- Danmaku API endpoints — fetch and submit comments
- Caching via existing `cache.Cache` abstraction

### Non-goals (later plans)
- Frontend DanmakuLayer canvas renderer
- Video.js player
- DandanPlay settings page (AppId/AppSecret input UI)
- Bilibili extended danmaku (includeExt) — deferred to player plan

---

## 2. Architecture

```
internal/integration/dandanplay/   ← DandanPlay HTTP client (pure API wrapper)
internal/scanner/hash.go           ← MD5 hash computation
internal/scanner/scanner.go        ← Modified: compute hash during scan
internal/matcher/                  ← Matcher service (DandanPlay matching)
internal/api/danmaku_handler.go    ← Danmaku endpoints
```

Separation of concerns:
- **Scanner** discovers files and computes hashes (single responsibility)
- **Matcher** calls DandanPlay to match files to episodes (separate service)
- **DandanPlay client** is a pure API wrapper (no caching, no DB access)
- **Danmaku handler** manages fetching/submitting comments with caching

---

## 3. DandanPlay API Client

**Package:** `internal/integration/dandanplay/`

**Base URL:** `https://api.dandanplay.net`

**Authentication:** `X-AppId` and `X-AppSecret` headers, read from `settings` table (`key='dandanplay'`). Passed per-request via a credentials function, not stored in the client struct (user may update at any time).

### Interface

```go
type CredentialsFn func(ctx context.Context) (appID, appSecret string, err error)

type Client interface {
    MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64) (*MatchResult, error)
    GetComments(ctx context.Context, episodeID int64) ([]Comment, error)
    PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error
}
```

### API Endpoints Used

| Method | DandanPlay API | Purpose |
|--------|---------------|---------|
| `MatchFile` | `POST /api/v2/match` | Match a file to an anime episode by hash/name |
| `GetComments` | `GET /api/v2/comment/{episodeId}?withRelated=true` | Fetch danmaku comments |
| `PostComment` | `POST /api/v2/comment/{episodeId}` | Submit a user's danmaku |

### Types

```go
type MatchResult struct {
    IsMatched bool    `json:"isMatched"`
    Matches   []Match `json:"matches"`
}

type Match struct {
    EpisodeID    int64  `json:"episodeId"`
    AnimeID      int64  `json:"animeId"`
    AnimeTitle   string `json:"animeTitle"`
    EpisodeTitle string `json:"episodeTitle"`
    Type         string `json:"type"`
    Shift        float64 `json:"shift"`
}

type Comment struct {
    CID int64  `json:"cid"`
    P   string `json:"p"`   // "time,type,color" e.g. "12.5,1,16777215"
    M   string `json:"m"`   // comment text
}

type PostCommentReq struct {
    Time    float64 `json:"time"`
    Mode    int     `json:"mode"`    // 1=scroll, 4=bottom, 5=top
    Color   int     `json:"color"`   // RGB integer
    Comment string  `json:"comment"`
}

// DandanPlay API response wrappers
type matchResponse struct {
    ErrorCode    int         `json:"errorCode"`
    ErrorMessage string      `json:"errorMessage"`
    IsMatched    bool        `json:"isMatched"`
    Matches      []Match     `json:"matches"`
}

type commentResponse struct {
    Count    int       `json:"count"`
    Comments []Comment `json:"comments"`
}
```

### Error Handling
- `errorCode != 0` → return `ErrAPIError` with message
- HTTP 429 → return `ErrRateLimited`
- Network/timeout → return `ErrUnavailable`
- Missing credentials → return `ErrNoCredentials`

---

## 4. File Hash Computation

**File:** `internal/scanner/hash.go`

```go
// ComputeFileHash computes MD5 hash of the first 16MB of a file.
// Returns hex-encoded hash string.
func ComputeFileHash(path string) (string, error)
```

- Read first `16 * 1024 * 1024` bytes (or entire file if smaller)
- Compute `crypto/md5` hash
- Return hex string via `hex.EncodeToString`

---

## 5. Scanner Integration

**Modified:** `internal/scanner/scanner.go`

Current `ScanLibrary` flow:
1. Walk directory → find video files → upsert to `media_files`

New flow:
1. Walk directory → find video files → upsert to `media_files`
2. **NEW:** For each upserted file, if `file_hash` is empty, compute hash and update DB via `UpdateMediaFileHash`

Hash computation happens inline during scan. The scanner does NOT call DandanPlay — matching is a separate step.

---

## 6. Matcher Service

**Package:** `internal/matcher/`

```go
type Matcher struct {
    queries    *store.Queries
    dandanplay dandanplay.Client
    cache      cache.Cache
}

func New(q *store.Queries, ddp dandanplay.Client, c cache.Cache) *Matcher

// MatchLibrary matches all unmatched files in a library
func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string) (*MatchSummary, error)

// MatchFile matches a single file
func (m *Matcher) MatchFile(ctx context.Context, fileID string) (*store.MediaFile, error)
```

**MatchLibrary flow:**
1. Query `ListUnmatchedMediaFilesByLibrary` to get files with hash but no match
2. For each file:
   a. Check cache `danmaku:match:{fileHash}` for cached DandanPlay episode ID
   b. On cache miss, call `dandanplay.MatchFile(fileName, fileHash, fileSize)`
   c. If matched (first match result), update `media_files.dandanplay_episode_id` + `match_status='auto'`
   d. Cache the match result: `danmaku:match:{fileHash}` → episodeID (7 day TTL)
3. Return summary: `{ matched, unmatched, errors }`

**MatchSummary:**
```go
type MatchSummary struct {
    Matched   int `json:"matched"`
    Unmatched int `json:"unmatched"`
    Errors    int `json:"errors"`
}
```

---

## 7. sqlc Queries

**File:** `api/internal/store/queries/media_files.sql` (append)

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

Run `sqlc generate` after adding.

---

## 8. Danmaku API Endpoints

**File:** `internal/api/danmaku_handler.go`

### Routes (JWT auth required)

```
GET  /api/v1/danmaku/:mediaFileId     → Fetch danmaku for a matched media file
POST /api/v1/danmaku/:mediaFileId     → Submit danmaku to DandanPlay
```

### GET /danmaku/:mediaFileId

1. Query `GetMediaFileByID` to get the file record
2. If `dandanplay_episode_id` is null/0 → return 404 `{"error": "file not matched"}`
3. Check cache `danmaku:ddp:{episodeId}`
4. Cache hit → return cached comments
5. Cache miss → call `dandanplay.GetComments(episodeID)`
6. Cache result with 6h TTL
7. Return `{ "count": N, "comments": [...] }`

### POST /danmaku/:mediaFileId

1. Query `GetMediaFileByID`
2. If `dandanplay_episode_id` is null/0 → return 404
3. Parse request body as `PostCommentReq`
4. Call `dandanplay.PostComment(episodeID, req)`
5. Delete cache `danmaku:ddp:{episodeId}` (invalidate)
6. Return 204

### Error Mapping

| Error | HTTP Status |
|-------|-------------|
| File not found | 404 |
| File not matched (no dandanplay_episode_id) | 404 |
| DandanPlay credentials missing | 503 |
| DandanPlay rate limited | 429 |
| DandanPlay unavailable | 502 |

---

## 9. Scan + Match Integration

**Modified:** `POST /api/v1/libraries/:id/scan` handler

Current: calls `scanner.ScanLibrary()` only.

New: calls `scanner.ScanLibrary()`, then `matcher.MatchLibrary()`.

The handler needs access to the `Matcher` service. Add `matcher *matcher.Matcher` to the `handler` struct.

---

## 10. Caching Strategy

| Data | Cache Key | TTL |
|------|-----------|-----|
| DandanPlay file match | `danmaku:match:{fileHash}` | 7 days |
| Danmaku comments | `danmaku:ddp:{episodeId}` | 6 hours |

---

## 11. Testing Strategy

### DandanPlay Client
- `httptest.NewServer` mocks for match, getComments, postComment
- Test: success, API error response, rate limit, missing credentials

### Hash Computation
- Create temp files with known content, verify MD5 output
- Test: small file (<16MB), large file (>16MB), empty file

### Matcher
- Mock DandanPlay client + mock store queries
- Test: successful match, no match, cached match, API error (non-fatal)

### Danmaku Handler
- Use `newTestApp` pattern with mock DandanPlay client
- Test: fetch danmaku success, file not matched 404, submit danmaku 204

---

## 12. File Map

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
- `api/internal/store/queries/media_files.sql` — add 4 queries
- `api/internal/scanner/scanner.go` — compute hash during scan
- `api/internal/api/router.go` — add danmaku routes, matcher + dandanplay in handler
- `api/cmd/server/main.go` — initialize dandanplay client + matcher
