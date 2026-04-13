# milmil Documentation Overhaul — Design Spec

**Date:** 2026-04-13
**Scope:** Documentation site only (landing page excluded)

## Goal

Enhance the milmil documentation website to match the quality and depth of Jellyfin and Seanime docs. Two dimensions:

1. **Doc UX** — Wire up fumadocs rich components (callouts, tabs, steps, cards, file trees, accordions, type tables, code groups) across all pages.
2. **Content depth** — Add missing sections: troubleshooting/FAQ, API reference, contributing guide, advanced configuration (reverse proxy, performance), platform-specific Docker guides, bot/notifications, migration guide, architecture/internals.

## Stack

- **Framework:** Next.js 16 + fumadocs-core/ui v16 + fumadocs-mdx v14
- **API docs:** fumadocs-openapi (new dependency) — auto-generates MDX from `openapi.json`
- **i18n:** 6 languages via fumadocs i18n + lingui. New pages English-only initially.
- **Styling:** Tailwind v4 + fumadocs neutral/preset CSS

---

## 1. Dependencies to Add

```bash
bun add fumadocs-openapi shiki
```

## 2. MDX Components Registration

Update `mdx-components.tsx` to export all fumadocs built-in components so they're available in every MDX file without explicit imports:

- `Callout` — `info`, `warn`, `error` types
- `Tab`, `Tabs` — platform/config toggles
- `Step`, `Steps` — numbered setup guides
- `Card`, `Cards` — section index grids with icons
- `File`, `Folder`, `Files` — directory tree diagrams
- `Accordion`, `Accordions` — collapsible FAQ sections
- `TypeTable` — structured config/API parameter tables

## 3. Sidebar / Page Structure

### 3.1 Enhanced Existing Pages

#### `content/docs/index.mdx` — Introduction
- Add `<Cards>` grid linking to each section (Getting Started, Features, Configuration, API, etc.)
- Add "What's New" callout for latest release info

#### `content/docs/getting-started/installation.mdx`
- Wrap platform instructions in `<Tabs items={["Docker", "Manual"]}>` 
- Use `<Steps>` for the installation flow
- Add `<Callout type="info">` for prerequisites
- Add `<Files>` showing expected directory structure after install

#### `content/docs/getting-started/docker.mdx`
- Add `<Tabs>` for docker compose vs docker run
- Add `<Callout type="warn">` for common pitfalls (permissions, volume mounts)
- Add `<Files>` for the expected file layout

#### `content/docs/getting-started/first-setup.mdx`
- Use `<Steps>` for the setup wizard walkthrough
- Add `<Callout type="info">` for each step's context

#### `content/docs/configuration/environment.mdx`
- Replace raw markdown tables with `<TypeTable>` for each config group
- Add `<Tabs>` for SQLite vs PostgreSQL database config
- Add `<Callout type="warn">` for required variables (JWT_SECRET, ENCRYPTION_KEY)

#### `content/docs/configuration/integrations.mdx`
- Use `<Tabs>` per integration (Bangumi, AniList, DandanPlay)
- Use `<Steps>` for API key setup flows

#### `content/docs/configuration/notifications.mdx`
- Use `<Tabs>` per notification channel
- Add `<Steps>` for webhook setup

#### `content/docs/features/*.mdx` (all 5 feature pages)
- Add `<Callout>` blocks for tips and caveats
- Add `<Files>` for directory structures where relevant (library scanning)
- Add `<Tabs>` where features have multiple modes (streaming modes, subtitle formats)

### 3.2 New Pages

#### `content/docs/getting-started/platforms.mdx` — Platform Guides
- `<Tabs items={["Synology", "Unraid", "TrueNAS", "Raspberry Pi"]}>`
- Per-platform `<Steps>` for installation
- `<Callout type="warn">` for platform-specific gotchas (ARM transcoding, DSM permissions)

#### `content/docs/configuration/reverse-proxy.mdx` — Reverse Proxy
- `<Tabs items={["Nginx", "Caddy", "Traefik"]}>`
- Full config examples per proxy
- `<Callout type="info">` for WebSocket support (needed for danmaku)
- HTTPS / Let's Encrypt setup

#### `content/docs/configuration/performance.mdx` — Performance Tuning
- Cache configuration (Redis sizing)
- Transcoding optimization (hardware acceleration, preset tuning)
- Database tuning (PostgreSQL connection pool, WAL mode for SQLite)
- `<TypeTable>` for performance-related env vars

#### `content/docs/features/bot.mdx` — Bot & Notifications
- `<Tabs items={["Discord", "Telegram"]}>`
- `<Steps>` for bot token creation and setup
- Slash commands reference with `<TypeTable>`
- Notification event types and configuration
- `<Callout type="info">` for required bot permissions

#### `content/docs/api/` — API Reference (auto-generated)
- Install `fumadocs-openapi`
- Copy `api/internal/api/openapi.json` into website as `content/docs/api/openapi.json`
- Create `lib/openapi.ts` with `createOpenAPI({ input: ['./content/docs/api/openapi.json'] })`
- Create `app/[lang]/docs/api/[[...slug]]/page.tsx` using `createAPIPage()`
- Auto-generate MDX index files with `generateFiles()` in a build script
- The API page renders interactive endpoint docs: request/response schemas, try-it-out, auth headers

#### `content/docs/troubleshooting/index.mdx` — FAQ
- `<Accordions>` with common questions grouped by category
- Categories: Installation, Playback, Library Scanning, Networking, Integration

#### `content/docs/troubleshooting/playback.mdx` — Playback Issues
- Common codec/format issues
- Transcoding failures (FFmpeg errors)
- Danmaku not loading
- Subtitle rendering issues
- `<Callout type="error">` for known bugs / workarounds

#### `content/docs/troubleshooting/scanning.mdx` — Library Scan Issues
- Files not detected
- Metadata mismatch
- Permission errors
- Rclone backend connectivity
- `<Steps>` for diagnostic flow

#### `content/docs/troubleshooting/networking.mdx` — Networking Issues
- Can't access from other devices
- Reverse proxy 502/504 errors
- WebSocket connection failures
- CORS issues

#### `content/docs/contributing/index.mdx` — Contributing Overview
- Project philosophy and code of conduct
- `<Cards>` linking to Development and Reporting sub-pages
- Links to GitHub issues, discussions

#### `content/docs/contributing/development.mdx` — Dev Setup
- `<Steps>` for setting up the development environment
- `<Tabs items={["Backend (Go)", "Frontend (React)", "Full Stack"]}>`
- `<Files>` showing the repo structure
- Testing, linting, PR guidelines

#### `content/docs/contributing/reporting.mdx` — Bug Reports & Feature Requests
- Bug report template
- Feature request guidelines
- `<Callout type="info">` for where to ask questions vs file bugs

#### `content/docs/migration/index.mdx` — Migration Guide
- `<Tabs items={["From Jellyfin", "From Plex", "From Seanime"]}>` 
- What transfers (metadata, watch progress) and what doesn't
- `<Steps>` per migration path
- `<Callout type="warn">` for data that requires manual re-matching

#### `content/docs/architecture/index.mdx` — Architecture & Internals
- System architecture diagram (text-based or embedded SVG)
- Component overview: API server, web frontend, torrent engine, transcoder, scanner
- Data flow diagrams for key features (library scan, streaming, auto-download)
- Database schema overview
- `<Files>` showing repo directory structure
- Technology choices and rationale

## 4. Sidebar Configuration

Update the fumadocs sidebar (via `content/docs/meta.json` or fumadocs page tree config) to organize pages into groups:

```
Getting Started
  ├── Installation
  ├── Docker Deployment
  ├── First Setup
  └── Platform Guides
Features
  ├── Library Management
  ├── Streaming & Playback
  ├── Downloads
  ├── Discovery
  ├── Collection
  └── Bot & Notifications
Configuration
  ├── Environment Variables
  ├── Integrations
  ├── Notifications
  ├── Reverse Proxy
  └── Performance Tuning
API Reference          ← auto-generated from OpenAPI
Troubleshooting
  ├── FAQ
  ├── Playback Issues
  ├── Scanning Issues
  └── Networking Issues
Contributing
  ├── Overview
  ├── Development Setup
  └── Reporting Issues
Migration Guide
Architecture
```

## 5. Build Pipeline

Add a script to `package.json` for regenerating API docs from the OpenAPI spec:

```json
{
  "scripts": {
    "generate:api": "node scripts/generate-api-docs.mjs"
  }
}
```

The script copies the latest `openapi.json` from the API codebase and runs `generateFiles()` to produce MDX pages.

## 6. What's NOT in Scope

- Landing page changes
- New i18n translations for new pages (English-only for now)
- Real screenshots (mock UIs remain)
- Custom fumadocs theme changes
- Search improvements (fumadocs built-in search is adequate)

## 7. Implementation Order

1. Install dependencies (`fumadocs-openapi`, `shiki`)
2. Register MDX components in `mdx-components.tsx`
3. Configure sidebar structure (`meta.json` files)
4. Enhance existing pages with rich components
5. Create new content pages
6. Set up API reference (openapi integration)
7. Verify build + typecheck
8. E2E test navigation and rendering
