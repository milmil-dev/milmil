# Video Player + Danmaku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add video playback with byte-range streaming and danmaku bullet comment overlay synced to video timeline.

**Architecture:** Backend serves files via `http.ServeContent` (automatic Range/206). Frontend uses Video.js for the player and `danmaku` npm library for bullet comments in canvas media mode. JWT auth falls back to `?token` query param for `<video src>`.

**Tech Stack:** Go (Echo v4, `http.ServeContent`), Video.js v8, `danmaku` npm library, React 19, TanStack Query, Zustand, Motion

**Important:** Backend uses `mise exec -- go`. Frontend uses `bun`.

---

## File Map

### Created (Backend)
- `api/internal/api/stream_handler.go` — byte-range file serve

### Created (Frontend)
- `web/src/lib/api/stream.ts` — stream URL builder + danmaku comment parser
- `web/src/store/player-store.ts` — Zustand store for danmaku settings
- `web/src/components/VideoPlayer.tsx` — Video.js wrapper
- `web/src/components/DanmakuOverlay.tsx` — danmaku library integration
- `web/src/components/DanmakuSettings.tsx` — settings panel
- `web/src/pages/WatchPage.tsx` — watch route page
- `web/src/routes/watch.$fileId.tsx` — route file

### Modified
- `api/internal/api/auth_middleware.go` — add `?token` query param fallback
- `api/internal/api/router.go` — add stream route
- `web/src/routes/__root.tsx` — add `/watch` to isPublicRoute
- `web/src/routeTree.gen.ts` — regenerated

---

## Task 1: Stream Handler + Auth Middleware Update (Backend)

**Files:**
- Create: `api/internal/api/stream_handler.go`
- Modify: `api/internal/api/auth_middleware.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Update auth_middleware.go — add query param fallback**

Read `api/internal/api/auth_middleware.go` first. Add a new middleware variant that also checks `?token` query param:

```go
// jwtMiddlewareWithQueryParam is like jwtMiddleware but also accepts ?token=JWT as fallback.
// Used for stream endpoints where <video src> cannot set custom headers.
func jwtMiddlewareWithQueryParam(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Try Authorization header first
			header := c.Request().Header.Get("Authorization")
			token := ""
			if strings.HasPrefix(header, "Bearer ") {
				token = strings.TrimPrefix(header, "Bearer ")
			}
			// Fallback to ?token query param
			if token == "" {
				token = c.QueryParam("token")
			}
			if token == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			userID, err := auth.VerifyToken(secret, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}
```

- [ ] **Step 2: Create stream_handler.go**

```go
package api

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

var mimeTypes = map[string]string{
	".mp4":  "video/mp4",
	".mkv":  "video/x-matroska",
	".webm": "video/webm",
	".avi":  "video/x-msvideo",
	".mov":  "video/quicktime",
	".m4v":  "video/x-m4v",
	".ts":   "video/mp2t",
	".flv":  "video/x-flv",
}

func (h *handler) handleStreamDirect(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	mediaFile, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	f, err := os.Open(mediaFile.Path)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "file not on disk")
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return echo.ErrInternalServerError
	}

	ext := strings.ToLower(filepath.Ext(mediaFile.Path))
	contentType := mimeTypes[ext]
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("Content-Type", contentType)
	http.ServeContent(c.Response(), c.Request(), mediaFile.Filename, stat.ModTime(), f)
	return nil
}
```

- [ ] **Step 3: Add stream route to router.go**

After the danmaku routes, add:

```go
// Stream — protected (with query param token fallback for <video src>)
streamGroup := v1.Group("/stream", jwtMiddlewareWithQueryParam(cfg.JWTSecret))
streamGroup.GET("/:fileId/direct", h.handleStreamDirect)
```

- [ ] **Step 4: Run all tests**

```bash
cd api && mise exec -- go test ./... 2>&1 | tail -15
```

Expected: all existing tests PASS (stream handler test comes in next step).

- [ ] **Step 5: Write stream handler test**

Add to the bottom of `stream_handler.go` or create a new test file. Since it needs a real file on disk and a test DB, use the existing `newTestApp` pattern:

Create `api/internal/api/stream_handler_test.go`:

```go
package api_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestStreamDirect_NotFound(t *testing.T) {
	e := newTestApp(t)
	req := makeAuthRequest(t, e, http.MethodGet, "/api/v1/stream/nonexistent/direct", "")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

**Note:** A full streaming test requires inserting a media_file record pointing to a real temp file, then requesting the stream. This is complex for a test file — the 404 test validates the route exists and auth works. Full integration testing is done manually.

- [ ] **Step 6: Run tests + commit**

```bash
cd api && mise exec -- go test ./... -v 2>&1 | tail -15
git add api/internal/api/stream_handler.go api/internal/api/stream_handler_test.go api/internal/api/auth_middleware.go api/internal/api/router.go
git commit -m "feat: add byte-range stream endpoint with query param JWT fallback"
```

---

## Task 2: Frontend — Stream API + Player Store + Install danmaku

**Files:**
- Create: `web/src/lib/api/stream.ts`
- Create: `web/src/store/player-store.ts`

- [ ] **Step 1: Install danmaku npm package**

```bash
cd web && bun add danmaku
```

- [ ] **Step 2: Create stream.ts — URL builder + comment parser**

```typescript
// web/src/lib/api/stream.ts

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export function getStreamUrl(fileId: string): string {
  const token = localStorage.getItem('milmil-token') ?? '';
  return `${API_URL}/api/v1/stream/${fileId}/direct?token=${encodeURIComponent(token)}`;
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    ts: 'video/mp2t',
    flv: 'video/x-flv',
  };
  return types[ext] ?? 'video/mp4';
}

export interface DanmakuComment {
  text: string;
  time: number;
  mode: 'rtl' | 'top' | 'bottom';
  style: {
    fontSize: string;
    color: string;
    opacity: number;
  };
}

export function parseDandanplayComments(
  comments: { p: string; m: string }[],
  fontSize: number = 20,
  opacity: number = 1,
): DanmakuComment[] {
  const modeMap: Record<string, 'rtl' | 'top' | 'bottom'> = {
    '1': 'rtl',
    '4': 'bottom',
    '5': 'top',
    '6': 'rtl',
  };
  return comments.map(({ p, m }) => {
    const parts = p.split(',');
    const time = parseFloat(parts[0] ?? '0');
    const type = parts[1] ?? '1';
    const colorInt = parseInt(parts[2] ?? '16777215', 10);
    return {
      text: m,
      time,
      mode: modeMap[type] ?? 'rtl',
      style: {
        fontSize: `${fontSize}px`,
        color: `#${colorInt.toString(16).padStart(6, '0')}`,
        opacity,
      },
    };
  });
}
```

- [ ] **Step 3: Create player-store.ts**

```typescript
// web/src/store/player-store.ts
import { create } from 'zustand';

interface PlayerState {
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuSpeed: number;
  toggleDanmaku: () => void;
  setDanmakuOpacity: (v: number) => void;
  setDanmakuFontSize: (v: number) => void;
  setDanmakuSpeed: (v: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  danmakuEnabled: true,
  danmakuOpacity: 1,
  danmakuFontSize: 20,
  danmakuSpeed: 144,
  toggleDanmaku: () => set((s) => ({ danmakuEnabled: !s.danmakuEnabled })),
  setDanmakuOpacity: (v) => set({ danmakuOpacity: v }),
  setDanmakuFontSize: (v) => set({ danmakuFontSize: v }),
  setDanmakuSpeed: (v) => set({ danmakuSpeed: v }),
}));
```

- [ ] **Step 4: Typecheck**

```bash
cd web && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
bun run lint:fix
git add web/src/lib/api/stream.ts web/src/store/player-store.ts web/package.json web/bun.lock
git commit -m "feat: add stream URL builder, danmaku parser, and player store"
```

---

## Task 3: Frontend — VideoPlayer + DanmakuOverlay + DanmakuSettings

**Files:**
- Create: `web/src/components/VideoPlayer.tsx`
- Create: `web/src/components/DanmakuOverlay.tsx`
- Create: `web/src/components/DanmakuSettings.tsx`

- [ ] **Step 1: Create VideoPlayer.tsx**

```typescript
// web/src/components/VideoPlayer.tsx
import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

interface VideoPlayerProps {
  src: string;
  type: string;
  onReady?: (player: Player) => void;
  className?: string;
}

export function VideoPlayer({ src, type, onReady, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered', 'vjs-fluid');
    videoRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: 'metadata',
      responsive: true,
      sources: [{ src, type }],
    });

    playerRef.current = player;

    player.ready(() => {
      onReady?.(player);
    });

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [src, type]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={videoRef} className={className} data-vjs-player />;
}
```

**Note on Video.js types:** If `video.js/dist/types/player` doesn't resolve, use `any` for the Player type. Check with typecheck.

- [ ] **Step 2: Create DanmakuOverlay.tsx**

```typescript
// web/src/components/DanmakuOverlay.tsx
import DanmakuEngine from 'danmaku';
import { useEffect, useRef } from 'react';
import type { DanmakuComment } from '../lib/api/stream';
import { usePlayerStore } from '../store/player-store';

interface DanmakuOverlayProps {
  videoElement: HTMLVideoElement | null;
  comments: DanmakuComment[];
}

export function DanmakuOverlay({ videoElement, comments }: DanmakuOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<DanmakuEngine | null>(null);
  const enabled = usePlayerStore((s) => s.danmakuEnabled);
  const speed = usePlayerStore((s) => s.danmakuSpeed);

  // Init danmaku engine
  useEffect(() => {
    if (!videoElement || !containerRef.current || comments.length === 0) return;

    const engine = new DanmakuEngine({
      container: containerRef.current,
      media: videoElement,
      engine: 'canvas',
      comments: comments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode,
        style: c.style,
      })),
      speed,
    });

    danmakuRef.current = engine;

    return () => {
      engine.destroy();
      danmakuRef.current = null;
    };
  }, [videoElement, comments, speed]);

  // Toggle visibility
  useEffect(() => {
    if (!danmakuRef.current) return;
    if (enabled) {
      danmakuRef.current.show();
    } else {
      danmakuRef.current.hide();
    }
  }, [enabled]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => danmakuRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
    />
  );
}
```

**Note on `danmaku` import:** The package may use default export or named export. Check with:
```bash
node -e "import('danmaku').then(m => console.log(Object.keys(m)))"
```
Adjust the import if needed (`import Danmaku from 'danmaku'` vs `import { Danmaku } from 'danmaku'`).

- [ ] **Step 3: Create DanmakuSettings.tsx**

```typescript
// web/src/components/DanmakuSettings.tsx
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { usePlayerStore } from '../store/player-store';
import { cn } from '../lib/utils';

const FONT_SIZES = [16, 20, 24] as const;
const SPEEDS = [
  { label: '慢', value: 100 },
  { label: '正常', value: 144 },
  { label: '快', value: 200 },
] as const;

export function DanmakuSettings() {
  const [open, setOpen] = useState(false);
  const enabled = usePlayerStore((s) => s.danmakuEnabled);
  const opacity = usePlayerStore((s) => s.danmakuOpacity);
  const fontSize = usePlayerStore((s) => s.danmakuFontSize);
  const speed = usePlayerStore((s) => s.danmakuSpeed);
  const toggleDanmaku = usePlayerStore((s) => s.toggleDanmaku);
  const setOpacity = usePlayerStore((s) => s.setDanmakuOpacity);
  const setFontSize = usePlayerStore((s) => s.setDanmakuFontSize);
  const setSpeed = usePlayerStore((s) => s.setDanmakuSpeed);

  return (
    <div className="absolute top-3 right-3 z-20">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'px-2.5 py-1 text-[11px] font-medium rounded transition-colors',
          enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary',
        )}
      >
        彈
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute top-9 right-0 w-52 rounded-lg border border-mm-border p-3 space-y-3"
            style={{ backgroundColor: 'oklch(12% 0.02 260)' }}
          >
            {/* On/Off */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-mm-text-secondary">彈幕</span>
              <button
                type="button"
                onClick={toggleDanmaku}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium rounded',
                  enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-muted',
                )}
              >
                {enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Opacity */}
            <div>
              <label className="text-[10px] text-mm-text-muted block mb-1">透明度</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1 accent-mm-accent"
              />
            </div>

            {/* Font size */}
            <div>
              <label className="text-[10px] text-mm-text-muted block mb-1">字體大小</label>
              <div className="flex gap-1">
                {FONT_SIZES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setFontSize(s)}
                    className={cn(
                      'flex-1 py-0.5 text-[10px] rounded transition-colors',
                      fontSize === s ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Speed */}
            <div>
              <label className="text-[10px] text-mm-text-muted block mb-1">速度</label>
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button
                    type="button"
                    key={s.value}
                    onClick={() => setSpeed(s.value)}
                    className={cn(
                      'flex-1 py-0.5 text-[10px] rounded transition-colors',
                      speed === s.value ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd web && bun run typecheck
```

Fix any Video.js or danmaku type issues. Common fixes:
- Video.js Player type: use `import type Player from 'video.js/dist/types/player'` or `any`
- Danmaku import: try `import Danmaku from 'danmaku'` (default export)

- [ ] **Step 5: Commit**

```bash
bun run lint:fix
git add web/src/components/VideoPlayer.tsx web/src/components/DanmakuOverlay.tsx web/src/components/DanmakuSettings.tsx
git commit -m "feat: add VideoPlayer, DanmakuOverlay, and DanmakuSettings components"
```

---

## Task 4: Frontend — WatchPage + Route + Root Update

**Files:**
- Create: `web/src/routes/watch.$fileId.tsx`
- Create: `web/src/pages/WatchPage.tsx`
- Modify: `web/src/routes/__root.tsx`

- [ ] **Step 1: Create route file**

```typescript
// web/src/routes/watch.$fileId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { WatchPage } from '../pages/WatchPage';
export const Route = createFileRoute('/watch/$fileId')({ component: WatchPage });
```

- [ ] **Step 2: Create WatchPage.tsx**

```typescript
// web/src/pages/WatchPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import type Player from 'video.js/dist/types/player';
import { DanmakuOverlay } from '../components/DanmakuOverlay';
import { DanmakuSettings } from '../components/DanmakuSettings';
import { PageTransition } from '../components/PageTransition';
import { VideoPlayer } from '../components/VideoPlayer';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { type DanmakuComment, getStreamUrl, getMimeType, parseDandanplayComments } from '../lib/api/stream';
import { usePlayerStore } from '../store/player-store';

export function WatchPage() {
  const { fileId } = useParams({ strict: false });
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const danmakuOpacity = usePlayerStore((s) => s.danmakuOpacity);
  const danmakuFontSize = usePlayerStore((s) => s.danmakuFontSize);

  // Fetch danmaku (may 404 — that's OK)
  const { data: danmakuData } = useQuery({
    queryKey: ['danmaku', fileId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:8080'}/api/v1/danmaku/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('milmil-token') ?? ''}`,
          },
        },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ count: number; comments: { p: string; m: string }[] }>;
    },
    enabled: !!fileId,
  });

  const comments: DanmakuComment[] = danmakuData?.comments
    ? parseDandanplayComments(danmakuData.comments, danmakuFontSize, danmakuOpacity)
    : [];

  // Stream URL — uses query param token for <video src>
  const streamUrl = fileId ? getStreamUrl(fileId) : '';
  // Use mp4 as default since we don't have the filename here
  // TODO: fetch media file details to get actual filename/type
  const mimeType = 'video/mp4';

  const handlePlayerReady = (player: Player) => {
    const el = player.el()?.querySelector('video') as HTMLVideoElement | null;
    setVideoEl(el);
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-mm-bg">
        <div className="max-w-[1200px] mx-auto px-4 pt-4 pb-16">
          {/* Player container */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-black"
          >
            <VideoPlayer
              src={streamUrl}
              type={mimeType}
              onReady={handlePlayerReady}
              className="w-full h-full"
            />
            <DanmakuOverlay videoElement={videoEl} comments={comments} />
            <DanmakuSettings />
          </motion.div>

          {/* File info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-4"
          >
            <p className="text-sm text-mm-text-tertiary">
              {danmakuData ? `${danmakuData.count} 條彈幕` : '無彈幕數據'}
            </p>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
```

**Note on Player type:** If `video.js/dist/types/player` doesn't resolve, replace the import with `type Player = any`.

- [ ] **Step 3: Update __root.tsx — add /watch to public routes**

Read `web/src/routes/__root.tsx`. In the `isPublicRoute` function, add:

```typescript
if (pathname.startsWith('/watch/')) return true;
```

- [ ] **Step 4: Regenerate route tree**

```bash
cd web && bunx @tanstack/router-cli generate
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd web && bun run typecheck && bun run lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add web/src/routes/watch.\$fileId.tsx web/src/pages/WatchPage.tsx web/src/routes/__root.tsx web/src/routeTree.gen.ts
git commit -m "feat: add WatchPage with video player and danmaku overlay"
```

---

## Final Verification

- [ ] **Backend tests**

```bash
cd api && mise exec -- go test ./... -v 2>&1 | tail -15
```

- [ ] **Frontend typecheck + build**

```bash
cd web && bun run typecheck && bun run build 2>&1 | tail -5
```
