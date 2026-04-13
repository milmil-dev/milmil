# Account Tab Restructure + Session Management Design

## Overview

Restructure AccountPanel into a tabbed layout with 3 inner tabs: Account, API Tokens, Sessions. Replace JWT auth entirely with API tokens. All logins (web + mobile) create revocable API token sessions. Track IP and user agent per session.

## Motivation

The current Account settings page is a flat list of cards. API tokens and session management need dedicated space with richer data display. JWT auth is redundant now that we have revocable API tokens — unifying on a single auth mechanism simplifies the codebase and gives full session visibility.

## Database Changes

New migration adding columns to `api_tokens`:

```sql
ALTER TABLE api_tokens ADD COLUMN last_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE api_tokens ADD COLUMN last_user_agent TEXT NOT NULL DEFAULT '';
```

No new tables needed — `api_tokens` already serves as the session store.

## Backend Changes

### Remove JWT Entirely

- Delete `api/internal/auth/jwt.go` (SignToken, VerifyToken, Claims)
- Remove all JWT references from middleware — `resolveToken` only handles `mlml_` tokens
- Login endpoints always issue API tokens (no more JWT path)
- Remove `tokenTTL` constant and `golang-jwt/jwt/v5` dependency

### Middleware Update

`resolveToken` simplified — no JWT branch. On each API token auth:
- Validate token by hash lookup (existing)
- Update `last_used_at`, `last_ip`, `last_user_agent` in a fire-and-forget goroutine

The `UpdateAPITokenLastUsed` query becomes `UpdateAPITokenActivity` and sets all three fields.

### Login Endpoints

`POST /api/v1/auth/login` and `POST /api/v1/auth/login/2fa`:
- Always issue an API token (remove JWT code path)
- `device_name` is optional — if not provided, auto-generate from User-Agent header (e.g., "Chrome on macOS", "Safari on iPhone")
- Store `last_ip` and `last_user_agent` at creation time

### User Agent Parsing

Lightweight parser in `api/internal/auth/useragent.go`:
- Extracts browser name + OS from User-Agent string
- Returns formatted label like "Chrome on macOS", "Safari on iPhone", "Firefox on Windows"
- Fallback: "Unknown Browser" if parsing fails
- No external dependencies — simple string matching on common UA patterns

### New/Modified Queries

- `UpdateAPITokenActivity` — replaces `UpdateAPITokenLastUsed`, sets `last_used_at`, `last_ip`, `last_user_agent`
- `GetAPITokenByHash` — already returns full row (includes new columns)
- `ListAPITokensByUser` — add `last_ip`, `last_user_agent` to selected columns
- `CountAPITokensByUser` — new, returns count for active session display
- `DeleteOtherAPITokens` — new, deletes all tokens for a user except a given token ID
- `GetAPITokenByID` — new, get single token by ID + user_id (for current session endpoint)

### New Endpoints

- `GET /api/v1/api-tokens/current` — returns the current session's token info (looked up by hashing the Bearer token). Used by frontend to identify and badge the current session.
- `DELETE /api/v1/api-tokens/others` — revoke all sessions except the current one. Requires the Bearer token to identify which to keep.

### Modified Endpoints

- `GET /api/v1/api-tokens` — response now includes `last_ip` and `last_user_agent` fields
- `POST /api/v1/auth/login` — always returns API token, `device_name` optional (auto from UA)
- `POST /api/v1/auth/login/2fa` — same as above

## Frontend Changes

### AccountPanel Tab Layout

Replace the flat card list with inner tabs using a simple button-based tab switcher (matching the Settings page pattern):

```
Account  |  API Tokens  |  Sessions
─────────────────────────────────────
[tab content]
```

Tab state managed via local `useState` (not URL params — these are sub-tabs within the Account settings tab).

### Account Tab (existing content, unchanged)

- Profile card
- Change Password card
- 2FA card

### API Tokens Tab (enhanced from current ApiTokensCard)

Token list with richer columns:
- Name
- Token prefix (`mlml_xxxx...`)
- Created date
- Last used (relative time)
- Revoke button with confirmation dialog

Create token form at the bottom (existing). One-time token reveal banner (existing).

### Sessions Tab

All active sessions (web + mobile) in a list. Each row shows:
- Device icon — phone icon for mobile UA, monitor icon for desktop UA
- Device name — parsed from UA or user-provided
- IP address + user agent summary (e.g., "192.168.1.5 · Chrome on macOS")
- Last active — relative time (e.g., "2 minutes ago", "3 days ago")
- Created date
- **"Current session"** badge on the session matching the token in localStorage
- Revoke button with confirmation dialog (hidden for current session)

Bottom action: **"Revoke all other sessions"** button — calls `DELETE /api/v1/api-tokens/others`, confirms first.

### Web Login Change

The web login flow (`auth-store.ts`) currently stores a JWT in localStorage as `milmil-token`. After this change, the login response returns an API token instead. No change needed in `auth-store.ts` or `api-client.ts` — they already store and send whatever token the login returns.

The login page does not need a device name field — the backend auto-generates it from the User-Agent header.

## Security Considerations

- Removing JWT eliminates a class of issues (can't-revoke, no session visibility)
- All tokens are SHA-256 hashed in DB — no plaintext storage
- `last_ip` reveals local network IPs only (home server context)
- "Revoke all other sessions" is a safety feature for compromised tokens
- Current session identification uses the Bearer token hash — no additional state needed

## Out of Scope

- Session expiry / automatic cleanup
- Login history (separate from active sessions)
- Device rename capability
- Push notifications on new session creation
