# milmil for macOS — Implementation Plan

**Date**: 2026-08-23
**Design**: `2026-08-23-macos-client-design.md`
**Branch / worktree**: `worktree-macos-client`
**Workspace**: `macos/`（新，第四個 workspace）

原則：每一期結束都是可跑、可 demo、CI 綠的狀態；彈幕在 Phase 3 成為一級功能，但從 Phase 2 起播放器就預留 overlay layer 與時鐘介面。

---

## Phase D — Design review（Claude Design canvas，進 Phase 0 之前）

全部畫面先以 design canvas 產出供 review：Server picker / Login、Home、Schedule、Discover、Search + ⌘K、Anime Detail、Player（一般 + inspector 彈幕 tab）、Player mini、Collection、History、Libraries、Library detail（檔案表 + match）、Downloads / RSS、Notifications、Settings（Player / Danmaku / Keyboard）。Review 定案後各畫面的 spacing / token / 互動寫回 design doc §8，再開 Phase 0。

- Canvas（76 張 artboard，六頁：瀏覽 / 播放器 / 彈幕 / 管理 / 設定 / Onboarding+系統）：https://claude.ai/code/artifact/0d2596a1-c284-4e7a-9327-e98f0e697a1f
- 產生器與 artboard 原始檔：`docs/design/macos-client/gen.py`（primitives + 第一批）、`gen2.py`（第二批）、`gen3.py`（彈幕系統 + 播放器狀態 + 版面）、`native.py`（macOS 原生 restyle）→ `*.dc.html` + `canvas.json`；`python3 gen3.py && python3 seed.py <design-skill-dir>` 重建。
- 彈幕頁定義的功能（實作時對照）：發送 popover（模式/顏色/字級/預覽）、seek bar 密度熱力圖 + 高能時刻、每來源時間偏移（OP 音訊指紋自動對齊、per-episode 記住）、未匹配狀態與 DandanPlay 手動匹配（hash + 檔名候選、套用到整部）、封鎖規則（關鍵字 / 正則 / 使用者、本集命中數、合併重複 ×N）、本機 XML/JSON 載入（自動偏移）、列表右鍵（跳轉 / 高亮 / 封鎖 / 檢舉）。
- 已拍板：主視窗 sidebar 用 labeled（Apple TV 式），可摺疊成 icon rail。

## Phase 0 — Scaffold & API foundation（~1 週）

**目標**：空殼 app 能登入 milmil server、拿到 `/auth/me`、顯示 server 版本；CI 跑單元測試。

### Tasks
- [ ] `macos/AGENTS.md`（工具鏈、gate、慣例）；`mise.toml` 加 `xcodegen`、`swift-format`（或 `swiftlint`）pin；`.github/workflows/ci.yml` 加 `macos` job（`macos-15` runner，cache SPM/DerivedData）。
- [ ] `macos/project.yml`（XcodeGen）：app target `Milmil`（macOS 15, arm64 only, Swift 6.2, strict concurrency, default MainActor isolation）、`MilmilUITests`；local packages `Packages/MilmilKit`、`Packages/MilmilPlayer`；entitlements（network client、outgoing；不 sandbox）；`Info.plist`（URL scheme `milmil`、`NSAppTransportSecurity` 允許 http LAN）。
- [ ] `MilmilKit/MilmilAPI`
  - `APIClient` actor（base URL、Bearer、JSON decode with `LenientBool`/`LenientStringArray`、`ApiError(status, message)`、429 退避、request logging with URL redaction）。
  - Endpoints v1：`health`, `setup/status`, `auth/status|login|login/2fa|me|logout`, `api-tokens`。
  - `ServerProfileStore`（`@Observable`；profiles 存 `UserDefaults`，token 存 Keychain）。
  - Tests：decoding fixtures（從真實 server 回應存成 JSON）、error mapping、Keychain round-trip（用 in-memory fake）。
- [ ] App：`MilmilApp` + `AppDelegate`；Onboarding feature：`ServerPickerView`（新增/選擇 server，`GET /health` 驗證）、`LoginView`（username/password/device_name、2FA 步驟、rate-limit 提示）、`SetupRedirectView`（`has_admin=false` → 引導去 web 完成 setup）。
- [ ] `Design/`：tokens（`#070707` bg、`#a78bfa` accent、文字四級透明度、radius）、字型（系統 SF + Noto Sans TC fallback for CJK）、motion presets（`.snappy`/`damping 1.0` springs；`accessibilityReduceMotion` 感知）。
- [ ] `Resources/Localizable.xcstrings`：6 語系骨架（zh-TW 預設，與 web 同）。

### Acceptance
- `xcodebuild test` 綠；登入後主視窗顯示「已連線 · vX.Y.Z · username」；token 重啟後仍有效；錯誤密碼/429 有可讀訊息。

---

## Phase 1 — Browse（~2 週）

**目標**：不含播放器的完整瀏覽體驗，視覺與 web 對齊並採用 Apple TV 交互。

### Tasks
- [ ] Endpoints：`progress/recent|history`, `collection*`, `discover/*`, `anime/{id}/playable-episodes`, `search/anime`, `notifications*`, `user/preferences*`。Models：`AnimeSummary`, `AnimeDetail`, `PlayableEpisodesResponse`, `CalendarDay`, `CollectionItem`, `ProgressEntry`。
- [ ] `MilmilRealtime`：ticket → WS → `AsyncStream<ServerEvent>`；重連/退避；tests（fake URLProtocol + fake WS）。
- [ ] `MilmilPreferences`：`GlobalPreferences` / `SeriesPreferences`（與 `web/src/lib/api/preferences.ts` 同 key）、載入/2s debounce 寫回、本機快取。
- [ ] 圖片：Nuke pipeline（磁碟快取 512MB、`lain.bgm.tv` Referer、downsampling）；`PosterImage`/`StillImage` wrappers + gradient fallback（port `web/src/lib/gradient.ts`）。
- [ ] Shell：`NavigationSplitView` sidebar（首頁/時刻表/探索/搜尋 │ 收藏/歷史 │ 媒體庫/下載/通知 │ 設定）、工具列搜尋、通知鈴 badge；`BackdropLayer` + environment API；頁面 crossfade。
- [ ] Shared：`Shelf`（viewAligned、chevrons、focusSection）、`PosterCard`（hover 延遲 250ms、scale 1.04、lift、▶/資訊、context menu）、`StillCard`（16:9 + 進度條）、`SectionHeader`（標題即連結）。
- [ ] Home：Hero carousel（8s 自動、hover 暫停、←/→、Ken Burns on rest）、繼續觀看 shelf（hover ▶/`…` 移除/標記已看）、今日時刻表 shelf（JST→本地時區）、熱門 grid。
- [ ] Schedule：年/季 + 週天 tabs + 時間軸分組；卡片大小 `@AppStorage`。
- [ ] Discover、Search（篩選 + 無限捲動）、⌘K Command Palette（本地 + 遠端，方向鍵，Return）。
- [ ] AnimeDetail：header、Resume-with-context 按鈕（此期先導向「Phase 2 播放器」stub）、收藏狀態 menu、評分、Episodes grid（進度/有檔/無檔/播出日）、預告片 sheet（WKWebView）、關聯、角色、評論。
- [ ] Collection、History（日期分桶、多選刪除、清空）。
- [ ] Notifications 列表 + WS `notification:new` → 系統通知（`UNUserNotificationCenter`）+ Dock badge。
- [ ] i18n：把 web `messages.po` 中瀏覽相關字串搬進 `.xcstrings`（腳本半自動）。

### Acceptance
- 六個瀏覽頁皆可用；鍵盤可在 shelf 內導覽；Reduce Motion 下無位移動畫；1000 部收藏捲動無掉幀（Instruments）；WS 斷線 10s 內自動恢復。

---

## Phase 2 — Player core（~3 週）

**目標**：mpv 播放器視窗可播 server 任何檔案，進度與 web 互通；預留彈幕 overlay。

### Tasks
- [ ] `MilmilPlayer/CMPVShim`：`shim_wait_event`（攤平 event）、`shim_track_list` / `shim_chapter_list`（`mpv_node` → C struct 陣列）、render helpers。SPM 依賴 `MPVKit`（LGPL product, `from: "1.0.0"`）。
- [ ] `MPVPlayer`：初始化選項表、wakeup → drain queue、~30 個 observed props、`AsyncStream<PlayerEvent>`、命令 API、readiness/teardown gates（`warmStop`/`fullDestroy`）、log 轉 `os.Logger`。
- [ ] `MPVRenderLayer: CAOpenGLLayer` + host `NSView` + `NSViewRepresentable`；live resize `isAsynchronous`；Retina scale；GL context lock 順序文件化。
- [ ] `PlayerState`（`@Observable`, MainActor）100ms 節流；`PlayerController`（每視窗一個）：串流策略（local path → direct → remux → transcode/HLS）、錯誤映射、換集。
- [ ] Player window scene（`WindowGroup(for: PlaybackRequest.self)`，單一實例重用）；標題列透明、全螢幕、aspect lock、記住尺寸/位置；Mini 模式（`.floating` level、固定 16:9、hover 顯示最小控制）。
- [ ] OSC（floating bottom, material, 2.5s 自動隱藏、窄寬降級）、seek bar（hover 放大、thumbnail peek 用 `/stream/{id}/thumbnails` VTT + sprite）、OSD pill、狀態層（loading/buffering/error + retry）。
- [ ] 互動：雙擊全螢幕、滾輪區域 seek/音量、pinch、右鍵 menu；鍵盤：預設表 + `preferences.keyboardBindings` 覆寫 + `?` 面板 + 衝突偵測。
- [ ] 進度：10s 節流 + pause/stop/換集/關窗/退出 + 睡眠前上報；Resume seek + pill；`completed` 門檻 30s。
- [ ] 自動下一集 post-play 卡（倒數 10s）；OP/ED segments 標記/跳過/自動跳；MKV chapters 名稱含 OP/ED 也納入。
- [ ] 字幕：內嵌軌列舉/切換、sidecar 從 server `sub-add`、拖放、雙字幕 `secondary-sid`、`SubtitleStyle` → mpv 選項映射、延遲、自動選軌評分。音訊：軌道、delay、輸出裝置。視訊：aspect/rotate/deinterlace/interpolation/hwdec 狀態。
- [ ] Inspector（右側，可收起 = theater）：集數 grid（點擊換集）、字幕、音訊、視訊 tabs；「彈幕 / 彈幕來源」tab 先放 placeholder。
- [ ] **彈幕預留**：`DanmakuOverlayHost`（空 layer-hosting view 疊在 mpv layer 之上）、`PlaybackClock`（time-pos + host time 插值，給 Phase 3 用）。
- [ ] Now Playing（`MPNowPlayingInfoCenter` 標題/集數/封面/進度）+ 媒體鍵；防睡眠；耳機拔除暫停。
- [ ] Tests：選項映射、串流 fallback 狀態機、進度節流、鍵盤衝突、`PlaybackClock` 插值；UI smoke：開播 → 暫停 → 關窗不 crash。

### Acceptance
- MKV+HEVC+ASS 檔案直播不經 server 轉碼；seek <300ms（local/direct）；web 與 mac 互相看得到對方的進度；記憶體在 4K 播放 1 小時無增長；關窗/換集 50 次無 crash（UI test loop）。

---

## Phase 3 — Danmaku（~2 週，一級功能）

**目標**：與 web 同等以上的彈幕體驗，原生渲染。

### Tasks
- [ ] `MilmilDanmaku`：
  - `DanmakuComment`、`DanmakuSource`；DandanPlay `p` parser；external `{text,time,mode,color}` decoder；local-sent。
  - `DanmakuPipeline`：merge → convert（SwiftyOpenCC s2t/t2s）→ filters（mode、keyword、`/regex/`）→ thinning（6s 視窗，low 20 / medium 50 / high 80 / unlimited）→ `DanmakuTimeline`（sorted, binary search）。
  - `LaneScheduler`：scroll lanes 碰撞規則、top/bottom 4s lanes、area/antiSubtitle 限制、溢出策略、seek re-seed。
  - Tests：parser 邊界（缺欄位、顏色溢位、mode 6）、thinning 視窗計數、scheduler 無重疊（property-based：隨機 1000 條，驗證任一時刻同 lane 不交疊）、seek 重 seed 的部分位移。
- [ ] Endpoints：`danmaku/{fileId}` GET/POST（POST shape `{time,mode,color,comment}`）、`danmaku/external/*`；磁碟快取 6h。
- [ ] `DanmakuOverlayView`（app）：容器 layer `speed`/`timeOffset` 對應暫停/倍速；CoreText rasterizer（字體/粗體/描邊/陰影/顏色/透明度/Retina）+ `NSCache`；`CABasicAnimation` 行進；`displayLink` tick 驅動 scheduler；視窗 resize 重算 lanes；Reduce Motion 模式（固定淡入淡出）。
- [ ] OSC：彈幕開關（動畫 icon）、計數、輸入框（optimistic 顯示 + POST，失敗 toast）、設定 popover（所有 web 同名 key、即時預覽）。
- [ ] Inspector「彈幕」tab：列表、目前位置高亮跟隨、click-to-seek、搜尋、右鍵加入封鎖詞、來源標籤。
- [ ] Inspector「彈幕來源」tab：sources → search（預填「標題 第N話」）→ parts → import → save toggle → remove；匯入後即時合併。
- [ ] 快捷鍵：`d` 開關、`Shift+D` 設定、`Cmd+Return` 聚焦輸入。
- [ ] Perf：Instruments 驗證 M1 300 同屏 60fps、空閒 CPU <3%；若不達標 → 啟動 Metal glyph-atlas 備案。

### Acceptance
- 同一集在 web 與 mac 顯示的彈幕集合一致（相同 density/filters）；暫停時彈幕凍結、倍速時同步加速；seek 後 200ms 內畫面重建且無重疊；發送的彈幕立即出現並在重新載入後仍存在（server 端已收）。

---

## Phase 4 — Desktop-native extras（~1.5 週）

- [ ] Local path mapping 設定頁（server 前綴 ↔ 本機掛載；檔案存在檢查；依賴 §11 server 變更）。
- [ ] 拖放：magnet/`.torrent` 到視窗/Dock → `POST /downloads`（選 library）；字幕檔到播放器。
- [ ] URL scheme `milmil://anime/<id>`、`milmil://watch/<id>?ep=`；web 端「在 App 開啟」按鈕（獨立小 PR）。
- [ ] Anime4K：bundle MIT GLSL，Fast/Balanced/HQ 預設組 + 自訂 shader 鏈；依 GPU 自動建議。
- [ ] yt-dlp（可選，不隨 app 打包）：設定頁一鍵下載到 `~/Library/Application Support/milmil/yt-dlp` + 自動 `-U`；有則 mpv `ytdl=yes` 直接播 YouTube 預告片（hero 停留預覽、詳情頁）與「開啟 URL」；無則預告片以瀏覽器開啟。
- [ ] 截圖（含/不含字幕與彈幕）到剪貼簿/`~/Pictures/milmil`；GIF（ffmpeg）v1.x。
- [ ] 發佈：CI 產 ad-hoc 簽名 DMG（無 Developer Team 期間）；Sparkle/公證/Homebrew cask 待帳號就緒後補。
- [ ] Menu bar extra（Now Playing + 下載進度）— 可延後到 v1.x。

### Acceptance
- 乾淨機器下載 DMG → 右鍵開啟可用（未公證）；NAS 掛載情境 seek 即時且 server log 無串流請求。

---

## Phase 5 — Management screens（~2 週）

- [ ] Libraries：列表（容量/掃描狀態/連線）、新增/編輯（本機 + SMB/SFTP/WebDAV/S3/rclone 來源表單、資料夾選擇、連線測試）、掃描（WS 進度）、media-files 表（`Table`，可排序/篩選/分頁、match/unmatch、bulk）、Match sheet（兩步：搜尋作品 → 選集）、重複檔案、缺集摘要、rename 規則 + 預覽/套用/undo。
- [ ] Downloads：grouped 卡片、per-episode rows、暫停/繼續/刪除（含檔案）、清空、新增（URL/magnet）、torrent 搜尋（providers 選擇）+ 一鍵訂閱（`POST /subscribe`）；RSS feeds CRUD + 預覽 + 規則編輯器（regex/解析度/字幕組/集數範圍）。
- [ ] Settings（`Settings` scene，原生 `Form`）：General（語言/週起始/自動加入收藏）、Server（profiles、token 管理、sessions）、Player（預設/buffer/hwdec/Anime4K/local mappings）、Danmaku、Subtitles（樣式預覽 + presets）、Keyboard（重綁 + 衝突）、Integrations（Bangumi/AniList OAuth 經瀏覽器回跳 URL scheme、Trakt device-code 原生流程、TMDB key）、Notifications（providers/events/test）、Account（改密碼、2FA）、About（版本/更新檢查/致謝與授權）。
- [ ] Audit/undo：設定頁內「最近變更」+ 一鍵 undo（`POST /audit/undo`）。

### Acceptance
- 常見管理流程（新增本機 library → 掃描 → 手動匹配 → 播放）全程不離開 App；偏好變更在 web 即時反映。

---

## Phase 6 — v1.x / v2 候選（不排程）

Spotlight 索引、App Intents/Shortcuts、WidgetKit、真 PiP（SW render + `AVSampleBufferDisplayLayer`）、AirPlay、離線下載、播出提醒、線上字幕 provider、Metal 彈幕渲染器、Sparkle/公證（待 Developer Team）。

---

## 跨期事項

- **Server/web 小 PR（可平行，另開 branch）**：`playable-episodes.media_file.path`；`danmaku/{fileId}` 回 `episode_id`；修 `DanmakuBar.tsx` 送錯 shape；更新 openapi.json `WatchProgress`；確認 preferences 透傳未知 key。
- **Commit 規範**：`feat(macos): …` / `fix(macos): …`；release-please 加 `macos` package。
- **每期 gate**：`swift-format lint` 0 findings、`xcodebuild test` 綠、`swiftui-pro` / `swift-concurrency-pro` skill 審查 PR diff。
- **風險**
  1. `CAOpenGLLayer` 已 deprecated 但仍可用（IINA 現況）；緩解：render layer 介面最小化，預留 SW render 路徑。
  2. MPVKit universal 二進位體積（~150MB）；緩解：接受，Sparkle delta 更新。
  3. 彈幕 CA 方案在極端密度（>500 同屏）可能掉幀；緩解：density 上限 + Metal 備案。
  4. Bangumi CDN Referer/防盜鏈；緩解：Nuke request 加 header，失敗用 gradient fallback。
  5. 單帳號 server：多 profile 只解決多 server，不解決多人；記錄為 server 未來議題。

---

## 進度（2026-08-23）

- **Phase 0 / 1 完成**：scaffold、MilmilKit（API + Realtime + preferences）、Shell、Home、Schedule、Discover、Search、⌘K、AnimeDetail、Collection、History、Notifications（含系統通知 + Dock badge）。**未做**：`.xcstrings` i18n 搬移（字串仍為 zh-TW 字面值，另開一輪）。
- **Phase 2 核心完成**（commits `2eef89fc`、`9a0ebf5a`）：`MilmilPlayer` 套件（MPVKit 1.0.0、純 Swift 綁定，暫不需 C shim）、in-app 播放頁（`Route.watch`，對齊 web WatchPage：劇院模式 / 沉浸全螢幕 / 側欄 = inspector）、獨立視窗 pop-out（同一個 render view 搬移）、OSC / OSD / seek bar thumbnail peek、字幕 sidecar、進度同步、Resume pill、自動下一集、OP/ED skip、Now Playing、防睡眠、快捷鍵表（與 web rebind 共用）。
  - **未做**：本機路徑直開（需 server 回 `media_file.path`）、thumbnail VTT 驗證（server 端需有 sprite）、A-B loop UI、截圖到剪貼簿、音訊輸出裝置、Anime4K shaders、UI smoke loop（50 次換集）。
  - **驗證方式**：ffmpeg 測試片 + 本機 OrbStack server，`MILMIL_SNAPSHOT_PLAY` 截圖（見 `macos/AGENTS.md`）。
- **Phase 3 核心完成**（commits `fd71b1d6`、`b0463ac0`）：`MilmilDanmaku`（parser / pipeline / LaneScheduler，11 tests 含隨機不重疊驗證）、`DanmakuLayerView`（CA 渲染、暫停/倍速用 layer speed、seek 重 seed）、compose bar、Inspector 彈幕 / 來源 tabs、設定 popover（全部 web 同名 key）、SwiftyOpenCC 轉換。
  - **未做**：磁碟快取 6h、Instruments 效能驗證（300 同屏）、Reduce Motion 只做了靜態化 fallback、`/regex/` 封鎖詞 UI 已支援但無即時預覽計數。
- **下一步**：audit 修正 → Phase 4（桌面加值：本機路徑直開、Dock/Menu bar、快捷鍵設定頁、截圖到剪貼簿）與 Phase 5（管理頁）。
