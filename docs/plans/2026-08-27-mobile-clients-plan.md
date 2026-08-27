# milmil for iOS / Android — Implementation Plan

> 狀態：未動工
> 日期：2026-08-27
> 設計：`2026-08-27-mobile-clients-design.md`

## 排序決定（2026-08-27）

**Android 行先，iOS 押後。**

唔係因為 Android 平啲做——恰恰相反，Android 係由零寫，iOS 有七成核心已經存在。
係因為 **iOS 派唔出去**：冇 Apple Developer 帳號（US$99/年）就冇 TestFlight，
而 TestFlight 係唯一一條可以公開派嘅路。寫得快但入唔到用家部機嘅嘢，唔值得行先。

連帶影響：
- macOS DMG 繼續 ad-hoc 簽章、未公證 —— `docs-site` 嗰段 Gatekeeper 指示要留住。
- iOS 用家喺 v1 期間行 PWA「加入主畫面」頂住。
- 一開到 Apple 帳號，Phase 5 就可以即刻起動，設計唔使改。

---

## Phase D — Design review（進 Phase 0 之前）

用 Claude Design canvas 出 artboard：首頁、時間表、探索、搜尋、收藏、詳情、播放頁、
配對流程。手機同 macOS 唔可以照搬版面 —— 觸控目標、單手可達範圍、直/橫向切換都要定案。

**Acceptance**：8 張 artboard 定稿，播放頁連橫向全螢幕態一齊出。

---

## Phase 0 — Scaffold & 契約（~1 週）

呢期唔寫 UI，先鎖死三端行為一致。

### Tasks
- `android/` Gradle KTS + Version Catalog，Compose、Ktor、kotlinx.serialization、Media3。
- **API 對照表**：由 `web/src/lib/api/*.ts` 抽一份端點清單，Kotlin 端命名逐一對齊
  （`macos/AGENTS.md` 第 4 條）。呢份表同時係將來 iOS 嘅驗收依據。
- `core/api`：APIClient、`mlml_` token、`@LenientBool`（`0|1`）同雙格式日期解碼器對等實作。
- 憑證：EncryptedSharedPreferences（Keystore）。
- 登入 + 二步驗證流程；登入端點限流 0.2 req/s、burst 10，收 429 要退避。

### Acceptance
- 對住本機 dev stack（`127.0.0.1:18080`）登入成功，token 存入 Keystore，重開 app 仲喺登入態。
- API 解碼單元測試涵蓋 `0|1` 布林、兩種日期格式、`genres` JSON string。

---

## Phase 1 — 配對與瀏覽（~2 週）

### Tasks
- **配對**：`milmil://` intent-filter + CameraX/ML Kit 掃碼，掃完直接連線。
  （Web 端 `milmil://pair?url=…&token=…` 已經喺主 checkout 做緊。）
- **LAN 自動探索**：聽 UDP 7359 嘅 Jellyfin discovery 廣播，同一個 Wi-Fi 自動列出伺服器。
- 首頁（Hero 輪播、今日時間表、熱門）、時間表、探索、搜尋、收藏。
- 詳情頁：主視覺、分集列表、角色、預告。
- 圖片載入同磁碟快取；返轉頭要由快取即刻上畫（唔好翻白）。

### Acceptance
- 全新安裝 → 掃 QR → 見到首頁，全程一個字都唔使打。
- 同一個 Wi-Fi 唔掃 QR 都搵到伺服器。
- 六個分頁同 Web 嘅資訊架構對得上。

---

## Phase 2 — 播放核心（~3 週）

### Tasks
- `PlaybackEngine` 介面 + `capabilities: Set<Capability>`（AssSubtitles、MultiAudioTrack、
  Screenshot…）。**由第一日就要有**，唔好等到換引擎先加。
- Media3/ExoPlayer 實作；硬解。
- 串流階梯：`direct → remux → hls`（手機 v1 冇 offlineCopy / localFile）。
  失敗要沿階梯落，同 macOS `StreamFallback` 行為一致。
- 播放頁：OSC、拖曳進度、速度、字幕/音軌切換、分集列表。
- `MediaSession` + 後台播放 + 鎖屏控制；系統畫中畫。
- 進度回寫（同 macOS 一樣嘅節流策略）。

### Acceptance
- 直接串流播到，斷網重連唔會死。
- 熄屏 / 切後台繼續播，鎖屏見到標題同集數。
- **要有數字**：`estimated-vf-fps`、掉幀計數入到 log，訂低預算，唔可以只憑「睇落順」。
- ASS 字幕實測：如果 Media3 表現唔可接受，即刻觸發 §未決 嘅 libmpv 決定。

---

## Phase 3 — 彈幕（~2 週，一級功能）

### Tasks
- 由 `MilmilDanmaku` 移植 LaneScheduler 落 Kotlin，**連單元測試一齊移植**
  （兩端行為對得上先算移植完）。
- Compose Canvas / 硬體加速 View 渲染；滾動、頂部、底部三種。
- 設定：字型大小、透明度、速度、顯示區域。
- 劇透防護：沿用 macOS `DanmakuSpoilerGuard` 嘅邏輯（遮住講後面集數嘅留言）。
- **密度分級自適應**：低階 500 / 中階 1000 / 高階 2000，按裝置能力封頂。

### Acceptance
- 移植過去嘅 LaneScheduler 測試全綠。
- 中階機 1000 條彈幕維持 60fps，掉幀計數入 CI 做迴歸關卡。

---

## Phase 4 — 發佈（~1 週）

### Tasks
- Release 簽名（keystore 入 GitHub Secrets）。
- `release-android.yml`：tag `v*` → 出 APK + AAB → 掛上 GitHub Release。
- 版本號同 release-please 嘅 tag 對齊（跟 `release-macos.yml` 嘅做法）。
- F-Droid 上架評估（要求 reproducible build，可能要調整依賴）。
- `docs-site` 加 `getting-started/android.mdx`，四個語系齊。

### Acceptance
- 打一個 tag，GitHub Release 自動出到可以裝嘅 APK。
- 文件企得住：由零到播到片，唔使問人。

---

## Phase 5 — iOS（開到 Apple 帳號先啟動）

工作量比上面細好多，因為核心已經存在。

### Tasks
- `MilmilKit/Package.swift`：`platforms: [.macOS(.v15), .iOS(.v17)]`。
  `MilmilAPI` / `MilmilRealtime` / `MilmilDanmaku` 應該即刻編到 —— 三個模組都冇 UI import。
- `MilmilPlayer` 拆渲染層：
  `Render/MPVRenderLayer+macOS.swift`（`CAOpenGLLayer`）／`+iOS.swift`（`CAMetalLayer`）。
  **呢步對 macOS 都有好處**：渲染層一拆乾淨，今次撞到嗰種「引擎能力唔明」嘅問題會容易睇得多。
- `ios/` XcodeGen + SwiftUI app target，引用 **同一個** 本地 package，唔好複製。
- 畫面照 Phase 1–3 已經定稿嗰套實作。
- TestFlight 發佈（build 90 日到期，要排定期重傳）。

### Acceptance
- iOS 同 Android 對住同一部伺服器，行為一致（用 Phase 0 嗰份 API 對照表驗）。

---

## 跨期事項

- **唔好複製 MilmilKit**：iOS app target 引用 `../macos/Packages/MilmilKit`，一改兩邊都改到。
- **三端不變式**（設計文件 §4.3）：串流階梯次序、`mlml_` token 永不過期（401 = 已撤銷）、
  `0|1` 布林、雙格式日期、登入限流。
- **偏好設定共用同一組 JSON key**，三端先至唔會各自為政。
- Commit 用 Conventional Commits，scope 開 `android` / `ios`（跟 `macos` 嘅做法）。
- CI 唔可以有「僅供參考」嘅步驟 —— 加乜 job 就要 block merge。

---

## 未決事項

- **Android 播放引擎**：v1 Media3 係為咗快。Phase 2 實測 ASS 字幕之後要落決定：
  接受，定係提早搬 libmpv（介面已經預留）。
- **離線下載**：手機儲存緊絀過桌面，配額策略要重新諗，v1 唔做。
- **F-Droid**：reproducible build 嘅要求可能同 Media3 嘅預編譯依賴有衝突，要驗。
