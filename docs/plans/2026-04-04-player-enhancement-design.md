# Player Enhancement Design

**Date**: 2026-04-04
**Approach**: VideoJS v10 Plugin 架構
**UI Style**: iOS/macOS (IINA 風格) — 毛玻璃、圓角、柔和動畫
**持久化**: Zustand persist (localStorage) + 後端 API 同步

---

## 總覽

6 個獨立 VideoJS v10 plugin，透過 event bus 通訊，統一 UI 設計語言。

### 分批

- **第一批**：字幕增強 + 快捷鍵系統
- **第二批**：音訊/視頻設定、播放體驗、手勢操作、截圖/GIF

---

## 1. 字幕增強 — SubtitlePlugin

### 架構

```
SubtitlePlugin (VideoJS v10 plugin)
  ├─ TrackManager
  │    ├─ 載入：embedded / external / drag-drop / online search
  │    ├─ 解析：WebVTT, ASS/SSA (libass-wasm), SRT
  │    └─ 字幕列表面板（來源標示 + CC/SDH 標籤）
  ├─ SubtitleRenderer (DOM overlay)
  │    ├─ PrimaryTrack（底部）
  │    ├─ SecondaryTrack（頂部，雙語）
  │    ├─ 淡入淡出過渡動畫
  │    └─ 安全邊距（可調 0-20%）
  ├─ StyleEngine
  │    ├─ 自定義：字體/大小/顏色/背景/描邊/陰影/位置
  │    ├─ 邊框樣式：outline / drop shadow / raised / depressed
  │    ├─ 預設模板：默認 / 電影院 / 動漫 / 高對比
  │    └─ ASS 原生樣式 toggle（預設尊重原生）
  ├─ TimingEngine
  │    ├─ 延遲調整 -10s ~ +10s
  │    └─ 快捷鍵：Z -0.1s / X +0.1s
  └─ DragDropLoader
       └─ 拖放 .srt/.ass/.vtt 到播放器載入
```

### 自定義樣式屬性

| 屬性 | 範圍 | 預設值 |
|------|------|--------|
| 字體 | 系統字體列表 + 自訂 | "Noto Sans CJK" |
| 字體大小 | 12px - 48px | 24px |
| 顏色 | 任意色碼 | #FFFFFF |
| 背景色 | 任意色碼 + 透明度 | rgba(0,0,0,0.75) |
| 描邊 | 0-4px + 顏色 | 2px #000000 |
| 陰影 | drop shadow | 無 |
| 位置 | 上/中/下 + 偏移量 | 底部 10% |
| 安全邊距 | 0-20% | 5% |
| 字幕延遲 | -10s ~ +10s, 0.1s 步進 | 0s |

### 雙語字幕

- 同時載入兩條 track（主 + 副語言）
- 主字幕底部、副字幕上方，各自可獨立調整樣式
- 使用者選擇主/副語言組合

### ASS 原生樣式

- 預設尊重 ASS 原生樣式（字體、顏色、定位、特效）
- Toggle：「使用自定義樣式覆蓋」
- 複雜 ASS 特效（karaoke、動畫）用 libass-wasm canvas 渲染

### 每部番記住

字幕語言 + 主副軌 + 延遲 → Zustand persist + 後端 API

---

## 2. 快捷鍵系統 — KeyboardPlugin

### 架構

```
KeyboardPlugin (VideoJS v10 plugin)
  ├─ KeyBindingManager
  │    ├─ 預設鍵位表（YouTube + mpv 混合）
  │    ├─ 使用者自定義綁定（後端持久化）
  │    ├─ 衝突偵測 + 提示
  │    └─ 快捷鍵分組（播放/字幕/音訊/介面）
  ├─ HelpOverlay
  │    └─ ? 鍵開啟快捷鍵提示面板
  └─ ActionFeedback (OSD)
       └─ 操作回饋（音量、快轉、倍速等）
```

### 預設鍵位表

| 分類 | 按鍵 | 動作 |
|------|------|------|
| **播放** | Space | 播放/暫停 |
| | ← / → | 快轉 ±5s |
| | Shift+← / Shift+→ | 快轉 ±30s |
| | 長按 → | 3x 快進，鬆開恢復 |
| | . / , | 逐幀前進/後退 |
| | [ / ] | 倍速 -0.25x / +0.25x |
| | Backspace | 重置 1x |
| | L | A-B 循環（三段式） |
| **音量** | ↑ / ↓ | 音量 ±5% |
| | M | 靜音 |
| **字幕** | C | 字幕開/關 |
| | V | 切換下一字幕軌 |
| | Z / X | 字幕延遲 ±0.1s |
| **介面** | F | 全螢幕 |
| | P | PiP |
| | ? | 快捷鍵說明 |
| | I | 技術資訊面板 |
| | N | 下一集 |
| | S | 截圖 |
| | Shift+S | 截圖含字幕 |
| | G | GIF 模式 |

### OSD 回饋

螢幕中央短暫顯示圖標 + 數值，0.8s 淡出，IINA 風格毛玻璃 pill。

---

## 3. 音訊/視頻設定 — MediaSettingsPlugin

### 架構

```
MediaSettingsPlugin (VideoJS v10 plugin)
  ├─ VideoFilter
  │    ├─ 亮度 (0-200%, 預設 100%)
  │    ├─ 對比度 (0-200%, 預設 100%)
  │    ├─ 飽和度 (0-200%, 預設 100%)
  │    ├─ 色溫/夜間模式 (sepia 0-100%)
  │    └─ 實作：CSS filter on <video>
  ├─ AudioEnhancer
  │    ├─ 音量增強 0-200% (Web Audio API GainNode)
  │    ├─ 音訊軌切換（多音軌 MKV）
  │    └─ pipeline: video → GainNode → destination
  └─ SettingsPanel
       ├─ iOS 風格滑桿
       └─ 一鍵重置
```

### 音訊軌切換

- HLS 模式：切換 HLS variant（後端多音軌 HLS）
- Direct 模式：HTML5 audioTracks API
- Remux 模式：重新請求指定音軌 remux stream

### 持久化

- 音訊軌語言：per-series ✅
- 視頻濾鏡：不持久化（每次重置）

---

## 4. 播放體驗 — PlaybackPlugin

### 架構

```
PlaybackPlugin (VideoJS v10 plugin)
  ├─ SpeedControl
  │    ├─ 0.25x - 4x, 步進 0.25x
  │    ├─ 長按快進 3x
  │    └─ per-series 記住
  ├─ ABLoop
  │    ├─ 進度條標記 A/B 點
  │    ├─ 高亮區間
  │    └─ 快捷鍵 L 三段式
  ├─ AutoNext
  │    ├─ 圓形進度環 5s 倒數
  │    ├─ 毛玻璃卡片：下一集縮圖+標題
  │    ├─ 可取消
  │    └─ 播完自動標記已看
  ├─ SkipSegment
  │    ├─ 跳過 OP/ED 浮動按鈕（Netflix 風格）
  │    ├─ 進度條顯示 OP/ED 區間色塊
  │    └─ 資料來源：後端 API（手動 / AniSkip）
  └─ MiniPlayer
       ├─ 頁內迷你播放器（離開 WatchPage 時）
       ├─ 可拖動、可調整大小
       ├─ 基本控制：播放/暫停、關閉、回到全頁
       └─ 毛玻璃邊框 + 圓角
```

### OP/ED 資料模型

```typescript
interface SegmentMark {
  media_file_id: string
  type: 'op' | 'ed' | 'recap' | 'preview'
  start_time: number
  end_time: number
  source: 'manual' | 'aniskip' | 'auto'
}
```

### 持久化

| 設定 | 範圍 | 持久化 |
|------|------|--------|
| 倍速偏好 | per-series | ✅ |
| 音量偏好 | per-series | ✅ |
| 自動播下一集 | global | ✅ |
| 自動跳 OP/ED | global | ✅ |
| A-B Loop | 不持久化 | — |

---

## 5. 手勢操作 — GesturePlugin

### 架構

```
GesturePlugin (VideoJS v10 plugin)
  ├─ SwipeHandler
  │    ├─ 水平滑動：快轉（距離映射秒數，最大 ±120s）
  │    ├─ 右側垂直：音量
  │    ├─ 左側垂直：亮度
  │    └─ 門檻 >10px 才觸發
  ├─ TapHandler
  │    ├─ 單擊中央：播放/暫停
  │    ├─ 雙擊左側：-10s
  │    ├─ 雙擊右側：+10s
  │    ├─ 雙擊中央：全螢幕
  │    └─ 300ms 區分單/雙擊
  ├─ LongPressHandler
  │    ├─ 長按：3x 快進
  │    └─ 鬆開恢復
  └─ FeedbackOverlay
       ├─ 快轉：箭頭 + 秒數
       ├─ 音量/亮度：垂直進度條
       └─ 毛玻璃圓角 pill，300ms 淡出
```

### 裝置適配

用 pointer 事件統一處理 mouse + touch。

### 持久化

- 手勢開關：global
- 靈敏度：global

---

## 6. 截圖/GIF — CapturePlugin

### 架構

```
CapturePlugin (VideoJS v10 plugin)
  ├─ Screenshot
  │    ├─ canvas drawImage 擷取
  │    ├─ 模式：純畫面 / +字幕 / +字幕+浮水印
  │    ├─ 輸出：PNG（複製剪貼簿 + 下載）
  │    ├─ S = 純畫面, Shift+S = 含字幕
  │    └─ toast 預覽（毛玻璃卡片，3s 淡出）
  └─ GifMaker
       ├─ G 鍵進入 GIF 模式
       ├─ 進度條拖曳選取起止區間
       ├─ 預覽面板（毛玻璃 popover）
       │    ├─ 時長上限 15s
       │    ├─ 尺寸：原始 / 480p / 320p
       │    ├─ FPS：10 / 15 / 20
       │    └─ 含字幕 toggle
       ├─ gif.js (Web Worker) 編碼
       └─ 進度條顯示編碼進度
```

---

## 7. 後端 API + 持久化

### 新增端點

```
GET/PUT  /api/v1/user/preferences                    — global 偏好
GET/PUT  /api/v1/user/preferences/series/:seriesId    — per-series 偏好
POST/GET /api/v1/media/:fileId/segments               — OP/ED 時間標記

POST     /api/v1/user/preferences/export              — 匯出 JSON
POST     /api/v1/user/preferences/import              — 匯入 JSON（驗證 schema）
POST     /api/v1/user/preferences/sync                — 觸發遠端同步
GET      /api/v1/user/preferences/sync/status
PUT/GET  /api/v1/user/preferences/backup-config       — 備份目標設定
```

### 資料模型

```typescript
interface UserPreferences {
  subtitle_style: SubtitleStyle
  subtitle_preset: string
  keyboard_bindings: KeyBinding[]
  gesture_enabled: boolean
  gesture_sensitivity: number
  auto_next: boolean
  auto_skip_op: boolean
  auto_skip_ed: boolean
}

interface SeriesPreferences {
  series_id: string
  playback_speed: number
  volume: number
  subtitle_language: string
  subtitle_secondary_language: string | null
  subtitle_delay: number
  audio_track_language: string
}
```

### 前端同步（Zustand persist）

```typescript
const usePreferencesStore = create(
  persist(
    (set, get) => ({
      // ...所有偏好
      updatePreference: (key, value) => {
        set({ [key]: value })
        debouncedSyncToBackend(get())  // debounce 2s
      }
    }),
    {
      name: 'milmil-preferences',
      partialize: (state) => ({ /* 只持久化需要的欄位 */ })
    }
  )
)
```

啟動時 Zustand 自動 hydrate localStorage → 背景 GET 後端版本 → 衝突時後端為準。

### 偏好備份

```
PreferenceBackup
  ├─ JSON 匯出/匯入
  │    ├─ 一鍵匯出全部偏好為 .json
  │    ├─ 匯入前 diff 預覽
  │    └─ schema 驗證
  ├─ WebDAV 同步
  │    ├─ 設定：URL + 帳號密碼
  │    ├─ 遠端路徑：/milmil/preferences.json
  │    └─ 衝突：timestamp 比較，較新為準
  └─ S3-Compatible 同步
       ├─ 設定：endpoint / bucket / access key / secret key
       ├─ 支援 MinIO / Cloudflare R2 / AWS S3
       └─ 同步策略同 WebDAV
```

後端處理 WebDAV/S3 連線，前端不直接觸碰 credentials。

---

## 8. Plugin 架構

### 檔案結構

```
web/src/plugins/
  ├─ subtitle/
  ├─ keyboard/
  ├─ media-settings/
  ├─ playback/
  ├─ gesture/
  ├─ capture/
  └─ shared/
       ├─ OSDFeedback.ts
       ├─ FrostedPanel.ts
       └─ preferences.ts
```

### Plugin 註冊

```typescript
// VideoPlayer.tsx onReady
player.registerPlugin('subtitle', SubtitlePlugin)
player.registerPlugin('keyboard', KeyboardPlugin)
player.registerPlugin('mediaSettings', MediaSettingsPlugin)
player.registerPlugin('playback', PlaybackPlugin)
player.registerPlugin('gesture', GesturePlugin)
player.registerPlugin('capture', CapturePlugin)
```

### Plugin 間通訊

VideoJS event bus，命名：`{plugin}:{action}`

```
keyboard → 'subtitle:toggle'      → subtitle plugin
keyboard → 'capture:screenshot'   → capture plugin
gesture  → 'playback:seek'        → playback plugin
playback → 'player:next-episode'  → WatchPage React 層
```

---

## UI 設計原則

- 跟隨 VideoJS v10 原生設計語言
- iOS/macOS 風格（IINA 為主要參考）
- 毛玻璃背景（backdrop-filter: blur）
- 圓角、柔和陰影、微動畫
- 面板用 popover，輕量不打斷觀看
- SF-style 圖標、細線條
- iOS 風格滑桿（圓形 thumb、細軌道）
- 過渡動畫 ease-out 200-300ms
