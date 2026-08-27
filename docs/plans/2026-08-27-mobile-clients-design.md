# milmil for iOS / Android — 原生行動客戶端設計

> 狀態：Android Phase 0 已完成；iOS 共用核心已驗證
> 日期：2026-08-27
> 相關：`2026-08-23-macos-client-design.md`、`2026-08-23-macos-client-plan.md`

## 0. 一句話

用 SwiftUI 同 Jetpack Compose 各做一個原生客戶端；iOS 直接重用 macOS 已經寫好嘅
`MilmilKit`，Android 由零寫一份對等嘅 Kotlin 核心。

---

## 1. 現況盤點（決定咗成個計劃嘅形狀）

動工之前先量度咗現有 code 可以搬幾多。結論係 **iOS 同 Android 唔係對稱嘅工作量**。

### 1.1 iOS 幾乎係「移植」

`macos/Packages/MilmilKit/Sources/` 入面 **完全冇** `import AppKit` / `import SwiftUI` /
`import Cocoa`。`macos/AGENTS.md` 第 3 條核心規則（「Keep `MilmilAPI` platform-neutral」）
一直有守住，所以：

| 模組 | iOS 可用性 |
|---|---|
| `MilmilAPI`（client、models、Keychain） | ✅ 已驗證（2026-08-27）—— 要改兩處，見下 |
| `MilmilRealtime`（WebSocket 事件） | ✅ 已驗證，零改動 |
| `MilmilDanmaku`（LaneScheduler，有單元測試） | ✅ 已驗證，零改動 |
| `MilmilPlayer` | ⚠️ 引擎層可搬，`MPVRenderLayer` 用 `CAOpenGLLayer`（macOS only）要換 |

MPVKit 本身已經出 `ios-arm64` slice（睇 `Libavcodec.xcframework` 嘅目錄），所以 libmpv
喺 iOS 係行得通嘅，只係渲染層要由 `CAOpenGLLayer` 換成 Metal（`CAMetalLayer` / `MTKView`）。

**估算：iOS v1 有七成核心 code 已經存在。**

**已實測（2026-08-27）**：`platforms:` 加咗 `.iOS(.v18)` 之後，三個 target 全部
`xcodebuild -destination 'generic/platform=iOS'` 通過。實際要改嘅只有兩處：

1. **最低版本定咗 iOS 26。** 技術下限其實係 18（`TokenStore` 用
   `Synchronization.Mutex`，iOS 18+），但設計係 Liquid Glass，客戶端要用真正嘅
   `glassEffect` API，唔係好似 macOS 咁行 availability shim（`GlassStyles.swift`
   為咗支援 macOS 15 先要 shim）。`.iOS(.v26)` 喺現時 SwiftPM 未開放，要寫
   `.iOS("26.0")`。
2. **`DeviceName.current()`** 用咗 `Foundation.Host`（macOS 專有），而且字串寫死
   "milmil for macOS"。改成 `#if os(macOS)` 分支；iOS 用 `ProcessInfo.hostName`，
   唔用 UIKit —— `MilmilAPI` 要保持無 UI framework，呢條規則就係令共用成立嘅原因。

macOS 全部 gate（lint / 62 個測試 / build）改完之後照樣綠。

### 1.2 Android 係「重寫」

冇任何 Swift code 可以過去。要重新實作嘅有：API client、Keychain 對等（EncryptedSharedPreferences /
Keystore）、realtime、彈幕排程、播放器整合、成套 UI。

**估算：Android v1 係完整一份新客戶端。**

### 1.3 分發現實（同工作量相反）

| | iOS | Android |
|---|---|---|
| 公開分發 | ❌ 冇正路 | ✅ APK 直出 / F-Droid |
| 實際途徑 | TestFlight（$99/年、build 90 日到期、首次要過 Beta Review） | GitHub Releases |
| 阻塞條件 | 要 Apple Developer 帳號（同 macOS 公證共用） | 冇 |

**即係話：iOS 寫得快但派唔到，Android 寫得慢但派得到。** 呢個張力係下面排序嘅根據。

---

## 2. 目標與非目標

### 目標（v1）

1. 睇得到、播得到：媒體庫、探索、時間表、詳情、播放（含彈幕）。
2. 對齊 Web 嘅頁面同流程（跟 macOS 客戶端同一條原則：先鏡射 Web，再加平台特性）。
3. 一次配對，唔使打字 —— 直接食 `milmil://pair` QR（見 §6）。
4. 手機專屬：後台播放、鎖屏控制、系統畫中畫。

### 非目標（v1）

- 種子搜尋、RSS 規則編輯、媒體庫管理（呢啲留喺 Web / macOS，手機screen細，唔值得）。
- 離線下載（v2；先確定播放同彈幕穩陣）。
- 平板 / TV 版面（v2）。
- Windows（喺 macOS 上開發 WinUI 3 唔現實，已擱置）。

---

## 3. 技術決策

| | iOS | Android |
|---|---|---|
| 語言 | Swift 6（strict concurrency，同 macOS 一致） | Kotlin 2.x |
| UI | SwiftUI | Jetpack Compose + Material 3 |
| 最低版本 | **iOS 26**（見下）| Android 8.0 (API 26) |
| 網路 | `MilmilAPI`（直接重用） | Ktor Client + kotlinx.serialization |
| 憑證 | Keychain（`MilmilAPI` 已有） | EncryptedSharedPreferences（Keystore 支撐） |
| 播放引擎 | libmpv（MPVKit iOS slice） | Media3/ExoPlayer → 之後可換 libmpv |
| 彈幕 | `MilmilDanmaku` + `CALayer` overlay | Kotlin 移植 LaneScheduler + Compose Canvas |
| 狀態 | `@Observable` | ViewModel + StateFlow |
| 建置 | XcodeGen（同 macOS 一致） | Gradle KTS + Version Catalog |

### 3.1 為何 Android v1 用 Media3 而唔係 libmpv

Media3/ExoPlayer 係平台原生、硬解穩、後台播放同 `MediaSession` 開箱即用，可以最快見到嘢。
代價係 **ASS 字幕樣式支援好弱**，而動畫字幕好依賴 ASS。

所以做法係：**由第一日就將播放器藏喺介面後面**，v1 用 Media3，v2 換 libmpv 而唔使改 UI。

呢個決定直接由今次 macOS 嗰個 bug 學返嚟：MPVKit 嘅 FFmpeg 冇任何靜態圖片編碼器，
`screenshot-to-file` 對每個用家、每一次都靜靜失敗，因為 code 入面冇「呢個後端到底做唔做得到乜」
呢個概念。所以介面上要有能力查詢：

```kotlin
interface PlaybackEngine {
    val capabilities: Set<Capability>   // AssSubtitles, MultiAudioTrack, Screenshot, …
}
```

iOS 直接用 libmpv（因為 `MilmilPlayer` 嘅引擎層已經寫好，唔使慳），但同樣要暴露 `capabilities`。

---

## 4. 共用核心策略

### 4.1 iOS：擴張 MilmilKit，唔好複製

```diff
- platforms: [.macOS(.v15)],
+ platforms: [.macOS(.v15), .iOS("26.0")],
```

規矩維持唔變：**`MilmilAPI` 唔准 import 任何 UI framework**。iOS app target 放 UI 型別，
就好似 `macos/Milmil/` 咁。

`MilmilPlayer` 拆成：

```
MilmilPlayer/
  Core/          MPVPlayer、MPVOptions、StreamFallback、PlaybackClock   ← 跨平台
  Render/
    MPVRenderLayer+macOS.swift   CAOpenGLLayer      (#if os(macOS))
    MPVRenderLayer+iOS.swift     CAMetalLayer       (#if os(iOS))
```

### 4.2 Android：對等，唔係翻譯

Kotlin 端唔好逐行照譯 Swift。要守嘅係 `macos/AGENTS.md` 第 4 條：
**端點包裝命名對齊 `web/src/lib/api/*.ts`，偏好設定共用同一組 JSON key。**
咁三個客戶端就算實作唔同，行為都一致。

### 4.3 三端共用嘅不變式

- 串流階梯次序一致：`offlineCopy → localFile → direct → remux → hls`
- `mlml_` token 永不過期；401 = 已撤銷 → 掉咗佢，顯示登入
- 布林值由 SQLite 出嚟係 `0|1`；日期有 RFC 3339 同 `yyyy-MM-dd HH:mm:ss` 兩種
- 登入端點限流 0.2 req/s（burst 10）——收到 429 要退避，唔好輪詢

---

## 5. 畫面清單（v1）

跟 Web 嘅資訊架構，唔好另起爐灶：

| 分頁 | 內容 |
|---|---|
| 首頁 | Hero 輪播、今日時間表、熱門 |
| 時間表 | 逐日新番 |
| 探索 | 熱門、分類篩選、本季 |
| 搜尋 | 全文 + 本地媒體庫 |
| 收藏 | 觀看狀態、評分 |
| 播放頁 | 播放器 + 彈幕 + 分集列表 |

導覽：iOS `TabView`；Android `NavigationBar`（底部）。詳情頁一律 push，唔用 modal。

---

## 6. 配對（唔使打字）

主 checkout 嗰邊已經做緊 `milmil://pair?url=…&token=…&name=…`：Web 設定頁出一個 QR，
`SessionStore.pair(name:url:token:)` 收咗就直接連線，跳過登入畫面。

**手機係呢個功能真正嘅受眾** —— macOS 唔會攞部 Mac 去掃 QR，但手機會。所以：

- iOS / Android 都要註冊 `milmil://` scheme（Android 用 intent-filter）。
- 兩邊都要內建掃碼器（iOS `AVCaptureMetadataOutput`；Android CameraX + ML Kit Barcode）。
- 掃完即刻連線，一步都唔使打字。

### 6.1 LAN 自動探索：Docker 部署下行唔通（2026-08-27 實測）

原本計劃寫住「伺服器已經喺 UDP 7359 廣播 Jellyfin discovery，手機同一個 Wi-Fi
自己搵到，連 QR 都慳埋」。實測之後呢句要收回：

- `docker-compose.yml` **從來冇 publish UDP 7359**（只有 `${API_PORT}:8080`），
  所以 responder 雖然喺容器入面行緊，但外面完全接觸唔到。
- 就算補上 `7359:7359/udp` 都仲係唔夠：探索靠客戶端向 `255.255.255.255` 廣播，
  而 Docker bridge 嘅 NAT 唔會轉發廣播封包。要真正行得通就要 `network_mode: host`
  （只限 Linux），或者客戶端已經知道伺服器 IP —— 但知道 IP 就唔使探索。

**影響唔止手機：**Web 設定頁而家對 Docker 用家展示緊一個實際上冇效嘅 Jellyfin
discovery 功能。

**結論：** v1 唔好靠 LAN 探索。QR 配對係主路徑（本身就唔使打字），手動輸入地址做後備。
探索留返做 v2，而且要先喺伺服器嗰邊解決 host networking 嘅問題。

---

## 7. 彈幕

`MilmilDanmaku` 嘅 LaneScheduler 係純運算 + 有單元測試，iOS 直接用，Android 照住移植
（連測試一齊移植，兩邊行為先至對得上）。

渲染：iOS 用 `CALayer` overlay（同 macOS 一樣）；Android 用 Compose Canvas 或者
`SurfaceView` 上面一層硬體加速 View。

手機要加嘅：**密度分級自適應**。跟 NipaPlay 嗰份 GPU 彈幕設計文件嘅諗頭，按裝置能力
封頂（低階 500 / 中階 1000 / 高階 2000），唔好用一個死上限——手機發熱同掉幀比桌面敏感好多。

驗收標準要有數字，唔可以「睇落順」：用同 macOS 一樣嘅計數器（`estimated-vf-fps`、
`frame-drop-count`）訂預算，入 CI 做迴歸關卡。

---

## 8. 專案結構

```
ios/
  project.yml                XcodeGen（同 macos/ 一致）
  Milmil/                    app target（UI）
  # Packages 唔重複：直接引用 ../macos/Packages/MilmilKit

android/
  settings.gradle.kts
  app/                       Compose UI
  core/
    api/                     Ktor client（對齊 web/src/lib/api）
    realtime/                WebSocket
    danmaku/                 LaneScheduler 移植 + 測試
    player/                  PlaybackEngine 介面 + Media3 實作
```

`MilmilKit` **唔好複製一份落 `ios/`** —— 兩個 app target 引用同一個本地 package，
一改就兩邊都改到，唔會走樣。

---

## 9. 建議次序

工作量同分發能力係相反嘅，所以：

1. **先做 iOS**。七成核心已經存在，可以最快驗證「共用核心」呢個假設係咪成立；
   而且過程中會逼 `MilmilPlayer` 拆乾淨渲染層，呢件事本身對 macOS 都有好處。
   分發用 TestFlight（要開 Apple 帳號——反正 macOS 公證都要）。
2. **再做 Android**。有咗 iOS 定下嘅畫面清單同 API 對照表，Kotlin 端就係照住實作，
   唔使再做設計決策。分發完全冇阻力。

如果 Apple 帳號一時開唔到，就掉轉：先做 Android 攞到「真係派得出去」嘅成果，
iOS 等帳號。兩條路嘅設計都唔使改。

---

## 10. 未決事項

- **Android 播放引擎**：v1 Media3 係為咗快，但 ASS 字幕弱。如果試玩之後覺得字幕唔可接受，
  就要提早搬 libmpv——介面已經預留咗。
- **離線下載**：macOS 版有磁碟配額同 manifest 端點；手機儲存更緊絀，配額策略要重新諗。
- **iOS 後台下載**：`URLSession` background transfer 同 macOS 嗰套邏輯唔一樣，要另外設計。
