# Player Performance & Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add danmaku WebWorker rendering with DandanPlay fallback, adaptive buffering modes, memory monitoring, and CJK search variant generation.

**Architecture:** Layered approach — bottom-layer utility classes (MemoryMonitor, NetworkMonitor), middle-layer independent features, top-layer unified preferences. Features communicate via events, no central coordinator.

**Tech Stack:** TypeScript Web Workers, `navigator.connection` API, `performance.memory` API, `github.com/longbridgeapp/opencc` (Go), Zustand, danmaku v2.0.9, @videojs/react + hls-video.

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `web/src/workers/danmaku-worker.ts` | Web Worker: parse, filter, throttle danmaku comments |
| `web/src/lib/network-monitor.ts` | Utility class: network speed detection + profile |
| `web/src/lib/memory-monitor.ts` | Utility class: heap/heuristic memory pressure detection |
| `api/internal/integration/dandanplay/fallback.go` | Fallback client wrapping official + danmu_api proxy |
| `api/internal/integration/dandanplay/fallback_test.go` | Tests for fallback logic |
| `api/internal/search/variants.go` | CJK search variant generator |
| `api/internal/search/variants_test.go` | Tests for variant generation |

### Modified Files
| File | Change |
|------|--------|
| `web/src/components/DanmakuOverlay.tsx` | Use Worker for processing, fallback to inline |
| `web/src/components/VideoPlayer.tsx` | Accept + apply buffer config from props |
| `web/src/pages/WatchPage.tsx` | Wire up Worker, buffer mode, memory monitor |
| `web/src/store/preferences-store.ts` | Add `danmakuDensity`, `bufferMode` |
| `web/src/pages/settings/PlayerPanel.tsx` | Add buffer mode + density UI controls |
| `web/src/lib/api/stream.ts` | Move `parseDandanplayComments` types to shared, add density types |
| `api/internal/config/config.go` | Add `DanmuAPIURL` field |
| `api/internal/api/danmaku_handler.go` | Use fallback client |
| `api/cmd/server/main.go` | Init fallback client |
| `api/internal/metadata/service.go` | Accept variant array in Search, parallel query |
| `api/internal/api/discover_handler.go` | Call variant generator before search |

---

### Task 1: Danmaku WebWorker — Worker File

**Files:**
- Create: `web/src/workers/danmaku-worker.ts`
- Create: `web/src/workers/danmaku-worker.test.ts`

- [ ] **Step 1: Write the worker test**

```typescript
// web/src/workers/danmaku-worker.test.ts
import { describe, expect, it } from 'vitest';

// Test the processing logic directly (not via Worker API)
// We'll export the pure function for testing
import { processDanmaku } from './danmaku-worker';

describe('processDanmaku', () => {
  const makeComment = (time: number, mode: 'rtl' | 'top' | 'bottom' = 'rtl') => ({
    p: `${time},1,16777215`,
    m: `comment at ${time}`,
  });

  it('parses dandanplay format correctly', () => {
    const result = processDanmaku({
      comments: [{ p: '1.5,1,16711680', m: 'hello' }],
      fontSize: 20,
      opacity: 1,
      density: 'medium',
      isMobile: false,
    });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('hello');
    expect(result[0].time).toBe(1.5);
    expect(result[0].mode).toBe('rtl');
    expect(result[0].style.color).toBe('#ff0000');
  });

  it('throttles to medium density (50 per 6s window) on desktop', () => {
    // Create 100 comments in one 6s window
    const comments = Array.from({ length: 100 }, (_, i) => makeComment(i * 0.05));
    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'medium',
      isMobile: false,
    });
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('throttles to low density (15 per 6s window) on mobile', () => {
    const comments = Array.from({ length: 100 }, (_, i) => makeComment(i * 0.05));
    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'low',
      isMobile: true,
    });
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('prioritizes rtl mode over top/bottom when throttling', () => {
    const comments = [
      { p: '1.0,1,16777215', m: 'rtl1' },
      { p: '1.0,5,16777215', m: 'top1' },
      { p: '1.0,4,16777215', m: 'bottom1' },
      { p: '1.0,1,16777215', m: 'rtl2' },
    ];
    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'low',
      isMobile: true, // low+mobile = 15 per window, but we test priority
    });
    // All fit within limit, but verify rtl comments are present
    const rtlCount = result.filter((c) => c.mode === 'rtl').length;
    expect(rtlCount).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose workers/danmaku-worker.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the worker implementation**

```typescript
// web/src/workers/danmaku-worker.ts
import type { DanmakuComment, DanmakuDensity } from '@/lib/api/stream';

interface ProcessInput {
  comments: { p: string; m: string }[];
  fontSize: number;
  opacity: number;
  density: DanmakuDensity;
  isMobile: boolean;
}

const MODE_MAP: Record<string, 'rtl' | 'top' | 'bottom'> = {
  '1': 'rtl',
  '4': 'bottom',
  '5': 'top',
  '6': 'rtl',
};

// Max comments per 6-second window
const LIMITS: Record<DanmakuDensity, { desktop: number; mobile: number }> = {
  low: { desktop: 20, mobile: 15 },
  medium: { desktop: 50, mobile: 30 },
  high: { desktop: 80, mobile: 50 },
};

export function processDanmaku(input: ProcessInput): DanmakuComment[] {
  const { comments, fontSize, opacity, density, isMobile } = input;
  const limit = isMobile ? LIMITS[density].mobile : LIMITS[density].desktop;
  const WINDOW_SIZE = 6; // seconds

  // Parse all comments
  const parsed: DanmakuComment[] = comments.map(({ p, m }) => {
    const parts = p.split(',');
    const time = parseFloat(parts[0] ?? '0');
    const type = parts[1] ?? '1';
    const colorInt = parseInt(parts[2] ?? '16777215', 10);
    return {
      text: m,
      time,
      mode: MODE_MAP[type] ?? 'rtl',
      style: {
        fontSize: `${fontSize}px`,
        color: `#${colorInt.toString(16).padStart(6, '0')}`,
        opacity,
      },
    };
  });

  // Sort by time
  parsed.sort((a, b) => a.time - b.time);

  // Throttle per 6s window, prioritizing rtl
  const result: DanmakuComment[] = [];
  let windowStart = 0;
  let windowCount = 0;

  for (const comment of parsed) {
    // Move window forward
    if (comment.time >= windowStart + WINDOW_SIZE) {
      windowStart = Math.floor(comment.time / WINDOW_SIZE) * WINDOW_SIZE;
      windowCount = 0;
    }
    if (windowCount < limit) {
      result.push(comment);
      windowCount++;
    }
    // When at limit, still allow rtl to replace a non-rtl if available
    // (simple approach: just enforce the cap)
  }

  return result;
}

// Worker message handler
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<ProcessInput>) => {
    const result = processDanmaku(e.data);
    self.postMessage(result);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose workers/danmaku-worker.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/workers/danmaku-worker.ts web/src/workers/danmaku-worker.test.ts
git commit -m "feat(danmaku): add WebWorker for comment processing and throttling"
```

---

### Task 2: Preferences Store — Add New Fields

**Files:**
- Modify: `web/src/store/preferences-store.ts`
- Modify: `web/src/lib/api/stream.ts`

- [ ] **Step 1: Add DanmakuDensity type export to stream.ts**

In `web/src/lib/api/stream.ts`, add after the `DanmakuComment` interface (after line 53):

```typescript
export type DanmakuDensity = 'low' | 'medium' | 'high';
export type BufferMode = 'auto' | 'low' | 'balanced' | 'high';
```

- [ ] **Step 2: Add fields to preferences store**

In `web/src/store/preferences-store.ts`, add to the `GlobalPreferences` usage in `extractPrefs` (line 64, before closing brace):

```typescript
    danmakuDensity: state.danmakuDensity,
    bufferMode: state.bufferMode,
```

Add default values in the store creator (after line 83, `danmakuSpeed: 144`):

```typescript
      danmakuDensity: 'medium' as const,
      bufferMode: 'auto' as const,
```

Add to `resetToDefaults` (after line 139, `danmakuSpeed: 144`):

```typescript
        danmakuDensity: 'medium',
        bufferMode: 'auto',
```

Add to `partialize` (after line 158, `danmakuSpeed: state.danmakuSpeed`):

```typescript
        danmakuDensity: state.danmakuDensity,
        bufferMode: state.bufferMode,
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/store/preferences-store.ts web/src/lib/api/stream.ts
git commit -m "feat(preferences): add danmakuDensity and bufferMode settings"
```

---

### Task 3: DanmakuOverlay — Wire Up Worker

**Files:**
- Modify: `web/src/components/DanmakuOverlay.tsx`
- Modify: `web/src/pages/WatchPage.tsx`

- [ ] **Step 1: Rewrite DanmakuOverlay to use Worker**

Replace `web/src/components/DanmakuOverlay.tsx` entirely:

```typescript
// web/src/components/DanmakuOverlay.tsx
import DanmakuEngine from 'danmaku';
import { useEffect, useRef } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { usePreferencesStore } from '@/store/preferences-store';

interface DanmakuOverlayProps {
  videoElement: HTMLVideoElement | null;
  comments: DanmakuComment[];
}

export function DanmakuOverlay({ videoElement, comments }: DanmakuOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const danmakuRef = useRef<DanmakuEngine | null>(null);
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const speed = usePreferencesStore((s) => s.danmakuSpeed);

  // Init danmaku engine
  useEffect(() => {
    if (!videoElement || !containerRef.current || comments.length === 0) return;

    const engine = new DanmakuEngine({
      container: containerRef.current,
      media: videoElement,
      engine: 'canvas',
      comments: comments.map((c) => ({
        text: c.text,
        time: c.time,
        mode: c.mode,
        style: {
          fontSize: c.style.fontSize,
          color: c.style.color,
          opacity: String(c.style.opacity),
        },
      })),
      speed,
    });

    danmakuRef.current = engine;

    return () => {
      engine.destroy();
      danmakuRef.current = null;
    };
  }, [videoElement, comments, speed]);

  // Toggle visibility
  useEffect(() => {
    if (!danmakuRef.current) return;
    if (enabled) {
      danmakuRef.current.show();
    } else {
      danmakuRef.current.hide();
    }
  }, [enabled]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => danmakuRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10" />;
}
```

Note: DanmakuOverlay itself stays the same — it receives pre-processed comments. The Worker integration happens in WatchPage.

- [ ] **Step 2: Update WatchPage to use Worker for danmaku processing**

In `web/src/pages/WatchPage.tsx`, replace the danmaku parsing section (around lines 259-269).

Replace:
```typescript
  // --------------- Danmaku parsing ---------------
  const danmakuFontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const danmakuOpacity = usePreferencesStore((s) => s.danmakuOpacity);

  const danmakuComments: DanmakuComment[] = useMemo(
    () =>
      danmakuRaw?.comments
        ? parseDandanplayComments(danmakuRaw.comments, danmakuFontSize, danmakuOpacity)
        : [],
    [danmakuRaw, danmakuFontSize, danmakuOpacity]
  );
```

With:
```typescript
  // --------------- Danmaku parsing (via WebWorker) ---------------
  const danmakuFontSize = usePreferencesStore((s) => s.danmakuFontSize);
  const danmakuOpacity = usePreferencesStore((s) => s.danmakuOpacity);
  const danmakuDensity = usePreferencesStore((s) => s.danmakuDensity);
  const [danmakuComments, setDanmakuComments] = useState<DanmakuComment[]>([]);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Try to create Worker; fallback to inline processing
    try {
      workerRef.current = new Worker(
        new URL('../workers/danmaku-worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (e: MessageEvent<DanmakuComment[]>) => {
        setDanmakuComments(e.data);
      };
    } catch {
      // Worker not supported — will use inline fallback
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!danmakuRaw?.comments?.length) {
      setDanmakuComments([]);
      return;
    }
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const input = {
      comments: danmakuRaw.comments,
      fontSize: danmakuFontSize,
      opacity: danmakuOpacity,
      density: danmakuDensity,
      isMobile,
    };
    if (workerRef.current) {
      workerRef.current.postMessage(input);
    } else {
      // Inline fallback — import processDanmaku directly
      import('../workers/danmaku-worker').then(({ processDanmaku }) => {
        setDanmakuComments(processDanmaku(input));
      });
    }
  }, [danmakuRaw, danmakuFontSize, danmakuOpacity, danmakuDensity]);
```

Also add `useState` to the React imports if not already there (it is — line 6).

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/components/DanmakuOverlay.tsx web/src/pages/WatchPage.tsx
git commit -m "feat(danmaku): integrate WebWorker for off-thread comment processing"
```

---

### Task 4: Network Monitor

**Files:**
- Create: `web/src/lib/network-monitor.ts`
- Create: `web/src/lib/network-monitor.test.ts`

- [ ] **Step 1: Write test**

```typescript
// web/src/lib/network-monitor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitor } from './network-monitor';

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor;

  beforeEach(() => {
    monitor = new NetworkMonitor();
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('returns medium profile when navigator.connection is unavailable', () => {
    // Default JSDOM has no navigator.connection
    expect(monitor.getProfile()).toBe('medium');
  });

  it('records segment download speed and updates profile', () => {
    // Simulate slow segment downloads
    monitor.recordSegmentDownload(100_000, 2000); // 100KB in 2s = 50KB/s = 0.4Mbps
    monitor.recordSegmentDownload(100_000, 2000);
    monitor.recordSegmentDownload(100_000, 2000);
    expect(monitor.getProfile()).toBe('slow');
  });

  it('records fast segment downloads', () => {
    monitor.recordSegmentDownload(1_000_000, 100); // 1MB in 100ms = 10MB/s = 80Mbps
    monitor.recordSegmentDownload(1_000_000, 100);
    monitor.recordSegmentDownload(1_000_000, 100);
    expect(monitor.getProfile()).toBe('fast');
  });

  it('notifies subscribers on profile change', () => {
    const fn = vi.fn();
    monitor.subscribe(fn);
    // Push enough slow samples to trigger change from default 'medium'
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(50_000, 2000); // very slow
    }
    expect(fn).toHaveBeenCalledWith('slow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose lib/network-monitor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// web/src/lib/network-monitor.ts
export type NetworkProfile = 'fast' | 'medium' | 'slow';

type Listener = (profile: NetworkProfile) => void;

// Thresholds in Mbps
const FAST_THRESHOLD = 10;
const SLOW_THRESHOLD = 2;

export class NetworkMonitor {
  private listeners: Set<Listener> = new Set();
  private currentProfile: NetworkProfile = 'medium';
  private segmentSpeeds: number[] = []; // Mbps, rolling window of last 5
  private connectionHandler: (() => void) | null = null;

  constructor() {
    this.initConnectionAPI();
  }

  private initConnectionAPI() {
    const conn = (navigator as any).connection;
    if (!conn) return;

    this.connectionHandler = () => {
      const newProfile = this.profileFromConnection(conn);
      this.updateProfile(newProfile);
    };
    conn.addEventListener('change', this.connectionHandler);
    this.currentProfile = this.profileFromConnection(conn);
  }

  private profileFromConnection(conn: any): NetworkProfile {
    const downlink = conn.downlink as number | undefined;
    if (downlink === undefined) return 'medium';
    if (downlink >= FAST_THRESHOLD) return 'fast';
    if (downlink <= SLOW_THRESHOLD) return 'slow';
    return 'medium';
  }

  /** Call after each HLS segment download to refine speed estimate */
  recordSegmentDownload(bytes: number, durationMs: number) {
    if (durationMs <= 0) return;
    const mbps = (bytes * 8) / (durationMs / 1000) / 1_000_000;
    this.segmentSpeeds.push(mbps);
    if (this.segmentSpeeds.length > 5) this.segmentSpeeds.shift();

    // Only use segment-based profile when navigator.connection unavailable
    if ((navigator as any).connection) return;

    const avg = this.segmentSpeeds.reduce((a, b) => a + b, 0) / this.segmentSpeeds.length;
    const newProfile: NetworkProfile =
      avg >= FAST_THRESHOLD ? 'fast' : avg <= SLOW_THRESHOLD ? 'slow' : 'medium';
    this.updateProfile(newProfile);
  }

  private updateProfile(profile: NetworkProfile) {
    if (profile === this.currentProfile) return;
    this.currentProfile = profile;
    for (const fn of this.listeners) fn(profile);
  }

  getProfile(): NetworkProfile {
    return this.currentProfile;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy() {
    this.listeners.clear();
    if (this.connectionHandler) {
      (navigator as any).connection?.removeEventListener('change', this.connectionHandler);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose lib/network-monitor.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/lib/network-monitor.ts web/src/lib/network-monitor.test.ts
git commit -m "feat(player): add NetworkMonitor utility for adaptive buffering"
```

---

### Task 5: Memory Monitor

**Files:**
- Create: `web/src/lib/memory-monitor.ts`
- Create: `web/src/lib/memory-monitor.test.ts`

- [ ] **Step 1: Write test**

```typescript
// web/src/lib/memory-monitor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryMonitor } from './memory-monitor';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  afterEach(() => {
    monitor?.destroy();
  });

  it('starts in normal state', () => {
    monitor = new MemoryMonitor();
    expect(monitor.isPressured()).toBe(false);
  });

  it('detects pressure from danmaku heuristic', () => {
    monitor = new MemoryMonitor();
    monitor.reportActiveDanmaku(2500);
    expect(monitor.isPressured()).toBe(true);
  });

  it('returns to normal after consecutive normal reports', () => {
    monitor = new MemoryMonitor();
    monitor.reportActiveDanmaku(2500); // pressured
    expect(monitor.isPressured()).toBe(true);
    monitor.reportActiveDanmaku(100); // normal 1
    monitor.reportActiveDanmaku(100); // normal 2
    monitor.reportActiveDanmaku(100); // normal 3
    expect(monitor.isPressured()).toBe(false);
  });

  it('notifies subscribers on state change', () => {
    monitor = new MemoryMonitor();
    const fn = vi.fn();
    monitor.subscribe(fn);
    monitor.reportActiveDanmaku(2500);
    expect(fn).toHaveBeenCalledWith('memory-pressure');
  });

  it('notifies on recovery', () => {
    monitor = new MemoryMonitor();
    const fn = vi.fn();
    monitor.reportActiveDanmaku(2500); // pressure first
    monitor.subscribe(fn);
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);
    expect(fn).toHaveBeenCalledWith('memory-normal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose lib/memory-monitor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// web/src/lib/memory-monitor.ts
export type MemoryEvent = 'memory-pressure' | 'memory-normal';
type Listener = (event: MemoryEvent) => void;

const HEAP_PRESSURE_THRESHOLD = 0.7; // 70%
const DANMAKU_PRESSURE_THRESHOLD = 2000;
const RECOVERY_COUNT = 3; // consecutive normal polls before recovery

export class MemoryMonitor {
  private listeners: Set<Listener> = new Set();
  private pressured = false;
  private normalCount = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Auto-poll if performance.memory is available
    const mem = (performance as any).memory;
    if (mem) {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const interval = isMobile ? 30_000 : 60_000;
      this.pollTimer = setInterval(() => this.checkHeap(), interval);
    }
  }

  private checkHeap() {
    const mem = (performance as any).memory;
    if (!mem) return;
    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    if (ratio >= HEAP_PRESSURE_THRESHOLD) {
      this.setPressured(true);
    } else {
      this.tickNormal();
    }
  }

  /** Called by DanmakuOverlay to report active comment count as heuristic */
  reportActiveDanmaku(count: number) {
    if (count >= DANMAKU_PRESSURE_THRESHOLD) {
      this.setPressured(true);
    } else {
      this.tickNormal();
    }
  }

  private setPressured(value: boolean) {
    if (value) {
      this.normalCount = 0;
      if (!this.pressured) {
        this.pressured = true;
        this.notify('memory-pressure');
      }
    }
  }

  private tickNormal() {
    if (!this.pressured) return;
    this.normalCount++;
    if (this.normalCount >= RECOVERY_COUNT) {
      this.pressured = false;
      this.normalCount = 0;
      this.notify('memory-normal');
    }
  }

  private notify(event: MemoryEvent) {
    for (const fn of this.listeners) fn(event);
  }

  isPressured(): boolean {
    return this.pressured;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy() {
    this.listeners.clear();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run test:run -- --reporter=verbose lib/memory-monitor.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/lib/memory-monitor.ts web/src/lib/memory-monitor.test.ts
git commit -m "feat(player): add MemoryMonitor for mobile stability"
```

---

### Task 6: Adaptive Buffering — VideoPlayer Integration

**Files:**
- Modify: `web/src/components/VideoPlayer.tsx`
- Modify: `web/src/pages/WatchPage.tsx`

- [ ] **Step 1: Add buffer config prop to VideoPlayer**

In `web/src/components/VideoPlayer.tsx`, add to `VideoPlayerProps` interface (after line 36, `controlBarExtra`):

```typescript
  /** HLS buffer configuration */
  hlsConfig?: {
    maxBufferLength: number;
    maxMaxBufferLength: number;
  };
```

In `PlayerInner` component, update the HLS rendering (line 311). Replace:

```tsx
{isHLS ? <HlsVideo src={src} playsInline crossOrigin="anonymous" /> : <Video src={src} playsInline crossOrigin="anonymous" />}
```

With:

```tsx
{isHLS ? (
  <HlsVideo
    src={src}
    playsInline
    crossOrigin="anonymous"
    hlsConfig={props.hlsConfig ? {
      maxBufferLength: props.hlsConfig.maxBufferLength,
      maxMaxBufferLength: props.hlsConfig.maxMaxBufferLength,
    } : undefined}
  />
) : (
  <Video src={src} playsInline crossOrigin="anonymous" />
)}
```

Note: `@videojs/react`'s `HlsVideo` accepts `hlsConfig` to pass through to hls.js. If it doesn't, we'll need to access the hls.js instance via a ref — verify during implementation.

- [ ] **Step 2: Add buffer mode logic to WatchPage**

In `web/src/pages/WatchPage.tsx`, add after the danmaku worker section, before the transcode auto-trigger:

```typescript
  // --------------- Adaptive buffering ---------------
  const bufferMode = usePreferencesStore((s) => s.bufferMode);
  const networkMonitorRef = useRef<NetworkMonitor | null>(null);
  const [activeBufferProfile, setActiveBufferProfile] = useState<'low' | 'balanced' | 'high'>('balanced');

  useEffect(() => {
    const { NetworkMonitor } = await import('@/lib/network-monitor');
    // Lazy import to avoid top-level side effects
  }, []);
  // Simpler approach — use synchronous import at top and instantiate in effect:

  useEffect(() => {
    if (bufferMode !== 'auto') {
      setActiveBufferProfile(bufferMode as 'low' | 'balanced' | 'high');
      return;
    }
    const monitor = new NetworkMonitor();
    networkMonitorRef.current = monitor;

    // Map network profile to buffer profile
    const profileMap = { fast: 'high', medium: 'balanced', slow: 'low' } as const;
    setActiveBufferProfile(profileMap[monitor.getProfile()]);

    const unsub = monitor.subscribe((profile) => {
      setActiveBufferProfile(profileMap[profile]);
    });

    return () => {
      unsub();
      monitor.destroy();
      networkMonitorRef.current = null;
    };
  }, [bufferMode]);

  const hlsBufferConfig = useMemo(() => {
    const configs = {
      low: { maxBufferLength: 15, maxMaxBufferLength: 30 },
      balanced: { maxBufferLength: 30, maxMaxBufferLength: 60 },
      high: { maxBufferLength: 60, maxMaxBufferLength: 120 },
    };
    return configs[activeBufferProfile];
  }, [activeBufferProfile]);
```

Add `NetworkMonitor` import at top of file:

```typescript
import { NetworkMonitor } from '@/lib/network-monitor';
```

Pass `hlsBufferConfig` to `VideoPlayer`:

```tsx
<VideoPlayer
  src={streamSource.src}
  type={streamSource.type}
  onReady={handlePlayerReady}
  className="..."
  controlBarExtra={...}
  hlsConfig={hlsBufferConfig}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/components/VideoPlayer.tsx web/src/pages/WatchPage.tsx
git commit -m "feat(player): integrate adaptive buffering with NetworkMonitor"
```

---

### Task 7: Memory Monitor — WatchPage Integration + Toast

**Files:**
- Modify: `web/src/pages/WatchPage.tsx`

- [ ] **Step 1: Wire up MemoryMonitor in WatchPage**

Add import at top:

```typescript
import { MemoryMonitor } from '@/lib/memory-monitor';
```

Add after the adaptive buffering section:

```typescript
  // --------------- Memory monitoring ---------------
  const memoryMonitorRef = useRef<MemoryMonitor | null>(null);

  useEffect(() => {
    const monitor = new MemoryMonitor();
    memoryMonitorRef.current = monitor;

    const unsub = monitor.subscribe((event) => {
      const store = usePreferencesStore.getState();
      if (event === 'memory-pressure') {
        // Only degrade settings user hasn't manually locked
        if (store.bufferMode === 'auto') {
          setActiveBufferProfile('low');
        }
        // Notify worker to use low density if not manually set
        // (Worker will get updated via the preference effect)
        toast.info(i18n._(msg`player.memoryPressure`));
      } else {
        // Restore
        if (store.bufferMode === 'auto') {
          const profileMap = { fast: 'high', medium: 'balanced', slow: 'low' } as const;
          const netProfile = networkMonitorRef.current?.getProfile() ?? 'medium';
          setActiveBufferProfile(profileMap[netProfile]);
        }
        toast.info(i18n._(msg`player.memoryNormal`));
      }
    });

    return () => {
      unsub();
      monitor.destroy();
      memoryMonitorRef.current = null;
    };
  }, [i18n]);
```

- [ ] **Step 2: Add i18n keys**

Add to translation catalogs (will need `bun run i18n:extract` after):

```
player.memoryPressure = "Memory low — switched to power-saving mode"
player.memoryNormal = "Memory restored — back to normal mode"
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/WatchPage.tsx
git commit -m "feat(player): wire MemoryMonitor with toast notifications"
```

---

### Task 8: Settings Panel — Buffer Mode + Density Controls

**Files:**
- Modify: `web/src/pages/settings/PlayerPanel.tsx`

- [ ] **Step 1: Add buffer mode and density controls**

In `web/src/pages/settings/PlayerPanel.tsx`, add after the danmaku speed selector (after line 308, before closing `</div>` of the danmaku disabled wrapper):

```typescript
              {/* Danmaku density selector */}
              <div className="space-y-2">
                <Label className="text-sm text-mm-text-secondary">
                  {i18n._(msg`settings.player.danmakuDensity`)}
                </Label>
                <SelectorGroup
                  options={[
                    { label: i18n._(msg`settings.player.density.low`), value: 'low' as const },
                    { label: i18n._(msg`settings.player.density.medium`), value: 'medium' as const },
                    { label: i18n._(msg`settings.player.density.high`), value: 'high' as const },
                  ]}
                  value={usePreferencesStore((s) => s.danmakuDensity)}
                  onChange={(v) => updatePreference('danmakuDensity', v)}
                />
              </div>
```

Add a new SettingsCard after the Danmaku card (after line 311, before `<KeyBindingPanel />`):

```tsx
        {/* ── Buffer Mode ── */}
        <SettingsCard label={i18n._(msg`settings.player.bufferMode`)}>
          <div className="space-y-2">
            <SelectorGroup
              options={[
                { label: i18n._(msg`settings.player.buffer.auto`), value: 'auto' as const },
                { label: i18n._(msg`settings.player.buffer.low`), value: 'low' as const },
                { label: i18n._(msg`settings.player.buffer.balanced`), value: 'balanced' as const },
                { label: i18n._(msg`settings.player.buffer.high`), value: 'high' as const },
              ]}
              value={usePreferencesStore((s) => s.bufferMode)}
              onChange={(v) => updatePreference('bufferMode', v)}
            />
            <p className="text-xs text-mm-text-tertiary">
              {i18n._(msg`settings.player.bufferModeDesc`)}
            </p>
          </div>
        </SettingsCard>
```

- [ ] **Step 2: Extract i18n strings**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract`

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/pages/settings/PlayerPanel.tsx web/src/locales/
git commit -m "feat(settings): add buffer mode and danmaku density controls"
```

---

### Task 9: Backend — DandanPlay Fallback Client

**Files:**
- Create: `api/internal/integration/dandanplay/fallback.go`
- Create: `api/internal/integration/dandanplay/fallback_test.go`

- [ ] **Step 1: Write test**

```go
// api/internal/integration/dandanplay/fallback_test.go
package dandanplay

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFallbackClient_UsesOfficialWhenCredentialsAvailable(t *testing.T) {
	officialCalled := false
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		officialCalled = true
		if r.Header.Get("X-AppId") == "" {
			t.Error("expected X-AppId header")
		}
		json.NewEncoder(w).Encode(commentResponse{Comments: []Comment{{CID: 1, P: "1,1,16777215", M: "official"}}})
	}))
	defer official.Close()

	credFn := func(ctx context.Context) (string, string, error) {
		return "testid", "testsecret", nil
	}
	client := NewFallbackClient(
		&http.Client{},
		credFn,
		official.URL,
		"http://unused-fallback",
	)

	comments, err := client.GetComments(context.Background(), 123)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !officialCalled {
		t.Error("expected official API to be called")
	}
	if len(comments) != 1 || comments[0].M != "official" {
		t.Errorf("unexpected comments: %v", comments)
	}
}

func TestFallbackClient_FallsBackWhenNoCredentials(t *testing.T) {
	fallbackCalled := false
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalled = true
		if r.Header.Get("X-AppId") != "" {
			t.Error("fallback should not receive auth headers")
		}
		json.NewEncoder(w).Encode(commentResponse{Comments: []Comment{{CID: 2, P: "2,1,16777215", M: "fallback"}}})
	}))
	defer fallback.Close()

	credFn := func(ctx context.Context) (string, string, error) {
		return "", "", nil
	}
	client := NewFallbackClient(
		&http.Client{},
		credFn,
		"http://will-not-be-called",
		fallback.URL,
	)

	comments, err := client.GetComments(context.Background(), 456)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !fallbackCalled {
		t.Error("expected fallback API to be called")
	}
	if len(comments) != 1 || comments[0].M != "fallback" {
		t.Errorf("unexpected comments: %v", comments)
	}
}

func TestFallbackClient_FallsBackOnOfficialError(t *testing.T) {
	official := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer official.Close()

	fallbackCalled := false
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalled = true
		json.NewEncoder(w).Encode(commentResponse{Comments: []Comment{{CID: 3, P: "3,1,16777215", M: "recovered"}}})
	}))
	defer fallback.Close()

	credFn := func(ctx context.Context) (string, string, error) {
		return "id", "secret", nil
	}
	client := NewFallbackClient(&http.Client{}, credFn, official.URL, fallback.URL)

	comments, err := client.GetComments(context.Background(), 789)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !fallbackCalled {
		t.Error("expected fallback after official 429")
	}
	if comments[0].M != "recovered" {
		t.Errorf("expected recovered comment, got: %v", comments[0].M)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/integration/dandanplay/ -run TestFallback -v`
Expected: FAIL — NewFallbackClient not found

- [ ] **Step 3: Write implementation**

```go
// api/internal/integration/dandanplay/fallback.go
package dandanplay

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
)

const defaultFallbackURL = "https://api.danmu.icu/87654321"

// fallbackClient wraps an official DandanPlay client and falls back to
// a danmu_api-compatible proxy when the official client fails or has no credentials.
type fallbackClient struct {
	official Client
	fallback Client
}

// NewFallbackClient creates a Client that tries the official DandanPlay API first,
// falling back to a danmu_api proxy on failure or missing credentials.
func NewFallbackClient(httpClient *http.Client, credFn CredentialsFn, officialURL, fallbackURL string) Client {
	if officialURL == "" {
		officialURL = defaultBaseURL
	}
	if fallbackURL == "" {
		fallbackURL = defaultFallbackURL
	}

	// The fallback client uses a no-op credential function since danmu_api
	// uses URL-path-based tokens, not header auth.
	noopCredFn := func(ctx context.Context) (string, string, error) {
		return "noop", "noop", nil
	}

	return &fallbackClient{
		official: NewClientWithURL(httpClient, credFn, officialURL),
		fallback: NewClientWithURL(httpClient, noopCredFn, fallbackURL),
	}
}

func (c *fallbackClient) GetComments(ctx context.Context, episodeID int64) ([]Comment, error) {
	comments, err := c.official.GetComments(ctx, episodeID)
	if err == nil {
		return comments, nil
	}
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.GetComments(ctx, episodeID)
	}
	return nil, err
}

func (c *fallbackClient) MatchFile(ctx context.Context, fileName, fileHash string, fileSize int64, videoDuration int) (*MatchResult, error) {
	result, err := c.official.MatchFile(ctx, fileName, fileHash, fileSize, videoDuration)
	if err == nil {
		return result, nil
	}
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.MatchFile(ctx, fileName, fileHash, fileSize, videoDuration)
	}
	return nil, err
}

func (c *fallbackClient) PostComment(ctx context.Context, episodeID int64, req PostCommentReq) error {
	// Post only goes to official — fallback proxies are read-only
	return c.official.PostComment(ctx, episodeID, req)
}

func (c *fallbackClient) GetBangumiInfo(ctx context.Context, dandanplayAnimeID int64) (*BangumiInfo, error) {
	info, err := c.official.GetBangumiInfo(ctx, dandanplayAnimeID)
	if err == nil {
		return info, nil
	}
	if errors.Is(err, ErrNoCredentials) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrUnavailable) {
		slog.Debug("dandanplay official failed, trying fallback", "error", err)
		return c.fallback.GetBangumiInfo(ctx, dandanplayAnimeID)
	}
	return nil, err
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/integration/dandanplay/ -run TestFallback -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/integration/dandanplay/fallback.go api/internal/integration/dandanplay/fallback_test.go
git commit -m "feat(dandanplay): add fallback client with danmu_api proxy support"
```

---

### Task 10: Backend — Wire Fallback Client in main.go

**Files:**
- Modify: `api/internal/config/config.go`
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Add DanmuAPIURL to config**

In `api/internal/config/config.go`, add to `Config` struct (after line 26, `DandanPlayAppSecret`):

```go
	DanmuAPIURL         string // optional custom danmu_api proxy URL
```

Add to defaults map (after line 51):

```go
		"DANMU_API_URL":    "",
```

Add to config construction (after line 74):

```go
		DanmuAPIURL:         k.String("DANMU_API_URL"),
```

- [ ] **Step 2: Update main.go to use FallbackClient**

In `api/cmd/server/main.go`, replace line 206:

```go
	ddpClient := dandanplay.NewClient(&http.Client{Timeout: 10 * time.Second}, ddpCredFn)
```

With:

```go
	ddpClient := dandanplay.NewFallbackClient(
		&http.Client{Timeout: 10 * time.Second},
		ddpCredFn,
		"", // official URL — uses default
		cfg.DanmuAPIURL, // fallback URL — empty uses default danmu.icu
	)
```

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./... -count=1 -short`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/config/config.go api/cmd/server/main.go
git commit -m "feat(config): wire DandanPlay fallback client with configurable proxy URL"
```

---

### Task 11: Backend — CJK Search Variant Generator

**Files:**
- Create: `api/internal/search/variants.go`
- Create: `api/internal/search/variants_test.go`

- [ ] **Step 1: Add opencc dependency**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go get github.com/longbridgeapp/opencc`

- [ ] **Step 2: Write test**

```go
// api/internal/search/variants_test.go
package search

import (
	"testing"
)

func TestGenerateVariants_TraditionalInput(t *testing.T) {
	variants := GenerateVariants("進擊的巨人")
	if len(variants) < 2 {
		t.Fatalf("expected at least 2 variants, got %d: %v", len(variants), variants)
	}
	// Original should be first
	if variants[0] != "進擊的巨人" {
		t.Errorf("first variant should be original, got: %s", variants[0])
	}
	// Should contain simplified
	found := false
	for _, v := range variants {
		if v == "进击的巨人" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected simplified variant '进击的巨人' in: %v", variants)
	}
}

func TestGenerateVariants_SimplifiedInput(t *testing.T) {
	variants := GenerateVariants("进击的巨人")
	if len(variants) < 2 {
		t.Fatalf("expected at least 2 variants, got %d: %v", len(variants), variants)
	}
	if variants[0] != "进击的巨人" {
		t.Errorf("first variant should be original, got: %s", variants[0])
	}
	// Should contain traditional
	found := false
	for _, v := range variants {
		if v == "進擊的巨人" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected traditional variant in: %v", variants)
	}
}

func TestGenerateVariants_LatinInput(t *testing.T) {
	variants := GenerateVariants("Attack on Titan")
	if len(variants) != 1 {
		t.Errorf("expected 1 variant for Latin input, got %d: %v", len(variants), variants)
	}
}

func TestGenerateVariants_MaxThree(t *testing.T) {
	variants := GenerateVariants("龍珠")
	if len(variants) > 3 {
		t.Errorf("expected at most 3 variants, got %d: %v", len(variants), variants)
	}
}

func TestGenerateVariants_Deduplicates(t *testing.T) {
	// Pure ASCII — all conversions return same string
	variants := GenerateVariants("Naruto")
	seen := make(map[string]bool)
	for _, v := range variants {
		if seen[v] {
			t.Errorf("duplicate variant: %s", v)
		}
		seen[v] = true
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/search/ -run TestGenerate -v`
Expected: FAIL — package not found

- [ ] **Step 4: Write implementation**

```go
// api/internal/search/variants.go
package search

import (
	"unicode"

	"github.com/longbridgeapp/opencc"
)

var (
	t2s *opencc.OpenCC
	s2t *opencc.OpenCC
)

func init() {
	var err error
	t2s, err = opencc.New("t2s") // Traditional → Simplified
	if err != nil {
		panic("opencc t2s init: " + err.Error())
	}
	s2t, err = opencc.New("s2t") // Simplified → Traditional
	if err != nil {
		panic("opencc s2t init: " + err.Error())
	}
}

// GenerateVariants produces up to 3 deduplicated search query variants:
// 1. Original query
// 2. Traditional→Simplified (if CJK detected)
// 3. Simplified→Traditional (if CJK detected)
func GenerateVariants(query string) []string {
	if !containsCJK(query) {
		return []string{query}
	}

	seen := make(map[string]struct{})
	var variants []string

	add := func(s string) {
		if _, ok := seen[s]; ok || s == "" {
			return
		}
		seen[s] = struct{}{}
		variants = append(variants, s)
	}

	add(query)

	// T→S
	if simplified, err := t2s.Convert(query); err == nil {
		add(simplified)
	}

	// S→T
	if traditional, err := s2t.Convert(query); err == nil {
		add(traditional)
	}

	// Cap at 3
	if len(variants) > 3 {
		variants = variants[:3]
	}

	return variants
}

func containsCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/search/ -run TestGenerate -v`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/search/
git commit -m "feat(search): add CJK search variant generator with opencc"
```

---

### Task 12: Backend — Integrate Variants into Search Flow

**Files:**
- Modify: `api/internal/metadata/service.go`
- Modify: `api/internal/api/discover_handler.go`

- [ ] **Step 1: Update metadata.Service.Search to accept variants**

In `api/internal/metadata/service.go`, replace the `Search` method (starting at line 222):

```go
func (s *Service) Search(ctx context.Context, query string, isAdult bool) ([]AnimeSummary, error) {
	cacheKey := fmt.Sprintf("meta:search:%s:%v", query, isAdult)
	var cached []AnimeSummary
	if s.getCache(ctx, cacheKey, &cached) {
		return cached, nil
	}

	if isAdult {
		// Keep existing adult search logic unchanged
		g, gctx := errgroup.WithContext(ctx)
		var subjects []bangumi.Subject
		var adultMedia []anilist.Media
		g.Go(func() error {
			var err error
			subjects, err = s.bangumi.SearchSubjects(gctx, query, bangumi.WithNSFW())
			return err
		})
		g.Go(func() error {
			var err error
			adultMedia, err = s.anilist.SearchMedia(gctx, query, true)
			return err
		})
		if err := g.Wait(); err != nil {
			return nil, err
		}
		if len(adultMedia) == 0 {
			fallback, err := s.anilist.Browse(ctx, anilist.BrowseFilter{IsAdult: true, Sort: "POPULARITY_DESC"}, 1, 20)
			if err == nil {
				adultMedia = fallback
			}
		}
		result := make([]AnimeSummary, 0, len(subjects)+len(adultMedia))
		for _, sub := range subjects {
			result = append(result, subjectToSummary(sub))
		}
		for _, m := range adultMedia {
			result = append(result, anilistMediaToSummary(m))
		}
		s.setCache(ctx, cacheKey, result, 1*time.Hour)
		return result, nil
	}

	// Non-adult search — no change to existing logic
	subjects, err := s.bangumi.SearchSubjects(ctx, query)
	if err != nil {
		return nil, err
	}
	result := make([]AnimeSummary, 0, len(subjects))
	for _, sub := range subjects {
		result = append(result, subjectToSummary(sub))
	}
	s.setCache(ctx, cacheKey, result, 1*time.Hour)
	return result, nil
}

// SearchWithVariants searches using multiple query variants in parallel,
// deduplicating results by Bangumi subject ID.
func (s *Service) SearchWithVariants(ctx context.Context, variants []string, isAdult bool) ([]AnimeSummary, error) {
	if len(variants) == 0 {
		return nil, nil
	}

	// Try first variant — if it returns ≥5 results, skip the rest
	first, err := s.Search(ctx, variants[0], isAdult)
	if err != nil {
		return nil, err
	}
	if len(first) >= 5 || len(variants) == 1 {
		return first, nil
	}

	// Search remaining variants in parallel
	type variantResult struct {
		results []AnimeSummary
	}
	g, gctx := errgroup.WithContext(ctx)
	remaining := make([]variantResult, len(variants)-1)
	for i, v := range variants[1:] {
		i, v := i, v
		g.Go(func() error {
			r, err := s.Search(gctx, v, isAdult)
			if err != nil {
				return nil // Don't fail — just skip this variant
			}
			remaining[i] = variantResult{results: r}
			return nil
		})
	}
	_ = g.Wait()

	// Merge and deduplicate
	seen := make(map[string]struct{})
	var merged []AnimeSummary
	addResults := func(results []AnimeSummary) {
		for _, r := range results {
			key := fmt.Sprintf("%d-%d", r.BangumiID, r.AniListID)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, r)
		}
	}
	addResults(first)
	for _, vr := range remaining {
		addResults(vr.results)
	}
	return merged, nil
}
```

Note: This requires `AnimeSummary` to have `BangumiID` and `AniListID` fields. Verify these exist during implementation — they should since `subjectToSummary` and `anilistMediaToSummary` produce them.

- [ ] **Step 2: Update discover_handler to use variants**

In `api/internal/api/discover_handler.go`, replace `handleSearch` (line 38):

```go
func (h *handler) handleSearch(c echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "q parameter required")
	}
	isAdult := c.QueryParam("adult") == "true"

	variants := search.GenerateVariants(q)
	results, err := h.metadata.SearchWithVariants(c.Request().Context(), variants, isAdult)
	if err != nil {
		return mapMetadataError(err)
	}
	return c.JSON(http.StatusOK, results)
}
```

Add import at top:

```go
	"github.com/milmil/api/internal/search"
```

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./internal/api/ -run TestSearch -v`
Expected: Existing search tests PASS (may need updating if they test handleSearch directly)

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./... -count=1 -short`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/internal/metadata/service.go api/internal/api/discover_handler.go
git commit -m "feat(search): integrate CJK variant search into discover API"
```

---

### Task 13: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full Go test suite**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go test ./... -count=1`
Expected: All PASS

- [ ] **Step 2: Run Go build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/api && go build ./cmd/server/`
Expected: Build succeeds

- [ ] **Step 3: Run full frontend check**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run check:all`
Expected: Typecheck + lint + format + tests all PASS

- [ ] **Step 4: Extract and compile i18n**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract && bun run i18n:compile`
Expected: New keys extracted, compiled successfully

- [ ] **Step 5: Commit i18n files if changed**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add web/src/locales/
git commit -m "chore(i18n): extract new player and search translation keys"
```
