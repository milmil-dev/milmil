# Player Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the VideoJS v10 player with 6 plugin modules — subtitle engine, keyboard shortcuts, media settings, playback features, gesture controls, and screenshot/GIF — backed by a preferences API with backup support.

**Architecture:** Each feature is an independent VideoJS v10 plugin registered via `player.registerPlugin()`. Plugins communicate through the VideoJS event bus (`player.on/trigger`). Shared UI primitives (OSD, frosted panels) live in `web/src/plugins/shared/`. All preferences use Zustand persist middleware (localStorage) + debounced backend API sync.

**Tech Stack:** VideoJS v10 (`@videojs/react`), Zustand v5 (persist middleware), Go/Echo v4 (backend), sqlc (queries), gif.js (Web Worker GIF encoding), libass-wasm (ASS rendering), Web Audio API (gain), CSS filters (video adjustments)

**UI Style:** iOS/macOS (IINA reference) — backdrop-filter blur, rounded corners, soft shadows, ease-out 200-300ms transitions, SF-style icons

---

## Phase 1: Foundation

### Task 1: Preferences Backend — Migration & Models

**Files:**
- Create: `api/migrations/028_user_preferences.up.sql`
- Create: `api/migrations/028_user_preferences.down.sql`
- Create: `api/internal/store/queries/preferences.sql`

**Step 1: Write the migration**

```sql
-- 028_user_preferences.up.sql
CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'global',       -- 'global' or 'series:{seriesId}'
    scope_id TEXT NOT NULL DEFAULT '',           -- empty for global, series ID otherwise
    data TEXT NOT NULL DEFAULT '{}',             -- JSON blob
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(user_id, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_scope ON user_preferences(user_id, scope, scope_id);

CREATE TABLE IF NOT EXISTS segment_marks (
    id TEXT PRIMARY KEY,
    media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                          -- 'op', 'ed', 'recap', 'preview'
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',       -- 'manual', 'aniskip', 'auto'
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(media_file_id, type, source)
);

CREATE TABLE IF NOT EXISTS backup_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                          -- 'webdav', 's3'
    config TEXT NOT NULL DEFAULT '{}',           -- encrypted JSON (endpoint, credentials)
    enabled INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT,
    UNIQUE(user_id, type)
);
```

```sql
-- 028_user_preferences.down.sql
DROP TABLE IF EXISTS backup_configs;
DROP TABLE IF EXISTS segment_marks;
DROP TABLE IF EXISTS user_preferences;
```

**Step 2: Write sqlc queries**

```sql
-- queries/preferences.sql

-- name: UpsertUserPreference :one
INSERT INTO user_preferences (id, user_id, scope, scope_id, data, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(user_id, scope, scope_id) DO UPDATE SET
    data = excluded.data,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
RETURNING *;

-- name: GetUserPreference :one
SELECT * FROM user_preferences
WHERE user_id = ? AND scope = ? AND scope_id = ?
LIMIT 1;

-- name: ListUserPreferences :many
SELECT * FROM user_preferences
WHERE user_id = ? AND scope = ?
ORDER BY updated_at DESC;

-- name: GetAllUserPreferences :many
SELECT * FROM user_preferences
WHERE user_id = ?
ORDER BY scope, scope_id;

-- name: DeleteUserPreference :exec
DELETE FROM user_preferences
WHERE user_id = ? AND scope = ? AND scope_id = ?;

-- name: CreateSegmentMark :one
INSERT INTO segment_marks (id, media_file_id, type, start_time, end_time, source, created_at)
VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
ON CONFLICT(media_file_id, type, source) DO UPDATE SET
    start_time = excluded.start_time,
    end_time = excluded.end_time
RETURNING *;

-- name: ListSegmentMarks :many
SELECT * FROM segment_marks
WHERE media_file_id = ?
ORDER BY start_time ASC;

-- name: DeleteSegmentMark :exec
DELETE FROM segment_marks WHERE id = ?;

-- name: UpsertBackupConfig :one
INSERT INTO backup_configs (id, user_id, type, config, enabled)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, type) DO UPDATE SET
    config = excluded.config,
    enabled = excluded.enabled
RETURNING *;

-- name: GetBackupConfig :one
SELECT * FROM backup_configs
WHERE user_id = ? AND type = ?
LIMIT 1;

-- name: ListBackupConfigs :many
SELECT * FROM backup_configs
WHERE user_id = ?;
```

**Step 3: Generate sqlc code**

Run: `cd api && sqlc generate`
Expected: New files generated in `api/internal/store/`

**Step 4: Commit**

```bash
git add api/migrations/ api/internal/store/queries/preferences.sql api/internal/store/
git commit -m "feat(player): add preferences, segment marks, and backup config tables"
```

---

### Task 2: Preferences Backend — API Handlers

**Files:**
- Create: `api/internal/api/preference_handler.go`
- Modify: `api/internal/api/router.go` — add route group

**Step 1: Write the preference handler**

Follow existing handler patterns from `settings_handler.go` and `progress_handler.go`:

```go
// preference_handler.go
package api

import (
    "encoding/json"
    "net/http"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
)

// --- Request/Response types ---

type upsertPreferenceRequest struct {
    Data json.RawMessage `json:"data"`
}

type exportPreferencesResponse struct {
    Version     int               `json:"version"`
    Preferences []preferenceDTO   `json:"preferences"`
    ExportedAt  string            `json:"exported_at"`
}

type preferenceDTO struct {
    Scope   string          `json:"scope"`
    ScopeID string          `json:"scope_id"`
    Data    json.RawMessage `json:"data"`
}

type importPreferencesRequest struct {
    Version     int             `json:"version"`
    Preferences []preferenceDTO `json:"preferences"`
}

// --- Handlers ---

// GET /api/v1/user/preferences
func (h *handler) handleGetGlobalPreferences(c echo.Context) error {
    userID := getUserID(c)
    ctx := c.Request().Context()

    pref, err := h.queries.GetUserPreference(ctx, store.GetUserPreferenceParams{
        UserID:  userID,
        Scope:   "global",
        ScopeID: "",
    })
    if err != nil {
        // Return empty defaults if not found
        return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage("{}")})
    }
    return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage(pref.Data)})
}

// PUT /api/v1/user/preferences
func (h *handler) handleUpsertGlobalPreferences(c echo.Context) error {
    userID := getUserID(c)
    ctx := c.Request().Context()

    var req upsertPreferenceRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
    }

    pref, err := h.queries.UpsertUserPreference(ctx, store.UpsertUserPreferenceParams{
        ID:      uuid.NewString(),
        UserID:  userID,
        Scope:   "global",
        ScopeID: "",
        Data:    string(req.Data),
    })
    if err != nil {
        return echo.ErrInternalServerError
    }
    return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage(pref.Data)})
}

// GET /api/v1/user/preferences/series/:seriesId
func (h *handler) handleGetSeriesPreferences(c echo.Context) error {
    userID := getUserID(c)
    seriesID := c.Param("seriesId")
    ctx := c.Request().Context()

    pref, err := h.queries.GetUserPreference(ctx, store.GetUserPreferenceParams{
        UserID:  userID,
        Scope:   "series",
        ScopeID: seriesID,
    })
    if err != nil {
        return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage("{}")})
    }
    return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage(pref.Data)})
}

// PUT /api/v1/user/preferences/series/:seriesId
func (h *handler) handleUpsertSeriesPreferences(c echo.Context) error {
    userID := getUserID(c)
    seriesID := c.Param("seriesId")
    ctx := c.Request().Context()

    var req upsertPreferenceRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
    }

    pref, err := h.queries.UpsertUserPreference(ctx, store.UpsertUserPreferenceParams{
        ID:      uuid.NewString(),
        UserID:  userID,
        Scope:   "series",
        ScopeID: seriesID,
        Data:    string(req.Data),
    })
    if err != nil {
        return echo.ErrInternalServerError
    }
    return c.JSON(http.StatusOK, map[string]any{"data": json.RawMessage(pref.Data)})
}

// POST /api/v1/user/preferences/export
func (h *handler) handleExportPreferences(c echo.Context) error {
    userID := getUserID(c)
    ctx := c.Request().Context()

    prefs, err := h.queries.GetAllUserPreferences(ctx, userID)
    if err != nil {
        return echo.ErrInternalServerError
    }

    dtos := make([]preferenceDTO, len(prefs))
    for i, p := range prefs {
        dtos[i] = preferenceDTO{
            Scope:   p.Scope,
            ScopeID: p.ScopeID,
            Data:    json.RawMessage(p.Data),
        }
    }

    return c.JSON(http.StatusOK, exportPreferencesResponse{
        Version:     1,
        Preferences: dtos,
        ExportedAt:  time.Now().UTC().Format(time.RFC3339),
    })
}

// POST /api/v1/user/preferences/import
func (h *handler) handleImportPreferences(c echo.Context) error {
    userID := getUserID(c)
    ctx := c.Request().Context()

    var req importPreferencesRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
    }
    if req.Version != 1 {
        return echo.NewHTTPError(http.StatusBadRequest, "unsupported version")
    }

    for _, p := range req.Preferences {
        _, err := h.queries.UpsertUserPreference(ctx, store.UpsertUserPreferenceParams{
            ID:      uuid.NewString(),
            UserID:  userID,
            Scope:   p.Scope,
            ScopeID: p.ScopeID,
            Data:    string(p.Data),
        })
        if err != nil {
            return echo.ErrInternalServerError
        }
    }

    return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
```

**Step 2: Write segment mark handlers in the same file or separate**

```go
// POST /api/v1/media/:fileId/segments
func (h *handler) handleCreateSegmentMark(c echo.Context) error { ... }

// GET /api/v1/media/:fileId/segments
func (h *handler) handleListSegmentMarks(c echo.Context) error { ... }

// DELETE /api/v1/media/:fileId/segments/:segmentId
func (h *handler) handleDeleteSegmentMark(c echo.Context) error { ... }
```

**Step 3: Register routes in router.go**

Add to the protected group section in `api/internal/api/router.go`:

```go
// User Preferences
prefs := v1.Group("/user/preferences", jwtMW)
prefs.GET("", h.handleGetGlobalPreferences)
prefs.PUT("", h.handleUpsertGlobalPreferences)
prefs.GET("/series/:seriesId", h.handleGetSeriesPreferences)
prefs.PUT("/series/:seriesId", h.handleUpsertSeriesPreferences)
prefs.POST("/export", h.handleExportPreferences)
prefs.POST("/import", h.handleImportPreferences)
prefs.PUT("/backup-config", h.handleUpsertBackupConfig)
prefs.GET("/backup-config", h.handleListBackupConfigs)
prefs.POST("/sync", h.handleTriggerSync)
prefs.GET("/sync/status", h.handleSyncStatus)

// Segment Marks
v1.POST("/media/:fileId/segments", h.handleCreateSegmentMark, jwtMW)
v1.GET("/media/:fileId/segments", h.handleListSegmentMarks, jwtMW)
v1.DELETE("/media/:fileId/segments/:segmentId", h.handleDeleteSegmentMark, jwtMW)
```

**Step 4: Run backend build**

Run: `cd api && go build ./...`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add api/internal/api/preference_handler.go api/internal/api/router.go
git commit -m "feat(player): add preferences and segment marks API endpoints"
```

---

### Task 3: Preferences Frontend — Zustand Store with Persist

**Files:**
- Create: `web/src/store/preferences-store.ts`
- Create: `web/src/lib/api/preferences.ts`

**Step 1: Write the API client**

```typescript
// web/src/lib/api/preferences.ts
import { api } from './client';

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeWidth: number;
  strokeColor: string;
  shadowType: 'none' | 'outline' | 'drop-shadow' | 'raised' | 'depressed';
  position: 'top' | 'center' | 'bottom';
  positionOffset: number;
  safeMargin: number;
  fadeAnimation: boolean;
  respectAssStyle: boolean;
}

export interface KeyBinding {
  action: string;
  key: string;
  modifiers?: ('shift' | 'ctrl' | 'alt' | 'meta')[];
}

export interface GlobalPreferences {
  subtitle_style: SubtitleStyle;
  subtitle_preset: string;
  keyboard_bindings: KeyBinding[];
  gesture_enabled: boolean;
  gesture_sensitivity: number;
  auto_next: boolean;
  auto_skip_op: boolean;
  auto_skip_ed: boolean;
  danmaku_enabled: boolean;
  danmaku_opacity: number;
  danmaku_font_size: number;
  danmaku_speed: number;
}

export interface SeriesPreferences {
  playback_speed: number;
  volume: number;
  subtitle_language: string;
  subtitle_secondary_language: string | null;
  subtitle_delay: number;
  audio_track_language: string;
}

export const preferencesApi = {
  getGlobal: () => api.get<{ data: GlobalPreferences }>('/api/v1/user/preferences').then(r => r.data),
  putGlobal: (data: Partial<GlobalPreferences>) => api.put('/api/v1/user/preferences', { data }),
  getSeries: (seriesId: string) => api.get<{ data: SeriesPreferences }>(`/api/v1/user/preferences/series/${seriesId}`).then(r => r.data),
  putSeries: (seriesId: string, data: Partial<SeriesPreferences>) => api.put(`/api/v1/user/preferences/series/${seriesId}`, { data }),
  exportAll: () => api.post<ExportResponse>('/api/v1/user/preferences/export'),
  importAll: (body: ImportRequest) => api.post('/api/v1/user/preferences/import', body),
};
```

**Step 2: Write the Zustand store with persist middleware**

```typescript
// web/src/store/preferences-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { preferencesApi, type GlobalPreferences, type SubtitleStyle } from '@/lib/api/preferences';

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Noto Sans CJK',
  fontSize: 24,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  strokeWidth: 2,
  strokeColor: '#000000',
  shadowType: 'outline',
  position: 'bottom',
  positionOffset: 10,
  safeMargin: 5,
  fadeAnimation: true,
  respectAssStyle: true,
};

// ...full store with persist, partialize, and debounced sync
```

**Step 3: Commit**

```bash
git add web/src/store/preferences-store.ts web/src/lib/api/preferences.ts
git commit -m "feat(player): add preferences store with Zustand persist + API sync"
```

---

### Task 4: Shared Plugin Infrastructure

**Files:**
- Create: `web/src/plugins/shared/OSDFeedback.ts`
- Create: `web/src/plugins/shared/FrostedPanel.ts`
- Create: `web/src/plugins/shared/plugin-utils.ts`

**Step 1: Write shared OSD feedback component**

OSD overlay for all plugins. Shows icon + text in a frosted glass pill, auto-fades.

```typescript
// web/src/plugins/shared/OSDFeedback.ts

export interface OSDOptions {
  icon?: string;      // SVG string or emoji
  text: string;
  duration?: number;  // ms, default 800
  position?: 'center' | 'top-right' | 'bottom-right';
}

export class OSDFeedback {
  private container: HTMLDivElement;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    // IINA style: frosted glass pill
    Object.assign(this.container.style, {
      position: 'absolute',
      zIndex: '100',
      pointerEvents: 'none',
      display: 'none',
      padding: '8px 16px',
      borderRadius: '12px',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'opacity 300ms ease-out',
      // center by default
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    });
    parentEl.appendChild(this.container);
  }

  show(opts: OSDOptions) { /* show with fade in/out */ }
  hide() { /* immediate hide */ }
  dispose() { /* cleanup */ }
}
```

**Step 2: Write frosted panel base for settings popover panels**

```typescript
// web/src/plugins/shared/FrostedPanel.ts
// Reusable popover panel with iOS-style backdrop blur
// Used by subtitle settings, media settings, keyboard help, etc.
```

**Step 3: Write plugin utilities**

```typescript
// web/src/plugins/shared/plugin-utils.ts
// Event bus helpers, common types, disposable pattern
export type PluginDispose = () => void;

export function createPluginEvent(namespace: string, action: string) {
  return `${namespace}:${action}`;
}
```

**Step 4: Commit**

```bash
git add web/src/plugins/shared/
git commit -m "feat(player): add shared plugin infrastructure — OSD, frosted panel, utils"
```

---

## Phase 2: Subtitle Enhancement (Batch 1)

### Task 5: SubtitlePlugin — Core Track Manager

**Files:**
- Create: `web/src/plugins/subtitle/SubtitlePlugin.ts`
- Create: `web/src/plugins/subtitle/TrackManager.ts`
- Create: `web/src/plugins/subtitle/types.ts`

**Step 1: Define subtitle types**

```typescript
// web/src/plugins/subtitle/types.ts
export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  source: 'embedded' | 'external' | 'drag-drop' | 'online';
  format: 'vtt' | 'ass' | 'ssa' | 'srt';
  isSDH?: boolean;
  url?: string;
  content?: string;  // for drag-drop loaded
}

export interface SubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
  // ASS-specific
  style?: Record<string, string>;
  position?: { x: number; y: number };
}
```

**Step 2: Implement TrackManager — parsing, loading, language matching**

Move subtitle loading logic from `WatchPage.tsx:392-444` into this module. Add drag-drop support.

**Step 3: Implement SubtitlePlugin as VideoJS v10 plugin entry point**

```typescript
// web/src/plugins/subtitle/SubtitlePlugin.ts
import type { Player } from '@videojs/react';

export function SubtitlePlugin(player: Player) {
  const trackManager = new TrackManager(player);
  const renderer = new SubtitleRenderer(player);
  const styleEngine = new StyleEngine();

  // Listen for events from other plugins
  player.on('subtitle:toggle', () => { ... });
  player.on('subtitle:next-track', () => { ... });
  player.on('subtitle:delay-adjust', (_, delta: number) => { ... });

  return {
    dispose() {
      trackManager.dispose();
      renderer.dispose();
    }
  };
}
```

**Step 4: Commit**

```bash
git add web/src/plugins/subtitle/
git commit -m "feat(player): add SubtitlePlugin core — track manager and types"
```

---

### Task 6: SubtitlePlugin — DOM Overlay Renderer

**Files:**
- Create: `web/src/plugins/subtitle/SubtitleRenderer.ts`
- Create: `web/src/plugins/subtitle/StyleEngine.ts`

**Step 1: Implement SubtitleRenderer**

DOM-based overlay that replaces native TextTrack rendering:
- Primary track (bottom) + Secondary track (top) for dual subtitles
- Fade in/out transitions
- Safe margin support
- ASS positioning support

**Step 2: Implement StyleEngine**

- Apply user custom styles
- Preset templates: Default, Cinema, Anime, High Contrast
- Border styles: outline, drop shadow, raised, depressed
- Toggle between ASS native style and user override

**Step 3: Commit**

```bash
git add web/src/plugins/subtitle/SubtitleRenderer.ts web/src/plugins/subtitle/StyleEngine.ts
git commit -m "feat(player): add subtitle DOM overlay renderer and style engine"
```

---

### Task 7: SubtitlePlugin — ASS/SSA Support

**Files:**
- Modify: `web/src/plugins/subtitle/SubtitleRenderer.ts`
- Modify: `web/package.json` — add `libass-wasm` or `ass-compiler`

**Step 1: Install ASS parsing dependency**

Run: `cd web && bun add ass-compiler`

For complex ASS effects (karaoke, animation), evaluate `libass-wasm` as optional canvas fallback.

**Step 2: Implement ASS parser integration in TrackManager**

Parse ASS styles, dialogue, and positioning. Feed structured cues to SubtitleRenderer.

**Step 3: Implement ASS native style rendering in SubtitleRenderer**

When `respectAssStyle: true`, apply ASS font, color, border, and position data.

**Step 4: Commit**

```bash
git add web/src/plugins/subtitle/ web/package.json web/bun.lock
git commit -m "feat(player): add ASS/SSA subtitle support with native style rendering"
```

---

### Task 8: SubtitlePlugin — Drag & Drop + Subtitle Panel UI

**Files:**
- Create: `web/src/plugins/subtitle/DragDropLoader.ts`
- Create: `web/src/plugins/subtitle/SubtitlePanel.tsx` (React component for settings UI)

**Step 1: Implement drag-drop handler**

Listen for dragover/drop on the player container. Accept `.srt`, `.ass`, `.ssa`, `.vtt` files. Parse and add as track.

**Step 2: Implement subtitle settings panel (React)**

IINA-style frosted popover with:
- Track list (with source badges: embedded/external/dropped)
- Dual subtitle selection (primary + secondary)
- Style controls (font, size, color, background, border style)
- Preset selector
- Delay slider
- Safe margin slider
- ASS native style toggle

**Step 3: Integrate panel into VideoPlayer controlBarExtra**

**Step 4: Commit**

```bash
git add web/src/plugins/subtitle/
git commit -m "feat(player): add subtitle drag-drop and settings panel UI"
```

---

### Task 9: Migrate WatchPage Subtitle Logic to SubtitlePlugin

**Files:**
- Modify: `web/src/pages/WatchPage.tsx:392-444` — remove subtitle loading, delegate to plugin
- Modify: `web/src/components/VideoPlayer.tsx` — register SubtitlePlugin

**Step 1: Remove subtitle loading effect from WatchPage.tsx**

Delete lines 392-444 (the `useEffect` that calls `addRemoteTextTrack`). Replace with plugin initialization:

```typescript
// In handlePlayerReady:
player.subtitle.loadTracks(subtitles.map(s => ({
  id: s.id,
  label: s.language,
  language: s.language,
  source: s.source === 'embedded' ? 'embedded' : 'external',
  format: s.format as any,
  url: getSubtitleUrl(s.id),
})));
```

**Step 2: Register plugin in VideoPlayer.tsx**

```typescript
// After createPlayer
Player.registerPlugin('subtitle', SubtitlePlugin);
```

**Step 3: Verify subtitles still work end-to-end**

Run the app: `cd web && bun dev`
Test: Open a video with subtitles, verify they render via DOM overlay instead of native TextTrack.

**Step 4: Commit**

```bash
git add web/src/pages/WatchPage.tsx web/src/components/VideoPlayer.tsx
git commit -m "refactor(player): migrate subtitle handling from WatchPage to SubtitlePlugin"
```

---

## Phase 3: Keyboard System (Batch 1)

### Task 10: KeyboardPlugin — Core

**Files:**
- Create: `web/src/plugins/keyboard/KeyboardPlugin.ts`
- Create: `web/src/plugins/keyboard/KeyBindingManager.ts`
- Create: `web/src/plugins/keyboard/defaults.ts`

**Step 1: Define default key bindings**

```typescript
// web/src/plugins/keyboard/defaults.ts
export const DEFAULT_BINDINGS: KeyBinding[] = [
  // Playback
  { action: 'playback:toggle', key: ' ' },
  { action: 'playback:seek-backward-5', key: 'ArrowLeft' },
  { action: 'playback:seek-forward-5', key: 'ArrowRight' },
  { action: 'playback:seek-backward-30', key: 'ArrowLeft', modifiers: ['shift'] },
  { action: 'playback:seek-forward-30', key: 'ArrowRight', modifiers: ['shift'] },
  { action: 'playback:frame-forward', key: '.' },
  { action: 'playback:frame-backward', key: ',' },
  { action: 'playback:speed-down', key: '[' },
  { action: 'playback:speed-up', key: ']' },
  { action: 'playback:speed-reset', key: 'Backspace' },
  { action: 'playback:ab-loop', key: 'l' },
  // Volume
  { action: 'volume:up', key: 'ArrowUp' },
  { action: 'volume:down', key: 'ArrowDown' },
  { action: 'volume:mute', key: 'm' },
  // Subtitle
  { action: 'subtitle:toggle', key: 'c' },
  { action: 'subtitle:next-track', key: 'v' },
  { action: 'subtitle:delay-decrease', key: 'z' },
  { action: 'subtitle:delay-increase', key: 'x' },
  // Interface
  { action: 'ui:fullscreen', key: 'f' },
  { action: 'ui:pip', key: 'p' },
  { action: 'ui:help', key: '?' },
  { action: 'ui:tech-info', key: 'i' },
  { action: 'ui:next-episode', key: 'n' },
  // Capture
  { action: 'capture:screenshot', key: 's' },
  { action: 'capture:screenshot-with-subs', key: 's', modifiers: ['shift'] },
  { action: 'capture:gif-mode', key: 'g' },
];
```

**Step 2: Implement KeyBindingManager**

- Listens to `keydown` events on the player container
- Maps key combos to actions
- Triggers VideoJS events
- Supports custom bindings (merge with defaults)
- Conflict detection

**Step 3: Implement long-press handler for fast-forward**

Detect long-press on `ArrowRight` → set 3x speed → restore on keyup.

**Step 4: Implement KeyboardPlugin entry point**

**Step 5: Register in VideoPlayer.tsx**

**Step 6: Commit**

```bash
git add web/src/plugins/keyboard/
git commit -m "feat(player): add KeyboardPlugin with default bindings and long-press support"
```

---

### Task 11: KeyboardPlugin — Help Overlay + OSD Integration

**Files:**
- Create: `web/src/plugins/keyboard/HelpOverlay.ts`
- Modify: `web/src/plugins/keyboard/KeyboardPlugin.ts` — add OSD feedback

**Step 1: Implement help overlay**

`?` key shows a frosted glass modal listing all keyboard shortcuts grouped by category. Dismissible by `?` or `Escape`.

**Step 2: Add OSD feedback for all keyboard actions**

When user presses a shortcut, show OSD: e.g., `⏩ +5s`, `🔊 75%`, `▶ 1.5x`.

**Step 3: Commit**

```bash
git add web/src/plugins/keyboard/
git commit -m "feat(player): add keyboard help overlay and OSD action feedback"
```

---

### Task 12: KeyboardPlugin — Custom Bindings UI

**Files:**
- Create: `web/src/plugins/keyboard/KeyBindingPanel.tsx`

**Step 1: Implement key binding editor panel**

Settings page component (not in-player popover) for customizing keyboard shortcuts:
- Grouped list of all actions
- Click-to-rebind with key capture modal
- Conflict detection with warning
- Reset to defaults button
- Persisted via preferences store

**Step 2: Add to settings page**

Add a "Keyboard Shortcuts" section in settings.

**Step 3: Commit**

```bash
git add web/src/plugins/keyboard/KeyBindingPanel.tsx
git commit -m "feat(player): add keyboard shortcut customization UI"
```

---

## Phase 4: Media Settings (Batch 2)

### Task 13: MediaSettingsPlugin — Video Filters

**Files:**
- Create: `web/src/plugins/media-settings/MediaSettingsPlugin.ts`
- Create: `web/src/plugins/media-settings/VideoFilter.ts`

**Step 1: Implement VideoFilter**

CSS filter manipulation on `<video>` element:

```typescript
export class VideoFilter {
  private videoEl: HTMLVideoElement;

  setBrightness(v: number) { this.update(); }    // 0-200
  setContrast(v: number) { this.update(); }       // 0-200
  setSaturation(v: number) { this.update(); }     // 0-200
  setWarmth(v: number) { this.update(); }         // 0-100 (sepia)

  private update() {
    this.videoEl.style.filter =
      `brightness(${this.brightness}%) contrast(${this.contrast}%) saturate(${this.saturation}%) sepia(${this.warmth}%)`;
  }

  reset() { /* all to 100/0 */ }
}
```

**Step 2: Register plugin, commit**

---

### Task 14: MediaSettingsPlugin — Audio Enhancer + Track Switching

**Files:**
- Create: `web/src/plugins/media-settings/AudioEnhancer.ts`

**Step 1: Implement AudioEnhancer**

Web Audio API pipeline:

```typescript
export class AudioEnhancer {
  private ctx: AudioContext;
  private gainNode: GainNode;
  private source: MediaElementAudioSourceNode;

  constructor(videoEl: HTMLVideoElement) {
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaElementSource(videoEl);
    this.gainNode = this.ctx.createGain();
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
  }

  setVolume(percent: number) {
    this.gainNode.gain.value = percent / 100;  // 0-200% → 0-2
  }
}
```

**Step 2: Implement audio track switching via HTML5 audioTracks API**

**Step 3: Commit**

---

### Task 15: MediaSettingsPlugin — Settings Panel UI

**Files:**
- Create: `web/src/plugins/media-settings/MediaSettingsPanel.tsx`

**Step 1: Implement IINA-style settings popover**

Frosted glass popover with iOS-style sliders for:
- Brightness, Contrast, Saturation, Warmth/Night mode
- Volume boost (0-200%)
- Audio track selector
- Reset all button

**Step 2: Integrate into control bar via controlBarExtra**

**Step 3: Commit**

---

## Phase 5: Playback Features (Batch 2)

### Task 16: PlaybackPlugin — A-B Loop

**Files:**
- Create: `web/src/plugins/playback/PlaybackPlugin.ts`
- Create: `web/src/plugins/playback/ABLoop.ts`

**Step 1: Implement A-B loop**

Three-state cycle via `L` key:
1. First press: set point A, show marker on progress bar
2. Second press: set point B, show highlighted range, start looping
3. Third press: clear both, remove markers

Visual: colored overlay on TimeSlider showing loop range.

**Step 2: Commit**

---

### Task 17: PlaybackPlugin — Auto Next + Skip OP/ED

**Files:**
- Create: `web/src/plugins/playback/AutoNext.ts`
- Create: `web/src/plugins/playback/SkipSegment.ts`

**Step 1: Implement AutoNext**

On video ended:
- Show frosted glass card with 5s circular countdown
- Next episode thumbnail + title
- Cancel button
- Trigger `player:next-episode` event on countdown complete

**Step 2: Implement SkipSegment**

- Fetch segment marks from `/api/v1/media/:fileId/segments`
- Show "Skip Intro" / "Skip Ending" floating button when playback enters segment
- Color blocks on progress bar for OP/ED ranges
- Auto-skip if enabled in preferences

**Step 3: Commit**

---

### Task 18: PlaybackPlugin — Speed Control + Mini Player

**Files:**
- Create: `web/src/plugins/playback/SpeedControl.ts`
- Create: `web/src/plugins/playback/MiniPlayer.ts`

**Step 1: Implement enhanced speed control**

- 0.25x - 4x range, 0.25x steps
- Long-press fast-forward (3x, restore on release)
- Per-series speed memory via preferences store

**Step 2: Implement mini player**

When navigating away from WatchPage, show draggable/resizable mini player in corner.
Frosted glass border, basic controls (play/pause, close, expand).

Implementation note: mini player lives outside WatchPage — needs a portal or global component.

**Step 3: Commit**

---

## Phase 6: Gesture Controls (Batch 2)

### Task 19: GesturePlugin — Swipe + Tap + Long Press

**Files:**
- Create: `web/src/plugins/gesture/GesturePlugin.ts`
- Create: `web/src/plugins/gesture/SwipeHandler.ts`
- Create: `web/src/plugins/gesture/TapHandler.ts`
- Create: `web/src/plugins/gesture/LongPressHandler.ts`

**Step 1: Implement SwipeHandler**

Pointer events (`pointerdown/move/up`) for unified mouse + touch:
- Horizontal: seek (distance → seconds, max ±120s)
- Right vertical: volume
- Left vertical: brightness (CSS filter)
- Sensitivity threshold: >10px

**Step 2: Implement TapHandler**

- Single tap center: play/pause (300ms debounce)
- Double tap left/right: ±10s
- Double tap center: fullscreen

**Step 3: Implement LongPressHandler**

- 500ms threshold → 3x speed
- Release → restore speed

**Step 4: Add FeedbackOverlay for gestures**

Show visual feedback during gesture:
- Seek: arrow + seconds overlay
- Volume: vertical bar + icon
- Brightness: vertical bar + sun icon
- All use frosted glass pill style

**Step 5: Commit**

---

## Phase 7: Screenshot / GIF (Batch 2)

### Task 20: CapturePlugin — Screenshot

**Files:**
- Create: `web/src/plugins/capture/CapturePlugin.ts`
- Create: `web/src/plugins/capture/Screenshot.ts`

**Step 1: Implement screenshot capture**

```typescript
export class Screenshot {
  capture(videoEl: HTMLVideoElement, options: {
    includeSubtitles?: boolean;
    includeWatermark?: boolean;
    watermarkText?: string;
  }): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d')!;

    // Draw video frame
    ctx.drawImage(videoEl, 0, 0);

    // Optionally composite subtitle overlay
    if (options.includeSubtitles) { /* html2canvas or manual draw */ }

    // Optionally add watermark
    if (options.includeWatermark) { /* draw text bottom-right */ }

    return new Promise(resolve => canvas.toBlob(resolve!, 'image/png'));
  }
}
```

**Step 2: Copy to clipboard + download + toast preview**

```typescript
// Copy to clipboard
navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
```

Toast: frosted glass card in bottom-right showing thumbnail, 3s fade.

**Step 3: Commit**

---

### Task 21: CapturePlugin — GIF Maker

**Files:**
- Create: `web/src/plugins/capture/GifMaker.ts`
- Modify: `web/package.json` — add `gif.js`

**Step 1: Install gif.js**

Run: `cd web && bun add gif.js`

**Step 2: Implement GIF maker**

- Enter GIF mode via `G` key
- UI: range selector on progress bar (drag start/end handles)
- Preview popover: frosted glass panel with size/FPS options
- Capture: seek through frames, draw to canvas, feed to gif.js Worker
- Progress bar during encoding
- Download on complete
- Max 15s limit

**Step 3: Commit**

---

## Phase 8: Plugin Registration + Integration

### Task 22: Register All Plugins in VideoPlayer.tsx

**Files:**
- Modify: `web/src/components/VideoPlayer.tsx` — register all 6 plugins
- Modify: `web/src/pages/WatchPage.tsx` — pass segment data, handle plugin events

**Step 1: Register plugins**

```typescript
// VideoPlayer.tsx — after createPlayer
Player.registerPlugin('subtitle', SubtitlePlugin);
Player.registerPlugin('keyboard', KeyboardPlugin);
Player.registerPlugin('mediaSettings', MediaSettingsPlugin);
Player.registerPlugin('playback', PlaybackPlugin);
Player.registerPlugin('gesture', GesturePlugin);
Player.registerPlugin('capture', CapturePlugin);
```

**Step 2: Wire WatchPage to plugin events**

- `player:next-episode` → navigate to next episode
- Pass segment marks and subtitle data to plugins
- Initialize per-series preferences on player ready

**Step 3: End-to-end test all plugins**

**Step 4: Commit**

---

## Phase 9: Backup & Sync

### Task 23: Backend — WebDAV & S3 Sync

**Files:**
- Create: `api/internal/backup/webdav.go`
- Create: `api/internal/backup/s3.go`
- Create: `api/internal/api/backup_handler.go`

**Step 1: Implement WebDAV client**

Upload/download `preferences.json` to configured WebDAV endpoint.

**Step 2: Implement S3-compatible client**

Using AWS SDK Go v2 with custom endpoint for MinIO/R2/S3 compatibility.

**Step 3: Wire up backup handlers**

- `PUT /api/v1/user/preferences/backup-config` — save encrypted credentials
- `POST /api/v1/user/preferences/sync` — trigger sync
- `GET /api/v1/user/preferences/sync/status` — check last sync status

**Step 4: Commit**

---

### Task 24: Frontend — Backup Settings UI

**Files:**
- Create: `web/src/components/settings/BackupPanel.tsx`

**Step 1: Implement backup settings panel**

Settings page section with:
- JSON export/import buttons (with diff preview on import)
- WebDAV config form (URL, username, password)
- S3 config form (endpoint, bucket, access key, secret key)
- Test connection button
- Sync now button + last sync timestamp
- Auto-sync toggle (optional)

**Step 2: Commit**

---

## Phase 10: Settings Page Integration

### Task 25: Player Settings Page

**Files:**
- Modify: `web/src/pages/settings/PlayerPanel.tsx` — expand with all new settings

**Step 1: Expand PlayerPanel with sections**

Add sections for:
- Subtitle style (with live preview)
- Subtitle presets
- Keyboard shortcuts (link to full editor)
- Gesture controls (enable/disable + sensitivity)
- Playback defaults (auto next, auto skip OP/ED)
- Backup & sync

**Step 2: Commit**

---

## Implementation Order Summary

| Phase | Tasks | Priority | Dependencies |
|-------|-------|----------|--------------|
| 1. Foundation | 1-4 | First | None |
| 2. Subtitle | 5-9 | First | Phase 1 |
| 3. Keyboard | 10-12 | First | Phase 1 |
| 4. Media Settings | 13-15 | Second | Phase 1 |
| 5. Playback | 16-18 | Second | Phase 1 |
| 6. Gesture | 19 | Second | Phase 1 |
| 7. Capture | 20-21 | Second | Phase 1 |
| 8. Integration | 22 | After all plugins | Phases 2-7 |
| 9. Backup | 23-24 | Second | Phase 1 |
| 10. Settings UI | 25 | Last | All phases |
