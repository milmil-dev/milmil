# API Token Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, revocable API tokens so milmil iOS/Android apps can authenticate without short-lived JWTs.

**Architecture:** Opaque tokens with `mlml_` prefix, SHA-256 hashed in DB. Middleware branches on prefix: `mlml_` → DB lookup, else → JWT validation. Two creation paths: login with `device_name` and manual web UI creation. Token management UI in Settings → Account tab.

**Tech Stack:** Go (Echo, sqlc, crypto/sha256, crypto/rand), React 19, TanStack Query, shadcn/ui, Lingui i18n

---

## File Structure

### Backend (Go)

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `api/migrations/000030_create_api_tokens.up.sql` | Create `api_tokens` table |
| Create | `api/migrations/000030_create_api_tokens.down.sql` | Drop `api_tokens` table |
| Create | `api/internal/store/queries/api_tokens.sql` | sqlc queries for CRUD + lookup by hash |
| Create | `api/internal/auth/apitoken.go` | Token generation + hashing functions |
| Create | `api/internal/api/apitoken_handler.go` | HTTP handlers for list/create/delete tokens |
| Modify | `api/internal/api/auth_middleware.go` | Branch on `mlml_` prefix for token auth |
| Modify | `api/internal/api/auth_handler.go:22-25,92-132,134-169` | Add `device_name` to login request/flow |
| Modify | `api/internal/api/router.go:83-89` | Register `/api/v1/api-tokens` routes |

### Frontend (React)

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web/src/pages/settings/ApiTokensCard.tsx` | Token list, create, revoke UI in Account panel |
| Modify | `web/src/pages/settings/AccountPanel.tsx:67-215` | Import and render `ApiTokensCard` |

---

## Task 1: Database Migration

**Files:**
- Create: `api/migrations/000030_create_api_tokens.up.sql`
- Create: `api/migrations/000030_create_api_tokens.down.sql`

- [ ] **Step 1: Create up migration**

```sql
-- api/migrations/000030_create_api_tokens.up.sql
CREATE TABLE api_tokens (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_used_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
```

- [ ] **Step 2: Create down migration**

```sql
-- api/migrations/000030_create_api_tokens.down.sql
DROP TABLE IF EXISTS api_tokens;
```

- [ ] **Step 3: Commit**

```bash
git add api/migrations/000030_create_api_tokens.up.sql api/migrations/000030_create_api_tokens.down.sql
git commit -m "feat(api-tokens): add api_tokens table migration"
```

---

## Task 2: sqlc Queries

**Files:**
- Create: `api/internal/store/queries/api_tokens.sql`

- [ ] **Step 1: Write sqlc query file**

```sql
-- api/internal/store/queries/api_tokens.sql

-- name: CreateAPIToken :one
INSERT INTO api_tokens (id, name, token_hash, token_prefix, user_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: GetAPITokenByHash :one
SELECT * FROM api_tokens WHERE token_hash = ? LIMIT 1;

-- name: ListAPITokensByUser :many
SELECT id, name, token_prefix, user_id, last_used_at, created_at, updated_at
FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC;

-- name: DeleteAPIToken :exec
DELETE FROM api_tokens WHERE id = ? AND user_id = ?;

-- name: UpdateAPITokenLastUsed :exec
UPDATE api_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?;
```

- [ ] **Step 2: Regenerate sqlc**

Run: `cd api && sqlc generate`
Expected: generates updated `internal/store/models.go`, `internal/store/querier.go`, `internal/store/api_tokens.sql.go`

- [ ] **Step 3: Verify generated code compiles**

Run: `cd api && go build ./...`
Expected: clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/api_tokens.sql api/internal/store/
git commit -m "feat(api-tokens): add sqlc queries for api_tokens"
```

---

## Task 3: Token Generation & Hashing

**Files:**
- Create: `api/internal/auth/apitoken.go`

- [ ] **Step 1: Write the token generation module**

```go
// api/internal/auth/apitoken.go
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

const (
	APITokenPrefix    = "mlml_"
	apiTokenByteLen   = 32
	APITokenPrefixLen = 8 // hex chars stored as token_prefix
)

// GenerateAPIToken creates a new opaque API token and returns the plaintext
// token, its SHA-256 hash, and the display prefix.
func GenerateAPIToken() (plaintext, hash, prefix string, err error) {
	b := make([]byte, apiTokenByteLen)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", fmt.Errorf("generate api token: %w", err)
	}
	hexPart := hex.EncodeToString(b)
	plaintext = APITokenPrefix + hexPart
	hash = HashAPIToken(plaintext)
	prefix = hexPart[:APITokenPrefixLen]
	return plaintext, hash, prefix, nil
}

// HashAPIToken returns the hex-encoded SHA-256 hash of the given token string.
func HashAPIToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// IsAPIToken returns true if the token string starts with the mlml_ prefix.
func IsAPIToken(token string) bool {
	return len(token) > len(APITokenPrefix) && token[:len(APITokenPrefix)] == APITokenPrefix
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd api && go build ./...`
Expected: clean build

- [ ] **Step 3: Commit**

```bash
git add api/internal/auth/apitoken.go
git commit -m "feat(api-tokens): add token generation and hashing"
```

---

## Task 4: Auth Middleware — API Token Support

**Files:**
- Modify: `api/internal/api/auth_middleware.go`

- [ ] **Step 1: Update middleware to support both token types**

Replace the entire `auth_middleware.go` with:

```go
package api

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

const contextKeyUserID = "userID"

// authMiddleware validates Bearer tokens (JWT or API token) and sets the userID in context.
func authMiddleware(secret string, queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			token := strings.TrimPrefix(header, "Bearer ")
			userID, err := resolveToken(c, secret, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}

// authMiddlewareWithQueryParam is like authMiddleware but also accepts ?token= as fallback.
func authMiddlewareWithQueryParam(secret string, queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			token := ""
			if strings.HasPrefix(header, "Bearer ") {
				token = strings.TrimPrefix(header, "Bearer ")
			}
			if token == "" {
				token = c.QueryParam("token")
			}
			if token == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			userID, err := resolveToken(c, secret, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, userID)
			return next(c)
		}
	}
}

// resolveToken checks if the token is an API token (mlml_ prefix) or JWT, and returns the userID.
func resolveToken(c echo.Context, jwtSecret string, queries *store.Queries, token string) (string, error) {
	if auth.IsAPIToken(token) {
		hash := auth.HashAPIToken(token)
		apiToken, err := queries.GetAPITokenByHash(c.Request().Context(), hash)
		if err != nil {
			return "", err
		}
		// Fire-and-forget last_used_at update
		go func() {
			if err := queries.UpdateAPITokenLastUsed(c.Request().Context(), apiToken.ID); err != nil {
				slog.Debug("failed to update api token last_used_at", "err", err)
			}
		}()
		return apiToken.UserID, nil
	}
	return auth.VerifyToken(jwtSecret, token)
}

// getUserID extracts the authenticated user ID from the Echo context.
func getUserID(c echo.Context) string {
	id, _ := c.Get(contextKeyUserID).(string)
	return id
}
```

- [ ] **Step 2: Update router.go to pass queries to middleware**

In `api/internal/api/router.go`, the middleware calls need to change from `jwtMiddleware(cfg.JWTSecret)` to `authMiddleware(cfg.JWTSecret, h.queries)`, and `jwtMiddlewareWithQueryParam(cfg.JWTSecret)` to `authMiddlewareWithQueryParam(cfg.JWTSecret, h.queries)`.

The `h.queries` is already available in the `NewRouter` function since the handler struct is created on line 48. However, the middleware is applied using `cfg.JWTSecret` directly. We need to create a `store.Queries` instance before the handler, or use `h.queries` after handler creation.

Since middleware references happen after `h` is created (line 48-63), replace all occurrences:

- `jwtMiddleware(cfg.JWTSecret)` → `authMiddleware(cfg.JWTSecret, h.queries)`
- `jwtMiddlewareWithQueryParam(cfg.JWTSecret)` → `authMiddlewareWithQueryParam(cfg.JWTSecret, h.queries)`

There are ~20 occurrences in `router.go`. Use find-and-replace across the file.

- [ ] **Step 3: Verify it compiles**

Run: `cd api && go build ./...`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/auth_middleware.go api/internal/api/router.go
git commit -m "feat(api-tokens): update middleware to support API token auth"
```

---

## Task 5: API Token HTTP Handlers

**Files:**
- Create: `api/internal/api/apitoken_handler.go`

- [ ] **Step 1: Write the handler file**

```go
// api/internal/api/apitoken_handler.go
package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

type apiTokenDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	TokenPrefix string  `json:"token_prefix"`
	LastUsedAt  *string `json:"last_used_at"`
	CreatedAt   string  `json:"created_at"`
}

type apiTokenCreateRequest struct {
	Name string `json:"name"`
}

type apiTokenCreateResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	CreatedAt   string `json:"created_at"`
}

func (h *handler) handleListAPITokens(c echo.Context) error {
	tokens, err := h.queries.ListAPITokensByUser(c.Request().Context(), getUserID(c))
	if err != nil {
		return echo.ErrInternalServerError
	}
	dtos := make([]apiTokenDTO, len(tokens))
	for i, t := range tokens {
		dto := apiTokenDTO{
			ID:          t.ID,
			Name:        t.Name,
			TokenPrefix: t.TokenPrefix,
			CreatedAt:   t.CreatedAt,
		}
		if t.LastUsedAt != "" {
			dto.LastUsedAt = &t.LastUsedAt
		}
		dtos[i] = dto
	}
	return c.JSON(http.StatusOK, dtos)
}

func (h *handler) handleCreateAPIToken(c echo.Context) error {
	var req apiTokenCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}

	token, err := h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:          uuid.NewString(),
		Name:        req.Name,
		TokenHash:   hash,
		TokenPrefix: prefix,
		UserID:      getUserID(c),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusCreated, apiTokenCreateResponse{
		ID:          token.ID,
		Name:        token.Name,
		Token:       plaintext,
		TokenPrefix: token.TokenPrefix,
		CreatedAt:   token.CreatedAt,
	})
}

func (h *handler) handleDeleteAPIToken(c echo.Context) error {
	id := c.Param("id")
	if err := h.queries.DeleteAPIToken(c.Request().Context(), store.DeleteAPITokenParams{
		ID:     id,
		UserID: getUserID(c),
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 2: Register routes in router.go**

In `api/internal/api/router.go`, after the auth protected group (after line 89), add:

```go
	// API Tokens — protected
	tokenGroup := v1.Group("/api-tokens", authMiddleware(cfg.JWTSecret, h.queries))
	tokenGroup.GET("", h.handleListAPITokens)
	tokenGroup.POST("", h.handleCreateAPIToken)
	tokenGroup.DELETE("/:id", h.handleDeleteAPIToken)
```

- [ ] **Step 3: Verify it compiles**

Run: `cd api && go build ./...`
Expected: clean build

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/apitoken_handler.go api/internal/api/router.go
git commit -m "feat(api-tokens): add list/create/delete API token endpoints"
```

---

## Task 6: Login Flow — Device Name Support

**Files:**
- Modify: `api/internal/api/auth_handler.go`

- [ ] **Step 1: Update login request struct**

In `auth_handler.go`, change `authLoginRequest` (line 22-25) to:

```go
type authLoginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	DeviceName string `json:"device_name,omitempty"`
}
```

- [ ] **Step 2: Update handleAuthLogin to return API token when device_name is present**

Replace the token-issuing section in `handleAuthLogin` (lines 113-131). After the 2FA check, the logic should branch:

```go
	if user.TwoFactorEnabled == 1 {
		return c.JSON(http.StatusOK, map[string]any{
			"requires_2fa": true,
			"user_id":      user.ID,
			"device_name":  req.DeviceName, // pass through for 2FA step
		})
	}

	h.sendLoginNotification(c, user.Username)

	if req.DeviceName != "" {
		return h.issueAPIToken(c, user.ID, user.Username, req.DeviceName)
	}

	token, err := auth.SignToken(h.cfg.JWTSecret, user.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authLoginResponse{
		Token: token,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
```

- [ ] **Step 3: Update 2FA login request and handler**

Change `authLogin2FARequest` (line 134-137) to:

```go
type authLogin2FARequest struct {
	UserID     string `json:"user_id"`
	Code       string `json:"code"`
	DeviceName string `json:"device_name,omitempty"`
}
```

In `handleAuthLogin2FA`, after the TOTP validation succeeds (after line 155), replace the token-issuing section:

```go
	h.sendLoginNotification(c, user.Username)

	if req.DeviceName != "" {
		return h.issueAPIToken(c, user.ID, user.Username, req.DeviceName)
	}

	token, err := auth.SignToken(h.cfg.JWTSecret, user.ID)
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authLoginResponse{
		Token: token,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
```

- [ ] **Step 4: Add issueAPIToken helper**

Add this method to auth_handler.go (after `sendLoginNotification`):

```go
// issueAPIToken creates a new API token for the device and returns it in the login response.
func (h *handler) issueAPIToken(c echo.Context, userID, username, deviceName string) error {
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}
	_, err = h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:          uuid.NewString(),
		Name:        deviceName,
		TokenHash:   hash,
		TokenPrefix: prefix,
		UserID:      userID,
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusOK, authLoginResponse{
		Token: plaintext,
		User:  authUserDTO{ID: userID, Username: username},
	})
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd api && go build ./...`
Expected: clean build

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/auth_handler.go
git commit -m "feat(api-tokens): add device_name to login flow for mobile apps"
```

---

## Task 7: Frontend — API Tokens Card

**Files:**
- Create: `web/src/pages/settings/ApiTokensCard.tsx`
- Modify: `web/src/pages/settings/AccountPanel.tsx`

- [ ] **Step 1: Create the ApiTokensCard component**

```tsx
// web/src/pages/settings/ApiTokensCard.tsx
import { useState } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, SmartPhone01Icon, Add01Icon, Copy01Icon } from '@hugeicons/core-free-icons';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface ApiTokenDTO {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

interface ApiTokenCreateResponse {
  id: string;
  name: string;
  token: string;
  token_prefix: string;
  created_at: string;
}

const inputClass = 'bg-transparent border-white/[0.08] focus:border-mm-accent text-white';

export function ApiTokensCard() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data: tokens = [] } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<ApiTokenDTO[]>('/api/v1/api-tokens'),
  });

  const createToken = useMutation({
    mutationFn: (name: string) =>
      api.post<ApiTokenCreateResponse>('/api/v1/api-tokens', { name }),
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setNewTokenName('');
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`apiTokens.createFailed`)),
  });

  const deleteToken = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/api-tokens/${id}`),
    onSuccess: () => {
      toast.success(i18n._(msg`apiTokens.revoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`apiTokens.revokeFailed`)),
  });

  const copyToken = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      toast.success(i18n._(msg`common.copied`));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <SettingsCard label={i18n._(msg`apiTokens.title`)}>
      <p className="mb-4 text-xs text-white/40">
        {i18n._(msg`apiTokens.description`)}
      </p>

      {/* Created token banner — shown once after creation */}
      {createdToken && (
        <div className="mb-4 rounded-lg border border-mm-accent/20 bg-mm-accent/[0.04] p-3">
          <p className="mb-2 text-xs font-medium text-mm-accent">
            {i18n._(msg`apiTokens.createdWarning`)}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-black/30 px-2 py-1.5 text-xs font-mono text-white/80">
              {createdToken}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyToken}
              className="shrink-0"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} />
            </Button>
          </div>
          <button
            type="button"
            className="mt-2 text-[11px] text-white/30 hover:text-white/50 transition-colors"
            onClick={() => setCreatedToken(null)}
          >
            {i18n._(msg`apiTokens.dismiss`)}
          </button>
        </div>
      )}

      {/* Token list */}
      {tokens.length > 0 && (
        <div className="mb-4 space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <HugeiconsIcon
                  icon={SmartPhone01Icon}
                  size={15}
                  className="shrink-0 text-white/30"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">
                    {token.name}
                  </p>
                  <p className="text-[11px] text-white/25 font-mono">
                    mlml_{token.token_prefix}...
                    {token.last_used_at && (
                      <span className="ml-2 font-sans">
                        · {i18n._(msg`apiTokens.lastUsed`)} {formatDate(token.last_used_at)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteToken.mutate(token.id)}
                disabled={deleteToken.isPending}
                className="shrink-0 rounded-md p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title={i18n._(msg`apiTokens.revoke`)}
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create new token */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={i18n._(msg`apiTokens.namePlaceholder`)}
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTokenName.trim()) {
              createToken.mutate(newTokenName.trim());
            }
          }}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm ${inputClass}`}
        />
        <Button
          type="button"
          size="sm"
          disabled={!newTokenName.trim() || createToken.isPending}
          onClick={() => createToken.mutate(newTokenName.trim())}
        >
          <HugeiconsIcon icon={Add01Icon} size={14} className="mr-1" />
          {i18n._(msg`apiTokens.create`)}
        </Button>
      </div>
    </SettingsCard>
  );
}
```

- [ ] **Step 2: Add ApiTokensCard to AccountPanel**

In `web/src/pages/settings/AccountPanel.tsx`, add the import at the top (after the existing imports):

```tsx
import { ApiTokensCard } from './ApiTokensCard';
```

Then in the `AccountPanel` return, add `<ApiTokensCard />` after the `TwoFactorCard` component (after line 212):

```tsx
        {/* API Tokens */}
        <ApiTokensCard />
```

- [ ] **Step 3: Extract i18n strings**

Run: `cd web && bun run i18n:extract`
Expected: new keys added to `src/locales/*/messages.po` files

- [ ] **Step 4: Add English translations**

In `web/src/locales/en/messages.po`, add translations for the new keys:

```
msgid "apiTokens.title"
msgstr "API Tokens"

msgid "apiTokens.description"
msgstr "Create tokens for mobile apps and external tools to access your milmil server."

msgid "apiTokens.createdWarning"
msgstr "Copy this token now — it won't be shown again."

msgid "apiTokens.dismiss"
msgstr "Dismiss"

msgid "apiTokens.lastUsed"
msgstr "Last used"

msgid "apiTokens.revoke"
msgstr "Revoke"

msgid "apiTokens.revoked"
msgstr "Token revoked"

msgid "apiTokens.namePlaceholder"
msgstr "Device name (e.g. iPhone)"

msgid "apiTokens.create"
msgstr "Create"

msgid "apiTokens.createFailed"
msgstr "Failed to create token"

msgid "apiTokens.revokeFailed"
msgstr "Failed to revoke token"
```

- [ ] **Step 5: Compile i18n**

Run: `cd web && bun run i18n:compile`
Expected: compiled message catalogs updated

- [ ] **Step 6: Verify frontend compiles**

Run: `cd web && bun run typecheck`
Expected: no type errors

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/settings/ApiTokensCard.tsx web/src/pages/settings/AccountPanel.tsx web/src/locales/
git commit -m "feat(api-tokens): add token management UI in Account settings"
```

---

## Task 8: E2E Verification

- [ ] **Step 1: Start the app and verify backend endpoints**

Start the server and test manually:

```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'

# Use the JWT from above to create an API token
curl -X POST http://localhost:8080/api/v1/api-tokens \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{"name":"Test Device"}'

# Use the API token to access a protected endpoint
curl http://localhost:8080/api/v1/auth/me \
  -H 'Authorization: Bearer mlml_<token>'

# List tokens
curl http://localhost:8080/api/v1/api-tokens \
  -H 'Authorization: Bearer <jwt>'

# Login with device_name (returns API token instead of JWT)
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password","device_name":"iPhone"}'

# Delete token
curl -X DELETE http://localhost:8080/api/v1/api-tokens/<id> \
  -H 'Authorization: Bearer <jwt>'
```

Expected: all endpoints return correct responses, API token auth works for all protected routes.

- [ ] **Step 2: Verify frontend UI**

Open Settings → Account in the browser. Verify:
- API Tokens card appears below 2FA section
- Can create a token with a device name
- Token is shown once with copy button
- Token list shows with prefix and last used date
- Can revoke a token

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(api-tokens): e2e verification fixes"
```
