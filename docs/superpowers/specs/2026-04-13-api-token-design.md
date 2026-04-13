# API Token Feature Design

## Overview

Add persistent, revocable API tokens for external app authentication (milmil iOS/Android). Tokens are opaque strings stored as SHA-256 hashes in the database, with no expiry and full API access. Two creation paths: login flow for mobile apps and manual creation via web UI.

## Motivation

The current JWT-based auth issues 24-hour tokens via username/password login. Mobile apps need persistent authentication that doesn't expire and can be managed (listed, revoked) from the web UI.

## Database

New `api_tokens` table:

```sql
CREATE TABLE api_tokens (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    user_id      TEXT NOT NULL REFERENCES users(id),
    last_used_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
```

- `token_hash`: SHA-256 hash of the plaintext token. Plaintext is never stored.
- `token_prefix`: First 8 characters after `mlml_` prefix, for identification in UI.
- `last_used_at`: Updated on each authenticated API call using this token.
- `name`: User-defined label (e.g., "iPhone", "Android tablet").

## Token Format & Generation

- Format: `mlml_` + 32 random bytes hex-encoded = 69 characters total.
- Example: `mlml_a1b2c3d4e5f6789...`
- Plaintext shown once at creation, then discarded server-side.
- `token_prefix` stores first 8 hex chars for display: `a1b2c3d4`.

## Authentication Flow

### Middleware Change

Update the existing auth middleware to handle both token types:

1. Extract token from `Authorization: Bearer <token>` header or `?token=` query param.
2. If token starts with `mlml_`:
   - SHA-256 hash the token.
   - Look up `token_hash` in `api_tokens` table.
   - If found, set `contextKeyUserID` from the token's `user_id`.
   - Update `last_used_at` asynchronously (fire-and-forget or batched).
3. Otherwise: validate as JWT (existing behavior).
4. Both paths produce the same context — downstream handlers are unaware of auth method.

### Mobile App Login Flow

`POST /api/v1/auth/login` gains an optional `device_name` string field:

- When `device_name` is absent: current behavior (returns JWT).
- When `device_name` is present and login succeeds (including 2FA if enabled):
  - Generate an API token.
  - Store hashed token in `api_tokens` with the given device name.
  - Return `{ "token": "mlml_...", "user": {...} }`.
- The mobile app stores this token and uses it for all subsequent requests.

### 2FA Interaction

If 2FA is enabled:
1. `POST /api/v1/auth/login` with `device_name` → returns `requires_2fa: true` + `user_id`.
2. `POST /api/v1/auth/login/2fa` with `device_name` + TOTP code → returns API token.

The `device_name` must be passed through to the 2FA step.

## API Endpoints

### New Endpoints (JWT-authenticated)

#### `GET /api/v1/api-tokens`

List all API tokens for the current user.

Response:
```json
[
  {
    "id": "uuid",
    "name": "iPhone",
    "token_prefix": "a1b2c3d4",
    "last_used_at": "2026-04-13T12:00:00Z",
    "created_at": "2026-04-01T08:00:00Z"
  }
]
```

#### `POST /api/v1/api-tokens`

Create a new API token. Used by the web UI.

Request:
```json
{ "name": "My Android Phone" }
```

Response:
```json
{
  "id": "uuid",
  "name": "My Android Phone",
  "token": "mlml_a1b2c3d4...",
  "token_prefix": "a1b2c3d4",
  "created_at": "2026-04-13T12:00:00Z"
}
```

The `token` field is only returned at creation time.

#### `DELETE /api/v1/api-tokens/:id`

Revoke and delete an API token. Returns 204 No Content.

### Modified Endpoints

#### `POST /api/v1/auth/login`

Add optional `device_name` field. When present, return API token instead of JWT.

#### `POST /api/v1/auth/login/2fa`

Add optional `device_name` field. When present, return API token instead of JWT.

## Web UI

Token management in the Settings page:

- **List view:** Table showing each token's name, prefix (`mlml_a1b2...`), last used time, created date, and a revoke button.
- **Create flow:** User enters a device name → clicks create → modal displays the full token once with copy button and QR code → warning "this won't be shown again" → user dismisses.
- **Revoke:** Confirmation dialog before deletion.

## Security Considerations

- Tokens are stored as SHA-256 hashes — database compromise doesn't leak usable tokens.
- `mlml_` prefix prevents confusion with JWTs and enables fast middleware branching.
- No expiry by design (personal media server). Users revoke tokens manually.
- Rate limiting already applies globally (100 req/100ms).
- Token creation via login still requires valid credentials (+ 2FA if enabled).

## Out of Scope

- Token scoping / permissions (all tokens have full access).
- Token expiry / automatic rotation.
- Multiple user support.
