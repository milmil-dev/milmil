# milmil for macOS — Native Desktop Client Design

**Date**: 2026-08-23
**Status**: Proposal (pre-implementation)
**Stack**: Swift 6.2 · SwiftUI (AppKit bridged where SwiftUI can't reach) · libmpv via MPVKit · macOS 15+ · Apple Silicon only
**Companion**: `2026-08-23-macos-client-plan.md`（分期實作計畫）

---

## 0. 一句話

把 milmil 的 webapp 體驗搬到 macOS 原生：**保留 web 已經做對的東西**（Seanime 式全幅背景、三層串流、雙來源彈幕、可重綁快捷鍵、server 端偏好同步），**用 mpv 換掉 Video.js**（播什麼都不用 remux/transcode、原生 libass、內嵌音軌/字幕），**用 Apple TV / Netflix 的瀏覽交互**（hero、Continue Watching shelf、hover-expand card、Resume-with-context、post-play 自動下一集），**彈幕是一級功能**，不是 overlay 外掛。

---

## 1. 研究結論（為什麼這樣設計）

### 1.1 從 webapp 學到什麼（保留）

| web 已做對 | macOS 對應 |
|---|---|
| 全幅 `BannerImage` + 多層 gradient + 捲動變暗（Seanime 風） | 視窗底層一張 `BackdropLayer`，crossfade，同樣的 gradient 參數 |
| 三層串流 `direct → remux → transcode(HLS)`，WS `transcode:ready` | mpv 幾乎只走 `direct`；`remux`/HLS 只當 mpv 開檔失敗的 fallback |
| 彈幕雙 pipeline：DandanPlay（按檔案 hash 自動）+ Bilibili 手動匯入（分 P、save toggle） | 一模一樣的來源與 UI，改成原生渲染 |
| 彈幕 / 字幕 / 快捷鍵偏好存 server（`/user/preferences` + per-series） | **直接共用同一組 key**，web 與 mac 設定互通 |
| 快捷鍵表（YouTube + mpv 混合）+ `?` help overlay + OSD pill | 相同預設表，多加 mpv 原生動作 |
| 進度每 10s 上報、剩 30s 視為完成、自動下一集、OP/ED segments | 相同語義，確保 AniList/Bangumi/Trakt 同步不變 |
| WS ticket 換 token（不把 token 放 URL） | `URLSessionWebSocketTask`，每次重連重新領 ticket |
| ⌘K command palette | 原生 ⌘K 浮層 + 工具列搜尋 |
| Resume overlay、theater mode、右側 Episodes/彈幕/來源 側欄 | 側欄變成 `.inspector`，theater = 收起 inspector |

### 1.2 從 IINA 學到什麼（學架構，不抄 code — GPL-3.0）

- libmpv 綁定：`mpv_set_wakeup_callback` → 專用 queue 用 `mpv_wait_event(0)` 把事件排乾；觀察 ~45 個 property；`mpv_command_async` 給截圖這類慢操作。
- 渲染：`CAOpenGLLayer`（不是 `NSOpenGLView`）。**這點對彈幕很關鍵**：layer-backed 的 mpv 畫面才能讓 sibling layer（彈幕、OSC、OSD）正確合成；OKVideoMac 用 `NSOpenGLView` 導致 live resize 期間畫面凍結。
- 渲染在背景 queue，主執行緒不畫；live resize 時開 `isAsynchronous` 而不是暫停渲染。
- OSC 三種位置（floating/top/bottom）+ 自動隱藏 + 依視窗寬度降級元件；seek bar 上方 thumbnail peek；OSD 訊息系統。
- 字幕自動配對同名檔、線上字幕 provider 抽象、A-B loop、幀步進、Music mode（mini 視窗）、always-on-top。
- dylib 出貨：把 libmpv/ffmpeg 系列 dylib `@rpath` 化後 embed + CodeSignOnCopy；Sparkle 更新。
- PiP 用私有 `PIP.framework` — **我們不跟**（無法公證安全、不能 sandbox）。

### 1.3 從 OKVideoMac 學到什麼（同樣 GPL-3.0，只學設計）

- **SwiftUI-first 的 mpv 專案是可行的**：`NSViewRepresentable` 包 render view，其餘全 SwiftUI。
- C shim 把 `mpv_event` union 與 `mpv_node`（track-list）攤平成 Swift 友善 struct，避免在 Swift 裡碰 union。
- 不可變 `PlayerSnapshot` 經 `AsyncStream<PlayerEvent>(bufferingPolicy: .bufferingNewest)` 推到 UI；timeline 100ms 節流；音量更新 ~16/s 節流避免灌爆 mpv queue。
- **Readiness / teardown gate**：render surface 未就緒不開播、render context 還掛著不銷毀 client；`warmStop` vs `fullDestroy` 兩種關閉模式。
- Player overlay 分層：render view → 互動層（throttled mouseMoved 12.5Hz、雙擊全螢幕）→ 漸層 → 狀態 → 浮動控制；`.allowsHitTesting(controlsVisible)`。
- 字幕自動選軌評分避開 forced "signs" 軌；使用者看得懂的錯誤映射。
- 弱點（我們要避免）：單一巨型 `AppState`、67KB 的 player client、`NSOpenGLView`、arm64-only、只有 Space 一個快捷鍵、無彈幕/PiP/thumbnail。

### 1.4 從 Apple TV (macOS) / Netflix 學到什麼

1. Hero billboard：Play（filled）+ More Info；指標停留 ~1s 才自動預覽，離開即停。
2. Continue Watching shelf 緊貼 hero 下方：16:9 still + 底部細進度條；hover 出現 Play 與 `…`（移除 / 標記已看）。
3. Shelf 水平分頁捲動，兩端 hover 出 chevron；行標題本身是連結，開整類 grid。
4. Hover-expand card：延遲 300–500ms 才放大；Apple 版克制（小幅 lift + Play/More），Netflix 版 1.5× + 預覽。**我們取 Apple 版克制風格**。
5. 方向鍵在 shelf 內移焦，Return 開啟，Space 播放。
6. Detail：電影感 header、**Resume 帶上下文（"S1 E3 · 剩 12 分鐘"）**、加入清單、metadata 徽章（4K/HDR/語言）、Episodes（季選擇 + 水平卡片 + 進度）、Related。
7. Post-play：下一集卡片倒數（Play Now / Cancel），自動推進。
8. 側欄導覽（macOS 14+ Apple TV）：Home / Library / … 放左側，搜尋在工具列。

### 1.5 UIKit？

**不用。** macOS 原生是 AppKit；UIKit 只能經 Mac Catalyst 跑，會失去：自訂 `NSWindow`（無邊框 / 浮動 mini player / 隱藏交通燈）、`CAOpenGLLayer` mpv 畫面、`NSEvent` 層級的鍵盤與滾輪控制、Sparkle、Dock menu。設計上把 **核心做成 platform-neutral Swift Package**（API、model、彈幕排程、偏好），未來要做 iOS/iPadOS 時再加一個 UIKit/SwiftUI target 共用核心即可。

---

## 2. 目標與非目標

### 目標（v1）
- 登入 / 首次設定導向、多 server profile、Keychain 存 token。
- 瀏覽：Home、Schedule、Discover、Search（+⌘K）、Anime detail、Collection、History。
- 播放：mpv 引擎、OSC、快捷鍵、字幕（內嵌 + sidecar + 拖放）、音軌、進度同步、Resume、自動下一集、OP/ED skip、thumbnail peek、mini player、全螢幕。
- **彈幕**：DandanPlay + Bilibili 匯入 + 發送；原生渲染；完整設定；列表 click-to-seek。
- 桌面整合：Now Playing / 媒體鍵、系統通知（WS 事件）、Dock badge、拖放 magnet/torrent、防睡眠。
- 管理：Libraries、Downloads/RSS、Settings（原生 Form）。
- 發佈：Developer ID + 公證 + Sparkle + Homebrew cask；CI gate。

### 非目標（v1）
- App Store 上架（mpv 授權與 sandbox 成本）、iOS/iPadOS、多使用者（server 只有單帳號）、Touch Bar、內建 torrent engine（server 已有）、直播。

---

## 3. 技術決策

| 決策 | 選擇 | 理由 / 備案 |
|---|---|---|
| 最低版本 | **macOS 15 Sequoia**，**arm64 only**（M1 以上；使用者拍板） | `onScrollGeometryChange`、zoom navigation transition、`Tab` API 都在 15；M1 全系列可升 15。macOS 26 的 Liquid Glass 以 `#available` 漸進採用。 |
| 語言 | Swift 6.2，strict concurrency，default `MainActor` isolation on app target | 依 `swiftui-pro` / `swift-concurrency-pro` skill 規範 |
| UI | SwiftUI；AppKit 僅在 `NSViewRepresentable`（mpv view、彈幕 layer view、鍵盤/滾輪捕捉）與 window 行為 | 不引入 UIKit/Catalyst |
| 播放引擎 | **libmpv via [MPVKit](https://github.com/mpvkit/MPVKit) 1.0.0（LGPL product）** | 預建 xcframework（mpv 0.41 / FFmpeg 8.1 / libplacebo / MoltenVK），免自己編；LGPL 產品保留授權彈性。備案：`MPVKit-GPL` 若需 smb 等 GPL 元件；KSPlayer（GPL）不選。 |
| 渲染 | `mpv_render_context` OpenGL API → `CAOpenGLLayer`（layer-hosting `NSView`） | libmpv 嵌入式只有 GL / SW 兩種；GL 保留 mpv 全部 shader/HDR 能力；layer-backed 才能正確疊彈幕。v2 備案：SW render → `CVPixelBuffer` → `AVSampleBufferDisplayLayer`（換取公開 API 的 PiP）。 |
| 彈幕渲染 | **Core Animation**：每條彈幕一個預先 rasterize 的 `CALayer`，`CABasicAnimation` 動 `position`；容器 `speed` 控暫停/倍速 | GPU 合成、暫停/倍速免費、與 web 的 CSS-transform 方案同構；排程器為純 Swift 可測。備案：Metal glyph atlas（profiling 證明需要時再做）。 |
| 狀態 | `@Observable` stores（每 feature 一個）+ `actor` API client + `AsyncStream` 事件 | 不做單一巨型 AppState |
| 專案生成 | **XcodeGen**（`project.yml` 進 git，`.xcodeproj` 不進）；版本 pin 在 `mise.toml` | 與 repo「工具版本 pin 在 mise.toml」慣例一致；diff 友善 |
| 套件 | 本地 SPM：`MilmilKit`（platform-neutral）、`MilmilPlayer`（macOS） | 核心可被未來 iOS target 共用 |
| 第三方 | MPVKit、Nuke（圖片快取，MIT）、SwiftyOpenCC（Apache-2.0）；Sparkle 待有 Developer Team。其餘自寫。 | 依 skill 規範：新增第三方前先問 |
| 圖片 | CDN 絕對 URL（Bangumi/AniList/TMDB）直接抓 + 磁碟快取；`lain.bgm.tv` 要帶 Referer | server 沒有 image proxy |
| 發佈 | 現階段 **ad-hoc 簽名 dev build**（無 Developer Team）；之後 Developer ID + notarize + Sparkle + Homebrew cask | 不 sandbox（與 IINA 同）；未公證版本需使用者右鍵開啟或 `xattr -d com.apple.quarantine` |

---

## 4. 工作區與模組結構

新增第四個 workspace `macos/`，有自己的 `AGENTS.md`。

```
macos/
├── AGENTS.md
├── project.yml                      # XcodeGen
├── Milmil/                          # app target
│   ├── App/                         # MilmilApp.swift, Scenes, AppDelegate (Dock/Sparkle/URL scheme)
│   ├── Design/                      # tokens, materials, typography, motion presets
│   ├── Features/
│   │   ├── Onboarding/              # ServerPicker, Login, TwoFactor, SetupRedirect
│   │   ├── Home/                    # HeroCarousel, ContinueWatchingShelf, TodayShelf, TrendingGrid
│   │   ├── Schedule/
│   │   ├── Discover/
│   │   ├── Search/                  # SearchView + CommandPalette
│   │   ├── AnimeDetail/
│   │   ├── Collection/
│   │   ├── History/
│   │   ├── Player/                  # PlayerWindow, OSC, OSD, Inspector tabs, MiniPlayer
│   │   ├── Danmaku/                 # DanmakuOverlayView (CALayer renderer), settings, list, sources
│   │   ├── Libraries/
│   │   ├── Downloads/               # downloads + RSS + rules
│   │   ├── Notifications/
│   │   └── Settings/
│   ├── Shared/                      # PosterCard, Shelf, Backdrop, AsyncImage wrappers, focus helpers
│   └── Resources/                   # Assets, Localizable.xcstrings (zh-HK/zh-TW/zh-CN/en/ja/ko), shaders/
├── Packages/
│   ├── MilmilKit/                   # platform-neutral
│   │   ├── Sources/MilmilAPI/       # APIClient (actor), Endpoints, Models, Errors, Keychain, ServerProfile
│   │   ├── Sources/MilmilRealtime/  # WebSocket ticket flow → AsyncStream<ServerEvent>
│   │   ├── Sources/MilmilDanmaku/   # parse / normalize / filter / thin / convert / LaneScheduler
│   │   ├── Sources/MilmilPreferences/ # GlobalPreferences & SeriesPreferences (same keys as web), sync
│   │   └── Tests/…                  # Swift Testing; fixtures from real API JSON
│   └── MilmilPlayer/                # macOS only
│       ├── Sources/CMPVShim/        # C shim: event/node flattening, render helpers
│       ├── Sources/MilmilPlayer/    # MPVPlayer, PlayerSnapshot, MPVRenderLayer, options mapping
│       └── Tests/
├── Scripts/                         # bootstrap.sh, notarize.sh, make-dmg.sh, appcast
└── MilmilUITests/
```

### 4.1 MilmilAPI
- `actor APIClient`：`URLSession`、`Authorization: Bearer mlml_…`、`ApiError(status, message)`（server 只回 `{"message"}`）、429 退避、`{"message"}` 映射成可讀錯誤。
- 典型 endpoint 以 typed function 暴露（與 `web/src/lib/api/*.ts` 一對一命名，方便對照）。
- 寬鬆 decoding：server 的 SQLite bool 是 `0|1`，DTO bool 是 `true|false`；`genres` 在 `/collection` 是 JSON string、在 `/libraries/{id}/anime` 是 array —— 用自訂 `LenientBool` / `LenientStringArray`。
- Stream URL builder：header 優先（mpv `http-header-fields`）；`?token=` 只給不能帶 header 的場合（thumbnail VTT 內的 sprite URL）。
- `ServerProfile { name, baseURL, userID }` 多 server；token 存 Keychain（`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`）。登入時送 `device_name: "milmil for macOS — <hostname>"`。

### 4.2 MilmilRealtime
- `GET /api/v1/ws/ticket` → `wss://…/ws?ticket=`；ticket 單次、60s；重連必重領。
- 指數退避重連、app 進前景立即重連、server ping/pong 由 `URLSessionWebSocketTask` 處理。
- 事件視為「失效提示」：收到就 refetch，不假設不丟（server 端 buffer 滿會靜默丟）。
- `enum ServerEvent`：scan / match / download / transcode / notification / sync / update。

### 4.3 MilmilPlayer（見 §6）

### 4.4 MilmilDanmaku（見 §7）

---

## 5. 導覽與視窗模型

```
Main Window (NavigationSplitView)
├─ Sidebar（Apple TV 風）：首頁、時刻表、探索、搜尋 │ 收藏、歷史 │ 媒體庫、下載、通知 │ 設定
├─ Detail column：各頁 push（Home → AnimeDetail → …），NavigationStack per tab
└─ Toolbar：搜尋欄（⌘F 聚焦）、⌘K palette、通知鈴（badge）

Player Window（獨立 WindowGroup，同時最多一個，重用）
├─ mpv render layer
├─ Danmaku overlay layer
├─ OSD / OSC（floating bottom，material）
├─ Inspector（右側，可收起 = theater）：集數 / 彈幕列表 / 彈幕來源 / 字幕 / 音訊 / 視訊
└─ 模式：一般 / 全螢幕 / Mini（always-on-top 浮動小窗，IINA Music mode 的影片版）

Settings Scene（⌘,）
Menu Bar Extra（選配）：Now Playing 控制 + 下載進度
```

- 播放在獨立視窗：可以邊看邊瀏覽（Apple TV 同樣做法）；mini 模式是 PiP 的公開 API 替代品。
- 背景：Main window 根層一張 `BackdropLayer`，各頁用 environment 設 `(image, dim, anchor)`，crossfade 0.35s；捲動時以 `onScrollGeometryChange` 變暗到 5%（對應 web 行為）。

---

## 6. 播放器設計

### 6.1 引擎層（`MilmilPlayer`）

```swift
public final class MPVPlayer: Sendable {            // 內部以 lock + 專用 queue 保護 mpv handle
    public let events: AsyncStream<PlayerEvent>     // .snapshot, .fileLoaded, .endFile(reason), .error, .log
    public func load(_ source: PlaybackSource, options: LoadOptions) async throws
    public func command(_ cmd: MPVCommand) async throws
    public func set<T: MPVValue>(_ option: MPVOption<T>, _ value: T)
    public func observe<T>(_ prop: MPVProperty<T>) -> AsyncStream<T>
}

@MainActor @Observable public final class PlayerState {   // 給 SwiftUI 的快照
    var status: .idle/.loading/.playing/.paused/.buffering(pct)/.ended/.failed(PlayerError)
    var timePos, duration, cacheSeconds, speed, volume, muted
    var tracks: [Track]   // video/audio/sub, lang, title, codec, selected, external
    var chapters: [Chapter]
    var videoSize, hwdecActive, hdr
}
```

- 初始化選項（IINA/OKVideoMac 兩邊的交集）：`vo=libmpv`, `hwdec=videotoolbox`（fallback `auto-safe`）, `keep-open=yes`, `cache=yes`, `demuxer-max-bytes=…`, `sub-auto=fuzzy`, `slang` 依偏好, `audio-channels=auto-safe`, `scaletempo2`（變速不變調）, `http-header-fields=Authorization: Bearer …`, `user-agent=milmil-macos/x.y`.
- 事件：`mpv_set_wakeup_callback` → 專用 `DispatchQueue` 排乾 `mpv_wait_event(0)`；property change 合併後 100ms 節流推 `PlayerState`；`MPV_EVENT_QUEUE_OVERFLOW` 視為 bug 記錄。
- C shim（`CMPVShim`）：`shim_wait_event` 回傳攤平 struct；`shim_track_list` 解析 `mpv_node`；render create/update/render/report_swap。Swift 端不碰 union。
- Readiness gate：render layer 建好才 `load`；關閉時先 `mpv_render_context_free` 再 `mpv_destroy`；`warmStop`（換集）vs `fullDestroy`（關窗）。

### 6.2 渲染層
- `MPVRenderLayer: CAOpenGLLayer` — GL 3.2 Core，`draw(inCGLContext:)` 建 `mpv_opengl_fbo` → `mpv_render_context_render`；`mpv_render_context_set_update_callback` 觸發 `setNeedsDisplay` 於 render queue；live resize 期間 `isAsynchronous = true`（不暫停渲染）。
- Host `NSView`：`wantsLayer`、layer-hosting、`contentsScale` 跟 backing；`NSViewRepresentable` 只做 wiring。
- 疊層順序（全部 Core Animation）：mpv layer → danmaku container layer → SwiftUI overlay（OSC/OSD/狀態）。

### 6.3 串流策略
1. **Local path 直開（新，桌面獨有）**：若使用者在設定裡把 server 路徑前綴映射到本機掛載（例如 `/data/anime` → `/Volumes/NAS/anime`）且檔案存在 → `file://` 直開。零 server I/O、即時 seek、NAS 用戶最大贏點。需 server 在 `playable-episodes.media_file` 多回 `path`（見 §11）。
2. `GET /stream/{id}/direct`（帶 Bearer header；支援 Range → mpv 可 seek）。**忽略** `can_direct_play`（那是瀏覽器邏輯）。
3. mpv 開檔失敗 / 無法解碼 → `GET /stream/{id}/remux`。
4. 仍失敗 → `POST /stream/{id}/transcode` → 輪詢 `master.m3u8`（202 期間）或等 WS `transcode:ready` → HLS。
5. 遠端 library（SMB/SFTP/rclone）若 reader 不可 seek，server 不回 Range → UI 標示「此來源不支援跳轉」。

### 6.4 OSC / OSD / 互動
- OSC：floating bottom，`.ultraThinMaterial`（macOS 26 → `glassEffect`），自動隱藏 2.5s（hover 在 OSC 上或暫停時不隱藏）；元件：播放/暫停、±10s、上一集/下一集、seek bar（hover 放大、thumbnail peek 用 server VTT+sprite）、時間/剩餘切換、音量（hover 展開）、速度、字幕、音軌、彈幕開關 + 輸入框、inspector、mini、全螢幕。
- 窄視窗降級：依寬度隱藏次要元件（IINA 的 priority 概念）。
- OSD pill：音量 / seek / 速度 / 字幕延遲 / 彈幕開關，0.8s 淡出；Reduce Motion 時只 fade。
- 滑鼠：雙擊全螢幕、單擊暫停（可關）、滾輪依區域 seek 或音量、pinch 全螢幕、右鍵 context menu（軌道、速度、畫面比例、截圖…）。
- 鍵盤：預設表 = web `plugins/keyboard/defaults.ts` 全集 + mpv 原生（`Shift+.` 逐幀後退、`o` 顯示進度 OSD、`Cmd+↑/↓` 音量…）；從 `preferences.keyboardBindings` 載入覆寫，設定頁可重綁，衝突偵測；`?` 顯示快捷鍵面板。
- 進度：每 10s + pause/stop/換集/關窗/退出 `POST /progress`；剩 ≤30s `completed=true`；開播先 seek 到 `progress.position_seconds` 並顯示 4s 可關閉的 Resume pill（與 web 一致）。
- 自動下一集：EOF 前 30s 出現 post-play 卡（下一集縮圖 + 標題 + 10s 倒數 + Play Now / Cancel）；`autoNext=false` 則只顯示按鈕。
- OP/ED：`GET /media/{id}/segments` → seek bar 標記 + 「跳過 OP」按鈕；`autoSkipOp/Ed` 自動跳；MKV chapters 若命名含 OP/ED 也當 segment 候選。
- A-B loop、逐幀、速度（0.25 步進，`Backspace` 重置）、截圖（`screenshot-raw` → 剪貼簿 / ~/Pictures/milmil）。

### 6.5 字幕 / 音訊 / 視訊
- 內嵌軌：mpv/libass 原生（ASS 特效、karaoke 全支援 — web 做不到）。
- Sidecar：`GET /subtitles/media/{id}` 列表 → `/subtitles/{sid}/content`（VTT）以 `sub-add` 外掛；拖放 `.srt/.ass/.vtt/.ssa` 進視窗也 `sub-add`。
- 雙字幕：`secondary-sid`。
- 樣式：`SubtitleStyle`（web 同一組 key）映射到 `sub-font/sub-font-size/sub-color/sub-border-size/sub-shadow-offset/sub-pos/sub-margin-y…`；`respectAssStyle` → `sub-ass-override=no|force`；延遲 `sub-delay`（`z/x` ±0.1s）。
- 自動選軌：偏好鏈 per-series → global → app locale；評分避開 forced/signs 軌（OKVideoMac 的教訓）。
- 音訊：軌道切換、`audio-delay`、輸出裝置選擇（`audio-device`）、音量正規化選項。
- 視訊：`hwdec` 狀態顯示、畫面比例、旋轉、去交錯、插幀（`interpolation`）、HDR tone-mapping、**Anime4K shaders**（bundle MIT 授權 GLSL，預設 Fast/Balanced/HQ 三組依 GPU 自動建議，`glsl-shaders` 熱切換）。

---

## 7. 彈幕系統（一級功能）

### 7.1 資料流

```
sources ──┬─ DandanPlay  GET /danmaku/{mediaFileId}        → {count, comments:[{cid, p:"t,mode,color,uid", m}]}
          ├─ External    GET /danmaku/external/imported/{episodeId} → [{source, count, saved, comments:[{text,time,mode,color}]}]
          └─ Local sent  (optimistic, 發送成功後保留)
      ↓ parse & normalize → [DanmakuComment]
      ↓ convert (none | s2t | t2s)
      ↓ filter: mode toggles · keyword/regex block · (選配) 重複合併 ×N
      ↓ thin: 每 6s 視窗上限 low 20 / medium 50 / high 80 / unlimited（與 web worker 同算法）
      ↓ sort by time → DanmakuTimeline（immutable, binary-searchable）
      ↓ LaneScheduler（純邏輯）→ Placement {lane, y, startX, duration}
      ↓ DanmakuOverlayView（Core Animation）
```

```swift
public struct DanmakuComment: Sendable, Hashable {
    public enum Mode: Sendable { case scroll, top, bottom }
    public let id: String          // "ddp:\(cid)" / "bili:\(hash)" / "local:\(uuid)"
    public let time: Double
    public let mode: Mode
    public let color: RGB
    public let text: String
    public let source: DanmakuSource
}
```
- DandanPlay `p` 解析：`time,mode,color,uid`；mode 1/6 → scroll、4 → bottom、5 → top；color 十進位 RGB int。
- 快取：每個 fileId 的合併結果存磁碟 6h（與 server cache 對齊），離線也能看。

### 7.2 LaneScheduler（`MilmilDanmaku`，可單元測試）
- 輸入：視口 `(width, height)`、字體量測結果 `textWidth`、`speed`（px/s，web 預設 144）、`area`（0.25/0.5/0.75/1；`antiSubtitle` 時上限 0.85）、行高。
- Scroll lane 可用條件：前一條的尾端已完全進入畫面（`prevEnterTime + prevWidth/speed ≤ now`）且新條在前一條離開前不會追上（速度相同時恆成立；若實作依長度變速則檢查追撞）。
- Top/Bottom：固定停留 4s；由上/下往中間找最低空 lane。
- 溢出策略：density ≠ unlimited → 丟棄；unlimited → 允許重疊（隨機 y 抖動）。
- Seek：清空所有活動條，重新 seed 區間 `[t - maxScrollDuration, t]` 內的 scroll 條並算出部分進度 `x(t)`，top/bottom 只 seed `[t-4s, t]`。

### 7.3 渲染（`DanmakuOverlayView`，app 層）
- Layer-hosting `NSView`，容器 `CALayer`（`masksToBounds`），`speed` = 0（暫停）/ 播放倍速；`timeOffset` 處理暫停恢復。
- 每條彈幕：以 CoreText 預先 rasterize 成 `CGImage`（字體、粗體、描邊/陰影、顏色、透明度、Retina scale），`NSCache` 以 `(text, styleHash)` 去重；layer `contents = image`；`CABasicAnimation(position.x)`：`from = width + w/2` → `to = -w/2`，`duration = (width + w) / speed`，linear；完成即移除。
- 時鐘：mpv `time-pos` 為真值（~10Hz）；overlay 用 `NSView.displayLink` 每幀插值 `now = lastTimePos + (hostTime - lastHostTime) * rate`；漂移 >150ms 時校正（重 seed）。
- 目標：M1 上 300 條同屏 60fps，空閒 CPU <3%；Instruments 驗證。
- 為何不是 SwiftUI `Canvas`：每幀重排文字成本高且無隱式動畫；為何不先做 Metal：CA 已是 GPU 合成，Metal 只在 profiling 證明瓶頸時引入（glyph atlas 方案留作 v2）。

### 7.4 UI
- OSC 內：彈幕開關（動畫 icon）、已載入 N 條、輸入框（Return 送出；送出 shape **必須是** `{time, mode, color, comment}` —— web 目前送 `{text}` 是 bug，見 §11）、設定 popover。
- 設定（全部共用 web key）：`danmakuEnabled / Opacity / FontSize / Speed / Density / Area / Bold / Stroke / FilterScroll / FilterTop / FilterBottom / AntiSubtitle / FontFamily / Color / BlockKeywords / ChineseConvert`。中文轉換用 **SwiftyOpenCC**（Apache-2.0，詞級，與 web 的 opencc-js 同字典族；使用者拍板）。
- Inspector「彈幕」tab：時間排序列表、目前播放位置高亮自動捲動、click-to-seek、來源標籤、搜尋/過濾、右鍵「加入封鎖詞」。
- Inspector「彈幕來源」tab：`GET /danmaku/external/sources` → 搜尋（預填「標題 第N話」）→ 分 P 選擇 → 匯入 → save toggle → 移除；匯入成功即時合併。
- 快捷鍵：`d` 開關彈幕、`Shift+D` 設定、`Cmd+Return` 聚焦輸入框。
- 無障礙：Reduce Motion → 彈幕改為淡入淡出固定顯示（不捲動）或僅列表模式；Reduce Transparency → 不透明底。

---

## 7.5 視覺語言（design canvas 定案，2026-08-23）

Review 後使用者要求「更 macOS 原生」，canvas 已改成 macOS 26 / Apple TV app 語言，實作時照此：

- 字型：SF Pro（system），body 13pt、secondary 11pt、頁標 20pt semibold、hero 40pt bold；CJK 走 PingFang。
- 底色：`#141416`（Apple TV app 深灰，不是 web 的 `#070707`）；hero / detail 保留全幅 backdrop gradient，sidebar 浮在 backdrop 之上。
- Sidebar：**浮動玻璃面板**（inset 10pt、圓角 14、`NSVisualEffectView` sidebar material + 1px 高光邊），寬 210；選取列系統灰圓角 7；分組標題 11pt 灰；項目 icon 用 accent 色。
- 控制項：膠囊按鈕（primary 白底黑字 = Apple TV「播放」；表單 primary = accent 填色）、膠囊 segmented control、popup 右側 accent 小方塊上下箭頭、text field 圓角 8、原生 switch、checkbox accent 圓角 4。
- Tabs 一律用 segmented control（inspector、媒體庫、收藏）；表格交替列色、選取列 accent 20%。
- 設定：System Settings 樣式——左側彩色 icon tile 列表（`#8e8e93` 灰 / `#5e5ce6` / `#ff9f0a` / accent / `#30d158` / `#64d2ff` / `#ff375f` / `#ff453a` / `#0a84ff` / `#bf5af2`），右側 grouped form（圓角 12、hairline 分隔）。
- 玻璃材質（OSC、popover、menu bar extra）：`rgba(34,34,38,.62)` + blur 30 + 1px 高光；macOS 26 上換 `glassEffect`。
- Icon 筆劃 1.8（SF Symbols regular 的重量）；海報圓角 8、劇照圓角 10、卡片圓角 12。
- 主視窗 sidebar 定案 labeled（Apple TV 式），可摺疊成 icon rail。

## 8. 瀏覽體驗（Apple TV + Netflix 取長）

### 8.1 Home
- **Hero**：7 張 trending 輪播，海報 + 標題 + 分數 + 類型 chips + 簡介 + 「詳情」(primary)「預覽」；背景 `BackdropLayer` 隨頁 crossfade；指標停留 1s → 背景 Ken Burns 微動（v1 不做影片自動預覽）；鍵盤 ←/→ 切頁；8s 自動輪播，hover 暫停。
- **繼續觀看 shelf**：`/progress/recent`；16:9 still（episode image → banner fallback）+ 底部進度條；hover 顯示 ▶ 與 `…`（從清單移除 = `DELETE /progress/{id}`、標記已看 = `POST /progress completed`）；點擊直接開播放器。
- **今日時刻表 shelf**：`/discover/calendar` 今天那列，顯示 EP 與播出時間（Asia/Tokyo → 本地時區換算並標示）。
- **現在熱門 grid**。
- Shelf 元件：`ScrollView(.horizontal)` + `scrollTargetBehavior(.viewAligned)` + `containerRelativeFrame`；hover 顯示兩端 chevron；`focusSection()` 讓方向鍵在行內移動，Return 開啟。

### 8.2 Card
- Poster 2:3，hover 延遲 250ms → scale 1.04 + lift（shadow 放大）+ 顯示 ▶/資訊按鈕；spring damping 1.0 response 0.3；Reduce Motion → 只換邊框。
- 右鍵 context menu：播放、加入收藏（狀態子選單）、在 Bangumi 開啟、複製標題。

### 8.3 Anime Detail
- 電影感 header（banner + gradient），海報、標題/原名、分數、徽章（TV/集數/年月/評分人數 + **本地檔案能力徽章：1080p/4K、HEVC、多音軌、字幕數**，來自 `media_file`）。
- **Resume 按鈕帶上下文**：「繼續 EP3 · 剩 12 分鐘」/「開始 EP1」/「已看完 · 重看」。
- 收藏狀態 menu（none/watching/planning/completed/paused/dropped）、使用者評分、sync flags。
- Episodes：grid（still + 集數 + 標題 + 進度 + 有檔/無檔），無檔的集顯示播出日與「搜尋資源」；右鍵：標記已看/未看、設定偏好檔案、缺集搜尋。
- 預告片（YouTube 連結 → 內嵌 `WKWebView` sheet 或外開）、關聯作品、角色/聲優、Bangumi 評論、重複檔案面板。

### 8.4 Schedule / Discover / Search / Collection / History
- Schedule：年/季 segmented + 週天 tabs + 時間軸分組（對應 web），卡片大小偏好共用 `ui-store` 語義（本機 `@AppStorage`）。
- Discover：多條 shelf + 類型/標籤 chips → 整類 grid。
- Search：工具列搜尋 + 篩選（sort/year/season/score/status/genres）+ 無限捲動；⌘K palette 即時本地+遠端搜尋。
- Collection：狀態 tabs 含計數、排序、搜尋。History：日期分桶、多選刪除、清空。

---

## 9. 桌面 client 相對 webapp 的好處（回答「好處比較」）

| 面向 | Webapp（現況） | macOS native |
|---|---|---|
| 格式支援 | 瀏覽器只吃 mp4/webm + h264/vp9/av1；MKV/HEVC/10-bit 要 server remux/transcode | mpv 全吃；**server 零轉碼 CPU**，seek 即時 |
| 字幕 | 自寫 ASS parser（特效/karaoke 降級） | libass 原生，與 IINA 同品質 |
| 內嵌音軌/字幕 | API 不暴露，無法切換 | 容器內直接列舉切換 |
| 本機/NAS 檔案 | 一定走 HTTP | 可 `file://` 直開掛載的 share |
| 畫質 | 無 | Anime4K、插幀、HDR tone-map、hwdec |
| 視窗 | 分頁內 | 獨立播放視窗、mini always-on-top、第二螢幕全螢幕 |
| 系統整合 | PWA 通知有限 | Now Playing / 媒體鍵 / AirPods、系統通知、Dock badge、Menu bar、Spotlight、Shortcuts |
| 認證 | localStorage token | Keychain、多 server profile |
| 離線 | 無 | 彈幕/中繼資料快取；（v2）離線下載整集 |
| 輸入 | 有限 | 全域快捷鍵、滾輪/trackpad 手勢、拖放 magnet/字幕 |
| 省電/效能 | JS 彈幕 DOM | Core Animation 合成、VideoToolbox |

---

## 10. 值得做的桌面獨有功能（優先序）

**✅ v1 必做**
1. Local path 直開（路徑映射）。
2. Now Playing + 媒體鍵（`MPNowPlayingInfoCenter` / `MPRemoteCommandCenter`）。
3. 系統通知：下載完成、掃描完成、更新可用（來自 WS）；Dock badge = 未讀通知 / 進行中下載數。
4. Mini player（always-on-top 浮窗）。
5. 拖放：magnet/`.torrent` 到視窗/Dock → `POST /downloads`；字幕檔到播放器。
6. Anime4K shader 預設組。
7. 防睡眠（`IOPMAssertion` 播放中）、耳機拔除自動暫停、系統睡眠自動暫停並上報進度。
8. `milmil://anime/<id>` / `milmil://watch/<id>?ep=` URL scheme（web 可放「在 App 開啟」）。
9. Sparkle 自動更新。

**⭐ v1.x 應做**
10. Menu bar extra：目前播放 + 下載進度。
11. Spotlight（CoreSpotlight）索引收藏/媒體庫，Spotlight 直接開播。
12. App Intents / Shortcuts：「播放 X 的下一集」、「今天有什麼番」。
13. WidgetKit：今日時刻表、繼續觀看。
14. 截圖含字幕/彈幕疊層、GIF（ffmpeg 在 MPVKit 內）。
15. 全域快捷鍵（播放/暫停、跳過 OP）。

**💡 v2**
16. 真 PiP：SW render → `AVSampleBufferDisplayLayer` → `AVPictureInPictureController`（公開 API；CPU 成本）。
17. 離線下載整集到本機快取 + 到期清理。
18. 播出提醒 → 本機通知 / EventKit。
19. AirPlay（需 AVFoundation 路徑，與 PiP 共用 SW render）。
20. 線上字幕 provider（OpenSubtitles/Assrt，IINA 的抽象）。

---

## 11. 需要的 server / web 變更

| 變更 | 用途 | 大小 |
|---|---|---|
| `playable-episodes.media_file` 加 `path`, `library_id`, `library_source_type` | Local path 直開 | 小（handler + openapi.json） |
| `GET /danmaku/{fileId}` 回傳多帶 `episode_id` | 客戶端合併 external（以 episodeId 為 key）免再查 | 小 |
| **web bug**：`DanmakuBar.tsx` 送 `{text}`，server 綁 `{time,mode,color,comment}` | 修 web；mac 端照 server shape | 小，獨立 PR |
| openapi.json `WatchProgress` schema 過期（`episode_id` 型別、`completed` 0/1、`last_watched_at`） | 讓 mac 端能以 spec 生成 fixtures | 小 |
| `/user/preferences` 容許新增桌面 key（`localPathMappings`, `anime4kPreset`, `miniPlayerSize`…）— 確認 server 是透傳 JSON | 偏好同步 | 確認即可 |
| （選配）`Cache-Control` / `ETag` on sprite/thumbnails | 磁碟快取命中 | 小 |
| （記錄，不急）Jellyfin `PlaybackInfo` 回的 `master.m3u8` 路由不存在 | 與本案無關，但順手記 | — |

---

## 12. 品質門檻（對齊 repo「CI 無 informational step」）

```bash
# macos/
mise run macos:gen          # xcodegen generate
swift-format lint -r Packages Milmil   # 0 findings（或 SwiftLint，二擇一，pin 在 mise.toml）
xcodebuild -scheme Milmil -destination 'platform=macOS' build test   # Kit/Player/Danmaku 單元測試 + UI smoke
```
- 測試重點：API decoding（真實 JSON fixtures、0/1 bool、三種分頁格式）、WS ticket 重連、`LaneScheduler`（確定性、無重疊、seek 重 seed）、`p` 解析、thinning 視窗、鍵盤綁定衝突、mpv 選項映射。
- CI：`macos-15` runner，cache SPM + DerivedData；release job 做 archive → notarize → DMG → appcast。
- Conventional Commits scope：`feat(macos): …`；release-please 新增 `macos` package 用 `macos/Milmil/Info.plist` 版本（或 `project.yml` 變數）。

---

## 13. 授權與合規

- MPVKit 取 **LGPL** product；動態連結、保留 LGPL 聲明與可重連結性（不做 App Store 可避開爭議）。
- Anime4K：MIT。Nuke：MIT。Sparkle：MIT。
- IINA / OKVideoMac / iina-plus / Danmaku Cosmos（MIT，可參考排程邏輯）：**只參考設計，不複製 GPL 原始碼**。About 頁列出致謝。

---

## 14. 已拍板（2026-08-23）

1. 最低 macOS 15，Apple Silicon only。
2. 管理頁（Libraries / Downloads / RSS / Settings）**v1 全部原生**。
3. XcodeGen（`project.yml` 進 git，`.xcodeproj` 產生）。
4. App 名 `milmil`，bundle id `dev.milmil.macos`；目前無 Developer Team → ad-hoc dev build，公證/Sparkle 延後。
5. 彈幕中文轉換用 OpenCC（SwiftyOpenCC）。
6. 流程：先以 Claude Design 產出全部畫面的 design canvas 供 review，確認後才進 Phase 0。
