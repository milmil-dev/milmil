# Jellyfin API 兼容層 + 串流效能優化設計

## 概述

為 milmil 新增 Jellyfin API 兼容層，讓 Infuse、VLC、Kodi、mpv 等外部播放器直接連接播放。同時全面升級串流引擎：硬體加速轉碼、自適應碼率（ABR）、HDR tone mapping，以及統一的 session 管理。

## 架構

```
┌─────────────────────────────────────────────────┐
│                   客戶端                         │
│  milmil Web UI    Infuse    VLC    Kodi    mpv   │
└──────┬──────────────┬───────┬──────┬───────┬─────┘
       │              │       │      │       │
       ▼              ▼       ▼      ▼       ▼
  /api/v1/*      /jellyfin/*  (Jellyfin 兼容 API)
       │              │
       ▼              ▼
┌─────────────────────────────────────────────────┐
│              milmil 核心服務層                    │
│                                                 │
│  ┌───────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  queries   │  │ TranscodeEng │  │  storage  │ │
│  │  (sqlc)    │  │  ine         │  │  (local/  │ │
│  │            │  │              │  │   rclone) │ │
│  └───────────┘  └──────┬───────┘  └───────────┘ │
│                        │                         │
│              ┌─────────▼─────────┐               │
│              │   HW Detector     │               │
│              │ NVENC>QSV>VAAPI>  │               │
│              │ VTB>libx264       │               │
│              └───────────────────┘               │
└─────────────────────────────────────────────────┘
```

保持 milmil 自有 API 不變。Jellyfin 兼容層是獨立的薄翻譯層，兩邊共用核心服務。

## 新增檔案結構

```
api/internal/
├── jellyfin/
│   ├── router.go          # /jellyfin/* 路由註冊
│   ├── auth.go            # AuthenticateByName + X-Emby-Authorization middleware
│   ├── items.go           # Items 瀏覽/搜尋/詳情
│   ├── library.go         # VirtualFolders
│   ├── playback.go        # 播放狀態回報 → watch_progress
│   ├── stream.go          # 串流 URL 決策 (direct/remux/transcode)
│   ├── images.go          # 封面圖代理
│   ├── system.go          # System/Info
│   ├── mapping.go         # ID 編解碼 + milmil↔Jellyfin 數據轉換
│   └── types.go           # Jellyfin JSON response 結構體
├── ffmpeg/
│   ├── transcode.go       # 現有（重構）
│   ├── hwdetect.go        # 硬體加速偵測
│   ├── profiles.go        # TranscodeProfile 定義
│   ├── tonemap.go         # HDR tone mapping filter 生成
│   └── probe.go           # ffprobe 封裝（含 color info）
```

---

## Phase 1：Jellyfin 兼容層

### 路由

所有 Jellyfin 兼容 API 掛在 `/jellyfin/*`：

```
# 系統
/jellyfin/System/Info/Public          → 伺服器資訊（含轉碼能力、GPU 狀態、已連接客戶端數）
/jellyfin/System/Info                 → 完整系統資訊（需認證）
/jellyfin/System/Ping                 → 心跳檢測

# 認證
/jellyfin/Users/AuthenticateByName   → 登入
/jellyfin/Users/{userId}             → 用戶資訊
/jellyfin/Users/{userId}/Views       → 首頁佈局（Infuse 首頁需要）

# 媒體庫
/jellyfin/Library/VirtualFolders     → 媒體庫列表
/jellyfin/Items                      → 瀏覽/搜尋
/jellyfin/Items/{itemId}             → 單個項目詳情
/jellyfin/Items/{itemId}/Images/*    → 封面圖（代理外部 URL，本地快取 7 天）
/jellyfin/Items/{itemId}/PlaybackInfo → 編解碼協商（Direct Play / Remux / Transcode 決策）
/jellyfin/Shows/{id}/Episodes        → 劇集列表

# 串流
/jellyfin/Videos/{itemId}/stream     → 直接串流
/jellyfin/Videos/{itemId}/master.m3u8 → HLS 串流
/jellyfin/Videos/{itemId}/{sourceId}/Subtitles/{index} → 字幕下載

# 播放狀態（雙向同步）
/jellyfin/Sessions/Playing           → 回報播放狀態
/jellyfin/Sessions/Playing/Progress  → 回報進度
/jellyfin/Sessions/Playing/Stopped   → 回報停止
/jellyfin/Users/{userId}/Items/{itemId}/UserData → 觀看進度/收藏（返回 PlaybackPositionTicks + Played）
```

### LAN 自動發現

實作 Jellyfin 的 UDP 發現協議，讓 Infuse/VLC 自動找到 milmil：

```
監聽 UDP port 7359
收到 "Who is JellyfinServer?" →
回覆 JSON: {
  "Address": "http://192.168.1.50:8080",
  "Id": "<server-uuid>",
  "Name": "milmil"
}
```

### 錯誤處理

- 未實作的 endpoint → 返回 `501` + Jellyfin 格式錯誤 JSON `{"Message": "Not implemented"}`
- 認證失敗 → 返回 `401` + `{"Message": "Invalid username or password"}`（Infuse 會顯示此訊息）
- 空媒體庫 → 返回空陣列 `[]`，不返回錯誤

### 圖片代理與快取

`images.go` 代理外部 URL（AniList CDN、Bangumi CDN）為 Jellyfin 圖片 API：
- 動畫封面 → `/Items/{id}/Images/Primary`
- 劇集縮圖 → `/Items/{id}/Images/Primary`
- 本地磁碟快取，TTL 7 天
- 支援 Jellyfin 的 `maxWidth`/`maxHeight` 參數進行縮放

### 觀看進度雙向同步

- **Infuse → milmil：** `/Sessions/Playing/Progress` 寫入 `watch_progress` 表
- **milmil → Infuse：** `/Users/{userId}/Items/{itemId}/UserData` 從 `watch_progress` 讀取，返回 `PlaybackPositionTicks`（秒×10000000）和 `Played`（completed=1 時為 true）
- 兩個方向共用同一張 `watch_progress` 表，無同步衝突

### 結構化日誌

- 所有 `/jellyfin/*` 請求記錄 INFO：客戶端名稱、endpoint、回應時間
- 未識別的 endpoint 記錄 WARN：完整請求路徑
- GPU 加速 fallback 記錄 WARN + 發送通知

### ID 映射

Jellyfin 用 GUID 做所有 item 的 ID。milmil 各實體有獨立 ID。映射方式：

```
Jellyfin ItemId = base64url(type:milmil_id)

例：
  "anime:abc123"   → base64url → "YW5pbWU6YWJjMTIz"
  "episode:def456" → base64url → "ZXBpc29kZTpkZWY0NTY"
  "file:ghi789"    → base64url → "ZmlsZTpnaGk3ODk"
```

handler 收到 ItemId 後 decode，拆出 type 和 id，路由到對應的 query。無狀態、不需額外映射表。

### 認證

```
Infuse → POST /jellyfin/Users/AuthenticateByName
         { "Username": "user", "Pw": "pass" }
     ← 200 { "AccessToken": "<jwt>", "User": { ... } }

後續請求 header:
  X-Emby-Authorization: MediaBrowser Token="<jwt>"
  或
  Authorization: MediaBrowser Token="<jwt>"
```

複用 milmil 現有密碼驗證邏輯，JWT 共用同一個 secret。新增 middleware 解析 `X-Emby-Authorization` header。

### 數據映射

| milmil 概念 | Jellyfin 類型 | 映射 |
|---|---|---|
| Library | CollectionFolder | `Name`, `Path` |
| Anime | Series | `Name`=Title, `Overview`=Synopsis, `ImageTags`=CoverImage |
| Episode | Episode | `IndexNumber`=EpisodeNumber, `ParentId`=AnimeId |
| MediaFile | MediaSource | `Path`, `Container`, `VideoCodec`, `AudioCodec`, `Size` |
| WatchProgress | UserItemDataDto | `PlaybackPositionTicks`, `Played` |

---

## Phase 2：硬體加速轉碼

### 自動偵測

啟動時探測可用加速器，按優先級排序：

```
1. NVENC  → ffmpeg -encoders | grep nvenc
2. QSV    → ffmpeg -encoders | grep qsv
3. VAAPI  → /dev/dri/renderD128 存在 + ffmpeg 支援
4. VideoToolbox → darwin 平台 + ffmpeg -encoders | grep videotoolbox
5. 軟體 (libx264) → fallback，永遠可用
```

結果快取在記憶體，暴露到 settings 和 `/jellyfin/System/Info`。

### TranscodeProfile

```go
type TranscodeProfile struct {
    Encoder     string   // "h264_nvenc", "h264_qsv", "h264_videotoolbox", "libx264"
    Decoder     string   // "h264_cuvid", "" (auto)
    ExtraArgs   []string // encoder 專屬參數
    PixelFormat string   // "nv12", "p010le" (HDR)
}

type TranscodeEngine struct {
    profiles []TranscodeProfile  // 按優先級排序
    active   *TranscodeProfile   // 當前使用的
}
```

嘗試 active profile，失敗時 fallback 到下一個。

### 各加速器參數

| 加速器 | Encoder | 品質控制 | 關鍵參數 |
|---|---|---|---|
| NVENC | `h264_nvenc` | `-cq 23 -preset p4` | `-hwaccel cuda -hwaccel_output_format cuda` |
| QSV | `h264_qsv` | `-global_quality 23` | `-hwaccel qsv -hwaccel_output_format qsv` |
| VAAPI | `h264_vaapi` | `-qp 23` | `-hwaccel vaapi -vaapi_device /dev/dri/renderD128` |
| VideoToolbox | `h264_videotoolbox` | `-q:v 65` | `-hwaccel videotoolbox` |
| 軟體 | `libx264` | `-crf 23 -preset fast` | 無 |

### Docker GPU passthrough

```yaml
# NVIDIA
deploy:
  resources:
    reservations:
      devices:
        - capabilities: [gpu]

# Intel QSV/VAAPI
devices:
  - /dev/dri:/dev/dri
```

---

## Phase 3：ABR 自適應碼率

### 多碼率 HLS

```
master.m3u8
  ├── stream_1080p.m3u8  (4500 kbps, 1920x1080)
  ├── stream_720p.m3u8   (2500 kbps, 1280x720)
  ├── stream_480p.m3u8   (1000 kbps, 854x480)
  └── stream_audio.m3u8  (AAC 192kbps, 純音訊 fallback)
```

### FFmpeg 多碼率輸出

單次讀取原始檔案產生全部 variant：

```
ffmpeg -i input.mkv \
  -map 0:v -map 0:v -map 0:v -map 0:a \
  -c:v:0 h264_nvenc -cq 20 -maxrate 4500k -bufsize 9000k -vf scale=-2:1080 \
  -c:v:1 h264_nvenc -cq 23 -maxrate 2500k -bufsize 5000k -vf scale=-2:720 \
  -c:v:2 h264_nvenc -cq 26 -maxrate 1000k -bufsize 2000k -vf scale=-2:480 \
  -c:a aac -b:a 192k \
  -f hls -hls_time 6 -hls_list_size 0 \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:0 v:2,a:0" \
  stream_%v/segment_%03d.ts
```

### 智慧 variant 選擇

| 原始解析度 | 產生的 variants |
|---|---|
| 4K (2160p) | 1080p, 720p, 480p |
| 1080p | 1080p, 720p, 480p |
| 720p | 720p, 480p |
| 480p 或更低 | 只保留原始 |

原始碼率低於目標碼率時跳過該 variant。

### Direct Play 優先

播放決策順序：

```
1. Direct Play — 客戶端支援原始格式 → 直接送檔案，零 CPU
2. Direct Stream (Remux) — codec 支援但容器不支援 → 只換容器
3. Transcode — codec 不支援 → 走 HLS 多碼率轉碼
```

Jellyfin 兼容層回報 `MediaSource.SupportsDirectPlay`、`SupportsDirectStream`、`SupportsTranscoding`，讓客戶端自選最優路徑。

---

## Phase 4：HDR Tone Mapping

### 偵測

```go
type VideoColorInfo struct {
    ColorSpace     string // "bt2020nc"
    ColorTransfer  string // "smpte2084" (HDR10), "arib-std-b67" (HLG)
    ColorPrimaries string // "bt2020"
    DolbyVision    bool   // side data 有 DOVI configuration
}
```

掃描結果存入 `media_files` 新欄位。

### Tone mapping 方案

| 加速器 | Filter | 說明 |
|---|---|---|
| NVENC (CUDA) | `tonemap_cuda=tonemap=hable` | GPU 上直接做，最快 |
| QSV | `vpp_qsv=tonemap=1` | Intel 硬體 tone map |
| VAAPI | `tonemap_vaapi=format=nv12` | AMD/Intel VAAPI |
| 軟體 | `zscale=t=linear,tonemap=hable,zscale=t=bt709` | CPU，慢但通用 |

### FFmpeg 範例（NVENC + HDR→SDR）

```
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
  -i input_hdr.mkv \
  -vf "tonemap_cuda=tonemap=hable:peak=100:desat=0,scale_cuda=-2:1080" \
  -c:v h264_nvenc -cq 20 -c:a aac -b:a 192k \
  -f hls ...
```

### 決策流程

```
客戶端請求串流
  → media_file.color_transfer 是 HDR？
     → 客戶端支援 HDR (Direct Play)？ → 直接送原檔
     → 不支援？ → 轉碼 + tone mapping → HLS
  → 不是 HDR → 正常 Direct Play / Transcode 流程
```

### DB 遷移

```sql
ALTER TABLE media_files ADD COLUMN color_transfer TEXT DEFAULT '';
ALTER TABLE media_files ADD COLUMN color_space TEXT DEFAULT '';
```

掃描器掃描時填入，現有檔案跑一次 backfill。

---

## Phase 5：統一 Session 管理

### 數據模型

```sql
CREATE TABLE playback_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    media_file_id TEXT NOT NULL REFERENCES media_files(id),
    episode_id TEXT REFERENCES episodes(id),

    -- 設備資訊
    client_name TEXT NOT NULL,        -- "Infuse", "milmil-web", "VLC"
    device_name TEXT NOT NULL,        -- "iPhone 15", "Chrome on Mac"
    device_id TEXT NOT NULL,          -- 客戶端生成的唯一 ID

    -- 播放狀態
    play_method TEXT NOT NULL,        -- "DirectPlay", "DirectStream", "Transcode"
    stream_url TEXT NOT NULL,
    position_seconds INTEGER DEFAULT 0,
    is_paused INTEGER DEFAULT 0,

    -- 串流資訊
    video_codec TEXT,
    audio_codec TEXT,
    transcode_video_codec TEXT,
    transcode_audio_codec TEXT,
    bitrate_kbps INTEGER,
    resolution TEXT,                  -- "1920x1080"

    -- 關聯
    transcode_session_id TEXT REFERENCES transcode_sessions(id),

    -- 生命週期
    started_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    ended_at TEXT                      -- NULL = 進行中
);
```

### 心跳機制

```
播放器 ──每 10 秒──→ POST /api/v1/sessions/{id}/heartbeat
                     { position_seconds, is_paused, bitrate_kbps }

伺服器：
  - 更新 last_activity_at 和播放進度
  - 同步寫入 watch_progress

背景 goroutine：
  - 每 30 秒掃描 last_activity_at > 60 秒的 session
  - 標記為 ended，清理關聯的 transcode session 資源
```

Jellyfin `/Sessions/Playing/Progress` 翻譯為內部心跳。

### API

```
GET    /api/v1/sessions              → 列出所有活躍 session
GET    /api/v1/sessions/:id          → 單個 session 詳情
POST   /api/v1/sessions              → 建立 session
POST   /api/v1/sessions/:id/heartbeat → 心跳 + 進度更新
DELETE /api/v1/sessions/:id          → 強制停止（管理員）
GET    /api/v1/sessions/stats        → 統計
```

### 管理員控制

- **強制停止** — DELETE session → kill FFmpeg → 清理 HLS 暫存 → 結束 session
- **同時串流限制** — settings 中 `max_concurrent_streams`（預設 0 = 不限），建立 session 時檢查
- **同時轉碼限制** — `max_concurrent_transcodes`（預設 2），避免 CPU/GPU 過載

### 前端 Dashboard

在設定頁或獨立頁面顯示活躍串流列表，包含：
- 正在播放的動畫名稱和集數
- 用戶、設備、客戶端名稱
- 播放方式（Direct Play / Transcode）、codec、解析度、碼率
- 播放進度條
- 停止按鈕
- 底部匯總：總頻寬、CPU、GPU 使用率

### 整合觸發點

| 觸發點 | 動作 |
|---|---|
| milmil web 開始播放 | 建立 playback session |
| Jellyfin `/Sessions/Playing` | 翻譯為建立 playback session |
| 開始轉碼 | 建立 transcode session → 關聯到 playback session |
| 播放器關閉 / 心跳超時 | 結束 session → 寫入 watch_progress → 清理轉碼 |
| 管理員強制停止 | kill FFmpeg → 清理暫存 → 結束 session |

---

## 分階段交付

| Phase | 內容 | 交付成果 |
|---|---|---|
| **1** | Jellyfin 兼容層 | Infuse/VLC/Kodi 能連接、瀏覽媒體庫、Direct Play |
| **2** | 硬體加速轉碼 | GPU 偵測、硬體轉碼、fallback、Docker GPU 支援 |
| **3** | ABR 自適應碼率 | 多碼率 HLS、smart variant 選擇、Direct Play 優先決策 |
| **4** | HDR tone mapping | 色彩偵測、tone mapping filter、DB 遷移 |
| **5** | 統一 Session 管理 | playback session、心跳、Dashboard、管理員控制 |

每個 phase 獨立可用。Phase 1 完成後外部播放器即可使用（Direct Play），後續 phase 逐步提升體驗。

### 升級相容性

- **Phase 1 → 2：** 現有 Infuse 連接不受影響。新增的硬體轉碼能力會透過 `/System/Info` 自動回報給客戶端，下次 sync 時生效。
- **Phase 2 → 3：** 無變更。ABR 多碼率是轉碼的增強，客戶端自動選擇最佳 variant。
- **Phase 3 → 4：** DB 遷移 000030 新增 `color_transfer`、`color_space` 欄位，自動執行。現有檔案需跑一次 backfill scan。
- **Phase 4 → 5：** DB 遷移 000031 新增 `playback_sessions` 表，自動執行。現有客戶端無需重新連接。

### DB 遷移編號

| Phase | 遷移編號 | 內容 |
|---|---|---|
| 1 | 無需遷移 | Jellyfin 兼容層只讀取現有表 |
| 4 | 000030 | `media_files` 新增 `color_transfer`, `color_space` |
| 5 | 000031 | 新增 `playback_sessions` 表 |

---

## 文件交付

每個 Phase 需同時交付對應文件：

| Phase | 文件 |
|---|---|
| 1 | README 新增「External Player Support」section、Infuse/VLC/Kodi 各自的連接指南 |
| 2 | GPU 轉碼設置指南、`docker-compose.gpu.yml` 範例檔 |
| 3 | 無額外文件（ABR 對用戶透明） |
| 5 | Session Dashboard 使用說明 |

### docker-compose.gpu.yml

Phase 2 須提供完整的 GPU docker-compose 範例，包含 NVIDIA 和 Intel 兩個版本。啟動時 log 輸出偵測到的加速器：
```
INFO milmil started (v1.x)
INFO Jellyfin API enabled, discoverable on LAN (UDP 7359)
INFO GPU detected: NVENC (NVIDIA GeForce RTX 3060)
```

或無 GPU 時：
```
INFO GPU: none detected, using software encoding (libx264)
```

---

## 測試策略

### Jellyfin API 一致性測試

從真實 Jellyfin server 擷取 Infuse/VLC 的 HTTP 請求序列，建立 Go integration tests：

1. **連接流程測試** — `System/Info/Public` → `AuthenticateByName` → `Users/{id}/Views` → `Items`
2. **播放流程測試** — `Items/{id}` → `PlaybackInfo` → `Videos/{id}/stream` → `Sessions/Playing`
3. **進度同步測試** — 寫入 → 讀取 → 確認 `PlaybackPositionTicks` 正確轉換
4. **錯誤格式測試** — 確認 401/404/501 回傳 Jellyfin 格式 JSON

每個 Phase 的 PR 需包含對應的一致性測試。

### 手動驗收

每次 release 前用真實 Infuse 測試：連接 → 瀏覽 → 播放 → 進度同步 → 字幕。

---

## DX 附註

### 目標用戶

動畫自架用戶 — 運行 Synology/Unraid/Proxmox，用過 Jellyfin/Plex，熟悉 Docker 但非開發者。設置容忍度 30 分鐘，連接外部播放器容忍度 5 分鐘。

### Settings UI：外部播放器

Phase 1 在設定頁新增「外部播放器」卡片：
- 顯示 milmil 的 Jellyfin 兼容 URL
- 已連接的客戶端列表（名稱、設備、最後活躍時間）
- 連接狀態指示

### GPU fallback 通知

當硬體轉碼失敗自動降級為軟體編碼時：
- WARN 日誌記錄原因
- 透過 milmil 通知系統發送通知
- Session Dashboard 顯示「Software (GPU fallback)」

---

## TODO（未來改進）

- 社群推廣：在 r/selfhosted、r/anime、Jellyfin 論壇公告 milmil 的 Jellyfin 兼容功能
- GitHub Discussions 作為社群支援頻道
- InfuseSync 插件支援（優化大型媒體庫的同步速度）
- DLNA/UPnP 支援（覆蓋舊型電視）
- Remote access 指南（reverse proxy + HTTPS）
