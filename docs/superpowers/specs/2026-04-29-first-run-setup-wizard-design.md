# First-Run Setup Wizard — Design

**Status:** Approved (brainstorming complete 2026-04-29)
**Owner:** TBD
**Related:** [Seanime UI reference](../../../web/AGENTS.md), `web/src/pages/SetupPage.tsx` (current single-step admin form)

## Problem

After admin creation, milmil drops the user onto an empty dashboard with no nudge to add a library. The user is left guessing where to go. Reference media servers (Seanime, Jellyfin, Plex) walk first-time users through library creation as part of signup. milmil doesn't.

Symptom seen on home-server 2026-04-29: user completed admin signup, asked "the web shows no library — is uiux flow problem?"

## Goal

Convert `SetupPage` from a single admin-creation form into a 3-step wizard that guarantees a logged-in user has at least one library before reaching the dashboard, plus a friendly pointer toward optional integrations.

## Decisions (from brainstorm)

| # | Question | Choice |
|---|----------|--------|
| 1 | Wizard scope | Admin → Library (required) → Optional integrations → Done |
| 2 | Re-entry behavior | Library-required gate: re-show library step until ≥1 library exists |
| 3 | Library form fields | Minimal: name + path only; `source_type=local`, `scan_interval=60min` defaults |
| 4 | Path validation UX | Blur validation via `POST /libraries/test-connection`, inline status + file count |
| 5 | Integrations step depth | Informational only — links users to Settings → Integrations |
| Approach | Architecture | Stepped routes (`/setup/admin`, `/setup/library`, `/setup/integrations`) |

## Out of Scope

- Inline OAuth flows for Bangumi/AniList/Trakt (settings panel handles that)
- Multi-library in-wizard (add additional libraries from settings)
- Source-type pickers (rclone/s3) in wizard (`source_type=local` only at first run)
- Theme/locale wizard step (locale switcher remains in chrome; theme defaults)
- Path picker UI (free text + blur validation only)

## Architecture

### Routes

```
/setup                  → redirect to current step based on /setup/status
/setup/admin            → admin creation
/setup/library          → first library creation (required)
/setup/integrations     → informational pointer; "Finish" → /
```

### Step gating (route `beforeLoad`)

| Route | Open when | Otherwise redirect to |
|-------|-----------|----------------------|
| `/setup/admin` | `has_admin === false` | `/setup/library` (auth required) or `/login` |
| `/setup/library` | authed && `library_count === 0` | `/setup/integrations` |
| `/setup/integrations` | authed && `library_count >= 1` | `/setup/library` |
| `/` (root) | authed && `library_count >= 1` | `/setup/library` |

The root-route guard is what enforces the Q2 "library-required gate" everywhere, so any deep link bounces back to the wizard until satisfied.

### New server endpoint

```
GET /api/v1/setup/status
→ 200 { "has_admin": bool, "library_count": int }
```

Public (no auth) — front-end loaders need to know `has_admin` before login. Single small handler, no migration needed (queries existing tables).

## Component Structure

```
web/src/pages/setup/
├── SetupLayout.tsx       # chrome: wordmark + locale switcher + 3-dot stepper + <Outlet/>
├── AdminStep.tsx         # current SetupPage form, lifted into the wizard frame
├── LibraryStep.tsx       # name + path, blur validation, create + start scan
└── IntegrationsStep.tsx  # static cards, "Finish setup" button

web/src/routes/
├── setup.tsx             # parent layout route, suspends on /setup/status
├── setup.admin.tsx
├── setup.library.tsx
└── setup.integrations.tsx

web/src/lib/api/
└── setup.ts              # getSetupStatus()
```

The existing `web/src/pages/SetupPage.tsx` is deleted; its form moves into `AdminStep.tsx` essentially unchanged.

## Data Flow

### Admin step
1. Submit → `POST /api/v1/auth/setup` → `{ token, user }`
2. `useAuthStore.login(token, user)`
3. `navigate({ to: '/setup/library' })`

### Library step
1. Form fields: `name` (text), `path` (text, placeholder `e.g. /media — your MEDIA_DIR mount`, default empty)
2. **On `path` blur**: `POST /api/v1/libraries/test-connection { source_type: 'local', path }`. Render inline status (see Error Handling).
3. Submit → `POST /api/v1/libraries { name, path, source_type: 'local', scan_interval_minutes: 60 }`
4. On 200 → fire-and-forget `POST /api/v1/library/:id/scan` → `navigate({ to: '/setup/integrations' })`. Scan runs in background; user is not held up.
5. On error → inline error, stay on step, preserve form values.

### Integrations step
1. No data fetching. Three static cards: Bangumi, AniList, Trakt. Each has a one-line description and a small "Available in Settings → Integrations" tag.
2. "Finish setup" button → `navigate({ to: '/' })`. Root guard sees `library_count ≥ 1` and renders the dashboard.

### State persistence

None in localStorage. The wizard re-derives its position from `GET /setup/status` on every load. Refresh-safe by construction.

## Error Handling

### Path validation states (Library step, on blur)

| Server response | Inline status | Submit blocked? |
|-----------------|---------------|-----------------|
| Validating | spinner + "Checking…" | yes |
| OK + has video files | "✓ Path readable, N video files found" (green) | no |
| OK + no video files | "⚠ Path readable but no video files found yet — you can scan again later" (amber) | no |
| Path missing | "✗ Path not found inside container. Try `/media` or check your `MEDIA_DIR` mount." (red) | yes |
| Permission denied | "✗ Path exists but is not readable by the milmil user." (red) | yes |
| Network/unknown | "✗ Validation failed — try again or check the API server." (red) | yes |

**Backend dependency:** The `test-connection` response should include a video-file count for the success cases. Inspect current shape; extend with `{ ok: true, file_count: N }` if not already present. Pure additive change.

### Other edge cases

- **Concurrent admin creation race:** second client gets 409 → show "Admin already exists — please log in" with link to `/login`.
- **Library-create network error:** preserve form values, show toast + inline error.
- **Scan kickoff failure:** library was created successfully; log warning toast and proceed. User can re-trigger from settings.
- **User navigates to `/` mid-wizard:** root guard redirects back to `/setup/library`. Admin step never shows again once admin exists.
- **Locale switch mid-wizard:** uses existing `useLingui()` context — no special wiring.
- **Skip vs Finish on integrations:** single "Finish setup" button (no separate Skip — both would do the same thing).

## UX Notes

- **Stepper indicator** in `SetupLayout`: 3 dots (●○○ → ●●○ → ●●●), with the active step labeled "Step 2 of 3 — Library".
- **No back button** between admin and library (admin can't be re-created safely; library is required). A back arrow appears between library and integrations for symmetry.
- **Buttons live in step components**, not the layout. Each step decides its own primary CTA copy ("Create admin" / "Create library" / "Finish setup").
- **Visual style** follows existing `LoginPage` chrome: dark zinc card centered on `bg-zinc-900`, white-opacity borders (per project convention "no primary/accent border colors").

## Testing

### Unit (Vitest + Testing Library)
- `LibraryStep.test.tsx`: blur validation triggers test-connection; renders correct inline state for each response shape; submit calls create + scan; scan failure does not block redirect.
- `setup-route-guards.test.ts`: each `(has_admin, library_count)` permutation routes to the correct step.
- `IntegrationsStep.test.tsx`: "Finish setup" navigates to `/`.

### E2E (Playwright, `e2e/setup-wizard.spec.ts`)
- Fresh DB: `/` → `/setup/admin` → fill → `/setup/library` → fill name + valid path → `/setup/integrations` → Finish → `/` with library visible.
- Refresh at `/setup/library` → stays on `/setup/library` (server-driven).
- Manual navigation to `/` mid-flow → guard kicks back to `/setup/library`.

### Backend (Go)
- `TestSetupStatus`: three table rows covering `(no_users)`, `(admin_only)`, `(admin + library)`.
- Existing `test-connection` tests extended if file_count field is added.

### Manual smoke (per project E2E rule)
- After v0.1.7 publishes: redeploy on home-server, drop SQLite DB, walk the flow in browser, verify scan kicks off and library appears post-scan.

## Implementation Order

1. Backend: `GET /setup/status` handler + test
2. Backend (if needed): extend `test-connection` response with `file_count`
3. Frontend: `web/src/lib/api/setup.ts` + types
4. Frontend: `SetupLayout`, route files (`setup.tsx`, three step routes), gating in `beforeLoad`
5. Frontend: lift admin form into `AdminStep.tsx`, delete `SetupPage.tsx`
6. Frontend: build `LibraryStep.tsx` (form + blur validation)
7. Frontend: build `IntegrationsStep.tsx` (static)
8. Root route guard: redirect to `/setup/library` when `library_count === 0`
9. Tests (unit + E2E)
10. Manual smoke on home-server post-publish

## Risks

- **`test-connection` doesn't return file count today.** If extending the response is awkward, fall back to a generic "✓ Path readable" without the count. Not a blocker.
- **Anonymous-volume data dir.** Per the home-server deployment memory, the SQLite DB lives in a Docker anonymous volume, not the host bind mount. Resetting the wizard for testing requires `docker compose down -v` to wipe the volume — document this in the smoke-test section of the implementation plan.
- **Routing change interaction with existing `/setup` route.** The current `web/src/routes/setup.tsx` is a single page. Need to delete it and re-introduce as a parent layout route — TanStack Router code-based config must be regenerated.
