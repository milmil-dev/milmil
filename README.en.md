<p align="center">
  <img src="web/public/icons/icon-512.png" width="120" alt="milmil logo" />
</p>

<h1 align="center">milmil</h1>

<p align="center">
  Self-hosted anime media server<br/>
  <sub>Media library management, seasonal calendar, trending anime, danmaku playback</sub>
</p>

<p align="center">
  <a href="https://github.com/milmil-dev/milmil/releases"><img src="https://img.shields.io/github/v/release/milmil-dev/milmil?style=flat-square&color=blue" alt="Release" /></a>
  <a href="https://github.com/milmil-dev/milmil/blob/main/LICENSE"><img src="https://img.shields.io/github/license/milmil-dev/milmil?style=flat-square" alt="License" /></a>
  <a href="https://github.com/milmil-dev/milmil/stargazers"><img src="https://img.shields.io/github/stars/milmil-dev/milmil?style=flat-square" alt="Stars" /></a>
  <a href="https://github.com/milmil-dev/milmil/actions"><img src="https://img.shields.io/github/actions/workflow/status/milmil-dev/milmil/ci.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://hub.docker.com/r/milmil/milmil-api"><img src="https://img.shields.io/docker/pulls/milmil/milmil-api?style=flat-square&label=Docker%20Pulls" alt="Docker Pulls" /></a>
</p>

<p align="center">
  English | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文（台灣）</a> | <a href="README.md">粵語</a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#screenshots">Screenshots</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#development">Development</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/home.png" width="800" alt="Home — featured carousel, today's schedule, trending" />
  <br/><sub>Home — Featured carousel, today's schedule, trending rankings</sub>
</p>

<p align="center">
  <img src="docs/screenshots/discover.png" width="800" alt="Discover — trending now, genre filters" />
  <br/><sub>Discover — Trending now, genre filters, top of the season</sub>
</p>

<p align="center">
  <img src="docs/screenshots/schedule.png" width="800" alt="Schedule — seasonal anime by day of week" />
  <br/><sub>Schedule — Seasonal anime organized by day and airtime</sub>
</p>

<p align="center">
  <img src="docs/screenshots/detail.png" width="800" alt="Anime detail — episodes, characters, trailer" />
  <br/><sub>Anime detail — Episode list, character info, YouTube trailer</sub>
</p>

<p align="center">
  <img src="docs/screenshots/watch.png" width="800" alt="Watch — video player with Cantonese danmaku overlay" />
  <br/><sub>Watch — Player with danmaku overlay and external source picker</sub>
</p>

---

## Features

### Library Management
- **Multi-source storage** — local filesystem, SMB, SFTP, and 40+ cloud backends via rclone
- **Automatic scanning** — configurable scan intervals with FFmpeg metadata extraction
- **File matching** — multi-provider anime identification (DandanPlay hash, Bangumi, TMDB, AniList)
- **Episode resolution** — automatic episode metadata enrichment from multiple sources

### Discovery
- **Seasonal calendar** — new anime releases by day of week
- **Trending** — popular anime rankings from Bangumi
- **Search** — full-text search across anime databases
- **Genre & tag browsing** — filter by genre, year, season, format, and score

### Playback
- **Direct streaming** — byte-range requests for compatible formats
- **Container remuxing** — MKV to MP4 without transcoding
- **HLS transcoding** — FFmpeg-based adaptive streaming with session caching
- **Danmaku** — bullet comment overlay from DandanPlay
- **Subtitle support** — embedded and external subtitle tracks
- **Watch progress** — automatic position saving and resume
- **External player support** — connect Infuse, VLC, Kodi, and mpv via Jellyfin-compatible API with LAN auto-discovery

### Downloads
- **Built-in torrent client** — anacrolix/torrent with configurable seeding
- **HTTP downloads** — direct file downloads with resume support
- **RSS auto-download** — subscribe to anime with regex filters, resolution/subgroup preferences
- **Torrent search** — aggregated search across Nyaa, DMHY, Mikan, Bangumi.moe, ACG.rip
- **Post-download pipeline** — automatic scan, match, and resolve on completion

### Collection
- **Watch status** — planning, watching, completed, paused, dropped
- **User ratings** — personal scoring system
- **Recent history** — continue watching from where you left off
- **Bangumi & AniList sync** — OAuth-based list synchronization

### System
- **PWA** — installable progressive web app with offline support
- **i18n** — English, Japanese, Korean, Simplified Chinese, Traditional Chinese (TW/HK)
- **Notifications** — real-time WebSocket push for download/scan events
- **Two-factor auth** — TOTP-based 2FA
- **Settings export/import** — full configuration backup

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.26, Echo v4, SQLite / PostgreSQL |
| Frontend | React 19, TanStack Router, Tailwind CSS v4 |
| State | Zustand (UI), TanStack Query (server) |
| Bundler | Vite 8, Bun |
| Styling | Tailwind CSS v4, shadcn/ui, Hugeicons |
| Animation | Motion (Framer Motion) |
| i18n | Lingui v5 |
| Video | Video.js, FFmpeg |
| PWA | Serwist |
| Cache | Redis (optional, in-memory fallback) |
| Testing | Vitest, Playwright, Go testing |
| Linting | Biome, Lefthook, Commitlint |

---

## Quick Start

### Docker (Recommended)

Get up and running with one command:

```bash
docker-compose up -d
```

Or use the production configuration:

```bash
cp .env.example .env
# Edit .env to set JWT_SECRET and other required variables
docker-compose -f docker-compose.prod.yml up -d
```

### From Source

**Prerequisites:** Go 1.26+, Bun 1.3+, FFmpeg, Redis (optional)

```bash
# Install tools
make setup

# Start API + frontend with hot reload
make dev
```

The API runs at `http://localhost:8080` and the frontend at `http://localhost:5173`.

---

## Deployment

### Docker Compose (Production)

**Services:**
- **PostgreSQL 16** — database
- **Redis 7** — cache
- **milmil-api** — Go backend (port 8080)
- **milmil-web** — React frontend via Nginx (port 3000)

### Reverse Proxy

Place behind Nginx or Caddy for HTTPS:

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

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite://data/milmil.db` | Database connection string |
| `REDIS_URL` | — | Redis URL (optional in dev) |
| `JWT_SECRET` | — | JWT signing key (min 32 chars, required) |
| `MILMIL_ENCRYPTION_KEY` | — | AES-256 key for storage credentials |
| `API_PORT` | `8080` | API server port |
| `DATA_DIR` | `./data` | Downloads and transcode cache |
| `TORRENT_LISTEN_PORT` | `42069` | Torrent DHT/peer port |
| `SEED_RATIO` | `1.0` | Torrent seed ratio target |
| `SEED_TIME_MINUTES` | `60` | Torrent seed duration |
| `DANDANPLAY_APP_ID` | — | DandanPlay API credentials |
| `DANDANPLAY_APP_SECRET` | — | DandanPlay API credentials |
| `DEBUG` | `0` | Enable debug logging |

### External Integrations (Optional)

| Service | Purpose | Setup |
|---------|---------|-------|
| **Bangumi** | Anime metadata, OAuth sync | Settings > Integrations |
| **AniList** | Alternative metadata, OAuth sync | Settings > Integrations |
| **DandanPlay** | File matching, danmaku comments | Environment variables or Settings |
| **TMDB** | TV show cross-referencing | Settings > Integrations |

---

## Development

### Project Structure

```
milmil/
  api/                    # Go backend
    cmd/server/           # Entry point
    internal/
      api/                # HTTP handlers + router
      auth/               # JWT + 2FA
      cache/              # Redis / in-memory
      config/             # Environment config
      db/                 # Database setup + migrations
      downloader/         # Torrent + HTTP engine
      ffmpeg/             # Transcoding
      integration/        # Bangumi, AniList, DandanPlay, TMDB
      matcher/            # Multi-provider anime matcher
      metadata/           # Metadata enrichment
      notification/       # Event notifications
      resolver/           # Episode resolver
      rss/                # RSS feed parsing
      scanner/            # Library file scanner
      storage/            # SMB/SFTP/local providers
      store/              # SQLc generated queries
      torrent/            # Torrent search providers
      worker/             # Background jobs
      ws/                 # WebSocket hub
    migrations/           # SQL migrations
  web/                    # React frontend
    src/
      components/         # UI components
      hooks/              # Custom hooks
      lib/                # API clients, utilities
      locales/            # i18n translations (6 languages)
      pages/              # Page components
      routes/             # TanStack Router definitions
      store/              # Zustand stores
      styles/             # Global CSS + theme
    e2e/                  # Playwright tests
```

### Commands

```bash
# Development
make dev              # Start both servers with hot reload
make dev-api          # API only (with air)
make dev-web          # Frontend only (with Vite)

# Build
make build            # Production frontend build

# Testing
make test             # Run all tests (Go + frontend)
cd web && bun run test:run      # Frontend unit tests
cd web && bun run test:e2e      # Playwright E2E tests

# Quality
make lint             # Go vet + Biome lint
cd web && bun run check:all     # Typecheck + lint + format + test

# i18n
cd web && bun run i18n:extract  # Extract translation strings
cd web && bun run i18n:compile  # Compile translations
```

### Database

- **Development:** SQLite (zero config)
- **Production:** PostgreSQL 16+
- **Migrations:** auto-applied on startup via golang-migrate
- **Queries:** SQL-first with sqlc code generation

---

## Supported Languages

- English
- Japanese (ja)
- Korean (ko)
- Simplified Chinese (zh-CN)
- Traditional Chinese — Taiwan (zh-TW)
- Traditional Chinese — Hong Kong (zh-HK)

---

## Contributing

Contributions of all kinds are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

- Bug reports and feature requests: [GitHub Issues](https://github.com/milmil-dev/milmil/issues)
- Code contributions: Fork → Create branch → Submit Pull Request

---

## Acknowledgements

milmil is built on the shoulders of these excellent open-source projects and services:

- [Bangumi](https://bangumi.tv) — Anime metadata and community
- [AniList](https://anilist.co) — Anime tracking and metadata
- [DandanPlay](https://www.dandanplay.com) — Danmaku comments and file matching
- [Seanime](https://github.com/5rahim/seanime) — Design inspiration

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

## License

milmil is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This means you are free to use, modify, and distribute milmil, but if you run a modified version as a network service, you must make the source code available to users of that service.
