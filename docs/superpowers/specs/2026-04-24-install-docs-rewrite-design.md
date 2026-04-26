# Install Docs Rewrite + Locale Cleanup

**Date**: 2026-04-24
**Scope**: `docs-site/content/docs/getting-started/*` rewrite, locale trim, README install section sync.
**Out of scope**: AI-agent install story (separate future spec), non-getting-started docs content fixes, README.ja/ko updates.

## Problem

A brand-new user following the current `docs-site` install guide cannot successfully install milmil. Observed gaps:

1. `getting-started/docker.mdx` references `docker-compose.prod.yml`, which was deleted in `297ac63` (Apr 22) in favor of a single profile-based `docker-compose.yml`.
2. `getting-started/installation.mdx` skips the `cp .env.example .env && cp api/.env.example api/.env` step, so `docker compose up -d` fails immediately because `JWT_SECRET` is required and has no default.
3. The repo now has two distinct env files (root `.env` = compose-level, `api/.env` = runtime secrets). Docs conflate them.
4. `DATABASE_URL` default contradicts itself across pages — `installation.mdx` shows SQLite as default, `docker.mdx` pins a Postgres URL in step 1 without mentioning `--profile postgres`.
5. `docker.mdx`'s `docker run` example references `ghcr.io/milmil-dev/milmil:latest` — images are actually published to Docker Hub as `milmildev/milmil-api` and `milmildev/milmil-web`.
6. FFmpeg listed as a host prerequisite even for Docker; image already bundles FFmpeg.
7. Manual install instructions (`make build && ./server`) are wrong — Makefile produces `./milmil-api`.
8. No verification step between "start" and "open the app", so users have no way to tell if the stack is healthy.
9. `platforms.mdx` (Synology / Unraid / TrueNAS / RPi) all refer back to the deleted prod compose file.
10. Six locales × four pages = 24 mdx files in `getting-started/` to keep in sync; ja / ko are drifting and there is no active translator.

Memory entries corroborate: #16482 (compose consolidation → profile-based), #16477 (api/.env split), #16484 (PR #27 merged).

## Goals

1. A new user can follow `installation.mdx` top-to-bottom and reach the Setup Wizard without a dead end.
2. Information has a single source of truth — no more contradictions between `installation.mdx` and `docker.mdx`.
3. docs-site maintains 4 locales (`en`, `zh-CN`, `zh-TW`, `zh-HK`); `ja` / `ko` are removed from docs-site (README unchanged).
4. The happy path stays under 6 numbered steps; everything else is progressive disclosure (accordions).

## Non-goals

- AI-agent / MCP / Claude-plugin install content (future spec).
- Rewriting `configuration/`, `features/`, `api/`, `troubleshooting/` content beyond locale file deletion.
- Updating `README.ja.md` and `README.ko.md` — they stay frozen for now.
- Designing a docs-snippet include system to DRY README and docs.

## Design

### Information Architecture

Four pages retained, roles redrawn:

| Page | Role | Audience |
|------|------|----------|
| `installation.mdx` | **The happy path.** Copy envs → generate JWT → `docker compose up -d` → verify → open wizard. All advanced options are accordion sections at the bottom. | New user, 90% of installs |
| `docker.mdx` | **Docker reference.** Env var tables split by scope (compose vs runtime), profile usage, image tags, volume conventions, reverse proxy. | Users who already installed and want to tune |
| `first-setup.mdx` | **Post-install wizard.** UI flow for creating admin + adding library + metadata matching explanation. Documents `ADMIN_USER` / `ADMIN_PASSWORD` env bypass. | Same user, 5 minutes later |
| `platforms.mdx` | **Platform deltas only.** Synology / Unraid / TrueNAS / RPi path conventions and permissions notes. Links back to `installation.mdx` for shared flow. | NAS users |

`installation.mdx` is the canonical source of install truth. Other pages link to it rather than duplicate.

### `installation.mdx` content (final form)

```
# Installation

## Prerequisites
- Docker Desktop or Docker Engine with the Compose plugin
- ~2 GB disk for images + app data
- ≥ 1 GB RAM free
(FFmpeg is bundled in the image; no host install required.)

## Install (Docker — recommended)

### 1. Clone the repo
    git clone https://github.com/milmil-dev/milmil.git
    cd milmil

### 2. Create env files
milmil has two env files with different scopes:

| File | Controls |
|------|----------|
| `.env` (repo root) | Compose-level: ports, volume paths, Postgres credentials |
| `api/.env` | Runtime secrets: JWT_SECRET, DATABASE_URL, Redis, integrations |

    cp .env.example .env
    cp api/.env.example api/.env

### 3. Generate a JWT secret (required)
The API refuses to start without a `JWT_SECRET` ≥ 32 characters.

    openssl rand -hex 32

Paste the output into the `JWT_SECRET=` line in `api/.env`.

> **Recommended**: also set `MILMIL_ENCRYPTION_KEY` (run `openssl rand -hex 32` again).
> This encrypts stored storage credentials (rclone tokens, OAuth). Without it,
> the key falls back to `JWT_SECRET`.

### 4. Start the stack
    docker compose up -d

First run takes ~1 minute to pull `milmildev/milmil-api` and `milmildev/milmil-web`.

### 5. Verify
    docker compose ps
    # All rows should read "running" or "healthy"

    curl http://localhost:8080/health
    # Expect: {"status":"ok"}

### 6. Open the app
http://localhost:3000 — follow the [First-time Setup](first-setup) wizard to create
the admin account and add your library.

---

## Advanced

<Accordion title="Use PostgreSQL instead of SQLite">
Edit `api/.env`:

    DATABASE_URL=postgres://milmil:change_me_postgres_password@postgres:5432/milmil?sslmode=disable

Then start with the `postgres` profile:

    docker compose --profile postgres up -d
</Accordion>

<Accordion title="Build from local source (development)">
Overlay `docker-compose.dev.yml` to build from the local checkout instead of pulling images:

    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
</Accordion>

<Accordion title="Skip the wizard: auto-provision admin">
Add to `api/.env`:

    ADMIN_USER=admin
    ADMIN_PASSWORD=your-strong-password

Only activates when the users table is empty. Remove these after first boot.
</Accordion>

<Accordion title="Manual install (no Docker)">
Prerequisites: Go 1.26+, Bun 1.3+, FFmpeg in `$PATH`.

    # Backend
    cd api
    make build
    ./milmil-api

    # Frontend
    cd web
    bun install
    bun run build
    # Serve web/dist from Nginx or any static host

`JWT_SECRET` and other env vars must be exported into the shell or placed in `api/.env` relative to the binary. The exact runtime flags will be verified during implementation and amended here if this example is inaccurate.
</Accordion>
```

### `docker.mdx` content

- Delete the entire `docker-compose.prod.yml` tab and the broken `docker run` example.
- Add a section explaining the two env files and what's in each, referencing `.env.example` and `api/.env.example` verbatim.
- Add a Profiles section: `--profile postgres` starts Postgres; without it, the stack uses SQLite.
- Keep Volume Mounts, Database, Reverse Proxy sections; update to match reality.
- Link back to `installation.mdx` for the actual install flow.

### `first-setup.mdx` content

- Keep current wizard description (it matches `web/src/pages/SetupPage.tsx`).
- Add a callout for the `ADMIN_USER` / `ADMIN_PASSWORD` env-based bypass (backed by `api/cmd/server/main.go:374`).
- Otherwise unchanged.

### `platforms.mdx` content

- Replace every "See [Docker Deployment]" stub with a real `docker-compose.yml` + `.env` + `api/.env` setup paragraph (or link back to installation).
- Remove the "production compose file" wording everywhere.
- Keep the platform-specific notes (Synology container root, Unraid `appdata`, TrueNAS pool paths, RPi SSD advice).

### Locale deletion

**Files and folders to delete (`docs-site/` relative)**:
- `content/docs/**/*.ja.mdx`, `content/docs/**/*.ko.mdx`
- `content/docs/**/meta.ja.json`, `content/docs/**/meta.ko.json`
- `content/docs/index.ja.mdx`, `content/docs/index.ko.mdx`, `content/docs/meta.ja.json`, `content/docs/meta.ko.json`
- `locales/ja/`, `locales/ko/`

**Code edits**:
- `lingui.config.ts` — change `locales: ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']` → `locales: ['en', 'zh-CN', 'zh-TW', 'zh-HK']`.
- `app/[lang]/layout.tsx:16-17` — remove `ja` and `ko` entries from the locale display-name map.
- `app/[lang]/layout.tsx:26-27` — remove `ja` and `ko` dynamic message imports.
- `app/api/search/route.ts:12-13` — remove `ja` and `ko` tokenizer entries.
- Any `generateStaticParams` / static lang list that hardcodes 6 locales (audit during implementation).

**Test updates**:
- `e2e/full-site.spec.ts:4` — `const LANGS = ['en', 'zh-CN', 'zh-TW', 'zh-HK']`.
- `e2e/landing.spec.ts:76, 84` — same array.

**Post-edit commands**:
    cd docs-site
    bun run i18n:extract
    bun run i18n:compile
    bun run build
    bun run test:e2e

### README sync (same PR)

Rewrite install sections in:
- `README.md` (粵語)
- `README.en.md`
- `README.zh-CN.md`
- `README.zh-TW.md`

Target content: compact 6-step block mirroring `installation.mdx`, ending with a link to the docs install page. Do **not** touch `README.ja.md`, `README.ko.md`.

### Happy-path rewrite covers all 4 kept locales

Implementation agent writes EN first, then generates `zh-CN`, `zh-TW`, `zh-HK` versions mirroring the EN structure. User reviews all four before merge. All four ship in the same PR — partial merge is not an option for this design.

## Validation

**Functional (manual)**
1. `rm -rf .env api/.env` in a fresh checkout of the rewritten branch.
2. Follow `installation.mdx` step-by-step on a machine with only Docker installed.
3. Stack comes up healthy; `curl /health` returns OK; browser opens wizard; admin account created.

**Docs build**
- `cd docs-site && bun run build` passes with no unresolved references.
- `bun run i18n:compile` passes with 4-locale catalog.
- `bun run test:e2e` passes with the updated LANGS array.

**Cross-reference check**
- Every link from `installation.mdx`, `docker.mdx`, `first-setup.mdx`, `platforms.mdx` resolves to an existing page / anchor.
- No remaining references to `docker-compose.prod.yml` anywhere in `docs-site/`.
- No remaining references to `ghcr.io/milmil-dev/milmil`.

## Risks

- **Fumadocs routing for removed locales**: If Fumadocs auto-generates routes from the `app/[lang]/` layout, visiting `/ja/...` will 404 after removal. Acceptable — verify during implementation; if graceful fallback is desired, document it.
- **Accidental stale link**: Other docs (e.g. `configuration/environment.mdx`) may reference removed compose files. One-time scan during implementation (`rg docker-compose.prod`).
- **Translation drift**: Shipping 4-locale rewrite at once increases PR review surface. Acceptable because the getting-started section is small.
- **README.ja / README.ko drift**: After this PR, those two files reference a deleted compose file. Accepted as known debt; future PR decides their fate.

## Open items (to resolve in implementation, not design)

- Verify whether the manual `make build` target produces `./milmil-api` at the exact path shown in the accordion; adjust if different.
- Confirm `/health` response shape matches what's documented.
- Audit `app/[lang]/` + `components/lingui-provider.tsx` for any other hardcoded locale list missed above.
