# External Danmaku Search & Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search Bilibili for videos and import their danmaku into the current playback session, with 24h cache and extensible source architecture.

**Architecture:** Go backend proxies Bilibili API calls (search → get cid → fetch XML danmaku), caches results for 24h. Frontend adds a "Danmaku Sources" tab in the EpisodeSidebar where users search, select, and import. Imported danmaku merges with existing DandanPlay danmaku for rendering.

**Tech Stack:** Go (echo, encoding/xml), React, TanStack Query, `danmaku` npm package (already installed), existing cache layer.

**Spec:** `docs/superpowers/specs/2026-04-19-external-danmaku-search-design.md`

## Design Decisions (from /plan-design-review)

1. **Tab name:** "彈幕來源" (not "來源") — explicit, no ambiguity with other source types
2. **Episode switch:** Reset all Sources tab state (keyword, results, imported) when episode changes. Re-fill keyword with new episode name.
3. **Import feedback:** Show toast notification on success ("Imported 1.2万 danmaku from Bilibili") and error ("Import failed, please try again").
4. **Thumbnails:** Show 40x30px thumbnail for each search result to help identify correct video among noise.
5. **Touch targets:** Import/Remove buttons use `py-2` padding for 44px minimum touch target height on all devices.
6. **Pre-fill keyword:** Use `name_cn` (Chinese title) first, fallback to `name` (romaji). Bilibili is a Chinese platform, Chinese titles get better search results.
7. **Re-import:** Overwrite silently. Cache key is per-source, so re-importing naturally replaces old data.
8. **Pagination:** Not in v1 — first page (20 results) is sufficient. Add later if needed.
9. **Cache expiry:** If 24h TTL expires mid-session, imported section disappears on next refetch. Acceptable for v1.

---

### Task 1: Backend — Source interface & Bilibili implementation

**Files:**
- Create: `api/internal/integration/danmaku/source.go`
- Create: `api/internal/integration/danmaku/bilibili.go`
- Create: `api/internal/integration/danmaku/bilibili_test.go`

- [ ] **Step 1: Create the source interface and types**

Create `api/internal/integration/danmaku/source.go`:

```go
package danmaku

import "context"

// SearchResult represents a video found on an external platform.
type SearchResult struct {
	VideoID      string `json:"videoId"`
	Title        string `json:"title"`
	DanmakuCount int    `json:"danmakuCount"`
	Duration     string `json:"duration"`
	Thumbnail    string `json:"thumbnail,omitempty"`
}

// Comment is a single danmaku comment in normalized form.
type Comment struct {
	Text  string  `json:"text"`
	Time  float64 `json:"time"`
	Mode  string  `json:"mode"`
	Color string  `json:"color"`
}

// Source is the interface that external danmaku providers implement.
type Source interface {
	Name() string
	Search(ctx context.Context, keyword string, page int) ([]SearchResult, error)
	FetchDanmaku(ctx context.Context, videoID string) ([]Comment, error)
}

// Registry holds all registered danmaku sources.
type Registry struct {
	sources map[string]Source
}

func NewRegistry() *Registry {
	return &Registry{sources: make(map[string]Source)}
}

func (r *Registry) Register(s Source) {
	r.sources[s.Name()] = s
}

func (r *Registry) Get(name string) (Source, bool) {
	s, ok := r.sources[name]
	return s, ok
}

// Names returns the list of registered source names.
func (r *Registry) Names() []string {
	names := make([]string, 0, len(r.sources))
	for name := range r.sources {
		names = append(names, name)
	}
	return names
}
```

- [ ] **Step 2: Write Bilibili source tests**

Create `api/internal/integration/danmaku/bilibili_test.go`:

```go
package danmaku

import (
	"testing"
)

func TestParseBilibiliDanmakuXML(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<i>
<d p="1.5,1,25,16777215,1609459200,0,abc123,100">Hello World</d>
<d p="10.0,5,25,255,1609459201,0,def456,101">Top comment</d>
<d p="20.5,4,25,16711680,1609459202,0,ghi789,102">Bottom comment</d>
</i>`

	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 3 {
		t.Fatalf("expected 3 comments, got %d", len(comments))
	}

	// First comment: rtl mode, white color
	c := comments[0]
	if c.Text != "Hello World" {
		t.Errorf("text = %q, want %q", c.Text, "Hello World")
	}
	if c.Time != 1.5 {
		t.Errorf("time = %f, want 1.5", c.Time)
	}
	if c.Mode != "rtl" {
		t.Errorf("mode = %q, want %q", c.Mode, "rtl")
	}
	if c.Color != "#ffffff" {
		t.Errorf("color = %q, want %q", c.Color, "#ffffff")
	}

	// Second comment: top mode, blue color (#0000ff)
	c = comments[1]
	if c.Mode != "top" {
		t.Errorf("mode = %q, want %q", c.Mode, "top")
	}
	if c.Color != "#0000ff" {
		t.Errorf("color = %q, want %q", c.Color, "#0000ff")
	}

	// Third comment: bottom mode, red color (#ff0000)
	c = comments[2]
	if c.Mode != "bottom" {
		t.Errorf("mode = %q, want %q", c.Mode, "bottom")
	}
	if c.Color != "#ff0000" {
		t.Errorf("color = %q, want %q", c.Color, "#ff0000")
	}
}

func TestParseBilibiliDanmakuXML_Empty(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><i></i>`
	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 0 {
		t.Fatalf("expected 0 comments, got %d", len(comments))
	}
}

func TestParseBilibiliDanmakuXML_MalformedP(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<i>
<d p="bad">test</d>
<d p="5.0,1,25,16777215,0,0,abc,100">valid</d>
</i>`
	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Malformed entries are skipped, valid one remains
	if len(comments) != 1 {
		t.Fatalf("expected 1 comment, got %d", len(comments))
	}
	if comments[0].Text != "valid" {
		t.Errorf("text = %q, want %q", comments[0].Text, "valid")
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && go test ./internal/integration/danmaku/ -v -run TestParseBilibili`
Expected: FAIL — `parseBilibiliXML` undefined.

- [ ] **Step 4: Implement Bilibili source**

Create `api/internal/integration/danmaku/bilibili.go`:

```go
package danmaku

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type BilibiliSource struct {
	http *http.Client
}

func NewBilibiliSource(c *http.Client) *BilibiliSource {
	return &BilibiliSource{http: c}
}

func (b *BilibiliSource) Name() string { return "bilibili" }

func (b *BilibiliSource) Search(ctx context.Context, keyword string, page int) ([]SearchResult, error) {
	u := fmt.Sprintf(
		"https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=%s&page=%d",
		url.QueryEscape(keyword), page,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	// Bilibili requires a User-Agent to avoid 412
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; milmil/1.0)")

	resp, err := b.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bilibili search: status %d", resp.StatusCode)
	}

	var body struct {
		Data struct {
			Result []struct {
				BVID     string `json:"bvid"`
				Title    string `json:"title"`
				Play     int    `json:"play"`
				Danmaku  int    `json:"video_review"` // danmaku count field
				Duration string `json:"duration"`
				Pic      string `json:"pic"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("bilibili search decode: %w", err)
	}

	results := make([]SearchResult, 0, len(body.Data.Result))
	for _, r := range body.Data.Result {
		// Strip HTML tags from title (Bilibili returns <em> tags for highlights)
		title := stripHTMLTags(r.Title)
		results = append(results, SearchResult{
			VideoID:      r.BVID,
			Title:        title,
			DanmakuCount: r.Danmaku,
			Duration:     r.Duration,
			Thumbnail:    r.Pic,
		})
	}
	return results, nil
}

func (b *BilibiliSource) FetchDanmaku(ctx context.Context, videoID string) ([]Comment, error) {
	// Step 1: Get cid from bvid
	cid, err := b.getCID(ctx, videoID)
	if err != nil {
		return nil, err
	}

	// Step 2: Fetch XML danmaku
	u := fmt.Sprintf("https://comment.bilibili.com/%d.xml", cid)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := b.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku fetch: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("bilibili danmaku read: %w", err)
	}

	return parseBilibiliXML(data)
}

func (b *BilibiliSource) getCID(ctx context.Context, bvid string) (int64, error) {
	u := fmt.Sprintf("https://api.bilibili.com/x/web-interface/view?bvid=%s", url.QueryEscape(bvid))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; milmil/1.0)")

	resp, err := b.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("bilibili view: %w", err)
	}
	defer resp.Body.Close()

	var body struct {
		Data struct {
			CID int64 `json:"cid"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, fmt.Errorf("bilibili view decode: %w", err)
	}
	if body.Data.CID == 0 {
		return 0, fmt.Errorf("bilibili: no cid for %s", bvid)
	}
	return body.Data.CID, nil
}

// bilibiliDanmakuDoc is the XML root element for Bilibili danmaku.
type bilibiliDanmakuDoc struct {
	XMLName xml.Name           `xml:"i"`
	Items   []bilibiliDanmaku  `xml:"d"`
}

type bilibiliDanmaku struct {
	P    string `xml:"p,attr"`
	Text string `xml:",chardata"`
}

func parseBilibiliXML(data []byte) ([]Comment, error) {
	var doc bilibiliDanmakuDoc
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("bilibili xml parse: %w", err)
	}

	modeMap := map[string]string{
		"1": "rtl",
		"4": "bottom",
		"5": "top",
		"6": "rtl",
	}

	comments := make([]Comment, 0, len(doc.Items))
	for _, item := range doc.Items {
		parts := strings.Split(item.P, ",")
		if len(parts) < 4 {
			continue // skip malformed
		}

		time, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			continue
		}

		mode, ok := modeMap[parts[1]]
		if !ok {
			mode = "rtl"
		}

		colorInt, err := strconv.ParseInt(parts[3], 10, 64)
		if err != nil {
			colorInt = 16777215 // default white
		}
		color := fmt.Sprintf("#%06x", colorInt)

		comments = append(comments, Comment{
			Text:  item.Text,
			Time:  time,
			Mode:  mode,
			Color: color,
		})
	}
	return comments, nil
}

// stripHTMLTags removes HTML tags from a string (Bilibili search results contain <em> highlights).
func stripHTMLTags(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	return b.String()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && go test ./internal/integration/danmaku/ -v -run TestParseBilibili`
Expected: PASS — all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/internal/integration/danmaku/
git commit -m "feat(danmaku): add pluggable Source interface and Bilibili implementation"
```

---

### Task 2: Backend — HTTP handlers for external danmaku

**Files:**
- Create: `api/internal/api/danmaku_external_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create the external danmaku handler file**

Create `api/internal/api/danmaku_external_handler.go`:

```go
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/integration/danmaku"
)

func (h *handler) handleListDanmakuSources(c echo.Context) error {
	names := h.danmakuRegistry.Names()
	type sourceInfo struct {
		Name  string `json:"name"`
		Label string `json:"label"`
	}
	sources := make([]sourceInfo, 0, len(names))
	for _, name := range names {
		sources = append(sources, sourceInfo{Name: name, Label: name})
	}
	return c.JSON(http.StatusOK, sources)
}

func (h *handler) handleSearchExternalDanmaku(c echo.Context) error {
	sourceName := c.QueryParam("source")
	keyword := c.QueryParam("q")
	pageStr := c.QueryParam("page")

	if sourceName == "" || keyword == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source and q are required")
	}

	source, ok := h.danmakuRegistry.Get(sourceName)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown source: "+sourceName)
	}

	page := 1
	if pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	ctx := c.Request().Context()
	results, err := source.Search(ctx, keyword, page)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "search failed: "+err.Error())
	}

	return c.JSON(http.StatusOK, results)
}

func (h *handler) handleImportExternalDanmaku(c echo.Context) error {
	var req struct {
		Source      string `json:"source"`
		VideoID     string `json:"videoId"`
		MediaFileID string `json:"mediaFileId"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Source == "" || req.VideoID == "" || req.MediaFileID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "source, videoId, and mediaFileId are required")
	}

	source, ok := h.danmakuRegistry.Get(req.Source)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown source: "+req.Source)
	}

	ctx := c.Request().Context()
	comments, err := source.FetchDanmaku(ctx, req.VideoID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "fetch failed: "+err.Error())
	}

	// Cache with 24h TTL
	cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", req.MediaFileID, req.Source)
	data, _ := json.Marshal(comments)
	_ = h.cache.Set(ctx, cacheKey, data, 24*time.Hour)

	return c.JSON(http.StatusOK, map[string]any{
		"source": req.Source,
		"count":  len(comments),
		"comments": comments,
	})
}

func (h *handler) handleGetImportedDanmaku(c echo.Context) error {
	mediaFileID := c.Param("mediaFileId")
	ctx := c.Request().Context()

	type importedSource struct {
		Source   string           `json:"source"`
		Count   int              `json:"count"`
		Comments []danmaku.Comment `json:"comments"`
	}

	var imported []importedSource
	for _, name := range h.danmakuRegistry.Names() {
		cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, name)
		data, err := h.cache.Get(ctx, cacheKey)
		if err != nil {
			continue
		}
		var comments []danmaku.Comment
		if json.Unmarshal(data, &comments) == nil && len(comments) > 0 {
			imported = append(imported, importedSource{
				Source:   name,
				Count:    len(comments),
				Comments: comments,
			})
		}
	}

	return c.JSON(http.StatusOK, imported)
}

func (h *handler) handleRemoveImportedDanmaku(c echo.Context) error {
	mediaFileID := c.Param("mediaFileId")
	sourceName := c.QueryParam("source")
	ctx := c.Request().Context()

	if sourceName != "" {
		// Remove specific source
		cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, sourceName)
		_ = h.cache.Del(ctx, cacheKey)
	} else {
		// Remove all imported for this file
		for _, name := range h.danmakuRegistry.Names() {
			cacheKey := fmt.Sprintf("danmaku:ext:%s:%s", mediaFileID, name)
			_ = h.cache.Del(ctx, cacheKey)
		}
	}

	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 2: Add `danmakuRegistry` to handler struct**

In `api/internal/api/router.go`, add the field and update `NewRouter`:

Add import:
```go
"github.com/milmil/api/internal/integration/danmaku"
```

Add field to `handler` struct:
```go
danmakuRegistry *danmaku.Registry
```

Add parameter to `NewRouter` signature:
```go
func NewRouter(cfg *config.Config, db *sql.DB, cacheClient cache.Cache, metadataSvc *metadata.Service, matcherSvc *matcher.Matcher, ddpClient dandanplay.Client, resolverSvc *resolver.Resolver, dlManager downloader.Manager, wsHub *ws.Hub, tmdbClient tmdb.Client, torrentReg *torrent.Registry, notifier *notification.Service, syncSvc *milmilsync.Service, danmakuReg *danmaku.Registry) *echo.Echo {
```

Add to handler initialization:
```go
danmakuRegistry: danmakuReg,
```

- [ ] **Step 3: Register routes**

In `api/internal/api/router.go`, add after the existing danmaku group (line ~165):

```go
	// External danmaku sources — protected
	danmakuExtGroup := v1.Group("/danmaku/external", authMiddleware(h.queries))
	danmakuExtGroup.GET("/sources", h.handleListDanmakuSources)
	danmakuExtGroup.GET("/search", h.handleSearchExternalDanmaku)
	danmakuExtGroup.POST("/import", h.handleImportExternalDanmaku)
	danmakuExtGroup.GET("/imported/:mediaFileId", h.handleGetImportedDanmaku)
	danmakuExtGroup.DELETE("/imported/:mediaFileId", h.handleRemoveImportedDanmaku)
```

**Important:** These routes must be registered BEFORE the existing `danmakuGroup` with `/:mediaFileId` to avoid the `/external` path being matched as a media file ID parameter. Move the new group above the existing one:

```go
	// External danmaku sources — protected (must be before /:mediaFileId routes)
	danmakuExtGroup := v1.Group("/danmaku/external", authMiddleware(h.queries))
	danmakuExtGroup.GET("/sources", h.handleListDanmakuSources)
	danmakuExtGroup.GET("/search", h.handleSearchExternalDanmaku)
	danmakuExtGroup.POST("/import", h.handleImportExternalDanmaku)
	danmakuExtGroup.GET("/imported/:mediaFileId", h.handleGetImportedDanmaku)
	danmakuExtGroup.DELETE("/imported/:mediaFileId", h.handleRemoveImportedDanmaku)

	// Danmaku — protected
	danmakuGroup := v1.Group("/danmaku", authMiddleware(h.queries))
	danmakuGroup.GET("/:mediaFileId", h.handleGetDanmaku)
	danmakuGroup.POST("/:mediaFileId", h.handlePostDanmaku)
```

- [ ] **Step 4: Initialize Bilibili source in main.go**

In `api/cmd/server/main.go`, add import:
```go
"github.com/milmil/api/internal/integration/danmaku"
```

Add after the torrent registry initialization (~line 270):
```go
	// External danmaku sources
	danmakuReg := danmaku.NewRegistry()
	danmakuReg.Register(danmaku.NewBilibiliSource(&http.Client{Timeout: 15 * time.Second}))
	slog.Debug("boot: external danmaku sources registered")
```

Update the `api.NewRouter` call (~line 303) to pass `danmakuReg`:
```go
	e := api.NewRouter(cfg, database, cacheClient, metadataSvc, matcherSvc, ddpClient, resolverSvc, dlEngine, wsHub, tmdbClient, torrentReg, notifier, syncSvc, danmakuReg)
```

- [ ] **Step 5: Verify compilation**

Run: `cd api && go build ./cmd/server/`
Expected: Compiles successfully with no errors.

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/danmaku_external_handler.go api/internal/api/router.go api/cmd/server/main.go
git commit -m "feat(danmaku): add external danmaku search/import HTTP endpoints"
```

---

### Task 3: Frontend — API client for external danmaku

**Files:**
- Create: `web/src/lib/api/danmaku.ts`

- [ ] **Step 1: Create the frontend API client**

Create `web/src/lib/api/danmaku.ts`:

```typescript
import { api } from '../api-client';

export interface DanmakuSource {
  name: string;
  label: string;
}

export interface DanmakuSearchResult {
  videoId: string;
  title: string;
  danmakuCount: number;
  duration: string;
  thumbnail?: string;
}

export interface ExternalComment {
  text: string;
  time: number;
  mode: string;
  color: string;
}

export interface ImportedDanmaku {
  source: string;
  count: number;
  comments: ExternalComment[];
}

export const externalDanmakuApi = {
  sources: () => api.get<DanmakuSource[]>('/api/v1/danmaku/external/sources'),

  search: (source: string, q: string, page = 1) =>
    api.get<DanmakuSearchResult[]>(
      `/api/v1/danmaku/external/search?source=${encodeURIComponent(source)}&q=${encodeURIComponent(q)}&page=${page}`
    ),

  import: (source: string, videoId: string, mediaFileId: string) =>
    api.post<{ source: string; count: number; comments: ExternalComment[] }>(
      '/api/v1/danmaku/external/import',
      { source, videoId, mediaFileId }
    ),

  getImported: (mediaFileId: string) =>
    api.get<ImportedDanmaku[]>(`/api/v1/danmaku/external/imported/${mediaFileId}`),

  removeImported: (mediaFileId: string, source?: string) =>
    api.delete<void>(
      `/api/v1/danmaku/external/imported/${mediaFileId}${source ? `?source=${encodeURIComponent(source)}` : ''}`
    ),
};

export const externalDanmakuKeys = {
  sources: () => ['danmaku', 'external', 'sources'] as const,
  search: (source: string, q: string, page: number) =>
    ['danmaku', 'external', 'search', source, q, page] as const,
  imported: (mediaFileId: string) =>
    ['danmaku', 'external', 'imported', mediaFileId] as const,
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/api/danmaku.ts
git commit -m "feat(danmaku): add frontend API client for external danmaku"
```

---

### Task 4: Frontend — DanmakuSourceTab component

**Files:**
- Create: `web/src/components/watch/DanmakuSourceTab.tsx`

- [ ] **Step 1: Create the DanmakuSourceTab component**

Create `web/src/components/watch/DanmakuSourceTab.tsx`:

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import {
  type DanmakuSearchResult,
  type ImportedDanmaku,
  externalDanmakuApi,
  externalDanmakuKeys,
} from '@/lib/api/danmaku';

interface DanmakuSourceTabProps {
  mediaFileId: string | null;
  animeName: string;
  episodeNumber: number | undefined;
  onImported: () => void;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function DanmakuSourceTab({
  mediaFileId,
  animeName,
  episodeNumber,
  onImported,
}: DanmakuSourceTabProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  // Source selection
  const { data: sources } = useQuery({
    queryKey: externalDanmakuKeys.sources(),
    queryFn: externalDanmakuApi.sources,
  });
  const [selectedSource, setSelectedSource] = useState('bilibili');

  // Search state
  const defaultKeyword = episodeNumber
    ? `${animeName} 第${episodeNumber}話`
    : animeName;
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Reset state when episode changes (mediaFileId changes)
  useEffect(() => {
    const newKeyword = episodeNumber
      ? `${animeName} 第${episodeNumber}話`
      : animeName;
    setKeyword(newKeyword);
    setSearchTriggered(false);
    setSearchKeyword('');
  }, [mediaFileId, animeName, episodeNumber]);

  // Search query
  const {
    data: searchResults,
    isLoading: searching,
    error: searchError,
  } = useQuery({
    queryKey: externalDanmakuKeys.search(selectedSource, searchKeyword, 1),
    queryFn: () => externalDanmakuApi.search(selectedSource, searchKeyword),
    enabled: searchTriggered && searchKeyword.length > 0,
  });

  // Imported danmaku query
  const { data: imported } = useQuery({
    queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
    queryFn: () => externalDanmakuApi.getImported(mediaFileId!),
    enabled: !!mediaFileId,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (result: DanmakuSearchResult) =>
      externalDanmakuApi.import(selectedSource, result.videoId, mediaFileId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
      });
      onImported();
      toast.success(
        i18n._(msg`watch.danmaku.importSuccess`, { count: formatCount(data.count), source: selectedSource })
      );
    },
    onError: () => {
      toast.error(i18n._(msg`watch.danmaku.importError`));
    },
  });

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: (source: string) =>
      externalDanmakuApi.removeImported(mediaFileId!, source),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalDanmakuKeys.imported(mediaFileId ?? ''),
      });
      onImported();
    },
  });

  const handleSearch = () => {
    if (!keyword.trim()) return;
    setSearchKeyword(keyword.trim());
    setSearchTriggered(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Source selector */}
      {sources && sources.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 shrink-0">
            {i18n._(msg`watch.danmaku.source`)}
          </span>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-white outline-none"
          >
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Search input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={i18n._(msg`watch.danmaku.searchPlaceholder`)}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={!keyword.trim() || searching}
          className="shrink-0 bg-white/[0.08] text-white/70 text-xs px-3 py-1.5 rounded transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {searching ? <Spinner size={12} /> : i18n._(msg`watch.danmaku.search`)}
        </button>
      </div>

      {/* Search results */}
      {searchTriggered && (
        <div className="flex flex-col gap-1">
          {searching && (
            <div className="flex items-center justify-center py-6">
              <Spinner size={20} className="text-white/30" />
            </div>
          )}

          {searchError && (
            <div className="text-xs text-red-400/70 py-2">
              {i18n._(msg`watch.danmaku.searchError`)}
            </div>
          )}

          {searchResults && searchResults.length === 0 && (
            <div className="text-xs text-white/30 py-4 text-center">
              {i18n._(msg`watch.danmaku.noResults`)}
            </div>
          )}

          {searchResults?.map((result) => (
            <div
              key={result.videoId}
              className="flex items-start gap-2.5 p-2 rounded hover:bg-white/[0.04] transition-colors"
            >
              {result.thumbnail && (
                <img
                  src={result.thumbnail}
                  alt=""
                  className="w-[54px] h-[40px] rounded object-cover shrink-0 bg-white/[0.04]"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 line-clamp-2" title={result.title}>
                  {result.title}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {formatCount(result.danmakuCount)}{i18n._(msg`watch.danmaku.countUnit`)} · {result.duration}
                </p>
              </div>
              <button
                type="button"
                onClick={() => importMutation.mutate(result)}
                disabled={importMutation.isPending}
                className="shrink-0 text-xs text-blue-400/70 hover:text-blue-400 py-2 px-2 rounded transition-colors disabled:opacity-40"
              >
                {importMutation.isPending &&
                importMutation.variables?.videoId === result.videoId
                  ? i18n._(msg`watch.danmaku.importing`)
                  : i18n._(msg`watch.danmaku.import`)}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Imported danmaku */}
      {imported && imported.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2 mt-1">
          <p className="text-[11px] text-white/30 mb-1.5 uppercase tracking-wider">
            {i18n._(msg`watch.danmaku.imported`)}
          </p>
          {imported.map((item) => (
            <div
              key={item.source}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-xs text-white/50">
                {item.source} · {formatCount(item.count)}{i18n._(msg`watch.danmaku.countUnit`)}
              </span>
              <button
                type="button"
                onClick={() => removeMutation.mutate(item.source)}
                disabled={removeMutation.isPending}
                className="text-xs text-red-400/50 hover:text-red-400 py-2 px-2 rounded transition-colors"
              >
                {i18n._(msg`watch.danmaku.remove`)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/watch/DanmakuSourceTab.tsx
git commit -m "feat(danmaku): add DanmakuSourceTab sidebar component"
```

---

### Task 5: Frontend — Wire DanmakuSourceTab into EpisodeSidebar & WatchPage

**Files:**
- Modify: `web/src/components/watch/EpisodeSidebar.tsx`
- Modify: `web/src/pages/WatchPage.tsx`

- [ ] **Step 1: Add "sources" tab to EpisodeSidebar**

Modify `web/src/components/watch/EpisodeSidebar.tsx` to add a third tab and accept new props:

```tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { PlayableEpisode } from '@/lib/api/anime';
import type { DanmakuComment } from '@/lib/api/stream';
import { cn } from '@/lib/utils';
import { DanmakuList } from './DanmakuList';
import { DanmakuSourceTab } from './DanmakuSourceTab';
import { EpisodeGrid } from './EpisodeGrid';

type Tab = 'episodes' | 'danmaku' | 'sources';

interface EpisodeSidebarProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
  danmakuComments: DanmakuComment[];
  onSeekDanmaku: (time: number) => void;
  // External danmaku props
  mediaFileId: string | null;
  animeName: string;
  episodeNumber: number | undefined;
  onExternalDanmakuImported: () => void;
}

export function EpisodeSidebar({
  episodes,
  currentSort,
  onSelectEpisode,
  danmakuComments,
  onSeekDanmaku,
  mediaFileId,
  animeName,
  episodeNumber,
  onExternalDanmakuImported,
}: EpisodeSidebarProps) {
  const { i18n } = useLingui();
  const [activeTab, setActiveTab] = useState<Tab>('episodes');

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'episodes', label: i18n._(msg`watch.episodes`) },
    {
      id: 'danmaku',
      label: i18n._(msg`watch.danmaku`),
      badge: danmakuComments.length > 0 ? `(${danmakuComments.length})` : undefined,
    },
    { id: 'sources', label: i18n._(msg`watch.danmaku.externalSources`) },
  ];

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'text-blue-400' : 'text-white/40 hover:text-white/60'
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badge && <span className="text-[11px] text-white/30">{tab.badge}</span>}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === 'episodes' && (
          <EpisodeGrid
            episodes={episodes}
            currentSort={currentSort}
            onSelectEpisode={onSelectEpisode}
          />
        )}
        {activeTab === 'danmaku' && (
          <DanmakuList comments={danmakuComments} onSeek={onSeekDanmaku} />
        )}
        {activeTab === 'sources' && (
          <DanmakuSourceTab
            mediaFileId={mediaFileId}
            animeName={animeName}
            episodeNumber={episodeNumber}
            onImported={onExternalDanmakuImported}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire imported danmaku into WatchPage**

In `web/src/pages/WatchPage.tsx`:

Add import at the top:
```typescript
import { externalDanmakuApi, externalDanmakuKeys } from '@/lib/api/danmaku';
```

After the existing danmaku parsing block (~line 335), add the imported danmaku query and merge logic:

```typescript
  // --------------- External imported danmaku ---------------
  const { data: importedDanmaku, refetch: refetchImported } = useQuery({
    queryKey: externalDanmakuKeys.imported(fileId ?? ''),
    queryFn: () => externalDanmakuApi.getImported(fileId!),
    enabled: !!fileId,
  });

  const mergedDanmakuComments = useMemo(() => {
    if (!importedDanmaku?.length) return danmakuComments;
    const imported: DanmakuComment[] = importedDanmaku.flatMap((source) =>
      source.comments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode as 'rtl' | 'top' | 'bottom',
        style: {
          fontSize: `${danmakuFontSize}px`,
          color: c.color,
          opacity: danmakuOpacity,
        },
      }))
    );
    return [...danmakuComments, ...imported];
  }, [danmakuComments, importedDanmaku, danmakuFontSize, danmakuOpacity]);
```

Then replace all references to `danmakuComments` in the JSX with `mergedDanmakuComments`:
- `<DanmakuOverlay videoElement={videoEl} comments={mergedDanmakuComments} />`
- `<DanmakuBar fileId={fileId} danmakuCount={mergedDanmakuComments.length} />`
- Both `<EpisodeSidebar>` instances: `danmakuComments={mergedDanmakuComments}`

Add new props to both `<EpisodeSidebar>` instances:
```tsx
mediaFileId={fileId}
animeName={animeDetail?.name_cn ?? animeDetail?.name ?? ''}
episodeNumber={currentEpisode?.sort}
onExternalDanmakuImported={() => refetchImported()}
```

- [ ] **Step 3: Verify build**

Run: `cd web && bun run typecheck`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/watch/EpisodeSidebar.tsx web/src/pages/WatchPage.tsx
git commit -m "feat(danmaku): wire external danmaku tab into sidebar and merge with player"
```

---

### Task 6: i18n — Add translation strings

**Files:**
- Modify: `web/src/locales/en/messages.po` (add new keys)

- [ ] **Step 1: Run i18n extraction**

Run: `cd web && bun run i18n:extract`

This will detect all new `msg` tags and add them to the `.po` files.

- [ ] **Step 2: Fill in English translations**

In `web/src/locales/en/messages.po`, find and fill the new entries:

```
msgid "watch.danmaku.source"
msgstr "Source"

msgid "watch.danmaku.externalSources"
msgstr "Danmaku Sources"

msgid "watch.danmaku.searchPlaceholder"
msgstr "Search anime name + episode..."

msgid "watch.danmaku.search"
msgstr "Search"

msgid "watch.danmaku.searchError"
msgstr "Search failed, please try again"

msgid "watch.danmaku.noResults"
msgstr "No results found"

msgid "watch.danmaku.countUnit"
msgstr " danmaku"

msgid "watch.danmaku.import"
msgstr "Import"

msgid "watch.danmaku.importing"
msgstr "Importing..."

msgid "watch.danmaku.imported"
msgstr "Imported"

msgid "watch.danmaku.remove"
msgstr "Remove"

msgid "watch.danmaku.importSuccess"
msgstr "Imported {count} danmaku from {source}"

msgid "watch.danmaku.importError"
msgstr "Import failed, please try again"
```

- [ ] **Step 3: Compile translations**

Run: `cd web && bun run i18n:compile`

- [ ] **Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "feat(danmaku): add i18n strings for external danmaku search"
```

---

### Task 7: Build verification & E2E smoke test

**Files:** None new — verification only.

- [ ] **Step 1: Full backend build**

Run: `cd api && go build ./cmd/server/`
Expected: Compiles without errors.

- [ ] **Step 2: Run backend tests**

Run: `cd api && go test ./internal/integration/danmaku/ -v`
Expected: All tests pass.

- [ ] **Step 3: Full frontend typecheck + lint**

Run: `cd web && bun run check:all`
Expected: No errors.

- [ ] **Step 4: Manual E2E verification**

Start the app and navigate to a watch page:
1. Verify the "Sources" tab appears in the right sidebar
2. Verify the search input is pre-filled with anime name + episode
3. Search for a keyword and verify results appear
4. Import danmaku from a result and verify it renders on the video
5. Verify the "Imported" section shows the imported source
6. Remove imported danmaku and verify it clears

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(danmaku): address E2E issues from manual testing"
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ISSUES_OPEN | score: 5/10 → 8/10, 9 decisions made |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** DESIGN REVIEWED (5→8/10) — 9 design decisions added to plan. Eng review still required before implementation.
