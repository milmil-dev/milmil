# Settings Page Redesign

## Summary

Redesign the settings page from a flat scrolling list into a sidebar-tabbed layout with elevated card surfaces. Consolidate 6 existing sections into logical groups, add new Account/Storage/About panels, and bring the visual quality in line with the polished library cards.

## Layout

Two-panel layout within the existing page shell:

- **Sidebar** (~220px, fixed within page): vertical nav with icon-badged items. Active item gets pink-tinted background (`rgba(232,143,170,0.1)`) with subtle border and glow. Top of sidebar has a faint gradient wash (`rgba(232,143,170,0.03)`).
- **Content area** (flex-1, scrollable): section title + subtitle at top, then stacked card groups below.

Clicking a sidebar item swaps the content panel with a fade transition (no full page reload). URL updates to `/settings/:tab` via TanStack Router nested routes (`/settings/general`, `/settings/integrations`, etc.). Default route redirects to `/settings/general`.

## Visual Treatment

All content cards use:
- Background: `rgba(255,255,255,0.025)`
- Border: `1px solid rgba(255,255,255,0.06)`
- Border radius: `10px`
- Padding: `16px 20px`
- Section labels inside cards: uppercase, muted (`rgba(255,255,255,0.5)`), `letter-spacing: 1px`, 11px font

Sidebar items:
- Inactive: `rgba(255,255,255,0.45)` text, icon in `rgba(255,255,255,0.04)` badge
- Active: white text, icon in `rgba(232,143,170,0.15)` badge, row background `rgba(232,143,170,0.1)` with `1px solid rgba(232,143,170,0.15)` border, `box-shadow: 0 0 20px rgba(232,143,170,0.06)`

Content area has a subtle gradient: `linear-gradient(135deg, rgba(232,143,170,0.015) 0%, transparent 50%)`.

Page entrance uses existing `PageTransition` wrapper. Sidebar items stagger in with motion. Content panel fades on tab switch.

## Sidebar Categories

| Item | Icon | Route |
|---|---|---|
| General | ⚙ (Settings02Icon) | `/settings/general` |
| Integrations | 🔗 (Link04Icon) | `/settings/integrations` |
| Player | ▶ (Play01Icon) | `/settings/player` |
| Account | 👤 (User01Icon) | `/settings/account` |
| Storage | 💾 (HardDrive01Icon) | `/settings/storage` |
| About | ℹ (InformationCircle01Icon) | `/settings/about` |

Icons from `@hugeicons/core-free-icons` wrapped in `HugeiconsIcon` from `@hugeicons/react` (same pattern as existing pages). Exact icon names resolved during implementation — the names above indicate intent.

## Panels

### General (`/settings/general`)

**Card 1 — Language**
- Label: "LANGUAGE"
- `SelectorGroup` with available languages
- Saves to localStorage on click, calls `loadAndActivate(code)`
- No save button — immediate effect

**Card 2 — Collection**
- Label: "COLLECTION"
- Row: "Auto-add matched anime" + description on left, Switch on right
- Fires `PUT /api/v1/settings/collection` mutation on toggle (existing endpoint)

### Integrations (`/settings/integrations`)

Three sub-cards stacked, one per provider:

**Card 1 — DandanPlay**
- Header: provider name
- Fields: App ID (Input), App Secret (PasswordInput)
- Save button
- Endpoint: `PUT /api/v1/settings/dandanplay` (existing)

**Card 2 — Bangumi**
- Header: "Bangumi" + connection status badge
  - Connected: green dot + "Connected" text
  - Not connected: grey dot + "Not connected"
- Fields: Client ID (Input), Client Secret (PasswordInput)
- Action row:
  - Save button (always visible)
  - Connect button (visible when credentials saved but not connected) — opens OAuth URL in new window
  - When connected: Disconnect button (red text), Sync button
- Endpoints: all existing (`PUT /api/v1/settings/bangumi_oauth`, `GET /api/v1/integrations/bangumi/auth-url`, `DELETE /api/v1/integrations/bangumi`, `POST /api/v1/integrations/bangumi/sync`)

**Card 3 — AniList**
- Identical pattern to Bangumi with `/anilist` endpoints

### Player (`/settings/player`)

**Card — Danmaku Settings**
- Enable toggle: "Danmaku comments" label + Switch
- When disabled, remaining controls fade to 50% opacity and become non-interactive
- Opacity: label + percentage display + range slider with pink fill gradient
- Font size: label + `SelectorGroup` (16px, 20px, 24px)
- Speed: label + `SelectorGroup` (i18n keys: `settings.player.speedSlow`, `settings.player.speedNormal`, `settings.player.speedFast`) mapped to values 96, 144, 200
- Save button
- On save: updates API via `PUT /api/v1/settings/player` (existing) + syncs Zustand store

### Account (`/settings/account`) — NEW

**Card 1 — Profile**
- Displays current username (read-only, fetched from session/auth)
- Simple row: user icon + username text

**Card 2 — Change Password**
- Fields: Current password, New password, Confirm new password (all PasswordInput)
- Validation: confirm must match new password, current password required, all fields non-empty
- Save button
- Endpoint: `PUT /api/v1/auth/password` (new backend endpoint)
- On success: toast confirmation, clear form
- On error: toast with error message

### Storage (`/settings/storage`) — NEW

**Card 1 — Disk Usage**
- Visual progress bar showing used space
- Text: "{size} used" (e.g., "2.3 GB")
- Breakdown: number of transcoded files, total size
- Endpoint: `GET /api/v1/system/storage` (new — scans transcode output directory)

**Card 2 — Actions**
- "Clear transcoded files" button (destructive: red outline text)
- Click triggers AlertDialog confirmation: "This will delete all transcoded video files. This cannot be undone."
- On confirm: `DELETE /api/v1/system/transcode-cache` (new)
- On success: toast, refetch disk usage

### About (`/settings/about`) — NEW

**Card 1 — System Info**
- Rows: Version, Server uptime, Go version, Runtime info
- Displayed as label-value pairs
- Endpoint: `GET /api/v1/system/info` (new)

**Card 2 — Settings Management**
- "Export settings" button — calls `GET /api/v1/settings/export`, triggers JSON file download
- "Import settings" button — opens file picker for JSON, confirms overwrite via AlertDialog, calls `POST /api/v1/settings/import`
- "Reset to defaults" button — destructive red outline, AlertDialog confirmation ("This will reset all settings to their defaults. This cannot be undone."), calls `POST /api/v1/settings/reset` (new)

**Card 3 — Links**
- GitHub repository (external link)
- Changelog / release notes (external link)
- Simple anchor rows with external-link icon

## Routing Changes

Current: single route `/settings` → `SettingsPage`

New structure:
```
/settings → redirect to /settings/general
/settings/general → GeneralPanel
/settings/integrations → IntegrationsPanel
/settings/player → PlayerPanel
/settings/account → AccountPanel
/settings/storage → StoragePanel
/settings/about → AboutPanel
```

Implemented as a parent layout route (`/settings`) that renders the sidebar + `<Outlet />`, with child routes for each panel.

## New Backend Endpoints

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/v1/auth/password` | Change password (current + new) |
| `GET` | `/api/v1/system/storage` | Transcode cache disk usage stats |
| `DELETE` | `/api/v1/system/transcode-cache` | Clear all transcoded files |
| `GET` | `/api/v1/system/info` | Server version, uptime, Go version |
| `GET` | `/api/v1/settings/export` | Export all settings as JSON |
| `POST` | `/api/v1/settings/import` | Import settings from JSON |
| `POST` | `/api/v1/settings/reset` | Reset all settings to defaults |

## File Structure

```
web/src/
├── routes/
│   ├── settings.tsx          (parent layout route — sidebar + outlet)
│   ├── settings/
│   │   ├── general.tsx       (child route)
│   │   ├── integrations.tsx
│   │   ├── player.tsx
│   │   ├── account.tsx
│   │   ├── storage.tsx
│   │   └── about.tsx
├── pages/
│   ├── settings/
│   │   ├── SettingsLayout.tsx    (sidebar + content shell)
│   │   ├── GeneralPanel.tsx
│   │   ├── IntegrationsPanel.tsx
│   │   ├── PlayerPanel.tsx
│   │   ├── AccountPanel.tsx
│   │   ├── StoragePanel.tsx
│   │   └── AboutPanel.tsx
├── components/
│   └── settings/
│       ├── SettingsSidebar.tsx
│       ├── SettingsCard.tsx       (reusable card surface)
│       └── ConnectionBadge.tsx    (green/grey status dot + text)

api/internal/api/
├── auth_handler.go        (add password change)
├── system_handler.go      (new — storage, info, transcode cache)
├── settings_handler.go    (add export, import, reset)
```

## Component Extraction

Reusable pieces extracted from the current monolithic `SettingsPage.tsx`:

- **`SettingsCard`**: the elevated card surface wrapper (bg, border, radius, padding, optional section label)
- **`ConnectionBadge`**: green/grey dot + text, used in Bangumi and AniList cards
- **`SelectorGroup`**: already exists, reuse as-is
- **`SettingsSidebar`**: sidebar nav with active state management

## State Management

No changes to the state architecture:
- TanStack Query for fetching settings (`['settings']` query key, existing)
- TanStack Form for form validation and submission
- Zustand for player settings sync (existing `usePlayerStore`)
- localStorage for language preference (existing)

New queries:
- `['system', 'storage']` for disk usage
- `['system', 'info']` for server info

## i18n

New keys needed for:
- Sidebar labels (General, Integrations, Player, Account, Storage, About)
- Player speed labels (Slow, Normal, Fast — replacing hardcoded Chinese)
- Account panel labels
- Storage panel labels
- About panel labels
- Confirmation dialog messages

All new text uses Lingui `msg` macro, extracted to `.po` files.

## Out of Scope

- Theme switcher (dark/light toggle) — the app is dark-only for now
- Notification preferences — no notification system exists yet
- Avatar upload — unnecessary complexity
- MAL integration — backend has the key but no UI needed yet
