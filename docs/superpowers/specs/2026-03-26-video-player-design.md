# Video Player + Danmaku — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Plan 6 (DandanPlay Integration) — danmaku API endpoints

---

## 1. Overview

Add video playback with danmaku overlay. Backend serves video files via byte-range HTTP. Frontend uses Video.js v10 for the player and the `danmaku` npm library for bullet comment rendering synced to video timeline.

### Goals
- Direct video streaming endpoint (byte-range HTTP serve)
- Video.js v10 player React component
- Danmaku overlay using `danmaku` npm library (canvas engine, media mode)
- Danmaku settings panel (toggle, opacity, font size, speed)
- `/watch/:fileId` route

### Non-goals (later plans)
- FFmpeg transcoding / HLS adaptive bitrate
- Subtitle rendering (embedded or external)
- Watch progress tracking / sync
- Danmaku submission UI (POST endpoint exists but no frontend form yet)

---

## 2. Backend — Stream Endpoint

**File:** `api/internal/api/stream_handler.go`

### Route (JWT auth)

```
GET /api/v1/stream/:fileId/direct
```

### Flow

1. Query `GetMediaFileByID` for file path
2. Open the file on disk
3. Determine Content-Type from file extension
4. Serve with `http.ServeContent(w, r, filename, modTime, file)` — handles Range headers, 206 Partial Content, seek automatically

### Content-Type Mapping

| Extension | Content-Type |
|-----------|-------------|
| `.mp4` | `video/mp4` |
| `.mkv` | `video/x-matroska` |
| `.webm` | `video/webm` |
| `.avi` | `video/x-msvideo` |
| `.mov` | `video/quicktime` |
| default | `application/octet-stream` |

### Error Cases
- File not found in DB → 404
- File not on disk → 404
- Unauthorized → 401

---

## 3. Frontend — Components

### VideoPlayer.tsx

Wrapper around Video.js v10. Initializes the player on mount, disposes on unmount.

```typescript
interface VideoPlayerProps {
  src: string;            // stream URL
  type: string;           // MIME type
  onReady?: (player: VideoJsPlayer) => void;
  className?: string;
}
```

Key implementation:
- Create `<div data-vjs-player><video ref={videoRef} className="video-js" /></div>`
- `useEffect` to init `videojs(videoRef.current, options)` on mount
- Call `onReady(player)` after init — this gives DanmakuOverlay access to the `<video>` element
- `useEffect` cleanup: `player.dispose()`
- Import Video.js CSS: `import 'video.js/dist/video-js.css'`

### DanmakuOverlay.tsx

Uses the `danmaku` npm library in media mode.

```typescript
interface DanmakuOverlayProps {
  videoElement: HTMLVideoElement | null;
  comments: DanmakuComment[];
}

interface DanmakuComment {
  text: string;
  time: number;        // seconds
  mode: 'rtl' | 'top' | 'bottom';
  style: {
    fontSize: string;
    color: string;
    opacity: number;
  };
}
```

Key implementation:
- `useEffect` watches `videoElement` + `comments` — creates `new Danmaku({ container, media: videoElement, engine: 'canvas', comments })`
- Reads settings from `usePlayerStore` (opacity, fontSize, speed, enabled)
- When `danmakuEnabled` is false, call `danmaku.hide()` / `danmaku.show()`
- On resize: `danmaku.resize()`
- Cleanup: `danmaku.destroy()`

### DanmakuComment Parser

Convert DandanPlay `"p": "12.5,1,16777215"` format to `danmaku` library format:

```typescript
function parseDandanplayComments(comments: { p: string; m: string }[]): DanmakuComment[] {
  return comments.map(({ p, m }) => {
    const [time, type, color] = p.split(',');
    const modeMap: Record<string, 'rtl' | 'top' | 'bottom'> = {
      '1': 'rtl',    // scroll
      '4': 'bottom', // bottom fixed
      '5': 'top',    // top fixed
      '6': 'rtl',    // reverse scroll → treat as rtl
    };
    return {
      text: m,
      time: parseFloat(time),
      mode: modeMap[type] ?? 'rtl',
      style: {
        fontSize: '20px',
        color: `#${parseInt(color).toString(16).padStart(6, '0')}`,
        opacity: 1,
      },
    };
  });
}
```

### DanmakuSettings.tsx

Floating panel positioned over the player (top-right). Toggled by a button in the player controls area.

Settings:
- Danmaku on/off toggle
- Opacity slider (0–100%)
- Font size selector (16px / 20px / 24px)
- Speed selector (slow / normal / fast)

All settings stored in `usePlayerStore` (Zustand).

### player-store.ts (Zustand)

```typescript
interface PlayerState {
  danmakuEnabled: boolean;
  danmakuOpacity: number;     // 0-1
  danmakuFontSize: number;    // 16 | 20 | 24
  danmakuSpeed: number;       // 100 | 144 | 200 (px/s)
  toggleDanmaku: () => void;
  setDanmakuOpacity: (v: number) => void;
  setDanmakuFontSize: (v: number) => void;
  setDanmakuSpeed: (v: number) => void;
}
```

Default: enabled, opacity 1, fontSize 20, speed 144.

---

## 4. Frontend — WatchPage

**Route:** `/watch/:fileId`

**File:** `web/src/pages/WatchPage.tsx`

### Data Flow

1. Extract `fileId` from route params
2. `useQuery` → `GET /api/v1/danmaku/${fileId}` (may 404 if not matched — that's OK, just no danmaku)
3. Video source: `/api/v1/stream/${fileId}/direct` (hardcoded URL with auth token in header)
4. Parse danmaku comments with `parseDandanplayComments()`
5. Render: VideoPlayer + DanmakuOverlay + DanmakuSettings

### Layout

```
<div className="min-h-screen bg-mm-bg">
  <div className="max-w-[1200px] mx-auto px-4 pt-4">
    <!-- Player container -->
    <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
      <VideoPlayer src={streamUrl} type={mimeType} onReady={setPlayer} />
      <DanmakuOverlay videoElement={player?.el()?.querySelector('video')} comments={comments} />
      <DanmakuSettings />
    </div>
    <!-- File info below player -->
    <div className="mt-4">
      <h1 className="text-lg font-semibold text-mm-text-primary">{file.filename}</h1>
      <p className="text-sm text-mm-text-tertiary mt-1">{file.path}</p>
    </div>
  </div>
</div>
```

### Auth for Stream URL

The stream endpoint requires JWT. Video.js cannot set custom headers on `<video src>`. Two approaches:

**Chosen: Query parameter token.** The stream handler accepts `?token=JWT` as fallback auth. The frontend appends the token from localStorage.

Stream URL: `/api/v1/stream/${fileId}/direct?token=${token}`

The backend stream handler checks `Authorization` header first, then falls back to `?token` query param.

---

## 5. npm Dependencies

```bash
bun add danmaku
```

`video.js` is already installed (`"video.js": "^8.23.7"` in package.json — note: the spec says v10 but v8 is what's installed. Use what's installed).

---

## 6. File Map

### Created (Backend)
- `api/internal/api/stream_handler.go`

### Created (Frontend)
- `web/src/components/VideoPlayer.tsx`
- `web/src/components/DanmakuOverlay.tsx`
- `web/src/components/DanmakuSettings.tsx`
- `web/src/store/player-store.ts`
- `web/src/lib/api/stream.ts` — stream URL builder + danmaku comment parser
- `web/src/pages/WatchPage.tsx`
- `web/src/routes/watch.$fileId.tsx`

### Modified
- `api/internal/api/router.go` — add stream route
- `web/src/routes/__root.tsx` — add `/watch` to public routes (isPublicRoute)
- `web/src/routeTree.gen.ts` — regenerated

---

## 7. Testing

### Backend
- Stream handler: test with a real temp file, verify `200 OK` with full content and `206 Partial Content` with Range header
- Test 404 for nonexistent file ID

### Frontend
- No automated tests for video player (requires browser environment)
- Manual verification via dev server
