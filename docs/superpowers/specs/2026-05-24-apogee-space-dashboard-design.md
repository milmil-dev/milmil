# Apogee — Space Dashboard Design Spec

**Date:** 2026-05-24  
**Status:** Approved

---

## Overview

Apogee is a real-time space launch tracking dashboard powered by The Space Devs Launch Library 2 (LL2) API. It targets both space enthusiasts who want a visually compelling "always-on" dashboard and developers who want a self-hosted installation.

**Deployment targets:**
- Public: Vercel
- Self-hosted: Docker (`next start`)

**MVP scope:** Tier 1 (core tracking) + Tier 3 (visual / cool)

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 16 App Router | ISR solves LL2 rate limits; SSR for SEO; one repo for frontend + API |
| Language | TypeScript | Type safety, same as milmil |
| Package manager | Bun | Same as milmil |
| Styling | Tailwind CSS v4 + shadcn/ui | Same as milmil, HUD-friendly dark customisation |
| State | TanStack Query + Zustand | Same as milmil |
| Charts | shadcn/ui Charts (Recharts) | Already in shadcn ecosystem, full colour control |
| 3D | React Three Fiber + Drei | Rocket model, star particle background |
| Globe | react-globe.gl | Global launch site map |
| i18n | next-intl | Built for App Router; no compile step; JSON format |
| Linter | Biome | Same as milmil |
| Animation | Motion (Framer Motion) | Same as milmil |

---

## Design Tokens — Sci-Fi HUD / Cyan

```css
/* Backgrounds */
--background:        #020b18   /* deep space */
--surface:           #051221   /* card surface */
--surface-elevated:  #0a1e33   /* modal / popover */

/* Borders */
--border:            rgba(6, 182, 212, 0.15)   /* cyan-tinted */
--border-subtle:     rgba(255, 255, 255, 0.06)

/* Accent colours */
--accent:            #06b6d4   /* cyan-500 — primary CTA, countdowns */
--accent-hover:      #22d3ee   /* cyan-400 */
--secondary:         #818cf8   /* indigo-400 — secondary actions */

/* Status colours */
--success:           #22c55e   /* launch success */
--warning:           #f59e0b   /* hold / weather delay */
--danger:            #ef4444   /* failure / scrub */
--in-flight:         #a78bfa   /* purple — currently flying */

/* Typography */
--font-ui:      'Geist', sans-serif          /* all UI text */
--font-mono:    'JetBrains Mono', monospace  /* countdowns, telemetry numbers */
```

---

## i18n

**Languages:** `zh-Hant` (Traditional Chinese), `zh-Hans` (Simplified Chinese), `en` (English)  
**Library:** next-intl  
**Message format:** JSON (no compile step required)

```
messages/
├── en.json
├── zh-Hant.json
└── zh-Hans.json
```

Locale prefix strategy: `/{locale}/...` (e.g. `/zh-Hant/`, `/en/`)

---

## Page Routes

```
/[locale]/                        # Home — main dashboard
/[locale]/launches                # Launch calendar (month / list toggle)
/[locale]/launches/[id]           # Mission detail + YouTube live embed
/[locale]/starship                # Starship zone
/[locale]/agencies                # Multi-agency overview
/[locale]/stats                   # Data visualisation (shadcn Charts)
/[locale]/map                     # Global launch site globe
```

---

## Tier 1 — Core Features

### Home Dashboard (`/`)
- Active countdown timers for next 3–5 upcoming launches (SSE-driven T-)
- "Currently flying" status card when a launch is in progress (TanStack Query 5s polling)
- Recent launches strip (last 5, success / failure / scrub badge)
- Agency filter chips (SpaceX, Rocket Lab, Blue Origin, ULA, ISRO, CNSA, ESA, others)

### Launch Calendar (`/launches`)
- Month calendar view with launch markers per day
- List view toggle (sortable by date, agency, status)
- Click → mission detail page

### Mission Detail (`/launches/[id]`)
- Hero: rocket render, mission name, T- countdown
- Payload, orbit, customer info (from LL2)
- YouTube live embed (`youtube-nocookie.com` iframe) when `vid_urls` present
- X (Twitter) stream link button (external redirect)
- Past similar missions comparison

### Starship Zone (`/starship`)
- Filter: `rocket__configuration__name=Starship`
- Vehicle status cards: Ship / Booster current status from LL2 spacecraft endpoints
- Test / flight timeline

### Agencies (`/agencies`)
- Grid of supported agencies with logo, country, launch count
- Click → filtered launch list

### Launch History
- Server Component ISR, LL2 `/launches/previous/`
- Success / failure / scrub colour coding

---

## Tier 3 — Visual Features

### 3D Rocket (`rocket-3d.tsx`)
- React Three Fiber client component
- Simple GLTF rocket model showing current flight phase (on pad / ascending / MECO / landing)
- Shown on mission detail page and home "currently flying" card

### Global Launch Map (`/map`)
- react-globe.gl dark globe
- Markers for all active launch pads (from LL2 `/pads/`)
- Click marker → recent launches from that pad

### Star Particle Background
- Three.js particle system or CSS-only backdrop
- Subtle depth effect on home and map pages

### Data Visualisation (`/stats`)
- shadcn Charts (Recharts):
  - Launch count per year per agency (bar chart)
  - Country competitiveness (horizontal bar)
  - Success rate trend (line chart)
- All data fetched from LL2 on server, computed in Server Component

### YouTube Live Embed
- `youtube-nocookie.com` iframe inside mission detail
- Shown only when LL2 `vid_urls` contains a YouTube URL
- Fallback: external link button if no embed available

---

## Data Fetching Strategy

| Data | Fetch method | Revalidate |
|------|-------------|-----------|
| Upcoming launches list | Server Component ISR | 60s |
| Mission detail | Server Component ISR | 300s |
| In-progress launch status | Client polling (TanStack Query) | 5s |
| T- countdown | SSE Route Handler (`/api/countdown`) | streaming |
| Previous launches | Server Component ISR | 3600s |
| Agencies list | Server Component ISR | 86400s |
| Launch pads | Server Component ISR | 86400s |

LL2 API base: `https://ll.thespacedevs.com/2.2.0/`  
(Dev/staging: `https://lldev.thespacedevs.com/2.2.0/`)

Rate limits: 15 req/hr anonymous. ISR caching on Server Components ensures repeated page loads do not hit the API beyond the revalidate interval.

---

## Component Architecture

```
app/
├── [locale]/
│   ├── layout.tsx                # Root layout with next-intl provider
│   ├── page.tsx                  # Home dashboard (Server Component)
│   ├── launches/
│   │   ├── page.tsx              # Calendar / list (Server Component)
│   │   └── [id]/page.tsx         # Mission detail (Server Component)
│   ├── starship/page.tsx
│   ├── agencies/page.tsx
│   ├── stats/page.tsx
│   └── map/page.tsx
├── api/
│   └── countdown/route.ts        # SSE stream for T- countdown

components/
├── layout/
│   ├── top-nav.tsx
│   └── locale-switcher.tsx
├── launch/
│   ├── launch-card.tsx
│   ├── countdown-timer.tsx       # Client component, SSE consumer
│   ├── status-badge.tsx
│   └── youtube-embed.tsx
├── globe/
│   └── globe-map.tsx             # Client component (react-globe.gl)
├── rocket/
│   └── rocket-3d.tsx             # Client component (R3F)
└── charts/
    ├── launches-per-year.tsx
    ├── success-rate-trend.tsx
    └── country-comparison.tsx
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| LL2 API unavailable | `error.tsx` boundary — shows skeleton + "Data temporarily unavailable" + retry button |
| Rate limit (429) | Server Component catches, serves stale ISR cache + toast warning |
| YouTube embed fails | Fallback to external link button |
| SSE connection drops | Client auto-reconnects with exponential backoff |

---

## Deployment

### Vercel (public)
- `vercel.json` with `NEXT_PUBLIC_LL2_BASE_URL` env var
- Vercel Cron not required (ISR handles revalidation)

### Docker (self-hosted)
```dockerfile
FROM oven/bun:latest AS builder
# ... standard Next.js Docker build
FROM node:alpine AS runner
CMD ["node", "server.js"]
```

Single `docker-compose.yml` — no external DB or Redis required.

---

## Out of Scope (v1)

- User accounts / personalised notifications
- Weather integration
- Viewing spot recommendations
- Starlink coverage map
- AI mission summaries
- Prediction engine
- Social / share features
- Multi-screen / TV mode
- Personal observation journal
