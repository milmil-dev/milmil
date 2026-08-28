# 手機端功能對齊追蹤

> 目標（2026-08-28 定）：**iOS 同 Android 對齊 Web 同 macOS 嘅全部功能，逐項真機 e2e 驗過先算完成。**
> 設計：`2026-08-27-mobile-clients-design.md`；分期：`2026-08-27-mobile-clients-plan.md`

呢份係驗收清單，唔係計劃書。每一行嘅「完成」定義係：**功能喺真機／模擬器上行過一次，
唔係「編譯到」**。截圖同驗證方法寫喺對應嘅 commit 入面。

## 記分方式

- ✅ 做完並且真機驗過
- 🚧 寫咗但未驗
- ⬜ 未做
- ➖ 唔適用（平台上冇意義）

## 導覽同頁面

| 功能 | Web | macOS | Android | iOS |
|---|---|---|---|---|
| 配對 / 登入 | ✅ | ✅ | ✅ | ✅ |
| 首頁書架 | ✅ | ✅ | ✅ | ✅ |
| 時間表 | ✅ | ✅ | ✅ | ✅ |
| 探索 | ✅ | ✅ | ✅ | ✅ |
| 搜尋 | ✅ | ✅ | ✅ | 🚧 |
| 收藏 | ✅ | ✅ | ✅ | ✅ |
| 詳情頁 | ✅ | ✅ | ✅ | ✅ |
| 播放頁 | ✅ | ✅ | ✅ | ✅ |
| 歷史 | ✅ | ✅ | ✅ | ✅ |
| 媒體庫管理 | ✅ | ✅ | ✅ | ✅ |
| 下載 / 種子 | ✅ | ✅ | ✅ | 🚧 |
| 通知 | ✅ | ✅ | ✅ | ✅ |
| 設定 | ✅ | ✅ | ✅ | ✅ |
| 帳戶（唯讀）| ✅ | ✅ | ✅ | ✅ |

## 播放

| 功能 | Web | macOS | Android | iOS |
|---|---|---|---|---|
| 串流階梯 direct → remux → HLS | ✅ | ✅ | ✅ | ✅ |
| 續播（三端共用進度） | ✅ | ✅ | ✅ | ✅ |
| 進度回寫 | ✅ | ✅ | ✅ | ✅ |
| 前後跳 10 秒 | ✅ | ✅ | ✅ | ✅ |
| 下一集 | ✅ | ✅ | ✅ | ⬜ |
| 全螢幕 / 橫向沉浸 | ✅ | ✅ | ✅ | 🚧 |
| 字幕軌切換 | ✅ | ✅ | ✅ | ⬜ |
| 音軌切換 | ✅ | ✅ | ✅ | ⬜ |
| 播放速度 | ✅ | ✅ | ✅ | ⬜ |
| 彈幕 | ✅ | ✅ | ✅ | 🚧 |
| 畫中畫 / 背景播放 | ➖ | ➖ | ⬜ | 🚧 |
| 鎖屏控制（MediaSession） | ➖ | ✅ | ⬜ | ⬜ |
| 截圖 | ➖ | ✅ | ➖ | ⬜ |

## 已知差距（唔止「未做」，係要記住點解）

- **ASS 字幕**：Media3 淨係畫到文字，樣式掉晒。`PlaybackEngine.capabilities` 由第一日就
  暴露呢件事，換 libmpv 嗰陣唔使改任何一個畫面。
- **彈幕鋪滿成個畫面**，唔淨係影片嗰格。橫向手機一定有黑邊，而主流手機彈幕播放器
  都係鋪滿全螢幕——如果之後決定要跟 Web／macOS 咁只鋪影片區，改 Canvas 嘅 modifier 就得。
- **冷啟動連線**：重裝之後第一次入 app 要 ~15 秒（Keystore 初始化）。而家有 12 秒 timeout
  同一個「再試一次」，唔會再無限轉圈。
- **帳戶／2FA**：Android 設定入面淨係睇到登入咗邊個同解除配對。改密碼、開 2FA 呢類嘢
  留喺 Web，因為手機端冇一個做得比 Web 好嘅理由。
- **iOS 派唔到街**：冇 Apple Developer 帳號就冇 TestFlight。功能照做，但「發佈」呢欄
  要等帳號。
- **iOS v1 用 AVPlayer，唔係 libmpv**。`MilmilPlayer` 嘅渲染層係 `CAOpenGLLayer`，
  macOS 專用；要拆開先搬得到 iOS。`PlaybackEngine` 協定同 `capabilities` 由第一日就
  擺喺度，所以將來換引擎唔使改任何一個畫面——同 Android 用 Media3 嘅理由一樣。
- **iOS 橫向未驗到**：`requestGeometryUpdate` 喺 Simulator 唔一定生效（真機先算數）。
  Info.plist 已經容許橫向，用家自己轉都得。
- **`idb` 讀到 iOS 嘅 accessibility tree 但撳唔到**（Xcode-beta 冇 SimulatorKit），
  所以 iOS Debug 版有 `MILMIL_TAB` / `MILMIL_ANIME` / `MILMIL_MORE` / `MILMIL_PLAY`
  導航 hook，就好似 macOS 嘅 `MILMIL_SNAPSHOT_*`。

## 驗證方法（唔好靠肉眼估）

- Android：`adb -s emulator-5554` 裝 debug APK，用真 `milmil://pair` link 入場，
  逐個畫面截圖；播放要對住伺服器 `GET /api/v1/progress/file/{id}` 查進度真係寫到。
- iOS：Debug 版有 `MILMIL_PAIR_LINK`（macOS `MILMIL_SNAPSHOT_*` 嘅孖生），
  因為 iOS 26 會喺 `simctl openurl` 前彈一個擋住自動化嘅確認框。
- **靜態截圖睇唔到掉幀**：播放流暢度要睇數字，唔可以淨係「睇落順」。
