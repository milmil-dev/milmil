<p align="center">
  <img src="web/public/icons/icon-512.png" width="120" alt="milmil logo" />
</p>

<h1 align="center">milmil</h1>

<p align="center">
  你自己嘅動畫媒體伺服器<br/>
  <sub>媒體庫管理、新番日曆、動畫熱度、彈幕播放</sub>
</p>

<p align="center">
  <a href="https://github.com/milmil-dev/milmil/releases"><img src="https://img.shields.io/github/v/release/milmil-dev/milmil?style=flat-square&color=blue" alt="Release" /></a>
  <a href="https://github.com/milmil-dev/milmil/blob/main/LICENSE"><img src="https://img.shields.io/github/license/milmil-dev/milmil?style=flat-square" alt="License" /></a>
  <a href="https://github.com/milmil-dev/milmil/stargazers"><img src="https://img.shields.io/github/stars/milmil-dev/milmil?style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/milmil-dev/milmil/actions"><img src="https://img.shields.io/github/actions/workflow/status/milmil-dev/milmil/ci.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://hub.docker.com/r/milmil/milmil-api"><img src="https://img.shields.io/docker/pulls/milmil/milmil-api?style=flat-square&label=Docker%20Pulls" alt="Docker Pulls" /></a>
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文（台灣）</a> | 粵語
</p>

<p align="center">
  <a href="#功能">功能</a> &bull;
  <a href="#睇下個樣">睇下個樣</a> &bull;
  <a href="#點樣開工">點樣開工</a> &bull;
  <a href="#點樣部署">點樣部署</a> &bull;
  <a href="#設定">設定</a> &bull;
  <a href="#開發">開發</a> &bull;
  <a href="#授權">授權</a>
</p>

---

## 睇下個樣

<p align="center">
  <img src="docs/screenshots/home.png" width="800" alt="首頁 — 精選輪播、今日時刻表、熱門排行" />
</p>

<p align="center">
  <img src="docs/screenshots/discover.png" width="800" alt="探索 — 而家熱門、類型篩選" />
</p>

<p align="center">
  <img src="docs/screenshots/schedule.png" width="800" alt="新番日曆 — 按星期排嘅當季動畫" />
</p>

<p align="center">
  <img src="docs/screenshots/detail.png" width="800" alt="動畫詳情 — 集數、角色、預告片" />
</p>

<p align="center">
  <img src="docs/screenshots/watch.png" width="800" alt="睇戲畫面 — 播放器連粵語彈幕覆蓋層" />
</p>

---

## 功能

### 媒體庫管理
- **多種儲存嚟源** — 本地檔案系統、SMB、SFTP，仲可以透過 rclone 接 40+ 種雲端後端
- **自動掃描** — 掃描間隔自己設，順便用 FFmpeg 抽媒體資料
- **檔案比對** — 多個來源一齊認動畫（DandanPlay 哈希、Bangumi、TMDB、AniList）
- **集數解析** — 自動由唔同來源補齊集數資料

### 探索
- **新番日曆** — 當季新番逐日睇
- **熱門排行** — 嚟自 Bangumi 嘅人氣榜
- **搜尋** — 跨晒動畫資料庫做全文搜尋
- **類型同標籤瀏覽** — 按類型、年份、季度、格式同評分揀

### 播放
- **直接串流** — 相容格式用 byte-range 請求直接播
- **容器重新封裝** — MKV 轉 MP4，唔使轉碼
- **HLS 轉碼** — 用 FFmpeg 做自適應串流，有 session 快取
- **彈幕** — 嚟自 弹弹play开放弹幕网络（DandanPlay） 嘅彈幕覆蓋層
- **字幕支援** — 內嵌同外掛字幕軌都 OK
- **觀看進度** — 自動幫你記位置、續返上次嗰度
- **外部播放器支援** — 透過 Jellyfin 相容 API 駁 Infuse、VLC、Kodi、mpv，仲支援 LAN 自動搵返個伺服器

### 下載
- **內建 torrent 客戶端** — 基於 anacrolix/torrent，做種規則自己揸
- **HTTP 下載** — 直接拎檔案，仲可以斷點續傳
- **RSS 自動下載** — 訂閱動畫，可以用正則揀、揀解析度／字幕組
- **種子搜尋** — 一次過揾 Nyaa、DMHY、Mikan、Bangumi.moe、ACG.rip
- **落完之後嘅流程** — 下載完自動掃描、比對、解析

### 收藏
- **觀看狀態** — 想睇、而家睇緊、睇咗、擱低、唔追啦
- **用戶評分** — 自己打分
- **最近紀錄** — 上次停咗喺邊就由邊繼續
- **Bangumi 同 AniList 同步** — 用 OAuth 對清單

### 系統
- **PWA** — 可以裝做 app，仲有離線支援
- **國際化** — 英文、日文、韓文、簡體中文、繁體中文（台灣／香港）
- **通知** — WebSocket 即時推送（下載／掃描嘅事件）
- **雙重驗證** — TOTP 嘅 2FA
- **設定匯出／匯入** — 配置 full backup 冇難度

---

## 技術堆疊

| 層 | 用乜嘢 |
|----|--------|
| 後端 | Go 1.27, Echo v5, SQLite / PostgreSQL |
| 前端 | React 19, TanStack Router, Tailwind CSS v4 |
| 狀態 | Zustand (UI), TanStack Query (伺服器) |
| 打包 | Vite 8, Bun |
| 樣式 | Tailwind CSS v4, shadcn/ui, Hugeicons |
| 動畫 | Motion (Framer Motion) |
| 國際化 | Lingui v5 |
| 影片 | Video.js, FFmpeg |
| PWA | Serwist |
| 快取 | Redis（唔裝都得，自動用記憶體頂） |
| 測試 | Vitest, Playwright, Go testing |
| 代碼品質 | Vite+ (Oxlint/Oxfmt), Lefthook, Commitlint |

---

## 點樣開工

**Docker（推薦）：**

```bash
git clone https://github.com/milmil-dev/milmil.git
cd milmil
cp .env.example .env
cp api/.env.example api/.env

# 喺 api/.env 入面設定 JWT_SECRET（必填，32 位以上）
openssl rand -hex 32

docker compose up -d
```

跟住打開 [http://localhost:3000](http://localhost:3000)，跟住個安裝精靈做就得喇。

完整安裝指南：[docs-site/content/docs/getting-started/installation.mdx](docs-site/content/docs/getting-started/installation.mdx)。

**由源碼起**（Go 1.27+、Bun 1.3+、FFmpeg）：

```bash
make setup
make dev
```

API 喺 `http://localhost:8080` 行緊，前端喺 `http://localhost:5173` 行緊。

---

## 點樣部署

環境變數、compose profile（`--profile postgres`）、數據卷同反向代理配置，睇呢度：[docs-site/content/docs/getting-started/docker.mdx](docs-site/content/docs/getting-started/docker.mdx)。

---

## 設定

### 環境變數

| 變數 | 預設值 | 做咩用 |
|------|--------|--------|
| `DATABASE_URL` | `sqlite://data/milmil.db` | 資料庫連線字串 |
| `REDIS_URL` | — | Redis URL（開發可以唔填） |
| `JWT_SECRET` | — | JWT 簽章 key（至少 32 字，一定要填） |
| `MILMIL_ENCRYPTION_KEY` | — | AES-256 key，用嚟加密儲存嘅憑證 |
| `API_PORT` | `8080` | API 伺服器端口 |
| `DATA_DIR` | `./data` | 下載同轉碼快取放呢度 |
| `TORRENT_LISTEN_PORT` | `42069` | Torrent DHT／peer 端口 |
| `SEED_RATIO` | `1.0` | 做種比率目標 |
| `SEED_TIME_MINUTES` | `60` | 做種幾耐 |
| `DANDANPLAY_APP_ID` | — | DandanPlay API 憑證 |
| `DANDANPLAY_APP_SECRET` | — | DandanPlay API 憑證 |
| `DEBUG` | `0` | 開埋 debug log |

### 外部整合（唔開都得）

| 服務 | 用嚟做 | 喺邊度設定 |
|------|--------|-----------|
| **Bangumi** | 動畫資料、OAuth 同步 | 設定 > 整合 |
| **AniList** | 備用資料來源、OAuth 同步 | 設定 > 整合 |
| **弹弹play开放弹幕网络（DandanPlay）** | 檔案比對、彈幕 | 環境變數或者設定頁 |
| **TMDB** | 對返電視劇資料 | 設定 > 整合 |

---

## 開發

### 專案結構

```
milmil/
  api/                    # Go 後端
    cmd/server/           # 入口
    internal/
      api/                # HTTP handler + router
      auth/               # JWT + 2FA
      cache/              # Redis / 記憶體快取
      config/             # 環境組態
      db/                 # 資料庫 + migration
      downloader/         # Torrent + HTTP 引擎
      ffmpeg/             # 轉碼
      integration/        # Bangumi, AniList, DandanPlay, TMDB
      matcher/            # 多來源動畫比對器
      metadata/           # 中繼資料豐富化
      notification/       # 事件通知
      resolver/           # 集數解析器
      rss/                # RSS 訂閱解析
      scanner/            # 媒體庫檔案掃描
      storage/            # SMB/SFTP/本地 provider
      store/              # sqlc 生成嘅查詢
      torrent/            # 種子搜尋 provider
      worker/             # 背景工作
      ws/                 # WebSocket hub
    migrations/           # SQL migration
  web/                    # React 前端
    src/
      components/         # UI 元件
      hooks/              # 自訂 hooks
      lib/                # API client、工具
      locales/            # 國際化翻譯（6 種語言）
      pages/              # 頁面元件
      routes/             # TanStack Router 定義
      store/              # Zustand stores
      styles/             # 全域 CSS + 主題
    e2e/                  # Playwright 測試
```

### 常用指令

```bash
# 開發
make dev              # 同時開前後端（熱重載）
make dev-api          # 淨係 API（行 air）
make dev-web          # 淨係前端（行 Vite）

# 建置
make build            # 打包正式環境前端

# 測試
make test             # 跑晒所有測試（Go + 前端）
cd web && bun run test:run      # 前端單元測試
cd web && bun run test:e2e      # Playwright E2E 測試

# 品質
make lint             # Go vet + vp lint (Oxlint)
cd web && bun run check:all     # 型別檢查 + lint + 格式 + 測試

# 國際化
cd web && bun run i18n:extract  # 抽翻譯字串
cd web && bun run i18n:compile  # 編譯翻譯
```

### 資料庫

- **開發：** SQLite（唔使配置）
- **正式：** PostgreSQL 16+
- **Migration：** 啟動時用 golang-migrate 自動做
- **查詢：** SQL 優先，用 sqlc 生成代碼

---

## 支援嘅語言

- English
- 日本語 (ja)
- 한국어 (ko)
- 简体中文 (zh-CN)
- 繁體中文 — 台灣 (zh-TW)
- 粵語 — 香港 (zh-HK)

---

## Star History

<a href="https://star-history.com/#milmil-dev/milmil&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=milmil-dev/milmil&type=Date" />
 </picture>
</a>

---

## 授權

milmil 用 [GNU Affero General Public License v3.0](LICENSE) 授權。

即係話你可以自由用、改、同派 milmil，不過如果你改咗之後攞去做網絡服務行，就要將個 source code 畀返嗰個服務嘅用戶睇。
