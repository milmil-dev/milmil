# Player Performance & Search Optimization Design

**Date**: 2026-04-16
**Status**: Approved
**Reference**: LunTV (github.com/czerov/LunTV) patterns adapted for milmil

## Overview

Four features inspired by LunTV, adapted to milmil's architecture:

1. **Danmaku system upgrade** — WebWorker rendering + smart throttling + DandanPlay/danmu_api fallback
2. **Adaptive buffering modes** — Auto/manual buffer profiles based on network conditions
3. **Memory monitoring** — Mobile stability with toast-notified auto-degradation
4. **CJK search optimization** — Traditional/Simplified Chinese variant search

## Architecture: Layered (Option C)

- **Bottom layer**: Independent utility classes (`MemoryMonitor`, `NetworkMonitor`) — not React-bound
- **Middle layer**: Each feature implemented independently, imports bottom-layer monitors as needed
- **Top layer**: `preferences-store` unified preference storage
- Features communicate via events, no central coordinator

---

## Feature 1: Danmaku System Upgrade

### 1a. Backend — DandanPlay + danmu_api Fallback

**Files**: `api/internal/integration/dandanplay/client.go`

The DandanPlay client gains a fallback to community danmu_api proxy services when official credentials are unavailable or requests fail.

**Request flow**:
1. Credentials configured → hit DandanPlay official (`api.dandanplay.net`) with `X-AppId`/`X-AppSecret` headers
2. Official fails (429/timeout/error) OR credentials not configured → fallback to danmu_api (`api.danmu.icu/87654321`)
3. danmu_api uses compatible API paths, no auth headers needed
4. Cache layer unchanged (6hr TTL), fallback results cached identically

**Settings addition**: Optional `danmu_api_url` field in settings DB for self-hosted proxy support.

**Error handling**: If both sources fail, return empty comments (existing behavior on DandanPlay failure).

### 1b. Frontend — WebWorker Rendering + Smart Throttling

**New file**: `web/src/workers/danmaku-worker.ts`

Worker responsibilities:
- Parse DandanPlay `p`/`m` format → standardized `DanmakuComment`
- Collision detection (overlapping danmaku calculation)
- Smart throttling: max comments per 6-second window, prioritizing RTL type
- Time-sorted render queue returned to main thread

**Throttling density presets**:

| Density | Desktop (per window) | Mobile (per window) |
|---------|---------------------|---------------------|
| Low     | 20                  | 15                  |
| Medium  | 50                  | 30                  |
| High    | 80                  | 50                  |

**Main thread changes** (`DanmakuOverlay.tsx`):
- Initialize Worker, `postMessage` raw danmaku data
- Listen for Worker's processed render queue
- Canvas rendering stays on main thread (danmaku v2.0.9 doesn't support OffscreenCanvas)
- Graceful fallback to current logic when Worker unavailable (old browsers)

**preferences-store addition**:
- `danmakuDensity`: `'low' | 'medium' | 'high'` (default `'medium'`)

---

## Feature 2: Adaptive Buffering Modes

### Network Monitor

**New file**: `web/src/lib/network-monitor.ts`

Pure utility class (not React):
- Uses `navigator.connection` API when available: reads `effectiveType` (4g/3g/2g), `downlink` (Mbps)
- Fallback when unsupported: calculates average speed from recent HLS segment downloads
- Exposes `getNetworkProfile()` → `'fast' | 'medium' | 'slow'`
- Listens to `change` events, notifies subscribers

### Buffer Profiles

| Profile | Target Buffer | HLS Segment Preload | Use Case |
|---------|--------------|--------------------:|----------|
| Low (省流) | 15s | 2 segments (12s) | Weak network / mobile data |
| Balanced (均衡) | 30s | 4 segments (24s) | Default, auto mode typical |
| High (高品質) | 60s | 8 segments (48s) | Strong network / WiFi |

### Auto Mode Logic

```
fast network  → High profile
medium network → Balanced profile
slow network  → Low profile
network change → dynamic switch + toast notification
```

### Player Integration (`VideoPlayer.tsx`)

- HLS mode: configure `hls.js` `maxBufferLength` / `maxMaxBufferLength`
- Direct Play / Remux: configure VideoJS `bufferLength` preload strategy
- Read from `preferences-store`, subscribe to `NetworkMonitor` when set to `'auto'`

### preferences-store addition

- `bufferMode`: `'auto' | 'low' | 'balanced' | 'high'` (default `'auto'`)

### Settings UI

Add radio group in `settings/PlayerPanel.tsx`:
- Auto (recommended) | Low | Balanced | High

---

## Feature 3: Memory Monitoring

### Memory Monitor

**New file**: `web/src/lib/memory-monitor.ts`

Pure utility class (not React):
- Uses `performance.memory` (Chrome/Edge) to detect heap usage percentage
- Unsupported browsers (Safari/Firefox): uses `performance.measureUserAgentSpecificMemory()` if available, otherwise heuristic based on active danmaku count
- Polling interval: mobile **30s**, desktop **60s**
- Publishes events: `'memory-pressure'` / `'memory-normal'`

### Thresholds

| Metric | Normal | Pressure |
|--------|--------|----------|
| Heap usage | < 70% | ≥ 70% |
| Danmaku heuristic | < 2000 active | ≥ 2000 active |

### Degradation Actions

On memory pressure:
1. **Danmaku**: Worker receives instruction, throttle to `low` density (20/window)
2. **Buffering**: Auto mode drops one tier (high→balanced, balanced→low)
3. **Notification**: Toast "Memory low, switched to power-saving mode"
4. **Recovery**: 3 consecutive normal polls → auto restore + toast "Restored to normal mode"

### Integration

- `DanmakuOverlay` and `VideoPlayer` each import `MemoryMonitor`, subscribe to events independently
- When user has manually locked buffer profile or danmaku density, memory monitor **does not override** that setting

---

## Feature 4: CJK Search Optimization

### Search Variant Generator

**New file**: `api/internal/search/variants.go`

Uses `github.com/longbridgeapp/opencc` (pure Go, no CGO):
- Variant generation order:
  1. Original query
  2. Traditional → Simplified conversion (if Traditional detected)
  3. Simplified → Traditional conversion (if Simplified detected)
  4. Japanese Kanji normalization (common in anime: `竜` ↔ `龍`)
- Max 3 variants, deduplicated

### Detection Logic

Unicode range-based detection — no external library needed:
- Compare against ~2000 common Traditional/Simplified character pairs
- Any Traditional character detected → generate Simplified variant, vice versa

### Search Flow Change

```
User query: "進擊的巨人"
  → Generate variants: ["進擊的巨人", "进击的巨人"]
  → Parallel query Bangumi API (both variants)
  → Parallel query AniList API (original query, AniList has native multilingual support)
  → Merge & deduplicate (by Bangumi ID / AniList ID)
  → Skip remaining variants if first variant yields ≥5 results
```

### Files Modified

- `api/internal/metadata/service.go`: Search methods accept variant array, parallel requests
- `api/internal/api/search_handler.go` (or equivalent): Call variant generator before search

### Caching

Each variant's search results cached independently (cache key includes query string). TTL unchanged at 6hr.

---

## Shared Preferences Summary

New fields in `preferences-store.ts`:

```typescript
// Danmaku
danmakuDensity: 'low' | 'medium' | 'high'  // default: 'medium'

// Buffering
bufferMode: 'auto' | 'low' | 'balanced' | 'high'  // default: 'auto'
```

No new backend-persisted preferences needed — these are local playback preferences stored in localStorage via Zustand.

## Settings DB Addition

- `danmu_api_url`: Optional custom danmu_api proxy URL (default: `https://api.danmu.icu/87654321`)

---

## Non-Goals

- **No ArtPlayer migration** — milmil's VideoJS plugin system is more feature-rich
- **No Kvrocks migration** — current Redis + in-memory fallback is sufficient
- **No OffscreenCanvas** — Safari/iOS support incomplete
- **No Liquid Glass UI** — excluded from scope per user decision
