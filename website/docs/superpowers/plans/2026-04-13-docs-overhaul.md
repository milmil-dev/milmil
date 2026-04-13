# milmil Documentation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the milmil documentation website with rich fumadocs components and new content sections (troubleshooting, API reference, contributing, advanced config, platforms, bot, migration, architecture).

**Architecture:** Fumadocs MDX-based docs with fumadocs-ui components registered globally in `mdx-components.tsx`. New doc sections added as MDX files under `content/docs/` with `meta.json` sidebar config. API reference auto-generated from `openapi.json` via `fumadocs-openapi`.

**Tech Stack:** Next.js 16, fumadocs-core/ui v16, fumadocs-mdx v14, fumadocs-openapi (new), Tailwind v4, Playwright for E2E.

---

## File Structure

### Files to modify:
- `mdx-components.tsx` — Register all fumadocs components
- `content/docs/meta.json` — Add new sidebar sections
- `content/docs/getting-started/meta.json` — Add platforms page
- `content/docs/configuration/meta.json` — Add reverse-proxy + performance pages
- `content/docs/features/meta.json` — Add bot page
- `content/docs/index.mdx` — Add Cards grid linking to all sections
- `content/docs/getting-started/installation.mdx` — Add Tabs, Steps, Callout
- `content/docs/getting-started/docker.mdx` — Add Tabs, Callout, Files
- `content/docs/getting-started/first-setup.mdx` — Add Steps, Callout
- `content/docs/configuration/environment.mdx` — Add TypeTable, Tabs, Callout
- `content/docs/configuration/integrations.mdx` — Add Tabs, Steps
- `content/docs/configuration/notifications.mdx` — Add Tabs, Steps, TypeTable
- `content/docs/features/library.mdx` — Add Callout, Files
- `content/docs/features/streaming.mdx` — Add Tabs, Callout
- `content/docs/features/downloads.mdx` — Add Callout, TypeTable
- `content/docs/features/discovery.mdx` — Add Callout
- `content/docs/features/collection.mdx` — Add Callout
- `e2e/docs-full.spec.ts` — Add new pages to test list
- `package.json` — Add fumadocs-openapi + shiki

### Files to create:
- `content/docs/getting-started/platforms.mdx`
- `content/docs/configuration/reverse-proxy.mdx`
- `content/docs/configuration/performance.mdx`
- `content/docs/features/bot.mdx`
- `content/docs/troubleshooting/meta.json`
- `content/docs/troubleshooting/index.mdx`
- `content/docs/troubleshooting/playback.mdx`
- `content/docs/troubleshooting/scanning.mdx`
- `content/docs/troubleshooting/networking.mdx`
- `content/docs/contributing/meta.json`
- `content/docs/contributing/index.mdx`
- `content/docs/contributing/development.mdx`
- `content/docs/contributing/reporting.mdx`
- `content/docs/migration/meta.json`
- `content/docs/migration/index.mdx`
- `content/docs/architecture/meta.json`
- `content/docs/architecture/index.mdx`
- `content/docs/api/openapi.json` (copied from API codebase)
- `lib/openapi.ts`
- `app/[lang]/docs/api/[[...slug]]/page.tsx`
- `scripts/generate-api-docs.mjs`

---

### Task 1: Install dependencies and register MDX components

**Files:**
- Modify: `package.json`
- Modify: `mdx-components.tsx`

- [ ] **Step 1: Install fumadocs-openapi and shiki**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/.worktrees/website/website
bun add fumadocs-openapi shiki
```

- [ ] **Step 2: Update mdx-components.tsx to register all fumadocs components**

Replace the contents of `mdx-components.tsx` with:

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { File, Folder, Files } from 'fumadocs-ui/components/files';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Callout,
    Tab,
    Tabs,
    Step,
    Steps,
    Card,
    Cards,
    Accordion,
    Accordions,
    TypeTable,
    File,
    Folder,
    Files,
    ...components,
  };
}
```

- [ ] **Step 3: Verify build succeeds**

```bash
bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock mdx-components.tsx
git commit -m "deps: add fumadocs-openapi, register all MDX components"
```

---

### Task 2: Update sidebar structure (all meta.json files)

**Files:**
- Modify: `content/docs/meta.json`
- Modify: `content/docs/getting-started/meta.json`
- Modify: `content/docs/configuration/meta.json`
- Modify: `content/docs/features/meta.json`
- Create: `content/docs/troubleshooting/meta.json`
- Create: `content/docs/contributing/meta.json`
- Create: `content/docs/migration/meta.json`
- Create: `content/docs/architecture/meta.json`

- [ ] **Step 1: Update root meta.json**

Replace `content/docs/meta.json` with:

```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "getting-started",
    "features",
    "configuration",
    "api",
    "troubleshooting",
    "contributing",
    "migration",
    "architecture"
  ]
}
```

- [ ] **Step 2: Update getting-started meta.json**

Replace `content/docs/getting-started/meta.json` with:

```json
{
  "title": "Getting Started",
  "pages": ["installation", "docker", "first-setup", "platforms"]
}
```

- [ ] **Step 3: Update configuration meta.json**

Replace `content/docs/configuration/meta.json` with:

```json
{
  "title": "Configuration",
  "pages": ["environment", "integrations", "notifications", "reverse-proxy", "performance"]
}
```

- [ ] **Step 4: Update features meta.json**

Replace `content/docs/features/meta.json` with:

```json
{
  "title": "Features",
  "pages": ["library", "streaming", "downloads", "discovery", "collection", "bot"]
}
```

- [ ] **Step 5: Create troubleshooting meta.json**

Create `content/docs/troubleshooting/meta.json`:

```json
{
  "title": "Troubleshooting",
  "pages": ["index", "playback", "scanning", "networking"]
}
```

- [ ] **Step 6: Create contributing meta.json**

Create `content/docs/contributing/meta.json`:

```json
{
  "title": "Contributing",
  "pages": ["index", "development", "reporting"]
}
```

- [ ] **Step 7: Create migration meta.json**

Create `content/docs/migration/meta.json`:

```json
{
  "title": "Migration",
  "pages": ["index"]
}
```

- [ ] **Step 8: Create architecture meta.json**

Create `content/docs/architecture/meta.json`:

```json
{
  "title": "Architecture",
  "pages": ["index"]
}
```

- [ ] **Step 9: Create placeholder MDX files for all new sections**

Each new section needs at least a stub MDX file so the build doesn't break. Create these minimal files:

`content/docs/getting-started/platforms.mdx`:
```mdx
---
title: Platform Guides
description: Platform-specific installation guides for Synology, Unraid, TrueNAS, and Raspberry Pi.
---

## Platform Guides

Coming soon.
```

`content/docs/configuration/reverse-proxy.mdx`:
```mdx
---
title: Reverse Proxy
description: Configure Nginx, Caddy, or Traefik as a reverse proxy for milmil.
---

## Reverse Proxy

Coming soon.
```

`content/docs/configuration/performance.mdx`:
```mdx
---
title: Performance Tuning
description: Optimize milmil for production workloads.
---

## Performance Tuning

Coming soon.
```

`content/docs/features/bot.mdx`:
```mdx
---
title: Bot & Notifications
description: Set up Discord and Telegram bots with interactive commands.
---

## Bot & Notifications

Coming soon.
```

`content/docs/troubleshooting/index.mdx`:
```mdx
---
title: FAQ
description: Frequently asked questions and common solutions.
---

## FAQ

Coming soon.
```

`content/docs/troubleshooting/playback.mdx`:
```mdx
---
title: Playback Issues
description: Troubleshoot streaming, transcoding, and danmaku problems.
---

## Playback Issues

Coming soon.
```

`content/docs/troubleshooting/scanning.mdx`:
```mdx
---
title: Scanning Issues
description: Troubleshoot library scanning and metadata matching problems.
---

## Scanning Issues

Coming soon.
```

`content/docs/troubleshooting/networking.mdx`:
```mdx
---
title: Networking Issues
description: Troubleshoot connectivity, reverse proxy, and WebSocket problems.
---

## Networking Issues

Coming soon.
```

`content/docs/contributing/index.mdx`:
```mdx
---
title: Contributing
description: How to contribute to milmil.
---

## Contributing

Coming soon.
```

`content/docs/contributing/development.mdx`:
```mdx
---
title: Development Setup
description: Set up a local development environment for milmil.
---

## Development Setup

Coming soon.
```

`content/docs/contributing/reporting.mdx`:
```mdx
---
title: Reporting Issues
description: How to report bugs and request features.
---

## Reporting Issues

Coming soon.
```

`content/docs/migration/index.mdx`:
```mdx
---
title: Migration Guide
description: Migrate to milmil from other anime media servers.
---

## Migration Guide

Coming soon.
```

`content/docs/architecture/index.mdx`:
```mdx
---
title: Architecture
description: milmil system architecture and internals.
---

## Architecture

Coming soon.
```

- [ ] **Step 10: Verify build succeeds**

```bash
bun run build
```

Expected: Build succeeds. All new sidebar sections appear.

- [ ] **Step 11: Commit**

```bash
git add content/docs/
git commit -m "docs: add sidebar structure and stub pages for all new sections"
```

---

### Task 3: Enhance Introduction page with Cards

**Files:**
- Modify: `content/docs/index.mdx`

- [ ] **Step 1: Rewrite index.mdx with Cards grid**

Replace `content/docs/index.mdx` with:

```mdx
---
title: Introduction
description: milmil is a self-hosted anime media server for managing, discovering, and streaming anime.
---

## What is milmil?

milmil is a self-hosted anime media server that lets you manage, discover, and stream your anime collection. It combines library management with advanced features like danmaku (bullet comments), automatic downloads, and multi-provider metadata matching.

## Explore

<Cards>
  <Card title="Installation" href="/docs/getting-started/installation">
    Install milmil with Docker or from source.
  </Card>
  <Card title="First Setup" href="/docs/getting-started/first-setup">
    Configure your first library and start watching.
  </Card>
  <Card title="Features" href="/docs/features/library">
    Explore library management, streaming, downloads, and more.
  </Card>
  <Card title="Configuration" href="/docs/configuration/environment">
    Environment variables, integrations, and notifications.
  </Card>
  <Card title="API Reference" href="/docs/api">
    REST API documentation auto-generated from OpenAPI spec.
  </Card>
  <Card title="Troubleshooting" href="/docs/troubleshooting">
    FAQ and solutions for common issues.
  </Card>
</Cards>

## Quick Start

```bash
docker compose up -d
```

Then open `http://localhost:3000` and follow the setup wizard.

## Key Features

- **Library Management** — Multi-source storage (local, SMB, SFTP, 40+ cloud backends via rclone) with automatic scanning and metadata matching
- **Streaming** — Direct playback, container remuxing (MKV to MP4), HLS transcoding with FFmpeg
- **Danmaku** — Real-time bullet comment overlay from DandanPlay
- **Auto Downloads** — Built-in torrent client, RSS subscriptions, aggregated torrent search (Nyaa, DMHY, Mikan, etc.)
- **Discovery** — Seasonal calendar, trending rankings, full-text search with genre/tag filtering
- **Collection** — Watch status tracking, personal ratings, progress sync with Bangumi and AniList
- **Multi-language** — Full i18n support for English, Japanese, Korean, Simplified Chinese, Traditional Chinese
- **PWA** — Installable progressive web app with offline support
```

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add content/docs/index.mdx
git commit -m "docs: enhance introduction page with Cards grid"
```

---

### Task 4: Enhance Getting Started pages

**Files:**
- Modify: `content/docs/getting-started/installation.mdx`
- Modify: `content/docs/getting-started/docker.mdx`
- Modify: `content/docs/getting-started/first-setup.mdx`

- [ ] **Step 1: Rewrite installation.mdx with Tabs, Steps, Callout**

Replace `content/docs/getting-started/installation.mdx` with:

```mdx
---
title: Installation
description: How to install and run milmil on your server.
---

## Prerequisites

<Callout type="info">
milmil requires **FFmpeg** for media info extraction and transcoding. Make sure it's installed and available in your `PATH`.
</Callout>

- **Docker** (recommended) or Go 1.26+ and Bun 1.3+
- **FFmpeg** — Required for transcoding and media info extraction
- **Redis** — Optional but recommended for production deployments

## Installation

<Tabs items={["Docker (Recommended)", "Manual"]}>
<Tab value="Docker (Recommended)">

<Steps>
<Step>
### Clone the repository

```bash
git clone https://github.com/milmil-org/milmil.git
cd milmil
```
</Step>
<Step>
### Start the services

```bash
docker compose up -d
```

This starts all services:

| Service | Port | Description |
|---------|------|-------------|
| `milmil-api` | 8080 | Go backend API |
| `milmil-web` | 3000 | React frontend |
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 cache |
</Step>
<Step>
### Open the app

Navigate to `http://localhost:3000` and follow the [First Setup](/docs/getting-started/first-setup) wizard.
</Step>
</Steps>

See [Docker Deployment](/docs/getting-started/docker) for advanced configuration.

</Tab>
<Tab value="Manual">

### Backend (Go API)

```bash
cd api
go mod download
make build
./server
```

### Frontend (React SPA)

```bash
cd web
bun install
bun run build
```

Serve the built files from `web/dist` with any static file server or Nginx.

</Tab>
</Tabs>

## Environment Variables

<Callout type="warn">
`JWT_SECRET` and `MILMIL_ENCRYPTION_KEY` are **required**. The server will not start without them.
</Callout>

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite://data/milmil.db` | Database connection string |
| `JWT_SECRET` | *required* | JWT signing key (min 32 chars) |
| `MILMIL_ENCRYPTION_KEY` | *required* | AES-256 key for storage credentials |
| `API_PORT` | `8080` | API server port |
| `DATA_DIR` | `./data` | Downloads and transcode cache |

See [Configuration](/docs/configuration/environment) for all options.
```

- [ ] **Step 2: Rewrite docker.mdx with Tabs, Callout, Files**

Replace `content/docs/getting-started/docker.mdx` with:

```mdx
---
title: Docker Deployment
description: Deploy milmil with Docker Compose for production use.
---

## Production Setup

<Steps>
<Step>
### Create environment file

Create a `.env` file in the project root:

```bash
JWT_SECRET=your-secret-key-at-least-32-characters
MILMIL_ENCRYPTION_KEY=your-aes-256-encryption-key
DATABASE_URL=postgres://milmil:password@postgres:5432/milmil?sslmode=disable
```

<Callout type="warn">
Generate strong random keys for production. You can use `openssl rand -hex 32` to generate a 64-character hex key.
</Callout>
</Step>
<Step>
### Start the stack

<Tabs items={["docker compose", "docker run"]}>
<Tab value="docker compose">
```bash
docker compose -f docker-compose.prod.yml up -d
```
</Tab>
<Tab value="docker run">
```bash
docker run -d \
  --name milmil-api \
  -p 8080:8080 \
  --env-file .env \
  -v milmil-data:/data \
  -v /path/to/anime:/media/anime \
  ghcr.io/milmil-org/milmil:latest
```
</Tab>
</Tabs>
</Step>
</Steps>

## Services

| Service | Port | Description |
|---------|------|-------------|
| `milmil-api` | 8080 | Go backend API |
| `milmil-web` | 3000 | React frontend |
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 cache |

## Volume Mounts

Map your media directories into the container:

```yaml
volumes:
  - /path/to/anime:/media/anime
  - milmil-data:/data
```

<Callout type="info">
The `/data` volume stores downloads, transcode cache, and SQLite database (if used). Make sure it has enough space.
</Callout>

## Expected File Layout

<Files>
  <Folder name="milmil" defaultOpen>
    <File name=".env" />
    <File name="docker-compose.yml" />
    <File name="docker-compose.prod.yml" />
    <Folder name="data">
      <File name="milmil.db" />
      <Folder name="downloads" />
      <Folder name="transcode" />
    </Folder>
  </Folder>
</Files>

## Database

<Tabs items={["SQLite", "PostgreSQL"]}>
<Tab value="SQLite">
Zero configuration — great for development and small setups. Data stored in `data/milmil.db`.

```bash
DATABASE_URL=sqlite://data/milmil.db
```
</Tab>
<Tab value="PostgreSQL">
Recommended for production deployments. Migrations are auto-applied on startup.

```bash
DATABASE_URL=postgres://milmil:password@postgres:5432/milmil?sslmode=disable
```
</Tab>
</Tabs>

## Reverse Proxy

<Callout type="info">
See the dedicated [Reverse Proxy](/docs/configuration/reverse-proxy) guide for full Nginx, Caddy, and Traefik configurations.
</Callout>

Place milmil behind a reverse proxy for HTTPS. Example Nginx config:

```nginx
server {
    listen 443 ssl;
    server_name milmil.example.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
```

- [ ] **Step 3: Rewrite first-setup.mdx with Steps, Callout**

Replace `content/docs/getting-started/first-setup.mdx` with:

```mdx
---
title: First-time Setup
description: Configure milmil after installation.
---

## Setup Wizard

When you first open milmil, you'll be guided through the setup wizard:

<Steps>
<Step>
### Create Admin Account

Set your username and password. This is the only admin account — you can create additional users later.

<Callout type="warn">
Choose a strong password. There is no password recovery without database access.
</Callout>
</Step>
<Step>
### Add Library

Point to your anime media directory. milmil supports multiple storage backends:

<Tabs items={["Local", "Network Storage", "Cloud (Rclone)"]}>
<Tab value="Local">
The simplest setup — provide the path to your anime folder:

```
/media/anime
```

<Callout type="info">
If using Docker, this path must match your container volume mount (e.g. `/media/anime` if you mounted `-v /path/to/anime:/media/anime`).
</Callout>
</Tab>
<Tab value="Network Storage">
For SMB, SFTP, or WebDAV, provide the connection details in the library settings. Supported protocols:

| Type | Example |
|------|---------|
| **SMB/CIFS** | `\\server\anime` |
| **SFTP** | `sftp://user@host/path` |
| **WebDAV** | `https://cloud.example.com/dav/anime` |
| **FTP** | `ftp://host/anime` |

Credentials are encrypted with AES-256.
</Tab>
<Tab value="Cloud (Rclone)">
milmil supports 40+ cloud providers via rclone integration: Google Drive, OneDrive, Dropbox, S3, and more.

Configure your rclone remote first, then add it as a library source in milmil.
</Tab>
</Tabs>
</Step>
<Step>
### Scan Library

milmil scans and matches your files automatically. The scan process:

1. Walks the directory tree to discover media files
2. Extracts metadata using FFmpeg (codec, resolution, duration, subtitles)
3. Matches files to anime entries using DandanPlay, Bangumi, and AniList
4. Enriches episodes with cover images, titles, and descriptions

<Callout type="info">
Initial scans can take several minutes for large libraries. Progress is shown in the UI.
</Callout>
</Step>
</Steps>

## Metadata Matching

milmil uses a multi-provider matching pipeline:

1. **DandanPlay Hash** — Most accurate, matches by file hash
2. **Bangumi** — Title-based matching against the Bangumi database
3. **AniList** — Alternative title matching
4. **TMDB** — Fallback cross-reference

Unmatched files can be manually matched from the library detail page.
```

- [ ] **Step 4: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add content/docs/getting-started/
git commit -m "docs: enhance getting-started pages with Tabs, Steps, Callout, Files"
```

---

### Task 5: Enhance Configuration pages

**Files:**
- Modify: `content/docs/configuration/environment.mdx`
- Modify: `content/docs/configuration/integrations.mdx`
- Modify: `content/docs/configuration/notifications.mdx`

- [ ] **Step 1: Rewrite environment.mdx with TypeTable, Tabs, Callout**

Replace `content/docs/configuration/environment.mdx` with:

```mdx
---
title: Environment Variables
description: All configurable environment variables for milmil.
---

## Core Settings

<Callout type="warn">
Variables marked as **required** must be set before starting the server.
</Callout>

<TypeTable
  type={{
    DATABASE_URL: {
      type: 'string',
      description: 'Database connection (SQLite or PostgreSQL)',
      default: 'sqlite://data/milmil.db',
    },
    JWT_SECRET: {
      type: 'string',
      description: 'JWT signing key (min 32 chars). Required.',
    },
    MILMIL_ENCRYPTION_KEY: {
      type: 'string',
      description: 'AES-256 key for storage credentials. Required.',
    },
    API_PORT: {
      type: 'number',
      description: 'API server port',
      default: '8080',
    },
    DATA_DIR: {
      type: 'string',
      description: 'Downloads and transcode cache directory',
      default: './data',
    },
    DEBUG: {
      type: 'boolean',
      description: 'Enable debug logging',
      default: '0',
    },
    REDIS_URL: {
      type: 'string',
      description: 'Redis connection URL. In-memory fallback if not set.',
    },
  }}
/>

## Torrent Settings

<TypeTable
  type={{
    TORRENT_LISTEN_PORT: {
      type: 'number',
      description: 'Torrent DHT/peer port',
      default: '42069',
    },
    SEED_RATIO: {
      type: 'number',
      description: 'Seed ratio target before stopping',
      default: '1.0',
    },
    SEED_TIME_MINUTES: {
      type: 'number',
      description: 'Minimum seed duration in minutes',
      default: '60',
    },
  }}
/>

## Integration Keys

<TypeTable
  type={{
    DANDANPLAY_APP_ID: {
      type: 'string',
      description: 'DandanPlay API app ID',
    },
    DANDANPLAY_APP_SECRET: {
      type: 'string',
      description: 'DandanPlay API app secret',
    },
  }}
/>

## Database

<Tabs items={["SQLite", "PostgreSQL"]}>
<Tab value="SQLite">
Zero configuration, great for development and small setups.

```bash
DATABASE_URL=sqlite://data/milmil.db
```
</Tab>
<Tab value="PostgreSQL">
Recommended for production deployments.

```bash
DATABASE_URL=postgres://user:password@localhost:5432/milmil?sslmode=disable
```
</Tab>
</Tabs>

## Redis

<Callout type="info">
Redis is optional but recommended for production. Without Redis, milmil uses an in-memory cache that doesn't persist across restarts.
</Callout>

```bash
REDIS_URL=redis://localhost:6379
```
```

- [ ] **Step 2: Rewrite integrations.mdx with Tabs, Steps**

Replace `content/docs/configuration/integrations.mdx` with:

```mdx
---
title: Integrations
description: Connect milmil with external services for metadata, sync, and danmaku.
---

<Tabs items={["Bangumi", "AniList", "DandanPlay", "TMDB"]}>
<Tab value="Bangumi">

## Bangumi

[Bangumi](https://bangumi.tv) provides anime metadata, ratings, and collection sync.

<Steps>
<Step>
### Navigate to Settings

Go to **Settings > Integrations** in the milmil web UI.
</Step>
<Step>
### Connect Bangumi

Click **Connect Bangumi** and authorize milmil in the Bangumi OAuth flow.
</Step>
<Step>
### Verify sync

Your Bangumi collection will begin syncing automatically. Check the integration status indicator.
</Step>
</Steps>

### Features

- Anime metadata (title, description, score, episodes)
- Watch status sync (planning, watching, completed, etc.)
- Score sync

</Tab>
<Tab value="AniList">

## AniList

[AniList](https://anilist.co) is an alternative metadata and tracking service.

<Steps>
<Step>
### Navigate to Settings

Go to **Settings > Integrations** in the milmil web UI.
</Step>
<Step>
### Connect AniList

Click **Connect AniList** and authorize milmil in the AniList OAuth flow.
</Step>
</Steps>

### Features

- Anime metadata and cover images
- Watch progress sync
- Score sync

</Tab>
<Tab value="DandanPlay">

## DandanPlay

[DandanPlay](https://www.dandanplay.com) provides file-hash based matching and danmaku (bullet comments).

<Steps>
<Step>
### Get API credentials

Register for API credentials at the DandanPlay developer portal.
</Step>
<Step>
### Set environment variables

```bash
DANDANPLAY_APP_ID=your_app_id
DANDANPLAY_APP_SECRET=your_app_secret
```
</Step>
</Steps>

### Features

- File hash matching — most accurate episode identification
- Danmaku overlay during playback
- Episode metadata

</Tab>
<Tab value="TMDB">

## TMDB

[TMDB](https://www.themoviedb.org) is used as a fallback for cross-referencing TV show metadata.

<Callout type="info">
No configuration required. TMDB is used automatically as a fallback source.
</Callout>

</Tab>
</Tabs>
```

- [ ] **Step 3: Rewrite notifications.mdx with Tabs, Steps, TypeTable**

Replace `content/docs/configuration/notifications.mdx` with:

```mdx
---
title: Notifications & Bot
description: Set up push notifications and interactive bot commands via Telegram, Discord, or webhooks.
---

## Overview

milmil can send push notifications and accept interactive bot commands through Telegram, Discord, and generic webhooks. Both features are configured in **Settings > Notifications**.

Each platform card has two independent toggles:
- **Push Notifications** — one-way alerts for downloads, errors, and system events
- **Bot Commands** — interactive commands like `/schedule`, `/search`, `/downloads`

<Tabs items={["Telegram", "Discord", "Webhook"]}>
<Tab value="Telegram">

## Telegram Setup

<Steps>
<Step>
### Create a Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Enter a display name (e.g. `milmil`)
4. Enter a username ending in `bot` (e.g. `milmil_media_bot`)
5. BotFather replies with a **Bot Token** — copy it
</Step>
<Step>
### Get Your Chat ID

1. Send any message to your new bot
2. Open in browser: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id": 123456789}` — that number is your Chat ID
</Step>
<Step>
### Configure in milmil

1. Go to **Settings > Notifications > Telegram**
2. Paste the **Bot Token**
3. Enter the **Chat ID**
4. Enable **Push Notifications** and/or **Bot Commands**
5. Click **Save**
</Step>
</Steps>

### Webhook Mode (Optional)

<Callout type="info">
By default the bot uses long polling (works behind NAT/firewalls). If your server has a public URL, you can switch to webhook mode for lower latency.
</Callout>

Enter a **Webhook URL** (e.g. `https://your-domain.com/api/v1/bot/telegram/webhook`). Leave blank to use polling.

### Allowed Chat IDs

Restrict which Telegram chats can send commands to the bot. Enter comma-separated chat IDs. Leave blank to allow only the configured Chat ID.

</Tab>
<Tab value="Discord">

## Discord Setup

### Push Notifications (Webhook)

<Steps>
<Step>
In your Discord server, go to **Server Settings > Integrations > Webhooks**.
</Step>
<Step>
Click **New Webhook**, name it (e.g. `milmil`), choose a channel. Click **Copy Webhook URL**.
</Step>
<Step>
In milmil: **Settings > Notifications > Discord**, enable **Push Notifications**. Paste the Webhook URL, save.
</Step>
</Steps>

### Bot Commands (Slash Commands)

<Steps>
<Step>
Go to the [Discord Developer Portal](https://discord.com/developers/applications). Click **New Application**, name it `milmil`.
</Step>
<Step>
Go to **Bot** tab, click **Add Bot**. Copy the **Bot Token**.
</Step>
<Step>
Go to **OAuth2 > URL Generator**, select scopes: `bot`, `applications.commands`. Select permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`.
</Step>
<Step>
Copy the generated URL and open it to invite the bot to your server.
</Step>
<Step>
Copy the **Application ID** from the General Information tab. In milmil: **Settings > Notifications > Discord**, enable **Bot Commands**. Paste the **Bot Token** and **Application ID**, save.
</Step>
</Steps>

### Allowed Guild IDs

Restrict which Discord servers can use the bot. Enter comma-separated server IDs. Leave blank to allow all servers.

</Tab>
<Tab value="Webhook">

## Webhook (Generic)

For custom integrations (Slack, ntfy, Gotify, Pushover, etc.):

<Steps>
<Step>
Enable **Webhook** in Settings.
</Step>
<Step>
Enter the target **URL**.
</Step>
<Step>
Optionally set an **HMAC Secret** for signature verification.
</Step>
</Steps>

Events are sent as JSON POST with an `X-Signature-256` header:

```json
{
  "type": "download.completed",
  "title": "Download Complete",
  "message": "Frieren S2E03",
  "severity": "success",
  "metadata": {
    "anime_name": "Frieren",
    "episode": "03",
    "subgroup": "LoliHouse"
  }
}
```

</Tab>
</Tabs>

## Event Routing

Configure which events go to which platforms using the event routing matrix below the platform cards.

<TypeTable
  type={{
    "download.started": { type: 'event', description: 'RSS rule triggers a new download' },
    "download.completed": { type: 'event', description: 'Download finishes successfully' },
    "download.failed": { type: 'event', description: 'Download encounters an error' },
    "library.scan_complete": { type: 'event', description: 'Library scan finishes processing' },
    "system.error": { type: 'event', description: 'Background job fails unexpectedly' },
  }}
/>

## Bot Commands

<TypeTable
  type={{
    "/start": { type: 'command', description: 'Welcome message and command list' },
    "/schedule": { type: 'command', description: 'Weekly airing schedule' },
    "/search <query>": { type: 'command', description: 'Search anime' },
    "/detail <id>": { type: 'command', description: 'Anime details with cover and score' },
    "/downloads": { type: 'command', description: 'Active downloads with progress' },
    "/subscribe <anime>": { type: 'command', description: 'Set up auto-download subscription' },
    "/status": { type: 'command', description: 'System overview' },
    "/mylist [status]": { type: 'command', description: 'Your anime collection' },
    "/continue": { type: 'command', description: 'Recently watched, continue watching' },
  }}
/>

Commands support inline buttons for quick actions like subscribing, pausing downloads, and viewing details.
```

- [ ] **Step 4: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add content/docs/configuration/
git commit -m "docs: enhance configuration pages with TypeTable, Tabs, Steps, Callout"
```

---

### Task 6: Enhance Feature pages

**Files:**
- Modify: `content/docs/features/library.mdx`
- Modify: `content/docs/features/streaming.mdx`
- Modify: `content/docs/features/downloads.mdx`
- Modify: `content/docs/features/discovery.mdx`
- Modify: `content/docs/features/collection.mdx`

- [ ] **Step 1: Rewrite library.mdx with Callout, Files**

Replace `content/docs/features/library.mdx` with:

```mdx
---
title: Library Management
description: Manage your anime collection with multi-source storage and automatic metadata matching.
---

## Overview

milmil's library system lets you organize and manage anime files from multiple storage backends. Files are automatically scanned, identified, and matched to anime entries with metadata from Bangumi, AniList, and DandanPlay.

## Storage Backends

<TypeTable
  type={{
    "Local": { type: 'backend', description: 'Directories on the host filesystem' },
    "SMB/CIFS": { type: 'backend', description: 'Windows network shares' },
    "SFTP": { type: 'backend', description: 'SSH file transfer' },
    "FTP": { type: 'backend', description: 'Standard FTP' },
    "WebDAV": { type: 'backend', description: 'Cloud storage (Nextcloud, etc.)' },
    "HTTP": { type: 'backend', description: 'Direct HTTP file access' },
    "Rclone": { type: 'backend', description: '40+ cloud providers (Google Drive, OneDrive, Dropbox, S3, etc.)' },
  }}
/>

## Scanning

When you scan a library, milmil:

<Steps>
<Step>
### Discover files

Walks the directory tree to discover media files.
</Step>
<Step>
### Extract metadata

Extracts metadata using FFmpeg (codec, resolution, duration, subtitles).
</Step>
<Step>
### Match anime

Matches files to anime entries using multiple providers.
</Step>
<Step>
### Enrich episodes

Enriches episodes with cover images, titles, and descriptions.
</Step>
</Steps>

<Callout type="info">
Scans can be triggered manually or configured to run automatically on a schedule.
</Callout>

## Metadata Matching

milmil uses a multi-provider matching pipeline:

1. **DandanPlay Hash** — Most accurate, matches by file hash
2. **Bangumi** — Title-based matching against the Bangumi database
3. **AniList** — Alternative title matching
4. **TMDB** — Fallback cross-reference

<Callout type="info">
Unmatched files can be manually matched from the library detail page.
</Callout>

## Expected Library Structure

<Files>
  <Folder name="anime" defaultOpen>
    <Folder name="Frieren" defaultOpen>
      <File name="[SubGroup] Frieren S01E01.mkv" />
      <File name="[SubGroup] Frieren S01E02.mkv" />
      <File name="[SubGroup] Frieren S01E03.mkv" />
    </Folder>
    <Folder name="Bocchi the Rock">
      <File name="[SubGroup] Bocchi the Rock - 01.mkv" />
      <File name="[SubGroup] Bocchi the Rock - 02.mkv" />
    </Folder>
  </Folder>
</Files>

## File Browser

The library detail page includes a file browser that shows:

- Directory tree with file counts
- Media file details (codec, resolution, size)
- Match status for each file
- Bulk match/unmatch operations
```

- [ ] **Step 2: Rewrite streaming.mdx with Tabs, Callout**

Replace `content/docs/features/streaming.mdx` with:

```mdx
---
title: Streaming & Playback
description: Stream anime with danmaku overlay, subtitle support, and watch progress tracking.
---

## Playback Modes

milmil supports three streaming modes, automatically selecting the best option:

<Tabs items={["Direct Play", "Container Remux", "HLS Transcoding"]}>
<Tab value="Direct Play">

Serves the original file directly with byte-range requests. Zero transcoding overhead — best quality and performance.

<Callout type="info">
Direct play works when the source format is natively supported by the browser (MP4 with H.264/H.265).
</Callout>
</Tab>
<Tab value="Container Remux">

Remuxes MKV containers to MP4 on-the-fly without re-encoding video or audio. This enables playback in browsers that don't support MKV natively.

<Callout type="info">
Remuxing is very fast and uses minimal CPU since it only changes the container format, not the video/audio streams.
</Callout>
</Tab>
<Tab value="HLS Transcoding">

Full FFmpeg transcoding to HLS (HTTP Live Streaming) when the source format isn't browser-compatible. Includes:

- Adaptive bitrate streaming
- Session-based caching for fast seeking
- Configurable quality presets

<Callout type="warn">
HLS transcoding requires significant CPU resources. Consider enabling hardware acceleration for better performance. See [Performance Tuning](/docs/configuration/performance).
</Callout>
</Tab>
</Tabs>

## Danmaku (Bullet Comments)

Real-time bullet comments overlaid on video, sourced from DandanPlay. Comments scroll across the screen during playback, creating a shared viewing experience.

<Callout type="info">
Configure danmaku density, opacity, and font size in the player settings. Requires [DandanPlay integration](/docs/configuration/integrations).
</Callout>

## Subtitles

milmil supports:

- **Embedded subtitles** — Extracted from MKV/MP4 containers (ASS, SRT, etc.)
- **External subtitles** — `.srt`, `.ass`, `.vtt` files alongside the video
- Multiple subtitle tracks with language selection

## Watch Progress

Your watch progress is automatically saved and synced:

- Resume from where you left off on any device
- Continue watching section on the home page
- Progress sync with Bangumi and AniList (when connected)
```

- [ ] **Step 3: Rewrite downloads.mdx with Callout, TypeTable**

Replace `content/docs/features/downloads.mdx` with:

```mdx
---
title: Downloads
description: Built-in torrent client, RSS auto-download, and aggregated torrent search.
---

## Torrent Client

milmil includes a built-in torrent client with:

- Configurable seed ratio and time limits
- DHT and peer exchange support
- Download progress tracking
- Pause/resume controls

### Configuration

<TypeTable
  type={{
    TORRENT_LISTEN_PORT: { type: 'number', description: 'DHT/peer port', default: '42069' },
    SEED_RATIO: { type: 'number', description: 'Target seed ratio', default: '1.0' },
    SEED_TIME_MINUTES: { type: 'number', description: 'Minimum seed time', default: '60' },
  }}
/>

## Torrent Search

Search across multiple torrent providers from a single interface:

<TypeTable
  type={{
    "Nyaa": { type: 'provider', description: 'Largest anime torrent tracker' },
    "DMHY": { type: 'provider', description: 'Chinese anime torrents (動漫花園)' },
    "Mikan": { type: 'provider', description: 'Mikan Project aggregator' },
    "Bangumi.moe": { type: 'provider', description: 'Bangumi torrent tracker' },
    "ACG.rip": { type: 'provider', description: 'ACG resource tracker' },
  }}
/>

Filter results by resolution, subgroup, and file type.

## RSS Auto-Download

<Steps>
<Step>
### Add RSS feed

Add an RSS feed URL from your preferred torrent tracker.
</Step>
<Step>
### Configure filters

Set up regex patterns, resolution preferences, and subgroup filters.
</Step>
<Step>
### Automatic processing

milmil checks the feed periodically and downloads matching episodes.
</Step>
</Steps>

<Callout type="info">
After a download completes, milmil automatically scans the file, matches it to the correct anime and episode, enriches metadata, and sends a notification.
</Callout>

## HTTP Downloads

milmil also supports direct HTTP downloads with resume capability.
```

- [ ] **Step 4: Rewrite discovery.mdx with Callout**

Replace `content/docs/features/discovery.mdx` with:

```mdx
---
title: Discovery
description: Discover new anime with seasonal calendar, trending rankings, and search.
---

## Seasonal Calendar

Browse anime airing each day of the week, sourced from Bangumi's schedule data. The calendar shows:

- Today's releases highlighted
- Episode count and air time
- Quick access to anime detail pages

<Callout type="info">
The calendar data is sourced from Bangumi.tv and refreshed daily.
</Callout>

## Trending

View currently popular anime ranked by community activity and ratings from Bangumi.

## Search

Full-text search across anime databases with filters:

- **Genre** — Action, Comedy, Drama, Fantasy, Romance, etc.
- **Tags** — Specific themes and content tags
- **Year/Season** — Filter by air date
- **Format** — TV, Movie, OVA, ONA, Special
- **Score** — Minimum rating threshold
- **Adult content** — Toggle NSFW results

## Anime Detail

Each anime detail page includes:

- Cover and banner images
- Synopsis and metadata
- Episode list with playback status
- Character and voice actor information
- Related works and sequels
- Recommendations
- Community reviews and comments
- Available torrents
```

- [ ] **Step 5: Rewrite collection.mdx with Callout**

Replace `content/docs/features/collection.mdx` with:

```mdx
---
title: Collection
description: Track your anime watching progress, ratings, and sync with external services.
---

## Watch Status

Organize your anime by status:

<TypeTable
  type={{
    "Watching": { type: 'status', description: 'Currently watching' },
    "Planning": { type: 'status', description: 'Plan to watch' },
    "Completed": { type: 'status', description: 'Finished watching' },
    "Paused": { type: 'status', description: 'On hold' },
    "Dropped": { type: 'status', description: 'Stopped watching' },
  }}
/>

## Ratings

Rate anime on a personal scale. Ratings sync bidirectionally with connected services (Bangumi, AniList).

## Continue Watching

The home page shows your recent watch history with:

- Episode progress bars
- Time remaining
- One-click resume playback

## External Sync

<Callout type="info">
When connected to Bangumi or AniList, your collection syncs automatically: watch status, scores, and progress update in real-time. Configure sync in [Settings > Integrations](/docs/configuration/integrations).
</Callout>
```

- [ ] **Step 6: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 7: Commit**

```bash
git add content/docs/features/
git commit -m "docs: enhance feature pages with Tabs, Callout, TypeTable, Steps, Files"
```

---

### Task 7: Write new content — Platform Guides

**Files:**
- Modify: `content/docs/getting-started/platforms.mdx` (replace stub)

- [ ] **Step 1: Write platforms.mdx**

Replace `content/docs/getting-started/platforms.mdx` with:

```mdx
---
title: Platform Guides
description: Platform-specific installation guides for Synology, Unraid, TrueNAS, and Raspberry Pi.
---

<Tabs items={["Synology", "Unraid", "TrueNAS", "Raspberry Pi"]}>
<Tab value="Synology">

## Synology NAS (DSM 7+)

<Steps>
<Step>
### Install Container Manager

Open **Package Center** and install **Container Manager** (formerly Docker).
</Step>
<Step>
### Create project directory

SSH into your NAS or use File Station to create `/docker/milmil/`.

<Files>
  <Folder name="docker" defaultOpen>
    <Folder name="milmil" defaultOpen>
      <File name=".env" />
      <File name="docker-compose.yml" />
      <Folder name="data" />
    </Folder>
  </Folder>
</Files>
</Step>
<Step>
### Upload docker-compose.yml and .env

Copy the production compose file and environment variables. See [Docker Deployment](/docs/getting-started/docker).
</Step>
<Step>
### Start via Container Manager

In Container Manager, go to **Project > Create**. Select the `docker-compose.yml` file and start the project.
</Step>
</Steps>

<Callout type="warn">
**Permissions:** Synology containers run as root by default. Ensure your shared folder permissions allow read access to your anime library directory. Set the volume mount to the shared folder path (e.g. `/volume1/media/anime`).
</Callout>

</Tab>
<Tab value="Unraid">

## Unraid

<Steps>
<Step>
### Install Docker Compose Manager

In the Unraid **Community Applications** store, install the **Docker Compose Manager** plugin.
</Step>
<Step>
### Create compose stack

Add a new stack with the milmil `docker-compose.yml` and `.env` file. See [Docker Deployment](/docs/getting-started/docker).
</Step>
<Step>
### Configure paths

Map your media share:

```yaml
volumes:
  - /mnt/user/media/anime:/media/anime
  - /mnt/user/appdata/milmil:/data
```
</Step>
<Step>
### Start the stack

Apply the compose stack from the Docker Compose Manager UI.
</Step>
</Steps>

<Callout type="info">
Use `/mnt/user/appdata/milmil` for persistent data to follow Unraid conventions.
</Callout>

</Tab>
<Tab value="TrueNAS">

## TrueNAS SCALE

<Steps>
<Step>
### Navigate to Apps

In the TrueNAS SCALE web UI, go to **Apps > Discover Apps**.
</Step>
<Step>
### Custom App

Click **Custom App** and configure a Docker Compose deployment with the milmil compose file.
</Step>
<Step>
### Configure storage

Map your dataset paths:

```yaml
volumes:
  - /mnt/pool/media/anime:/media/anime
  - /mnt/pool/apps/milmil:/data
```
</Step>
</Steps>

<Callout type="warn">
TrueNAS SCALE uses Kubernetes under the hood for custom apps. Make sure your pool paths are correct and accessible.
</Callout>

</Tab>
<Tab value="Raspberry Pi">

## Raspberry Pi (4/5)

<Callout type="warn">
Raspberry Pi has limited CPU for transcoding. Direct play and container remux work well, but HLS transcoding will be slow. Use pre-encoded MP4 files for best results.
</Callout>

<Steps>
<Step>
### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in for group changes to take effect.
</Step>
<Step>
### Clone and start

```bash
git clone https://github.com/milmil-org/milmil.git
cd milmil
docker compose up -d
```
</Step>
</Steps>

<Callout type="info">
Use an SSD (via USB 3.0) instead of an SD card for the data volume — SD cards have limited write endurance and are slow for database operations.
</Callout>

</Tab>
</Tabs>
```

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add content/docs/getting-started/platforms.mdx
git commit -m "docs: add platform-specific guides (Synology, Unraid, TrueNAS, RPi)"
```

---

### Task 8: Write new content — Reverse Proxy & Performance

**Files:**
- Modify: `content/docs/configuration/reverse-proxy.mdx` (replace stub)
- Modify: `content/docs/configuration/performance.mdx` (replace stub)

- [ ] **Step 1: Write reverse-proxy.mdx**

Replace `content/docs/configuration/reverse-proxy.mdx` with:

```mdx
---
title: Reverse Proxy
description: Configure Nginx, Caddy, or Traefik as a reverse proxy for milmil.
---

<Callout type="info">
A reverse proxy is required for HTTPS and recommended for production deployments. milmil uses WebSocket connections for real-time features (danmaku, notifications), so your proxy must support WebSocket upgrades.
</Callout>

<Tabs items={["Nginx", "Caddy", "Traefik"]}>
<Tab value="Nginx">

## Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name milmil.example.com;

    ssl_certificate /etc/letsencrypt/live/milmil.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/milmil.example.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API + WebSocket
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Streaming — increase timeouts and disable buffering
    location /api/v1/stream/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 0;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name milmil.example.com;
    return 301 https://$host$request_uri;
}
```

<Callout type="warn">
The streaming location block disables buffering and increases timeouts. Without this, large video files may fail to stream.
</Callout>

### Let's Encrypt with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d milmil.example.com
```

</Tab>
<Tab value="Caddy">

## Caddy

Caddy provides automatic HTTPS with Let's Encrypt.

```
milmil.example.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }

    handle /ws {
        reverse_proxy localhost:8080
    }

    handle {
        reverse_proxy localhost:3000
    }
}
```

<Callout type="info">
Caddy handles HTTPS certificates automatically — no additional configuration needed. Just point your DNS to the server.
</Callout>

</Tab>
<Tab value="Traefik">

## Traefik

Add labels to your `docker-compose.yml`:

```yaml
services:
  milmil-web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.milmil.rule=Host(`milmil.example.com`)"
      - "traefik.http.routers.milmil.tls.certresolver=letsencrypt"
      - "traefik.http.services.milmil.loadbalancer.server.port=3000"

  milmil-api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.milmil-api.rule=Host(`milmil.example.com`) && (PathPrefix(`/api`) || PathPrefix(`/ws`))"
      - "traefik.http.routers.milmil-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.milmil-api.loadbalancer.server.port=8080"
```

</Tab>
</Tabs>

## Troubleshooting

<Accordions>
<Accordion title="WebSocket connection fails (danmaku not loading)">
Ensure your proxy passes the `Upgrade` and `Connection` headers for the `/ws` and `/api/` paths. Check that `proxy_http_version 1.1` is set in Nginx.
</Accordion>
<Accordion title="Video streaming cuts off or is slow">
Disable proxy buffering for the streaming endpoint. In Nginx, set `proxy_buffering off` and increase `proxy_read_timeout`.
</Accordion>
<Accordion title="502 Bad Gateway">
Check that both `milmil-api` (port 8080) and `milmil-web` (port 3000) are running. Verify with `docker ps`.
</Accordion>
</Accordions>
```

- [ ] **Step 2: Write performance.mdx**

Replace `content/docs/configuration/performance.mdx` with:

```mdx
---
title: Performance Tuning
description: Optimize milmil for production workloads.
---

## Redis Cache

<Callout type="info">
Redis is optional but strongly recommended for production. Without Redis, milmil uses an in-memory cache that doesn't persist across restarts.
</Callout>

```bash
REDIS_URL=redis://localhost:6379
```

### Sizing Recommendations

| Library Size | Recommended Redis Memory |
|---|---|
| < 500 anime | 64 MB |
| 500–2000 anime | 256 MB |
| 2000+ anime | 512 MB+ |

## Transcoding

### Hardware Acceleration

<Callout type="warn">
Hardware acceleration significantly reduces CPU usage during transcoding. Without it, a single 1080p transcode stream can use 100% of a CPU core.
</Callout>

milmil supports FFmpeg hardware acceleration backends:

<TypeTable
  type={{
    "VAAPI": { type: 'backend', description: 'Video Acceleration API (Intel, AMD on Linux)' },
    "NVENC": { type: 'backend', description: 'NVIDIA GPU encoding' },
    "QSV": { type: 'backend', description: 'Intel Quick Sync Video' },
    "VideoToolbox": { type: 'backend', description: 'macOS hardware acceleration' },
  }}
/>

For Docker, pass through the GPU device:

```yaml
# NVIDIA
devices:
  - /dev/nvidia0:/dev/nvidia0
  - /dev/nvidiactl:/dev/nvidiactl

# Intel VAAPI
devices:
  - /dev/dri:/dev/dri
```

### Quality Presets

| Preset | Use Case | CPU Usage |
|---|---|---|
| `ultrafast` | Low-power devices (RPi) | Minimal |
| `fast` | Balanced quality/speed | Moderate |
| `medium` | Default — good quality | High |

## Database Tuning

<Tabs items={["PostgreSQL", "SQLite"]}>
<Tab value="PostgreSQL">

For large libraries, tune PostgreSQL:

```sql
-- Connection pool (set in DATABASE_URL)
-- ?pool_max_conns=20&pool_min_conns=5

-- Recommended postgresql.conf tweaks
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
```

</Tab>
<Tab value="SQLite">

SQLite works well for small to medium libraries. Enable WAL mode for better concurrent read performance (milmil enables this automatically):

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

<Callout type="warn">
SQLite has limited write concurrency. If you're running frequent scans or downloads simultaneously, consider switching to PostgreSQL.
</Callout>

</Tab>
</Tabs>
```

- [ ] **Step 3: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 4: Commit**

```bash
git add content/docs/configuration/reverse-proxy.mdx content/docs/configuration/performance.mdx
git commit -m "docs: add reverse proxy and performance tuning guides"
```

---

### Task 9: Write new content — Bot feature page

**Files:**
- Modify: `content/docs/features/bot.mdx` (replace stub)

- [ ] **Step 1: Write bot.mdx**

Replace `content/docs/features/bot.mdx` with:

```mdx
---
title: Bot & Notifications
description: Set up Discord and Telegram bots with interactive commands and push notifications.
---

## Overview

milmil supports interactive bot commands and push notifications through Telegram, Discord, and generic webhooks. Bots are first-class citizens — they can search anime, manage downloads, show schedules, and control subscriptions.

<Cards>
  <Card title="Setup Guide" href="/docs/configuration/notifications">
    Step-by-step setup for Telegram, Discord, and webhooks.
  </Card>
</Cards>

## Bot Commands

Both Telegram and Discord bots support the same command set:

<TypeTable
  type={{
    "/start": { type: 'command', description: 'Welcome message and command list' },
    "/schedule": { type: 'command', description: 'Weekly airing schedule with day-of-week grouping' },
    "/search <query>": { type: 'command', description: 'Search anime by title' },
    "/detail <id>": { type: 'command', description: 'Anime details with cover image and score' },
    "/downloads": { type: 'command', description: 'Active downloads with progress bars' },
    "/subscribe <anime>": { type: 'command', description: 'Set up auto-download for new episodes' },
    "/status": { type: 'command', description: 'System overview (uptime, disk, active streams)' },
    "/mylist [status]": { type: 'command', description: 'Your anime collection filtered by status' },
    "/continue": { type: 'command', description: 'Recently watched with resume links' },
  }}
/>

## Interactive Features

Commands support inline buttons for quick actions:

- **Search results** — Buttons to view details, subscribe, or download
- **Download list** — Pause, resume, or cancel buttons
- **Anime detail** — Subscribe, add to collection, or start playback

<Callout type="info">
Discord uses slash commands with autocomplete. Telegram uses inline keyboards and callback buttons.
</Callout>

## Push Notifications

Configure which events trigger notifications:

| Event | Description |
|---|---|
| Download Started | RSS rule triggers a new download |
| Download Completed | Download finishes successfully |
| Download Failed | Download encounters an error |
| Library Scan Complete | Library scan finishes processing |
| System Error | Background job fails unexpectedly |

Notifications include rich embeds (Discord) or formatted messages (Telegram) with anime cover images and metadata.

## Security

<Callout type="warn">
Always configure **Allowed Chat IDs** (Telegram) or **Allowed Guild IDs** (Discord) to restrict who can interact with your bot. Without these restrictions, anyone who discovers your bot can control your milmil instance.
</Callout>
```

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add content/docs/features/bot.mdx
git commit -m "docs: add bot & notifications feature page"
```

---

### Task 10: Write new content — Troubleshooting section

**Files:**
- Modify: `content/docs/troubleshooting/index.mdx` (replace stub)
- Modify: `content/docs/troubleshooting/playback.mdx` (replace stub)
- Modify: `content/docs/troubleshooting/scanning.mdx` (replace stub)
- Modify: `content/docs/troubleshooting/networking.mdx` (replace stub)

- [ ] **Step 1: Write troubleshooting index.mdx (FAQ)**

Replace `content/docs/troubleshooting/index.mdx` with:

```mdx
---
title: FAQ
description: Frequently asked questions and common solutions.
---

## General

<Accordions>
<Accordion title="What are the minimum system requirements?">
- **CPU:** 2 cores (4+ recommended for transcoding)
- **RAM:** 1 GB minimum, 2 GB+ recommended
- **Storage:** Depends on your media library. milmil itself uses < 500 MB for the application and database.
- **FFmpeg:** Required for media info extraction and transcoding
</Accordion>
<Accordion title="Does milmil support multiple users?">
Yes. Create additional user accounts from **Settings > Users**. Each user has their own collection, watch progress, and preferences.
</Accordion>
<Accordion title="Can I access milmil from outside my network?">
Yes, but you need to set up a reverse proxy with HTTPS. See the [Reverse Proxy](/docs/configuration/reverse-proxy) guide. Do not expose milmil directly to the internet without HTTPS.
</Accordion>
<Accordion title="Which video formats are supported?">
milmil can play any format FFmpeg supports. For direct play, the browser must support the codec (typically H.264/H.265 in MP4). Other formats are automatically remuxed or transcoded.
</Accordion>
<Accordion title="How do I update milmil?">
Pull the latest Docker image and restart:

```bash
docker compose pull
docker compose up -d
```

Database migrations are applied automatically on startup.
</Accordion>
</Accordions>

## Specific Issues

<Cards>
  <Card title="Playback Issues" href="/docs/troubleshooting/playback">
    Streaming, transcoding, danmaku, and subtitle problems.
  </Card>
  <Card title="Scanning Issues" href="/docs/troubleshooting/scanning">
    Library scanning, metadata matching, and file detection.
  </Card>
  <Card title="Networking Issues" href="/docs/troubleshooting/networking">
    Connectivity, reverse proxy, WebSocket, and CORS problems.
  </Card>
</Cards>
```

- [ ] **Step 2: Write playback.mdx**

Replace `content/docs/troubleshooting/playback.mdx` with:

```mdx
---
title: Playback Issues
description: Troubleshoot streaming, transcoding, and danmaku problems.
---

<Accordions>
<Accordion title="Video won't play / black screen">
**Cause:** The video codec isn't supported for direct play in your browser.

**Solution:**
1. Check the file's codec in the library file browser (e.g. HEVC, AV1)
2. milmil should automatically fall back to remux or transcode — check that FFmpeg is installed and accessible
3. Try a different browser (Chrome has the best codec support)
</Accordion>

<Accordion title="Transcoding is very slow">
**Cause:** Software transcoding uses CPU, which is slow for HD/4K content.

**Solution:**
1. Enable hardware acceleration — see [Performance Tuning](/docs/configuration/performance)
2. Use the `ultrafast` or `fast` preset for lower-power devices
3. Pre-encode your files to H.264 MP4 for direct play (no transcoding needed)
</Accordion>

<Accordion title="Danmaku (bullet comments) not showing">
**Cause:** DandanPlay integration not configured or no comments available for this episode.

**Solution:**
1. Verify DandanPlay credentials are set — see [Integrations](/docs/configuration/integrations)
2. Check that the episode was matched via DandanPlay (file hash match)
3. Some episodes may have few or no comments available
4. If behind a reverse proxy, ensure WebSocket connections work — see [Reverse Proxy](/docs/configuration/reverse-proxy)
</Accordion>

<Accordion title="Subtitles not appearing">
**Solution:**
1. Check that the subtitle track is selected in the player controls
2. For embedded subtitles, milmil extracts them from MKV/MP4 containers automatically
3. For external subtitles, ensure the `.srt`/`.ass`/`.vtt` file is in the same directory as the video with the same base filename
4. ASS subtitles with complex styling may not render perfectly in the web player
</Accordion>

<Accordion title="Video buffering / seeking is slow">
**Solution:**
1. If using HLS transcoding, previously seeked segments are cached — subsequent seeks will be faster
2. Check your network bandwidth between the server and client
3. For remote access, ensure your reverse proxy doesn't buffer the stream — see [Reverse Proxy](/docs/configuration/reverse-proxy)
</Accordion>
</Accordions>
```

- [ ] **Step 3: Write scanning.mdx**

Replace `content/docs/troubleshooting/scanning.mdx` with:

```mdx
---
title: Scanning Issues
description: Troubleshoot library scanning and metadata matching problems.
---

<Accordions>
<Accordion title="Files not detected during scan">
**Common causes:**

1. **Wrong path:** Ensure the library path matches your volume mount. In Docker, use the container-side path (e.g. `/media/anime`, not `/path/on/host/anime`)
2. **Permissions:** The milmil process must have read access to the media directory
3. **File extensions:** milmil scans for common video extensions (`.mkv`, `.mp4`, `.avi`, `.webm`, etc.). Non-standard extensions are skipped
4. **Hidden files:** Files starting with `.` are ignored by default
</Accordion>

<Accordion title="Anime matched to wrong entry">
**Solution:**

1. Go to the library detail page
2. Click the mismatched anime entry
3. Click **Unmatch** to remove the incorrect match
4. Click **Manual Match** and search for the correct anime
5. Select the correct entry from the search results

<Callout type="info">
Tip: DandanPlay file hash matching is the most accurate method. If your files have standard fansub naming (e.g. `[SubGroup] Title - 01.mkv`), matching accuracy is high.
</Callout>
</Accordion>

<Accordion title="Scan stuck or very slow">
**Common causes:**

1. **Network storage latency:** Scanning remote backends (SMB, SFTP, rclone) is slower than local storage
2. **Large library:** First scans of large libraries (10,000+ files) can take several minutes
3. **FFmpeg probing:** Each file is probed for codec info — this adds time per file
4. **API rate limits:** Metadata providers may rate-limit requests for large batch matches

**Solution:** Check scan progress in the UI. If truly stuck, restart milmil and try scanning a smaller subset first.
</Accordion>

<Accordion title="Rclone backend not connecting">
**Solution:**

1. Verify your rclone remote works independently: `rclone ls remote:path`
2. Check that the rclone config is accessible to the milmil process
3. For Docker, mount your rclone config into the container
4. Ensure the cloud provider credentials haven't expired (OAuth tokens need periodic refresh)
</Accordion>
</Accordions>
```

- [ ] **Step 4: Write networking.mdx**

Replace `content/docs/troubleshooting/networking.mdx` with:

```mdx
---
title: Networking Issues
description: Troubleshoot connectivity, reverse proxy, and WebSocket problems.
---

<Accordions>
<Accordion title="Can't access milmil from other devices on the network">
**Solution:**

1. Check that milmil is listening on `0.0.0.0`, not `127.0.0.1` (localhost only)
2. Check firewall rules — ports 3000 (web) and 8080 (API) must be open
3. Try accessing via IP address (e.g. `http://192.168.1.100:3000`)
4. In Docker, ensure ports are mapped with `-p 3000:3000 -p 8080:8080`
</Accordion>

<Accordion title="502 Bad Gateway from reverse proxy">
**Common causes:**

1. milmil services not running — check with `docker ps`
2. Wrong upstream port in proxy config
3. Proxy trying HTTPS to upstream when milmil only serves HTTP

**Solution:** Verify services are running, then check proxy error logs (`/var/log/nginx/error.log` for Nginx).
</Accordion>

<Accordion title="WebSocket connection fails">
**Symptoms:** Danmaku not loading, notifications not updating in real-time.

**Solution:**

1. Ensure your reverse proxy passes WebSocket upgrade headers — see [Reverse Proxy](/docs/configuration/reverse-proxy)
2. Check that both `/ws` and `/api/` paths have WebSocket support configured
3. Some CDNs (Cloudflare free tier) have WebSocket limitations — check your CDN settings
</Accordion>

<Accordion title="CORS errors in browser console">
**Cause:** The API and frontend are on different domains or ports without proper CORS headers.

**Solution:**

1. Use a reverse proxy to serve both frontend and API under the same domain (recommended)
2. If running separately, milmil's API sets CORS headers automatically based on the `CORS_ORIGIN` environment variable
</Accordion>

<Accordion title="Torrent downloads not starting">
**Solution:**

1. Check that port `42069` (or your configured `TORRENT_LISTEN_PORT`) is open and port-forwarded on your router
2. DHT needs time to bootstrap on first run — wait a few minutes
3. Check if your ISP blocks BitTorrent traffic
4. In Docker, the torrent port must be mapped: `-p 42069:42069/tcp -p 42069:42069/udp`
</Accordion>
</Accordions>
```

- [ ] **Step 5: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 6: Commit**

```bash
git add content/docs/troubleshooting/
git commit -m "docs: add troubleshooting FAQ, playback, scanning, and networking pages"
```

---

### Task 11: Write new content — Contributing section

**Files:**
- Modify: `content/docs/contributing/index.mdx` (replace stub)
- Modify: `content/docs/contributing/development.mdx` (replace stub)
- Modify: `content/docs/contributing/reporting.mdx` (replace stub)

- [ ] **Step 1: Write contributing index.mdx**

Replace `content/docs/contributing/index.mdx` with:

```mdx
---
title: Contributing
description: How to contribute to milmil.
---

## Welcome

milmil is an open-source project and contributions are welcome! Whether you're fixing bugs, adding features, improving documentation, or reporting issues, every contribution helps.

<Cards>
  <Card title="Development Setup" href="/docs/contributing/development">
    Set up a local development environment.
  </Card>
  <Card title="Reporting Issues" href="/docs/contributing/reporting">
    How to report bugs and request features.
  </Card>
</Cards>

## Ways to Contribute

- **Code** — Fix bugs, implement features, improve performance
- **Documentation** — Improve docs, add translations, fix typos
- **Bug Reports** — Report issues with detailed reproduction steps
- **Feature Requests** — Suggest new features or improvements
- **Translations** — Help translate the UI and docs to new languages

## Code of Conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct.
```

- [ ] **Step 2: Write development.mdx**

Replace `content/docs/contributing/development.mdx` with:

```mdx
---
title: Development Setup
description: Set up a local development environment for milmil.
---

## Prerequisites

- **Go 1.26+** — Backend API
- **Bun 1.3+** — Frontend build tool
- **FFmpeg** — Media processing
- **Docker** — For PostgreSQL and Redis (or install locally)

## Getting Started

<Tabs items={["Full Stack", "Backend Only", "Frontend Only"]}>
<Tab value="Full Stack">

<Steps>
<Step>
### Clone the repository

```bash
git clone https://github.com/milmil-org/milmil.git
cd milmil
```
</Step>
<Step>
### Start infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL and Redis for development.
</Step>
<Step>
### Start the backend

```bash
cd api
cp .env.example .env
go mod download
make dev
```

The API server starts at `http://localhost:8080` with hot reload.
</Step>
<Step>
### Start the frontend

```bash
cd web
bun install
bun run dev
```

The dev server starts at `http://localhost:5173` with HMR.
</Step>
</Steps>

</Tab>
<Tab value="Backend Only">

```bash
cd api
cp .env.example .env
go mod download
make dev
```

The API server starts at `http://localhost:8080` with hot reload.

</Tab>
<Tab value="Frontend Only">

```bash
cd web
bun install
bun run dev
```

The dev server starts at `http://localhost:5173`. Configure `VITE_API_URL=http://localhost:8080` to point at a running backend.

</Tab>
</Tabs>

## Repository Structure

<Files>
  <Folder name="milmil" defaultOpen>
    <Folder name="api" defaultOpen>
      <Folder name="internal">
        <Folder name="api" />
        <Folder name="bot" />
        <Folder name="domain" />
        <Folder name="infra" />
        <Folder name="service" />
      </Folder>
      <File name="go.mod" />
      <File name="Makefile" />
    </Folder>
    <Folder name="web" defaultOpen>
      <Folder name="src">
        <Folder name="components" />
        <Folder name="features" />
        <Folder name="pages" />
      </Folder>
      <File name="package.json" />
    </Folder>
    <Folder name="website">
      <Folder name="content" />
      <File name="package.json" />
    </Folder>
    <File name="docker-compose.yml" />
    <File name="Makefile" />
  </Folder>
</Files>

## Pull Request Guidelines

1. Fork the repository and create a feature branch
2. Write tests for new functionality
3. Ensure `make lint` and `make test` pass
4. Keep PRs focused — one feature or fix per PR
5. Write clear commit messages describing the change
```

- [ ] **Step 3: Write reporting.mdx**

Replace `content/docs/contributing/reporting.mdx` with:

```mdx
---
title: Reporting Issues
description: How to report bugs and request features.
---

## Bug Reports

<Steps>
<Step>
### Search existing issues

Before filing a new bug, check [GitHub Issues](https://github.com/milmil-org/milmil/issues) to see if it's already reported.
</Step>
<Step>
### Gather information

Include in your report:

- milmil version (shown in **Settings > System**)
- Deployment method (Docker, manual)
- Operating system and architecture
- Browser and version (for UI bugs)
- Relevant log output
</Step>
<Step>
### File the issue

Open a [new issue](https://github.com/milmil-org/milmil/issues/new) with a clear title and detailed description. Include steps to reproduce the bug.
</Step>
</Steps>

<Callout type="info">
Include relevant log output from `docker logs milmil-api` for backend issues. For frontend issues, include browser console errors (F12 > Console).
</Callout>

## Feature Requests

Open a [GitHub Discussion](https://github.com/milmil-org/milmil/discussions) for feature ideas. Describe:

- **What** you want to achieve
- **Why** it would be useful
- **How** you envision it working (optional)

## Questions & Help

For general questions, use [GitHub Discussions](https://github.com/milmil-org/milmil/discussions) rather than filing an issue. Issues are reserved for confirmed bugs and tracked work items.
```

- [ ] **Step 4: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 5: Commit**

```bash
git add content/docs/contributing/
git commit -m "docs: add contributing guides (overview, development, reporting)"
```

---

### Task 12: Write new content — Migration & Architecture

**Files:**
- Modify: `content/docs/migration/index.mdx` (replace stub)
- Modify: `content/docs/architecture/index.mdx` (replace stub)

- [ ] **Step 1: Write migration index.mdx**

Replace `content/docs/migration/index.mdx` with:

```mdx
---
title: Migration Guide
description: Migrate to milmil from other anime media servers.
---

<Callout type="info">
milmil does not have automated migration tools yet. The guides below describe what can be manually transferred and what requires re-setup.
</Callout>

<Tabs items={["From Jellyfin", "From Plex", "From Seanime"]}>
<Tab value="From Jellyfin">

## Migrating from Jellyfin

### What transfers
- **Media files** — Point milmil at the same media directory. No need to move files.
- **File organization** — milmil supports the same folder-per-show structure.

### What needs re-setup
- **Metadata** — milmil uses different metadata providers (Bangumi, AniList, DandanPlay instead of TheTVDB/TMDb). All metadata will be re-matched during the first scan.
- **Watch progress** — Not transferable. Start fresh or manually mark watched episodes.
- **User accounts** — Create new accounts in milmil.

<Callout type="warn">
milmil's metadata matching is optimized for anime specifically. Shows that were difficult to match in Jellyfin may match more accurately in milmil due to anime-specific providers like DandanPlay and Bangumi.
</Callout>

### Steps

<Steps>
<Step>
Install milmil alongside Jellyfin (they can coexist).
</Step>
<Step>
Point milmil at the same media directory Jellyfin uses.
</Step>
<Step>
Run a full library scan in milmil.
</Step>
<Step>
Verify metadata matches, manually correct any mismatches.
</Step>
<Step>
Connect Bangumi/AniList if you want collection sync.
</Step>
</Steps>

</Tab>
<Tab value="From Plex">

## Migrating from Plex

### What transfers
- **Media files** — Point milmil at the same media directory.

### What needs re-setup
- **Metadata** — All re-matched from anime-specific providers.
- **Watch progress** — Not transferable.
- **Playlists/Collections** — Not transferable.
- **User accounts** — Create new accounts.

### Steps

<Steps>
<Step>
Install milmil alongside Plex.
</Step>
<Step>
Point milmil at the same media library path.
</Step>
<Step>
Run a full library scan.
</Step>
<Step>
Review and correct metadata matches.
</Step>
</Steps>

</Tab>
<Tab value="From Seanime">

## Migrating from Seanime

### What transfers
- **Media files** — Same directory structure.
- **AniList data** — If you used AniList with Seanime, connect the same AniList account in milmil to sync your collection.

### What needs re-setup
- **Local metadata** — Re-scanned and re-matched.
- **Download rules** — RSS subscriptions need to be recreated.
- **Settings** — All application settings.

### Steps

<Steps>
<Step>
Install milmil and point it at your anime directory.
</Step>
<Step>
Connect your AniList account to recover collection data.
</Step>
<Step>
Run a full library scan.
</Step>
<Step>
Re-create any RSS subscriptions or download rules.
</Step>
</Steps>

</Tab>
</Tabs>
```

- [ ] **Step 2: Write architecture index.mdx**

Replace `content/docs/architecture/index.mdx` with:

```mdx
---
title: Architecture
description: milmil system architecture and internals.
---

## System Overview

milmil is a monolithic Go backend with a React SPA frontend, designed for self-hosted deployment.

```
┌─────────────────────────────────────────────────┐
│                   Clients                       │
│         Browser (PWA)  │  Telegram/Discord Bot  │
└───────────┬─────────────────────┬───────────────┘
            │ HTTP/WS             │ Bot API
┌───────────▼─────────────────────▼───────────────┐
│                milmil-api (Go)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ REST API │ │WebSocket │ │ Bot Engine       ││
│  └────┬─────┘ └────┬─────┘ └───────┬──────────┘│
│       │             │               │           │
│  ┌────▼─────────────▼───────────────▼──────────┐│
│  │              Service Layer                  ││
│  │  Library │ Stream │ Download │ Discover     ││
│  │  Collection │ Auth │ Notification           ││
│  └────┬────────────────────────────────────────┘│
│       │                                         │
│  ┌────▼────────────────────────────────────────┐│
│  │           Infrastructure Layer              ││
│  │  PostgreSQL/SQLite │ Redis │ FFmpeg │ Rclone││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              milmil-web (React SPA)             │
│  Served via Nginx or dev server                 │
└─────────────────────────────────────────────────┘
```

## Component Overview

<TypeTable
  type={{
    "REST API": { type: 'component', description: 'Chi router serving JSON endpoints. Handles auth, CRUD, streaming, and search.' },
    "WebSocket": { type: 'component', description: 'Real-time event push for danmaku, notifications, and scan progress.' },
    "Bot Engine": { type: 'component', description: 'Platform-agnostic bot with adapters for Telegram and Discord.' },
    "Service Layer": { type: 'component', description: 'Business logic for library scanning, metadata matching, download management, and collection sync.' },
    "FFmpeg": { type: 'component', description: 'Media probing, container remuxing, and HLS transcoding.' },
    "Rclone": { type: 'component', description: 'Cloud storage abstraction for 40+ providers.' },
  }}
/>

## Data Flow: Library Scan

<Steps>
<Step>
### File Discovery

Walk the storage backend (local, SMB, rclone, etc.) to enumerate all media files.
</Step>
<Step>
### Media Probing

FFmpeg probes each file for codec info, resolution, duration, embedded subtitles, and audio tracks.
</Step>
<Step>
### Metadata Matching

Match files to anime entries using the provider pipeline: DandanPlay (hash) → Bangumi (title) → AniList (title) → TMDB (fallback).
</Step>
<Step>
### Enrichment

Fetch cover images, episode titles, descriptions, and ratings from matched providers.
</Step>
<Step>
### Persistence

Store all metadata in the database. Send scan completion notification.
</Step>
</Steps>

## Data Flow: Streaming

```
Client request
    │
    ▼
┌─────────────────┐
│ Codec supported? │──yes──▶ Direct Play (byte-range)
└────────┬────────┘
         │ no
         ▼
┌─────────────────┐
│ Container only?  │──yes──▶ Remux (MKV→MP4, no re-encode)
└────────┬────────┘
         │ no
         ▼
    HLS Transcode (FFmpeg)
```

## Technology Stack

<TypeTable
  type={{
    "Backend": { type: 'Go', description: 'Chi router, sqlc, golang-migrate, anacrolix/torrent' },
    "Frontend": { type: 'React', description: 'Vite, TanStack Router, TanStack Query, Tailwind CSS' },
    "Database": { type: 'PostgreSQL/SQLite', description: 'Schema managed with golang-migrate' },
    "Cache": { type: 'Redis', description: 'Optional, in-memory fallback available' },
    "Media": { type: 'FFmpeg', description: 'Probing, remuxing, HLS transcoding' },
    "Storage": { type: 'Rclone', description: '40+ cloud provider backends' },
    "Docs": { type: 'Fumadocs', description: 'Next.js-based documentation with i18n' },
  }}
/>

## Repository Structure

<Files>
  <Folder name="milmil" defaultOpen>
    <Folder name="api" defaultOpen>
      <Folder name="internal" defaultOpen>
        <Folder name="api">api routes, middleware, OpenAPI spec</Folder>
        <Folder name="bot">bot engine, adapters (Telegram, Discord)</Folder>
        <Folder name="domain">entities, repository interfaces</Folder>
        <Folder name="infra">database, redis, FFmpeg, rclone implementations</Folder>
        <Folder name="service">business logic (library, stream, download, etc.)</Folder>
      </Folder>
      <File name="go.mod" />
      <File name="Makefile" />
    </Folder>
    <Folder name="web">React SPA frontend</Folder>
    <Folder name="website">documentation site (this site)</Folder>
    <File name="docker-compose.yml" />
    <File name="Makefile" />
  </Folder>
</Files>
```

- [ ] **Step 3: Verify build succeeds**

```bash
bun run build
```

- [ ] **Step 4: Commit**

```bash
git add content/docs/migration/ content/docs/architecture/
git commit -m "docs: add migration guide and architecture overview"
```

---

### Task 13: Set up API Reference with fumadocs-openapi

**Files:**
- Create: `content/docs/api/openapi.json` (copy from API codebase)
- Create: `lib/openapi.ts`
- Create: `app/[lang]/docs/api/[[...slug]]/page.tsx`
- Create: `scripts/generate-api-docs.mjs`
- Modify: `package.json` (add generate:api script)
- Modify: `content/docs/meta.json` (already has "api" — verify)

- [ ] **Step 1: Copy openapi.json from API codebase**

```bash
cp /Users/niskan516/Sync/Workspace/dev/milmil/api/internal/api/openapi.json \
   /Users/niskan516/Sync/Workspace/dev/milmil/.worktrees/website/website/content/docs/api/openapi.json
```

- [ ] **Step 2: Create lib/openapi.ts**

Create `lib/openapi.ts`:

```ts
import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: ['./content/docs/api/openapi.json'],
});
```

- [ ] **Step 3: Create the API page route**

Create `app/[lang]/docs/api/[[...slug]]/page.tsx`:

```tsx
import { openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const APIPage = createAPIPage(openapi);

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { slug } = await params;
  return <APIPage slug={slug} />;
}

export function generateStaticParams() {
  return openapi.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = openapi.getPage(slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.description,
  };
}
```

- [ ] **Step 4: Create generate script**

Create `scripts/generate-api-docs.mjs`:

```js
import { generateFiles } from 'fumadocs-openapi';

await generateFiles({
  input: ['./content/docs/api/openapi.json'],
  output: './content/docs/api',
});

console.log('API docs generated successfully.');
```

- [ ] **Step 5: Add script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"generate:api": "node scripts/generate-api-docs.mjs"
```

- [ ] **Step 6: Run the generate script**

```bash
bun run generate:api
```

- [ ] **Step 7: Verify build succeeds**

```bash
bun run build
```

<Callout type="warn">
The fumadocs-openapi integration may require adjustments depending on the exact API version and how it integrates with the i18n routing. If the build fails, check the fumadocs-openapi docs for the correct page component setup with i18n. The API page may need to be outside the i18n layout or use a different source configuration.
</Callout>

- [ ] **Step 8: Commit**

```bash
git add content/docs/api/ lib/openapi.ts app/\[lang\]/docs/api/ scripts/ package.json
git commit -m "docs: set up API reference with fumadocs-openapi"
```

---

### Task 14: Update E2E tests for new pages

**Files:**
- Modify: `e2e/docs-full.spec.ts`

- [ ] **Step 1: Update the CHILD_PAGES list in docs-full.spec.ts**

In `e2e/docs-full.spec.ts`, replace the `CHILD_PAGES` array with:

```ts
const CHILD_PAGES = [
  'getting-started/installation',
  'getting-started/docker',
  'getting-started/first-setup',
  'getting-started/platforms',
  'configuration/environment',
  'configuration/integrations',
  'configuration/notifications',
  'configuration/reverse-proxy',
  'configuration/performance',
  'features/library',
  'features/streaming',
  'features/downloads',
  'features/discovery',
  'features/collection',
  'features/bot',
  'troubleshooting',
  'troubleshooting/playback',
  'troubleshooting/scanning',
  'troubleshooting/networking',
  'contributing',
  'contributing/development',
  'contributing/reporting',
  'migration',
  'architecture',
];
```

- [ ] **Step 2: Build the site**

```bash
bun run build
```

- [ ] **Step 3: Run E2E tests**

```bash
bun run test:e2e
```

Expected: All tests pass — every new page loads with an h1, no framework errors, body content > 100 chars.

- [ ] **Step 4: Commit**

```bash
git add e2e/docs-full.spec.ts
git commit -m "test: add all new doc pages to E2E test suite"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full build**

```bash
bun run build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Start dev server and verify manually**

```bash
bun run dev
```

Open `http://localhost:3000/zh-HK/docs` and verify:
1. Sidebar shows all new sections (Getting Started, Features, Configuration, API Reference, Troubleshooting, Contributing, Migration, Architecture)
2. Cards render on the introduction page
3. Tabs switch correctly on installation page
4. Steps render with numbered indicators
5. Callout blocks display with correct styling (info=blue, warn=yellow, error=red)
6. TypeTable renders structured data
7. Files/Folder tree renders correctly
8. Accordions expand/collapse on the FAQ page
9. Navigate between pages via sidebar — no blank pages or errors

- [ ] **Step 4: Run E2E tests**

```bash
bun run build && bun run test:e2e
```

Expected: All tests pass.
