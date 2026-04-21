<p align="center">
  <img src="web/public/icons/icon-512.png" width="120" alt="milmil logo" />
</p>

<h1 align="center">milmil</h1>

<p align="center">
  自托管动画媒体服务器<br/>
  <sub>媒体库管理、新番日历、动画趋势、弹幕播放</sub>
</p>

<p align="center">
  <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | 简体中文 | <a href="README.zh-TW.md">繁體中文（台灣）</a> | <a href="README.md">粵語</a>
</p>

<p align="center">
  <a href="#功能特色">功能特色</a> &bull;
  <a href="#截图预览">截图预览</a> &bull;
  <a href="#快速开始">快速开始</a> &bull;
  <a href="#部署">部署</a> &bull;
  <a href="#配置">配置</a> &bull;
  <a href="#开发">开发</a> &bull;
  <a href="#许可证">许可证</a>
</p>

---

## 截图预览

<p align="center">
  <img src="docs/screenshots/home.png" width="800" alt="首页 — 精选轮播、今日时间表、趋势排行" />
</p>

<p align="center">
  <img src="docs/screenshots/discover.png" width="800" alt="发现 — 当季热门、类型筛选" />
</p>

<p align="center">
  <img src="docs/screenshots/schedule.png" width="800" alt="新番日历 — 按星期排列当季动画" />
</p>

<p align="center">
  <img src="docs/screenshots/detail.png" width="800" alt="动画详情 — 剧集列表、角色、预告片" />
</p>

<p align="center">
  <img src="docs/screenshots/watch.png" width="800" alt="播放页 — 带粤语弹幕叠加层的播放器" />
</p>

---

## 功能特色

### 媒体库管理
- **多来源存储** — 本地文件系统、SMB、SFTP，以及通过 rclone 支持 40+ 云端后端
- **自动扫描** — 可配置扫描间隔，配合 FFmpeg 提取媒体元数据
- **文件匹配** — 多来源动画识别（DandanPlay 哈希、Bangumi、TMDB、AniList）
- **剧集解析** — 自动从多个来源丰富剧集元数据

### 发现
- **新番日历** — 按星期排列新番动画
- **趋势排行** — 来自 Bangumi 的人气动画排名
- **搜索** — 跨动画数据库全文搜索
- **类型与标签浏览** — 按类型、年份、季度、格式和评分筛选

### 播放
- **直接串流** — 兼容格式的 byte-range 请求
- **容器重封装** — MKV 转 MP4，无需转码
- **HLS 转码** — 基于 FFmpeg 的自适应串流，支持 session 缓存
- **弹幕** — 来自 DandanPlay 的弹幕评论叠加层
- **字幕支持** — 内嵌及外挂字幕轨
- **观看进度** — 自动保存位置及续播
- **外部播放器支持** — 通过 Jellyfin 兼容 API 连接 Infuse、VLC、Kodi、mpv，支持 LAN 自动发现

### 下载
- **内置 torrent 客户端** — 基于 anacrolix/torrent，可配置做种
- **HTTP 下载** — 直接文件下载，支持断点续传
- **RSS 自动下载** — 订阅动画，支持正则筛选、分辨率/字幕组偏好
- **种子搜索** — 聚合搜索 Nyaa、DMHY、Mikan、Bangumi.moe、ACG.rip
- **下载后流水线** — 完成后自动扫描、匹配、解析

### 收藏
- **观看状态** — 想看、在看、看过、搁置、抛弃
- **用户评分** — 个人评分系统
- **最近历史** — 从上次离开的地方继续观看
- **Bangumi 及 AniList 同步** — 基于 OAuth 的列表同步

### 系统
- **PWA** — 可安装的渐进式网页应用，支持离线
- **国际化** — 英文、日文、韩文、简体中文、繁体中文（台湾/香港）
- **通知** — 基于 WebSocket 的实时推送（下载/扫描事件）
- **双重验证** — 基于 TOTP 的 2FA
- **设置导出/导入** — 完整配置备份

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Go 1.26, Echo v4, SQLite / PostgreSQL |
| 前端 | React 19, TanStack Router, Tailwind CSS v4 |
| 状态 | Zustand (UI), TanStack Query (服务器) |
| 打包 | Vite 8, Bun |
| 样式 | Tailwind CSS v4, shadcn/ui, Hugeicons |
| 动画 | Motion (Framer Motion) |
| 国际化 | Lingui v5 |
| 视频 | Video.js, FFmpeg |
| PWA | Serwist |
| 缓存 | Redis（可选，内存回退） |
| 测试 | Vitest, Playwright, Go testing |
| 代码质量 | Biome, Lefthook, Commitlint |

---

## 快速开始

### 前置要求

- Go 1.26+
- Bun 1.3+
- FFmpeg（用于转码及媒体信息）
- Redis（可选）

### 开发模式

```bash
# 安装工具
make setup

# 启动 API + 前端（热重载）
make dev
```

API 运行于 `http://localhost:8080`，前端运行于 `http://localhost:5173`。

### Docker

```bash
docker-compose up -d
```

---

## 部署

### Docker Compose（生产环境）

```bash
# 复制并编辑环境变量文件
cp .env.example .env

# 启动所有服务
docker-compose -f docker-compose.prod.yml up -d
```

**服务：**
- **PostgreSQL 16** — 数据库
- **Redis 7** — 缓存
- **milmil-api** — Go 后端（端口 8080）
- **milmil-web** — React 前端，通过 Nginx（端口 3000）

### 反向代理

建议使用 Nginx 或 Caddy 加上 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name anime.example.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite://data/milmil.db` | 数据库连接字符串 |
| `REDIS_URL` | — | Redis URL（开发环境可选） |
| `JWT_SECRET` | — | JWT 签名密钥（最少 32 字符，必填） |
| `MILMIL_ENCRYPTION_KEY` | — | AES-256 密钥，用于加密存储凭证 |
| `API_PORT` | `8080` | API 服务器端口 |
| `DATA_DIR` | `./data` | 下载及转码缓存目录 |
| `TORRENT_LISTEN_PORT` | `42069` | Torrent DHT/peer 端口 |
| `SEED_RATIO` | `1.0` | Torrent 做种比率目标 |
| `SEED_TIME_MINUTES` | `60` | Torrent 做种时长 |
| `DANDANPLAY_APP_ID` | — | DandanPlay API 凭证 |
| `DANDANPLAY_APP_SECRET` | — | DandanPlay API 凭证 |
| `DEBUG` | `0` | 启用调试日志 |

### 外部集成（可选）

| 服务 | 用途 | 设置 |
|------|------|------|
| **Bangumi** | 动画元数据、OAuth 同步 | 设置 > 集成 |
| **AniList** | 替代元数据来源、OAuth 同步 | 设置 > 集成 |
| **DandanPlay** | 文件匹配、弹幕评论 | 环境变量或设置页面 |
| **TMDB** | TV 节目交叉参照 | 设置 > 集成 |

---

## 开发

### 项目结构

```
milmil/
  api/                    # Go 后端
    cmd/server/           # 入口点
    internal/
      api/                # HTTP 处理器 + 路由
      auth/               # JWT + 2FA
      cache/              # Redis / 内存缓存
      config/             # 环境配置
      db/                 # 数据库设置 + 迁移
      downloader/         # Torrent + HTTP 引擎
      ffmpeg/             # 转码
      integration/        # Bangumi, AniList, DandanPlay, TMDB
      matcher/            # 多来源动画匹配器
      metadata/           # 元数据丰富化
      notification/       # 事件通知
      resolver/           # 剧集解析器
      rss/                # RSS 订阅解析
      scanner/            # 媒体库文件扫描器
      storage/            # SMB/SFTP/本地存储提供者
      store/              # SQLc 生成查询
      torrent/            # 种子搜索提供者
      worker/             # 后台任务
      ws/                 # WebSocket hub
    migrations/           # SQL 迁移
  web/                    # React 前端
    src/
      components/         # UI 组件
      hooks/              # 自定义 hooks
      lib/                # API 客户端、工具函数
      locales/            # 国际化翻译（6 种语言）
      pages/              # 页面组件
      routes/             # TanStack Router 定义
      store/              # Zustand stores
      styles/             # 全局 CSS + 主题
    e2e/                  # Playwright 测试
```

### 命令

```bash
# 开发
make dev              # 启动双服务器（热重载）
make dev-api          # 仅 API（使用 air）
make dev-web          # 仅前端（使用 Vite）

# 构建
make build            # 生产环境前端构建

# 测试
make test             # 运行所有测试（Go + 前端）
cd web && bun run test:run      # 前端单元测试
cd web && bun run test:e2e      # Playwright E2E 测试

# 质量
make lint             # Go vet + Biome lint
cd web && bun run check:all     # 类型检查 + lint + 格式化 + 测试

# 国际化
cd web && bun run i18n:extract  # 提取翻译字符串
cd web && bun run i18n:compile  # 编译翻译
```

### 数据库

- **开发：** SQLite（零配置）
- **生产：** PostgreSQL 16+
- **迁移：** 启动时自动应用，使用 golang-migrate
- **查询：** SQL-first，使用 sqlc 代码生成

---

## 支持语言

- English
- 日本語 (ja)
- 한국어 (ko)
- 简体中文 (zh-CN)
- 繁體中文 — 台灣 (zh-TW)
- 繁體中文 — 香港 (zh-HK)

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

## 许可证

milmil 采用 [GNU Affero General Public License v3.0](LICENSE) 许可。

这意味着你可以自由使用、修改及分发 milmil，但若你将修改版本作为网络服务运行，你必须向该服务的用户提供源代码。
