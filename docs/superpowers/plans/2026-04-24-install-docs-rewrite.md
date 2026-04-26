# Install Docs Rewrite + Locale Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `docs-site` getting-started into a single happy-path install flow, remove `ja`/`ko` locales from docs-site, and sync `README` install sections.

**Architecture:** Single-PR change. First: structural trim of `ja`/`ko` locales (config + routing, then content files). Then: rewrite 4 getting-started pages in EN. Then: translate to `zh-CN` / `zh-TW` / `zh-HK`. Then: sync 4 README install sections. Final verification sweep.

**Tech Stack:** Fumadocs MDX, Next.js App Router, Lingui i18n, Playwright e2e, Bun.

**Spec:** `docs/superpowers/specs/2026-04-24-install-docs-rewrite-design.md`

**Pre-flight findings baked into plan:**
- `/health` endpoint returns `{"status":"ok","version":"1.0.0"}` (`api/internal/api/health.go:9`)
- Manual build command: `go build -o milmil-api ./cmd/server` (confirmed in `api/Dockerfile:30-34`; no `api/Makefile` exists)
- Authoritative locale array is `docs-site/lib/i18n.ts:5` (`generateStaticParams` reads from it)
- Image names: `milmildev/milmil-api`, `milmildev/milmil-web` (`docker-compose.yml`)

---

## Task 1: Remove ja/ko from docs-site routing and i18n config

**Files:**
- Modify: `docs-site/lib/i18n.ts:5`
- Modify: `docs-site/lingui.config.ts:4`
- Modify: `docs-site/app/[lang]/layout.tsx:16-17,26-27`
- Modify: `docs-site/app/api/search/route.ts:12-13`
- Modify: `docs-site/e2e/full-site.spec.ts:4`
- Modify: `docs-site/e2e/landing.spec.ts:76,84`

- [ ] **Step 1.1: Update `lib/i18n.ts` authoritative locale list**

Replace:
```ts
export const i18n: I18nConfig = {
  defaultLanguage: 'en',
  languages: ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko'],
  hideLocale: 'never',
};
```
With:
```ts
export const i18n: I18nConfig = {
  defaultLanguage: 'en',
  languages: ['en', 'zh-CN', 'zh-TW', 'zh-HK'],
  hideLocale: 'never',
};
```

- [ ] **Step 1.2: Update `lingui.config.ts`**

Replace:
```ts
locales: ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko'],
```
With:
```ts
locales: ['en', 'zh-CN', 'zh-TW', 'zh-HK'],
```

- [ ] **Step 1.3: Remove ja/ko from `app/[lang]/layout.tsx` display names**

Delete lines 16-17:
```ts
    ja: { displayName: '日本語', search: 'ドキュメントを検索' },
    ko: { displayName: '한국어', search: '문서 검색' },
```

- [ ] **Step 1.4: Remove ja/ko from `app/[lang]/layout.tsx` message loaders**

Delete lines 26-27:
```ts
  ja: () => import('@/locales/ja/messages'),
  ko: () => import('@/locales/ko/messages'),
```

- [ ] **Step 1.5: Remove ja/ko from `app/api/search/route.ts`**

Delete lines 12-13:
```ts
    ja: { tokenizer: cjkTokenizer },
    ko: { tokenizer: cjkTokenizer },
```

- [ ] **Step 1.6: Update e2e `full-site.spec.ts` LANGS array**

Change line 4 from:
```ts
const LANGS = ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko'];
```
To:
```ts
const LANGS = ['en', 'zh-CN', 'zh-TW', 'zh-HK'];
```

- [ ] **Step 1.7: Update e2e `landing.spec.ts` locale arrays**

Change both lines 76 and 84 from:
```ts
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']) {
```
To:
```ts
    for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK']) {
```

- [ ] **Step 1.8: Verify build still works with stale ja/ko content present**

Run:
```bash
cd docs-site && bun run build
```
Expected: build succeeds. ja/ko content files still exist but are orphaned (no route maps to them).

- [ ] **Step 1.9: Commit**

```bash
git add docs-site/lib/i18n.ts docs-site/lingui.config.ts \
        docs-site/app/[lang]/layout.tsx docs-site/app/api/search/route.ts \
        docs-site/e2e/full-site.spec.ts docs-site/e2e/landing.spec.ts
git commit -m "$(cat <<'EOF'
chore(docs-site): remove ja/ko from locale routing and config

Drops ja/ko from the authoritative locale list, locale switcher display
names, dynamic message loaders, search tokenizers, and e2e test arrays.
Content mdx files still present; removed in follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Delete ja/ko content files and compiled messages

**Files:**
- Delete: `docs-site/content/docs/**/*.ja.mdx`, `**/*.ko.mdx`
- Delete: `docs-site/content/docs/**/meta.ja.json`, `**/meta.ko.json`
- Delete: `docs-site/content/docs/index.ja.mdx`, `index.ko.mdx`, `meta.ja.json`, `meta.ko.json`
- Delete: `docs-site/locales/ja/`, `docs-site/locales/ko/`

- [ ] **Step 2.1: Preview what will be deleted**

Run:
```bash
cd docs-site
find content/docs -type f \( -name '*.ja.mdx' -o -name '*.ko.mdx' -o -name 'meta.ja.json' -o -name 'meta.ko.json' \) | sort
ls -d locales/ja locales/ko 2>/dev/null
```
Expected: list of ~18 mdx files, ~10 meta.json files, 2 locale folders. Verify no surprises.

- [ ] **Step 2.2: Delete content files**

Run:
```bash
cd docs-site
find content/docs -type f \( -name '*.ja.mdx' -o -name '*.ko.mdx' -o -name 'meta.ja.json' -o -name 'meta.ko.json' \) -delete
rm -rf locales/ja locales/ko
```

- [ ] **Step 2.3: Regenerate i18n catalogs**

Run:
```bash
cd docs-site
bun run i18n:extract
bun run i18n:compile
```
Expected: extract reports 4 locale catalogs (no ja/ko); compile produces `locales/{en,zh-CN,zh-TW,zh-HK}/messages.ts` only.

- [ ] **Step 2.4: Verify build passes with 4 locales**

Run:
```bash
cd docs-site && bun run build
```
Expected: build succeeds. No "cannot resolve `@/locales/ja/messages`" errors.

- [ ] **Step 2.5: Verify e2e tests pass**

Run:
```bash
cd docs-site && bun run test:e2e
```
Expected: all tests pass. Locale-iteration tests cover 4 locales.

- [ ] **Step 2.6: Manual sanity — locale switcher**

Run `bun run dev` in `docs-site/`, open `http://localhost:3000`, click the locale switcher. Expected: exactly 4 languages listed (English / 简体中文 / 繁體中文 / 粵語). `/ja/...` URLs should 404 or redirect (either is acceptable).

Kill the dev server after verifying.

- [ ] **Step 2.7: Commit**

```bash
git add -A docs-site/content/docs docs-site/locales
git commit -m "$(cat <<'EOF'
chore(docs-site): delete ja/ko content and compiled messages

Removes all *.ja.mdx / *.ko.mdx / meta.ja.json / meta.ko.json across
docs-site/content/docs/** plus locales/ja and locales/ko.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite `installation.mdx` (EN) as happy path

**Files:**
- Rewrite: `docs-site/content/docs/getting-started/installation.mdx`

- [ ] **Step 3.1: Replace file contents**

Overwrite `docs-site/content/docs/getting-started/installation.mdx` with:

````mdx
---
title: Installation
description: Install milmil with Docker Compose in under five minutes.
---

## Prerequisites

- **Docker Desktop** or **Docker Engine** with the Compose plugin
- ~2 GB disk space for images and app data
- ≥ 1 GB free RAM

<Callout type="info">
FFmpeg is bundled in the `milmildev/milmil-api` image. You do **not** need to install it on the host.
</Callout>

## Install with Docker

<Steps>

<Step>
### Clone the repository

```bash
git clone https://github.com/milmil-dev/milmil.git
cd milmil
```
</Step>

<Step>
### Create env files

milmil uses two env files with distinct responsibilities:

| File | Controls |
|------|----------|
| `.env` (repo root) | Compose-level: ports, volume paths, Postgres credentials |
| `api/.env` | Runtime secrets: `JWT_SECRET`, `DATABASE_URL`, Redis, integrations |

```bash
cp .env.example .env
cp api/.env.example api/.env
```
</Step>

<Step>
### Generate a JWT secret (required)

The API refuses to start without a `JWT_SECRET` of at least 32 characters.

```bash
openssl rand -hex 32
```

Paste the output into the `JWT_SECRET=` line in `api/.env`.

<Callout type="warn">
**Also set `MILMIL_ENCRYPTION_KEY`** — run `openssl rand -hex 32` again and paste it into `api/.env` under `MILMIL_ENCRYPTION_KEY=`. This encrypts stored storage credentials (rclone tokens, OAuth). If unset it falls back to `JWT_SECRET`.
</Callout>
</Step>

<Step>
### Start the stack

```bash
docker compose up -d
```

First run pulls `milmildev/milmil-api` and `milmildev/milmil-web` (~1 minute).
</Step>

<Step>
### Verify

```bash
docker compose ps
```

Every row should show `running` or `healthy`.

```bash
curl http://localhost:8080/health
# {"status":"ok","version":"1.0.0"}
```
</Step>

<Step>
### Open the app

Visit [http://localhost:3000](http://localhost:3000) and follow the [First-time Setup](/docs/getting-started/first-setup) wizard to create your admin account and add a library.
</Step>

</Steps>

## Advanced

<Accordions>

<Accordion title="Use PostgreSQL instead of SQLite">

The default compose setup uses SQLite. To switch to Postgres:

1. Edit `api/.env`:
   ```
   DATABASE_URL=postgres://milmil:change_me_postgres_password@postgres:5432/milmil?sslmode=disable
   ```

2. Start with the `postgres` profile:
   ```bash
   docker compose --profile postgres up -d
   ```

See the [Docker reference](/docs/getting-started/docker) for all compose profiles.

</Accordion>

<Accordion title="Build from local source (development)">

Overlay `docker-compose.dev.yml` to build images from your local checkout instead of pulling published ones:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

</Accordion>

<Accordion title="Skip the wizard: auto-provision admin">

Add two variables to `api/.env`:

```
ADMIN_USER=admin
ADMIN_PASSWORD=your-strong-password
```

On first boot, if the users table is empty, milmil auto-creates this admin. Remove both variables after first boot to avoid leaking the password on disk.

</Accordion>

<Accordion title="Manual install (no Docker)">

Prerequisites: Go 1.26+, Bun 1.3+, FFmpeg in `$PATH`.

**Backend:**
```bash
cd api
go build -o milmil-api ./cmd/server
export JWT_SECRET=$(openssl rand -hex 32)
./milmil-api
```

**Frontend:**
```bash
cd web
bun install
bun run build
# Serve web/dist from Nginx, Caddy, or any static host.
```

Point the frontend's `VITE_API_URL` at the API host. All env vars from `api/.env.example` apply.

</Accordion>

</Accordions>
````

- [ ] **Step 3.2: Verify build passes**

Run:
```bash
cd docs-site && bun run build
```
Expected: build succeeds, no MDX parse errors.

- [ ] **Step 3.3: Visual check**

Run `bun run dev`, open `http://localhost:3000/en/docs/getting-started/installation`. Confirm:
- Six numbered steps render in order
- Four accordions render collapsed
- Links to `/docs/getting-started/first-setup` and `/docs/getting-started/docker` resolve

Kill the dev server.

- [ ] **Step 3.4: Commit**

```bash
git add docs-site/content/docs/getting-started/installation.mdx
git commit -m "$(cat <<'EOF'
docs(install): rewrite installation.mdx as single happy path

Six-step Docker-first flow (clone → env → JWT → start → verify → open)
with advanced options collapsed into accordions. Removes references to
deleted docker-compose.prod.yml.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `docker.mdx` (EN) as Docker reference

**Files:**
- Rewrite: `docs-site/content/docs/getting-started/docker.mdx`

- [ ] **Step 4.1: Replace file contents**

Overwrite `docs-site/content/docs/getting-started/docker.mdx` with:

````mdx
---
title: Docker Reference
description: Environment variables, profiles, volumes, and reverse proxy reference for milmil's Docker Compose setup.
---

<Callout type="info">
For the step-by-step install flow, see [Installation](/docs/getting-started/installation). This page is the reference you come back to after you're running.
</Callout>

## Env files

milmil splits environment variables into two files:

### `.env` (repo root) — compose-level

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | `8080` | Host port the API binds to |
| `WEB_PORT` | `3000` | Host port the web UI binds to |
| `DATA_DIR` | `./data` | Host path mounted into the API at `/data` |
| `MEDIA_DIR` | `/mnt/media` | Host path mounted into the API at `/media` (read-only) |
| `DOWNLOAD_DIR` | `./downloads` | Host path mounted into the API at `/downloads` |
| `POSTGRES_USER` | `milmil` | Postgres superuser (only used with `--profile postgres`) |
| `POSTGRES_PASSWORD` | `change_me_postgres_password` | Postgres password |
| `POSTGRES_DB` | `milmil` | Postgres database name |

### `api/.env` — runtime secrets

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | ✅ | JWT signing key (≥ 32 chars). Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | ✅ | See [Database](#database) below |
| `MILMIL_ENCRYPTION_KEY` | Recommended | AES-256 key for storage credentials. Falls back to `JWT_SECRET`. |
| `REDIS_URL` | No | Leave empty for in-memory cache (dev); set `redis://redis:6379` in production. |
| `REDIS_USERNAME`, `REDIS_PASSWORD` | No | Used by the Redis container's ACL (not consumed by the API directly). |
| `ADMIN_USER`, `ADMIN_PASSWORD` | No | First-boot admin auto-provisioning. See [First-time Setup](/docs/getting-started/first-setup). |
| `DANDANPLAY_APP_ID`, `DANDANPLAY_APP_SECRET` | No | DandanPlay hash match + danmaku. |

See [`api/.env.example`](https://github.com/milmil-dev/milmil/blob/main/api/.env.example) for the full list.

## Profiles

```bash
docker compose up -d
```

Starts: `api` + `web` + `redis` (SQLite database — no Postgres).

```bash
docker compose --profile postgres up -d
```

Adds: Postgres 16 container. Set `DATABASE_URL=postgres://...` in `api/.env` first.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Builds images from local source instead of pulling from Docker Hub.

## Services

| Service | Port | Image |
|---------|------|-------|
| `milmil-api` | 8080 | `milmildev/milmil-api:latest` |
| `milmil-web` | 3000 | `milmildev/milmil-web:latest` |
| `redis` | 6379 | `redis:alpine` |
| `postgres` | 5432 | `postgres:16-alpine` (opt-in via `--profile postgres`) |

## Volume mounts

The API container expects three mounts:

```yaml
volumes:
  - ${DATA_DIR:-./data}:/data            # app data, transcode cache, SQLite DB
  - ${MEDIA_DIR:-/mnt/media}:/media:ro   # anime library (read-only)
  - ${DOWNLOAD_DIR:-./downloads}:/downloads
```

Set those host paths in `.env`. The container always uses `/data`, `/media`, `/downloads` internally, so library paths inside milmil should start with `/media/...`.

## Database

<Tabs items={['SQLite', 'PostgreSQL']}>
<Tab value="SQLite">

Zero config, stored at `/data/milmil.db`. Recommended for single-user setups and small libraries.

```
DATABASE_URL=sqlite://data/milmil.db
```

</Tab>
<Tab value="PostgreSQL">

Recommended for multi-user or multi-instance deployments. Migrations auto-apply on startup.

```
DATABASE_URL=postgres://milmil:change_me_postgres_password@postgres:5432/milmil?sslmode=disable
```

Start the stack with `docker compose --profile postgres up -d`.

</Tab>
</Tabs>

## Reverse proxy

See the dedicated [Reverse Proxy](/docs/configuration/reverse-proxy) guide for Nginx, Caddy, and Traefik configs.

## Expected file layout

<Files>
  <Folder name="milmil" defaultOpen>
    <File name=".env" />
    <File name="docker-compose.yml" />
    <File name="docker-compose.dev.yml" />
    <Folder name="api" defaultOpen>
      <File name=".env" />
    </Folder>
    <Folder name="data">
      <File name="milmil.db" />
      <Folder name="transcode" />
    </Folder>
    <Folder name="downloads" />
  </Folder>
</Files>
````

- [ ] **Step 4.2: Verify build passes**

```bash
cd docs-site && bun run build
```
Expected: passes.

- [ ] **Step 4.3: Commit**

```bash
git add docs-site/content/docs/getting-started/docker.mdx
git commit -m "$(cat <<'EOF'
docs(install): rewrite docker.mdx as compose reference

Splits env vars into compose vs runtime tables, documents the profile
system, replaces broken ghcr.io image refs with Docker Hub ones, removes
references to deleted docker-compose.prod.yml.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `first-setup.mdx` (EN) — add admin auto-provision callout

**Files:**
- Modify: `docs-site/content/docs/getting-started/first-setup.mdx`

- [ ] **Step 5.1: Add env-based bypass callout**

In `docs-site/content/docs/getting-started/first-setup.mdx`, directly after the `### Create Admin Account` Step's content (after its `</Callout>` closing tag for the "Choose a strong password" warning), insert:

```mdx
<Callout type="info">
**Skip the UI:** You can auto-provision the admin account via env vars. Set `ADMIN_USER` and `ADMIN_PASSWORD` in `api/.env` before first boot. milmil creates the admin on startup if the users table is empty, then the wizard redirects straight to login. Remove the vars after first boot to avoid leaving the password on disk.
</Callout>
```

- [ ] **Step 5.2: Verify build passes**

```bash
cd docs-site && bun run build
```

- [ ] **Step 5.3: Commit**

```bash
git add docs-site/content/docs/getting-started/first-setup.mdx
git commit -m "$(cat <<'EOF'
docs(install): document admin auto-provision env bypass

Adds a callout in first-setup.mdx explaining ADMIN_USER / ADMIN_PASSWORD
env vars as an alternative to the wizard. Backed by
api/cmd/server/main.go:374.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `platforms.mdx` (EN) — deltas only

**Files:**
- Rewrite: `docs-site/content/docs/getting-started/platforms.mdx`

- [ ] **Step 6.1: Replace file contents**

Overwrite `docs-site/content/docs/getting-started/platforms.mdx` with:

````mdx
---
title: Platform-Specific Notes
description: Synology, Unraid, TrueNAS, and Raspberry Pi deltas over the standard Docker Compose install.
---

<Callout type="info">
Follow the standard [Installation](/docs/getting-started/installation) guide. This page only documents what's different on each platform.
</Callout>

## Synology NAS (DSM 7+)

1. Install **Container Manager** from Package Center.
2. SSH in and create `/volume1/docker/milmil/`.
3. Copy the project's `docker-compose.yml`, `.env`, and `api/.env` into that folder.
4. In Container Manager, **Project > Create**, select the compose file.

**Volumes:** use your Synology shared folder path for media:
```
MEDIA_DIR=/volume1/media/anime
```

<Callout type="warn">
Containers run as root by default. Ensure the shared folder permissions allow the container to read your anime directory.
</Callout>

## Unraid

1. Install the **Docker Compose Manager** plugin from Community Applications.
2. Add a new stack pointing at `docker-compose.yml` with `.env` and `api/.env` alongside.

**Volumes:** use Unraid's `/mnt/user/` conventions:
```
DATA_DIR=/mnt/user/appdata/milmil
MEDIA_DIR=/mnt/user/media/anime
DOWNLOAD_DIR=/mnt/user/downloads/milmil
```

<Callout type="info">
`/mnt/user/appdata/milmil` is the standard Unraid path for persistent app data.
</Callout>

## TrueNAS SCALE

1. In the TrueNAS web UI: **Apps > Discover Apps > Custom App**.
2. Configure a Docker Compose deployment with the milmil compose file.

**Volumes:** map your dataset paths:
```
DATA_DIR=/mnt/pool/apps/milmil
MEDIA_DIR=/mnt/pool/media/anime
```

<Callout type="warn">
TrueNAS SCALE uses Kubernetes for custom apps. Confirm pool permissions allow the container to read the media dataset.
</Callout>

## Raspberry Pi (4/5)

<Callout type="warn">
Pis have limited CPU for transcoding. Direct play and container remux work well; HLS transcoding is slow. Prefer pre-encoded MP4 files.
</Callout>

1. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
   Log out and back in.

2. Follow the standard [Installation](/docs/getting-started/installation) flow.

<Callout type="info">
Use an SSD via USB 3.0 for the `DATA_DIR` volume. SD cards have limited write endurance and are slow for database operations.
</Callout>
````

- [ ] **Step 6.2: Verify build passes**

```bash
cd docs-site && bun run build
```

- [ ] **Step 6.3: Commit**

```bash
git add docs-site/content/docs/getting-started/platforms.mdx
git commit -m "$(cat <<'EOF'
docs(install): rewrite platforms.mdx as deltas only

Synology / Unraid / TrueNAS / RPi notes now only document what's
different from the standard install. Shared flow links back to
installation.mdx. Removes references to deleted compose file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: End-to-end smoke test of EN install flow

No file changes; this is a validation gate.

- [ ] **Step 7.1: Fresh checkout simulation**

Create a scratch directory and clone:
```bash
mkdir -p /tmp/milmil-install-test && cd /tmp/milmil-install-test
git clone --branch "$(cd - > /dev/null; git branch --show-current)" "$(cd - > /dev/null; git config --get remote.origin.url)" milmil
cd milmil
```

- [ ] **Step 7.2: Follow the new installation.mdx**

Execute exactly what the doc says:
```bash
cp .env.example .env
cp api/.env.example api/.env
# Edit api/.env — replace JWT_SECRET with: openssl rand -hex 32
# (Also fill MILMIL_ENCRYPTION_KEY)
docker compose up -d
```

- [ ] **Step 7.3: Verify step outputs match docs**

```bash
docker compose ps
```
Expected: api / web / redis rows show `running` or `healthy`.

```bash
curl http://localhost:8080/health
```
Expected: `{"status":"ok","version":"1.0.0"}` (version field may vary).

Open `http://localhost:3000` in a browser. Expected: redirect to `/setup` wizard.

- [ ] **Step 7.4: Tear down scratch stack**

```bash
docker compose down -v
cd / && rm -rf /tmp/milmil-install-test
```

- [ ] **Step 7.5: Report discrepancies**

If any step above diverged from the docs (different health response, unexpected output, missing step needed), stop and amend `installation.mdx` or `docker.mdx` accordingly, then commit the fix before proceeding to translations. If no discrepancies, proceed to Task 8.

---

## Task 8: Translate the 4 pages to zh-CN

**Files:**
- Create: `docs-site/content/docs/getting-started/installation.zh-CN.mdx`
- Create: `docs-site/content/docs/getting-started/docker.zh-CN.mdx`
- Create: `docs-site/content/docs/getting-started/first-setup.zh-CN.mdx` (existed; rewrite to match new EN)
- Create: `docs-site/content/docs/getting-started/platforms.zh-CN.mdx` (existed; rewrite to match new EN)

Note: `installation.zh-CN.mdx` and `docker.zh-CN.mdx` currently exist and are stale — they reference deleted `docker-compose.prod.yml`. Overwrite them with translated versions of the new EN content.

- [ ] **Step 8.1: Translate `installation.mdx` → `installation.zh-CN.mdx`**

Translation rules (apply to all pages):
- Translate prose and table headings to Simplified Chinese.
- **Preserve verbatim**: all MDX component names and props (`<Steps>`, `<Step>`, `<Callout type="info">`, `<Accordion title="...">`, `<Tabs>`, `<Tab value="...">`, `<Files>`, `<Folder>`, `<File>`), all code blocks (shell/bash/yaml), all file paths, all URLs, all env var names, all image names, the frontmatter `title` and `description` (translate these to Simplified Chinese).
- Keep heading levels (`##`, `###`) and step ordering identical to EN.
- Translate callout body text but keep the `type` attribute untouched.

Read source: `docs-site/content/docs/getting-started/installation.mdx`.
Write: `docs-site/content/docs/getting-started/installation.zh-CN.mdx` with fully translated content.

- [ ] **Step 8.2: Translate `docker.mdx` → `docker.zh-CN.mdx`**

Same rules. Overwrite existing file.

- [ ] **Step 8.3: Translate `first-setup.mdx` → `first-setup.zh-CN.mdx`**

Same rules. Overwrite existing file with translation of the *updated* EN (including the new ADMIN_USER callout).

- [ ] **Step 8.4: Translate `platforms.mdx` → `platforms.zh-CN.mdx`**

Same rules. Overwrite existing file.

- [ ] **Step 8.5: Verify build passes**

```bash
cd docs-site && bun run build
```
Expected: passes. All four zh-CN pages render.

- [ ] **Step 8.6: Visual check**

```bash
cd docs-site && bun run dev
```
Open `http://localhost:3000/zh-CN/docs/getting-started/installation`. Verify the content is Simplified Chinese and the structure matches EN. Repeat for the other three pages. Kill dev server.

- [ ] **Step 8.7: Commit**

```bash
git add docs-site/content/docs/getting-started/*.zh-CN.mdx
git commit -m "$(cat <<'EOF'
docs(install): translate getting-started to zh-CN

Mirrors the rewritten EN happy-path flow in Simplified Chinese.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Translate the 4 pages to zh-TW

**Files:**
- Overwrite: `docs-site/content/docs/getting-started/installation.zh-TW.mdx`
- Overwrite: `docs-site/content/docs/getting-started/docker.zh-TW.mdx`
- Overwrite: `docs-site/content/docs/getting-started/first-setup.zh-TW.mdx`
- Overwrite: `docs-site/content/docs/getting-started/platforms.zh-TW.mdx`

- [ ] **Step 9.1: Translate all four pages using the same rules as Task 8, but in Traditional Chinese (Taiwan conventions)**

Taiwan-specific conventions: use 「」 for quotes (not “”); use 「容器」 for container, 「網頁」 for web page, 「安裝」 for install. Source file: the rewritten EN. Overwrite all four `.zh-TW.mdx` files.

- [ ] **Step 9.2: Verify build + dev preview**

```bash
cd docs-site && bun run build
```

`bun run dev` → visit `http://localhost:3000/zh-TW/docs/getting-started/installation`. Kill dev server.

- [ ] **Step 9.3: Commit**

```bash
git add docs-site/content/docs/getting-started/*.zh-TW.mdx
git commit -m "$(cat <<'EOF'
docs(install): translate getting-started to zh-TW

Mirrors the rewritten EN happy-path flow in Traditional Chinese (Taiwan).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Translate the 4 pages to zh-HK

**Files:**
- Overwrite: `docs-site/content/docs/getting-started/installation.zh-HK.mdx`
- Overwrite: `docs-site/content/docs/getting-started/docker.zh-HK.mdx`
- Overwrite: `docs-site/content/docs/getting-started/first-setup.zh-HK.mdx`
- Overwrite: `docs-site/content/docs/getting-started/platforms.zh-HK.mdx`

- [ ] **Step 10.1: Translate all four pages in Cantonese (Hong Kong written convention)**

Hong Kong conventions: Traditional characters, colloquial Cantonese where natural (e.g. "嘅", "咗", "冇"), Hong Kong technical vocabulary (「電腦」, 「記憶體」, 「硬碟」). Tone matches the existing `README.md` (粵語) voice. Source: rewritten EN. Overwrite all four `.zh-HK.mdx` files.

- [ ] **Step 10.2: Verify build + dev preview**

```bash
cd docs-site && bun run build
```
Visit `http://localhost:3000/zh-HK/docs/getting-started/installation`. Kill dev server.

- [ ] **Step 10.3: Commit**

```bash
git add docs-site/content/docs/getting-started/*.zh-HK.mdx
git commit -m "$(cat <<'EOF'
docs(install): translate getting-started to zh-HK (粵語)

Mirrors the rewritten EN happy-path flow in Hong Kong Cantonese.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Sync README install sections

**Files:**
- Modify: `README.md` (粵語 — default)
- Modify: `README.en.md`
- Modify: `README.zh-CN.md`
- Modify: `README.zh-TW.md`

Do **not** touch `README.ja.md` or `README.ko.md`.

- [ ] **Step 11.1: Rewrite `README.en.md` Quick Start + Deployment sections**

Replace the `## Quick Start` section (and remove the separate `### Docker Compose (Production)` block in the `## Deployment` section, which currently references the deleted prod compose file) with this compact block, keeping everything else in the README unchanged:

```markdown
## Quick Start

**Docker (recommended):**

```bash
git clone https://github.com/milmil-dev/milmil.git
cd milmil
cp .env.example .env
cp api/.env.example api/.env
# Edit api/.env — set JWT_SECRET: openssl rand -hex 32
docker compose up -d
```

Then open [http://localhost:3000](http://localhost:3000) and run the setup wizard.

**From source** (Go 1.26+, Bun 1.3+, FFmpeg):

```bash
make setup
make dev
```

API runs at `http://localhost:8080`, frontend at `http://localhost:5173`.

Full install guide: [docs/getting-started/installation](https://milmil.dev/docs/getting-started/installation).
```

Keep the `## Deployment` heading but replace its body with a single line:

```markdown
## Deployment

See [docs/getting-started/docker](https://milmil.dev/docs/getting-started/docker) for env vars, profiles (`--profile postgres`), volumes, and reverse-proxy setup.
```

- [ ] **Step 11.2: Mirror the change into `README.zh-CN.md`**

Same structure, Simplified Chinese prose. Code blocks verbatim.

- [ ] **Step 11.3: Mirror the change into `README.zh-TW.md`**

Same structure, Traditional Chinese (Taiwan) prose.

- [ ] **Step 11.4: Mirror the change into `README.md` (粵語)**

Same structure, Hong Kong Cantonese prose.

- [ ] **Step 11.5: Verify all four README files still render cleanly on GitHub**

Quick pass: run `npx markdownlint-cli2 README.md README.en.md README.zh-CN.md README.zh-TW.md` or visually inspect. No broken code fences, no malformed tables.

- [ ] **Step 11.6: Commit**

```bash
git add README.md README.en.md README.zh-CN.md README.zh-TW.md
git commit -m "$(cat <<'EOF'
docs(readme): sync install sections with new docs flow

Points README Quick Start + Deployment to the rewritten docs-site
install guide. Removes references to deleted docker-compose.prod.yml.
README.ja and README.ko intentionally left unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Final verification sweep and PR

No file changes unless the sweep finds issues.

- [ ] **Step 12.1: Stale-reference sweep**

Run each grep; every result must be zero:

```bash
# Deleted compose file should not be referenced anywhere outside historic specs/plans
rg 'docker-compose\.prod\.yml' docs-site README.md README.en.md README.zh-CN.md README.zh-TW.md
# Wrong image registry
rg 'ghcr\.io/milmil-dev/milmil' docs-site README.md README.en.md README.zh-CN.md README.zh-TW.md
# Orphaned ja/ko locale references in docs-site
rg -g '!*.po' '\.ja\.mdx|\.ko\.mdx|locales/ja|locales/ko' docs-site
# Wrong manual build command
rg 'make build' docs-site/content/docs/getting-started
```

Expected: all return no matches. If any do, fix before proceeding.

- [ ] **Step 12.2: Full docs-site build**

```bash
cd docs-site && bun run build
```
Expected: passes with 4 locales × all getting-started pages generated.

- [ ] **Step 12.3: Full e2e**

```bash
cd docs-site && bun run test:e2e
```
Expected: passes.

- [ ] **Step 12.4: Final manual click-through**

```bash
cd docs-site && bun run dev
```

For each of `en`, `zh-CN`, `zh-TW`, `zh-HK`:
- Open `/{lang}/docs/getting-started/installation` → six steps + four accordions render
- Open `/{lang}/docs/getting-started/docker` → two env tables + profile section render
- Open `/{lang}/docs/getting-started/first-setup` → wizard steps + auto-provision callout render
- Open `/{lang}/docs/getting-started/platforms` → four platform sections render
- Click the locale switcher — exactly 4 languages listed, no ja/ko

Kill dev server.

- [ ] **Step 12.5: Create PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "docs: rewrite getting-started install flow + drop ja/ko locales" --body "$(cat <<'EOF'
## Summary

- Rewrites the four \`docs-site/content/docs/getting-started/\` pages into a single happy-path install flow (SQLite default, Postgres opt-in via profile), fixing 10 concrete gaps that prevented new users from successfully installing milmil.
- Removes \`ja\` and \`ko\` locales from \`docs-site\` (config, routing, content, compiled messages, e2e); \`README.ja.md\` and \`README.ko.md\` are intentionally retained.
- Syncs \`README.md\` (粵語), \`README.en.md\`, \`README.zh-CN.md\`, \`README.zh-TW.md\` install sections with the new docs flow.

Spec: \`docs/superpowers/specs/2026-04-24-install-docs-rewrite-design.md\`

## Test plan

- [x] \`cd docs-site && bun run build\` passes
- [x] \`cd docs-site && bun run test:e2e\` passes with 4-locale LANGS array
- [x] Fresh \`git clone\` → follow \`installation.mdx\` → \`curl /health\` → wizard opens (manual)
- [x] Locale switcher shows only 4 languages in dev preview
- [x] No remaining references to \`docker-compose.prod.yml\` or \`ghcr.io/milmil-dev/milmil\` in docs or READMEs
EOF
)"
```

---

## Self-review notes

**Spec coverage** — checked each spec section against a task:
- IA redraw (4 pages, new roles) → Tasks 3–6
- `installation.mdx` happy-path content → Task 3 (full content inlined)
- `docker.mdx` reference role → Task 4
- `first-setup.mdx` admin env bypass callout → Task 5
- `platforms.mdx` delta format → Task 6
- Locale deletion (config + content + messages + tests) → Tasks 1–2
- 4-locale rewrite coverage → Tasks 3–6 (EN) + 8–10 (zh-CN/TW/HK)
- README sync 4 files → Task 11
- Validation (build, e2e, manual install smoke) → Tasks 7, 12
- Open items (health response, binary name, additional locale spot) → resolved pre-plan, baked into Tasks 3 (manual install accordion) and 1 (added `lib/i18n.ts` to edit list)

**Type consistency** — same env var names (`JWT_SECRET`, `MILMIL_ENCRYPTION_KEY`, `ADMIN_USER`, `ADMIN_PASSWORD`, `DATABASE_URL`), same image names (`milmildev/milmil-api`, `milmildev/milmil-web`), same locale list (`['en', 'zh-CN', 'zh-TW', 'zh-HK']`) everywhere. Health response shape consistent between Task 3's install doc (`{"status":"ok","version":"1.0.0"}`) and Task 7's verification step.

**Placeholder scan** — full content inlined for every page rewrite (Tasks 3, 4, 6, 11); Tasks 8–10 translation steps give explicit rules and specify the source file. No "TBD", "fill in", or generic "add error handling" entries.
