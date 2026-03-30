# Watch Page Player Upgrade + Transcode Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Video.js to v10, add automatic HLS transcode fallback for MKV/x265, and build a resource panel with error states.

**Architecture:** New media-info API endpoint returns file metadata + playability status. WatchPage auto-detects format compatibility and falls back to HLS transcode. Transcode handler fixed to use Storage Provider for remote files. Resource panel shows stream/track options and error states.

**Tech Stack:** Go (Echo, ffmpeg, rclone VFS), TypeScript (Video.js 10, TanStack Query, Motion, Tailwind)

**Spec:** `docs/superpowers/specs/2026-03-30-watch-player-upgrade-design.md`

---

## File Structure

### Backend (create)
- `api/internal/api/media_info_handler.go` — media file info endpoint with playability detection

### Backend (modify)
- `api/internal/api/transcode_handler.go` — use Storage Provider for remote files
- `api/internal/api/router.go` — register media info route

### Frontend (modify)
- `web/package.json` — Video.js 8 → 10
- `web/src/components/VideoPlayer.tsx` — update for Video.js 10 API
- `web/src/lib/api/stream.ts` — add media info API client
- `web/src/pages/WatchPage.tsx` — auto-detect, transcode fallback, resource panel, error states

---

## Task 1: Video.js 10 Upgrade

**Files:**
- Modify: `web/package.json`
- Modify: `web/src/components/VideoPlayer.tsx`

- [ ] **Step 1: Upgrade packages**

Run:
```bash
cd web && bun remove video.js @types/video.js && bun add video.js@10
```

- [ ] **Step 2: Update VideoPlayer imports**

Read `web/src/components/VideoPlayer.tsx`. Video.js 10 changes:
- `import videojs from 'video.js'` — stays the same
- `import type Player from 'video.js/dist/types/player'` — may need to change to `import type { Player } from 'video.js'`. Check the v10 exports after install.
- `import 'video.js/dist/video-js.css'` — check if path still valid in v10
- The `<video-js>` custom element approach stays the same

After install, check what's exported:
```bash
cd web && node -e "const vjs = require('video.js'); console.log(typeof vjs)" 2>/dev/null || echo "Check ESM exports"
```

If types path changed, update import. If not, keep as-is.

- [ ] **Step 3: Verify build**

Run: `cd web && bun run typecheck 2>&1 | grep -i video`
Expected: No new video.js related errors.

- [ ] **Step 4: Do NOT commit yet — verify after all changes**

---

## Task 2: Media Info API Endpoint

**Files:**
- Create: `api/internal/api/media_info_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Create media info handler**

```go
package api

import (
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/storage"
)

// Browser-compatible formats for direct play
var directPlayCodecs = map[string]bool{
	"h264": true, "avc":  true, "avc1": true,
	"vp8":  true, "vp9":  true, "av1":  true,
}
var directPlayContainers = map[string]bool{
	".mp4": true, ".webm": true, ".m4v": true,
}

type mediaInfoResponse struct {
	ID              string  `json:"id"`
	Filename        string  `json:"filename"`
	SizeBytes       int64   `json:"size_bytes"`
	Container       string  `json:"container"`
	VideoCodec      *string `json:"video_codec"`
	AudioCodec      *string `json:"audio_codec"`
	Width           *int64  `json:"width"`
	Height          *int64  `json:"height"`
	DurationSeconds *int64  `json:"duration_seconds"`
	CanDirectPlay   bool    `json:"can_direct_play"`
	NeedsTranscode  bool    `json:"needs_transcode"`
	LibraryOnline   bool    `json:"library_online"`
	LibraryType     string  `json:"library_type"`
}

func (h *handler) handleMediaInfo(c echo.Context) error {
	ctx := c.Request().Context()
	fileID := c.Param("fileId")

	mf, err := h.queries.GetMediaFileByID(ctx, fileID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.ErrInternalServerError
	}

	lib, err := h.queries.GetLibrary(ctx, mf.LibraryID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "library not found")
	}

	ext := strings.ToLower(filepath.Ext(mf.Path))
	codec := ""
	if mf.VideoCodec.Valid {
		codec = strings.ToLower(mf.VideoCodec.String)
	}

	canDirect := directPlayContainers[ext] && directPlayCodecs[codec]

	// Check if file is accessible
	online := true
	if lib.SourceType == "local" || lib.SourceType == "" {
		// Local: just stat the file
		_, statErr := storage.NewLocalProvider().Stat(mf.Path)
		if statErr != nil {
			online = false
		}
	} else {
		// Remote: try creating provider + stat
		var configJSON string
		if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
			decrypted, decErr := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
			if decErr != nil {
				online = false
			} else {
				configJSON = decrypted
			}
		}
		if online {
			provider, provErr := storage.NewProvider(lib.SourceType, configJSON)
			if provErr != nil {
				online = false
			} else {
				defer provider.Close()
				_, statErr := provider.Stat(mf.Path)
				if statErr != nil {
					online = false
				}
			}
		}
	}

	resp := mediaInfoResponse{
		ID:             mf.ID,
		Filename:       mf.Filename,
		SizeBytes:      mf.SizeBytes,
		Container:      strings.TrimPrefix(ext, "."),
		VideoCodec:     nullStr(mf.VideoCodec),
		AudioCodec:     nullStr(mf.AudioCodec),
		Width:          nullInt(mf.Width),
		Height:         nullInt(mf.Height),
		DurationSeconds: nullInt(mf.DurationSeconds),
		CanDirectPlay:  canDirect && online,
		NeedsTranscode: !canDirect,
		LibraryOnline:  online,
		LibraryType:    lib.SourceType,
	}

	return c.JSON(http.StatusOK, resp)
}
```

- [ ] **Step 2: Register route**

In `router.go`, add to the existing media files group or create alongside stream:

```go
	// Media info — protected
	mediaGroup.GET("/:id/info", h.handleMediaInfo)
```

This uses the existing `mediaGroup` at `/api/v1/media-files`.

- [ ] **Step 3: Build and verify**

Run: `cd api && go build ./...`

- [ ] **Step 4: Do NOT commit yet**

---

## Task 3: Transcode Handler — Storage Provider Fix

**Files:**
- Modify: `api/internal/api/transcode_handler.go`

- [ ] **Step 1: Read the current transcode handler**

Read `api/internal/api/transcode_handler.go` fully. Find where `file.Path` is passed to ffmpeg. The issue is the same as the stream handler — ffmpeg needs a local path but remote files aren't local.

- [ ] **Step 2: Fix the transcode handler**

For remote files, the approach is:
1. Create a Storage Provider
2. Open the file via provider
3. Copy to a temp local file
4. Pass the temp path to ffmpeg
5. Clean up temp file after transcode completes

In the `handleStartTranscode` function, after getting the media file, add library lookup + provider logic:

```go
// Get library to determine storage type
lib, err := h.queries.GetLibrary(ctx, file.LibraryID)
if err != nil {
    return echo.NewHTTPError(http.StatusNotFound, "library not found")
}

inputPath := file.Path
var tempInput string

// For remote files, copy to temp location for ffmpeg
if lib.SourceType != "local" && lib.SourceType != "" {
    var configJSON string
    if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
        decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
        if err != nil {
            return echo.NewHTTPError(http.StatusInternalServerError, "cannot decrypt config")
        }
        configJSON = decrypted
    }

    provider, err := storage.NewProvider(lib.SourceType, configJSON)
    if err != nil {
        return echo.NewHTTPError(http.StatusServiceUnavailable, "storage unavailable")
    }

    // Copy remote file to temp
    tempDir := filepath.Join(os.TempDir(), "milmil", "transcode-input")
    os.MkdirAll(tempDir, 0o755)
    tempInput = filepath.Join(tempDir, filepath.Base(file.Path))

    reader, err := provider.Open(file.Path)
    if err != nil {
        provider.Close()
        return echo.NewHTTPError(http.StatusNotFound, "file not accessible")
    }

    tmpFile, err := os.Create(tempInput)
    if err != nil {
        reader.Close()
        provider.Close()
        return echo.ErrInternalServerError
    }

    _, copyErr := io.Copy(tmpFile, reader)
    tmpFile.Close()
    reader.Close()
    provider.Close()

    if copyErr != nil {
        os.Remove(tempInput)
        return echo.ErrInternalServerError
    }

    inputPath = tempInput
}
```

Then in the background goroutine, use `inputPath` instead of `file.Path`, and clean up `tempInput` after ffmpeg finishes:

```go
go func() {
    defer func() {
        if tempInput != "" {
            os.Remove(tempInput)
        }
    }()
    // ... existing ffmpeg logic but using inputPath
}()
```

Add imports: `"io"`, `crypto`, `storage`.

- [ ] **Step 3: Build and verify**

Run: `cd api && go build ./...`

- [ ] **Step 4: Do NOT commit yet**

---

## Task 4: Frontend — Media Info API Client

**Files:**
- Modify: `web/src/lib/api/stream.ts`

- [ ] **Step 1: Add media info types and API method**

Add to `web/src/lib/api/stream.ts`:

```typescript
export interface MediaInfo {
  id: string;
  filename: string;
  size_bytes: number;
  container: string;
  video_codec: string | null;
  audio_codec: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  can_direct_play: boolean;
  needs_transcode: boolean;
  library_online: boolean;
  library_type: string;
}
```

Add to the existing `streamApi` object (or create one if it doesn't exist as an object — check current file structure):

```typescript
export const mediaApi = {
  info: (fileId: string) =>
    api.get<MediaInfo>(`/api/v1/media-files/${fileId}/info`),
};

export const mediaKeys = {
  info: (fileId: string) => ['media', 'info', fileId] as const,
};
```

Import `api` from `../api-client` if not already imported.

- [ ] **Step 2: Do NOT commit yet**

---

## Task 5: WatchPage — Auto-Detect + Transcode Fallback + Resource Panel

**Files:**
- Modify: `web/src/pages/WatchPage.tsx`

This is the largest task. Read the current file first.

- [ ] **Step 1: Add media info query**

Import:
```typescript
import { mediaApi, mediaKeys, type MediaInfo } from '@/lib/api/stream';
import { streamApi, getHLSUrl } from '@/lib/api/stream';
```

Add query after existing queries:
```typescript
const { data: mediaInfo, error: mediaError } = useQuery({
  queryKey: mediaKeys.info(fileId ?? ''),
  queryFn: () => mediaApi.info(fileId!),
  enabled: !!fileId,
});
```

- [ ] **Step 2: Add transcode auto-trigger logic**

Add state for tracking transcode:
```typescript
const [transcodeToken, setTranscodeToken] = useState<string | null>(null);
const [transcodeStatus, setTranscodeStatus] = useState<'idle' | 'starting' | 'transcoding' | 'ready' | 'error'>('idle');
```

Add effect to auto-trigger transcode when `mediaInfo.needs_transcode`:
```typescript
useEffect(() => {
  if (!mediaInfo || !fileId) return;
  if (mediaInfo.needs_transcode && mediaInfo.library_online && transcodeStatus === 'idle') {
    setTranscodeStatus('starting');
    streamApi.transcode(fileId, { codec: 'h264', resolution: '1080p' })
      .then(({ token }) => {
        setTranscodeToken(token);
        setTranscodeStatus('transcoding');
      })
      .catch(() => setTranscodeStatus('error'));
  }
}, [mediaInfo, fileId, transcodeStatus]);
```

Listen for WebSocket transcode events:
```typescript
useEffect(() => {
  function onWS(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (detail?.type === 'transcode:ready' && detail?.data?.token === transcodeToken) {
      setTranscodeStatus('ready');
    }
    if (detail?.type === 'transcode:error' && detail?.data?.token === transcodeToken) {
      setTranscodeStatus('error');
    }
  }
  window.addEventListener('milmil-ws', onWS);
  return () => window.removeEventListener('milmil-ws', onWS);
}, [transcodeToken]);
```

- [ ] **Step 3: Compute stream URL based on mode**

Replace the current hardcoded stream URL:
```typescript
const streamUrl = useMemo(() => {
  if (!fileId) return '';
  if (transcodeStatus === 'ready' && transcodeToken) {
    return getHLSUrl(transcodeToken);
  }
  if (mediaInfo?.can_direct_play) {
    return getStreamUrl(fileId);
  }
  return ''; // no playable URL yet
}, [fileId, mediaInfo, transcodeStatus, transcodeToken]);

const mimeType = useMemo(() => {
  if (transcodeStatus === 'ready') return 'application/x-mpegURL';
  return getMimeType(mediaInfo?.filename ?? 'video.mp4');
}, [transcodeStatus, mediaInfo]);
```

- [ ] **Step 4: Build resource panel**

Replace the current sidebar content with the redesigned resource panel. The panel should show:

**Section 1: Playback Info** (always shown)
- Filename (truncated)
- Resolution + codec (e.g. "1920×1080 · HEVC · FLAC")
- File size + duration
- `can_direct_play` status indicator

**Section 2: Playback Method** (when needs_transcode)
- Radio-style options: Direct Stream (disabled if unsupported) | HLS Transcode
- Transcode progress/status display

**Section 3: Error States** (conditional)
- Library offline: warning banner with retry button
- File not found: error banner with back link
- Transcode error: error with retry

**Section 4: Subtitles** (existing, reformatted)

**Section 5: Danmaku** (existing, reformatted)

Use i18n keys for all strings. Use motion.div for section entrance animations.

Example error state:
```tsx
{mediaInfo && !mediaInfo.library_online && (
  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
    <p className="text-sm font-medium text-red-400">{i18n._(msg`watch.error.offline`)}</p>
    <p className="text-xs text-red-400/60 mt-1">{i18n._(msg`watch.error.offlineDesc`)}</p>
    <Button variant="outline" size="sm" className="mt-2"
      onClick={() => queryClient.invalidateQueries({ queryKey: mediaKeys.info(fileId!) })}>
      {i18n._(msg`watch.error.retry`)}
    </Button>
  </div>
)}
```

Example transcode status:
```tsx
{transcodeStatus === 'transcoding' && (
  <div className="rounded-lg bg-white/[0.04] p-3">
    <p className="text-sm text-white/70">{i18n._(msg`watch.transcoding`)}</p>
    <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div className="h-full bg-mm-accent/60 rounded-full"
        animate={{ width: '60%' }} transition={{ duration: 2, repeat: Infinity }} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Handle VideoPlayer not rendering until URL ready**

Only render VideoPlayer when `streamUrl` is non-empty:
```tsx
{streamUrl ? (
  <VideoPlayer src={streamUrl} type={mimeType} onReady={handlePlayerReady} className="w-full h-full" />
) : (
  <div className="w-full h-full flex items-center justify-center">
    {/* Loading or error state */}
  </div>
)}
```

- [ ] **Step 6: Do NOT commit yet**

---

## Task 6: i18n Translations

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add all translations**

English:
```po
msgid "watch.playbackInfo"
msgstr "Playback Info"

msgid "watch.playbackMethod"
msgstr "Playback Method"

msgid "watch.directStream"
msgstr "Direct Stream"

msgid "watch.transcode"
msgstr "HLS Transcode"

msgid "watch.transcoding"
msgstr "Transcoding..."

msgid "watch.transcodeReady"
msgstr "Transcode ready"

msgid "watch.unsupported"
msgstr "Not supported"

msgid "watch.supported"
msgstr "Supported"

msgid "watch.audioTrack"
msgstr "Audio"

msgid "watch.error.offline"
msgstr "Media library offline"

msgid "watch.error.offlineDesc"
msgstr "Cannot connect to the storage server"

msgid "watch.error.notFound"
msgstr "File not found"

msgid "watch.error.notFoundDesc"
msgstr "The file may have been moved or deleted"

msgid "watch.error.transcodeError"
msgstr "Transcode failed"

msgid "watch.error.retry"
msgstr "Retry"

msgid "watch.error.goBack"
msgstr "Go back"
```

Traditional Chinese:
```po
msgid "watch.playbackInfo"
msgstr "播放資訊"

msgid "watch.playbackMethod"
msgstr "播放方式"

msgid "watch.directStream"
msgstr "直接串流"

msgid "watch.transcode"
msgstr "HLS 轉碼"

msgid "watch.transcoding"
msgstr "轉碼中..."

msgid "watch.transcodeReady"
msgstr "轉碼完成"

msgid "watch.unsupported"
msgstr "不支援"

msgid "watch.supported"
msgstr "支援"

msgid "watch.audioTrack"
msgstr "音軌"

msgid "watch.error.offline"
msgstr "媒體庫離線"

msgid "watch.error.offlineDesc"
msgstr "無法連接到儲存伺服器"

msgid "watch.error.notFound"
msgstr "檔案不存在"

msgid "watch.error.notFoundDesc"
msgstr "檔案可能已被移動或刪除"

msgid "watch.error.transcodeError"
msgstr "轉碼失敗"

msgid "watch.error.retry"
msgstr "重試"

msgid "watch.error.goBack"
msgstr "返回"
```

Simplified Chinese:
```po
msgid "watch.playbackInfo"
msgstr "播放信息"

msgid "watch.playbackMethod"
msgstr "播放方式"

msgid "watch.directStream"
msgstr "直接串流"

msgid "watch.transcode"
msgstr "HLS 转码"

msgid "watch.transcoding"
msgstr "转码中..."

msgid "watch.transcodeReady"
msgstr "转码完成"

msgid "watch.unsupported"
msgstr "不支持"

msgid "watch.supported"
msgstr "支持"

msgid "watch.audioTrack"
msgstr "音轨"

msgid "watch.error.offline"
msgstr "媒体库离线"

msgid "watch.error.offlineDesc"
msgstr "无法连接到存储服务器"

msgid "watch.error.notFound"
msgstr "文件不存在"

msgid "watch.error.notFoundDesc"
msgstr "文件可能已被移动或删除"

msgid "watch.error.transcodeError"
msgstr "转码失败"

msgid "watch.error.retry"
msgstr "重试"

msgid "watch.error.goBack"
msgstr "返回"
```

- [ ] **Step 2: Compile**

Run: `cd web && bun run i18n:compile`

- [ ] **Step 3: Do NOT commit yet**

---

## Task 7: Verification + Commit

- [ ] **Step 1: Build backend**

Run: `cd api && go build ./...`
Expected: Succeeds.

- [ ] **Step 2: Typecheck frontend**

Run: `cd web && bun run typecheck 2>&1 | grep "error TS" | grep -v "MotionTable\|LibraryDetailPage\|SchedulePage\|AnimeDetailPage.tsx:7[12]"`
Expected: No new errors.

- [ ] **Step 3: Commit all changes together**

```bash
git add -A
git commit -m "feat: upgrade Video.js 10, add auto-transcode + resource panel

- Video.js 8 → 10
- Media info API: /media-files/:id/info with playability detection
- Transcode handler: Storage Provider support for remote files
- WatchPage: auto-detect format, fallback to HLS transcode
- Resource panel: stream info, playback method, error states
- i18n: watch page translations (en, zh-Hant, zh-Hans)"
```

- [ ] **Step 4: Manual test**

1. Start backend + frontend
2. Navigate to anime with matched MKV files
3. Click episode → watch page
4. Verify:
   - Media info panel shows file details (resolution, codec, size)
   - "Not supported" badge on direct stream
   - Auto-triggers transcode
   - Transcode progress shown
   - Once ready, HLS plays in Video.js
   - Error states shown if library offline
