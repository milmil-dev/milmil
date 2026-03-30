# Watch Page Player Upgrade + Transcode Pipeline

## Overview

Upgrade Video.js 8 → 10, add automatic HLS transcode fallback for MKV/x265 files, and build a resource panel showing available streams, tracks, and playback options.

## Problems Solved

1. MKV x265 files can't play in browser (format not supported)
2. No fallback from direct stream to transcode
3. No resource/track selection UI
4. No error state UI (media offline, file not found, format unsupported)

## 1. Video.js 10 Upgrade

### Package changes

```bash
bun remove video.js @types/video.js
bun add video.js@10
```

Video.js 10 has built-in TypeScript types, no `@types/video.js` needed.

### Code changes

- `VideoPlayer.tsx`: Update import path — `video.js` v10 uses ESM exports
- Import change: `import videojs from 'video.js'` stays the same
- Type import: `import type Player from 'video.js/dist/types/player'` → check v10 type export path
- CSS import: `import 'video.js/dist/video-js.css'` → verify path in v10
- v10 API is mostly backward compatible with v8

## 2. Transcode Fallback

### Flow

```
1. WatchPage loads → fetch media file info (format, codec)
2. If format is browser-compatible (mp4 h264) → direct stream
3. If format needs transcode (mkv, x265, hevc) → auto-trigger transcode
4. Show loading state while transcode starts
5. Once HLS ready → play via HLS URL
6. User can manually switch between direct/transcode in resource panel
```

### New API endpoint

`GET /api/v1/media-files/:id/info` — returns file metadata for the watch page:

```json
{
  "id": "869feb63-...",
  "filename": "[Sub] Title - 01.mkv",
  "path": "/Video/Anime/...",
  "size_bytes": 524288000,
  "container": "mkv",
  "video_codec": "hevc",
  "audio_codec": "flac",
  "width": 1920,
  "height": 1080,
  "duration_seconds": 1440,
  "video_tracks": [...],
  "audio_tracks": [...],
  "subtitle_tracks": [...],
  "can_direct_play": false,
  "needs_transcode": true,
  "library_online": true
}
```

`can_direct_play` logic:
- Container is mp4/webm AND video codec is h264/vp8/vp9/av1 → true
- Everything else → false

`library_online` — attempt `provider.Stat()` on the file, if fails → false.

### Transcode handler fix

`transcode_handler.go` also needs to use Storage Provider (same fix as stream_handler.go) for remote files. The ffmpeg input can be a pipe from rclone VFS or a temporary local copy.

Simpler approach: rclone VFS mounts appear as regular file paths to ffmpeg. If the RcloneProvider is initialized, ffmpeg can read from the VFS path directly. Check if this works — if not, stream the file to a temp location first.

## 3. Resource Panel (Watch Page sidebar)

### Current sidebar shows
- Danmaku count
- Subtitle languages
- File ID (raw UUID)

### Redesigned sidebar

```
┌─────────────────────────┐
│ 📺 播放信息              │
│ Episode 1 — 无职转生     │
│ 1920×1080 · HEVC · FLAC │
│ 524 MB · 24:00           │
├─────────────────────────┤
│ 🎬 播放方式              │
│ ○ 直接串流 (不支持)      │
│ ● HLS 轉碼 (H.264 1080p)│
│   [轉碼中... 45%]        │
├─────────────────────────┤
│ 🔤 字幕                  │
│ ☑ 繁體中文 (.ass)        │
│ ☐ 日文 (.srt)            │
├─────────────────────────┤
│ 🔊 音軌                  │
│ ● FLAC 2ch               │
│ ○ AAC 5.1ch              │
├─────────────────────────┤
│ 💬 彈幕                  │
│ 1234 條彈幕              │
└─────────────────────────┘
```

### Error States

```
┌─────────────────────────┐
│ ⚠️ 媒體庫離線            │
│ 無法連接到 SMB 伺服器    │
│ [重試] [返回]            │
├─────────────────────────┤
│ ❌ 文件不存在             │
│ 文件可能已被移動或刪除   │
│ [返回動畫頁]             │
├─────────────────────────┤
│ ⏳ 格式不支持直接播放     │
│ 正在轉碼為 HLS...        │
│ [====----] 45%           │
└─────────────────────────┘
```

## 4. i18n Keys

```
watch.playbackInfo = 播放信息 / Playback Info
watch.playbackMethod = 播放方式 / Playback Method
watch.directStream = 直接串流 / Direct Stream
watch.transcode = HLS 轉碼 / HLS Transcode
watch.transcoding = 轉碼中... / Transcoding...
watch.unsupported = 不支持 / Unsupported
watch.audioTrack = 音軌 / Audio Track
watch.error.offline = 媒體庫離線 / Media library offline
watch.error.notFound = 文件不存在 / File not found
watch.error.retry = 重試 / Retry
watch.error.goBack = 返回 / Go back
```

## Scope Exclusions

- Multiple file selection per episode (future)
- Quality presets for transcode (use 1080p h264 default)
- Audio track switching during playback (browser limitation)
