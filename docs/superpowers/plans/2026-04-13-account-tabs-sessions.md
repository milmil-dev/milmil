# Account Tabs + Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JWT auth with API tokens for the main API, add session tracking (IP + user agent), restructure Account settings into tabbed layout with Account/API Tokens/Sessions tabs.

**Architecture:** Keep `jwt.go` for Jellyfin compatibility only. Main API auth becomes API-token-only. Middleware no longer branches — all tokens are `mlml_` prefixed. Login always issues API tokens with auto-generated device names from user agent. New migration adds `last_ip` and `last_user_agent` columns to `api_tokens`. Frontend AccountPanel gets inner tabs.

**Tech Stack:** Go (Echo, sqlc, crypto/sha256), React 19, TanStack Query, shadcn/ui, Lingui i18n

**Note on JWT:** `auth/jwt.go` is kept because the Jellyfin-compatible API (`api/internal/jellyfin/`) uses JWT for the MediaBrowser token protocol. Only the main `/api/v1/` routes drop JWT. The `JWTSecret` config field and env var are retained (renamed would be a breaking change for existing users).

---

## File Structure

### Backend

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `api/migrations/000031_add_activity_to_api_tokens.up.sql` | Add `last_ip`, `last_user_agent` columns |
| Create | `api/migrations/000031_add_activity_to_api_tokens.down.sql` | Drop the columns |
| Create | `api/internal/auth/useragent.go` | Parse User-Agent into human-readable device name |
| Modify | `api/internal/store/queries/api_tokens.sql` | Update queries: activity update, new queries |
| Modify | `api/internal/api/auth_middleware.go` | Remove JWT branch, update activity fields |
| Modify | `api/internal/api/auth_handler.go` | Always issue API tokens, auto device name |
| Modify | `api/internal/api/apitoken_handler.go` | Add current/others endpoints, update DTO |
| Modify | `api/internal/api/router.go` | Register new endpoints, simplify middleware |

### Frontend

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `web/src/pages/settings/SessionsTab.tsx` | Sessions list with revoke, revoke-all |
| Modify | `web/src/pages/settings/ApiTokensCard.tsx` | Enhanced with IP, user agent, richer display |
| Modify | `web/src/pages/settings/AccountPanel.tsx` | Tabbed layout: Account / API Tokens / Sessions |

---

## Task 1: Migration — Add Activity Columns

**Files:**
- Create: `api/migrations/000031_add_activity_to_api_tokens.up.sql`
- Create: `api/migrations/000031_add_activity_to_api_tokens.down.sql`

- [ ] **Step 1: Create up migration**

```sql
-- api/migrations/000031_add_activity_to_api_tokens.up.sql
ALTER TABLE api_tokens ADD COLUMN last_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE api_tokens ADD COLUMN last_user_agent TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: Create down migration**

```sql
-- api/migrations/000031_add_activity_to_api_tokens.down.sql
ALTER TABLE api_tokens DROP COLUMN last_ip;
ALTER TABLE api_tokens DROP COLUMN last_user_agent;
```

- [ ] **Step 3: Commit**

```bash
git add api/migrations/000031_*
git commit -m "feat(sessions): add last_ip and last_user_agent to api_tokens"
```

---

## Task 2: User Agent Parser

**Files:**
- Create: `api/internal/auth/useragent.go`

- [ ] **Step 1: Write the parser**

```go
// api/internal/auth/useragent.go
package auth

import "strings"

// ParseUserAgent extracts a human-readable device label from a User-Agent string.
// Returns labels like "Chrome on macOS", "Safari on iPhone", "Firefox on Windows".
func ParseUserAgent(ua string) string {
	browser := parseBrowser(ua)
	os := parseOS(ua)
	if browser == "" && os == "" {
		return "Unknown Device"
	}
	if browser == "" {
		return os
	}
	if os == "" {
		return browser
	}
	return browser + " on " + os
}

func parseBrowser(ua string) string {
	// Order matters — check specific browsers before generic ones
	switch {
	case strings.Contains(ua, "Edg/"):
		return "Edge"
	case strings.Contains(ua, "OPR/") || strings.Contains(ua, "Opera"):
		return "Opera"
	case strings.Contains(ua, "Chrome/") && !strings.Contains(ua, "Edg/"):
		return "Chrome"
	case strings.Contains(ua, "Safari/") && !strings.Contains(ua, "Chrome/"):
		return "Safari"
	case strings.Contains(ua, "Firefox/"):
		return "Firefox"
	case strings.Contains(ua, "milmil-ios"):
		return "milmil iOS"
	case strings.Contains(ua, "milmil-android"):
		return "milmil Android"
	default:
		return ""
	}
}

func parseOS(ua string) string {
	switch {
	case strings.Contains(ua, "iPhone"):
		return "iPhone"
	case strings.Contains(ua, "iPad"):
		return "iPad"
	case strings.Contains(ua, "Android"):
		return "Android"
	case strings.Contains(ua, "Mac OS X") || strings.Contains(ua, "Macintosh"):
		return "macOS"
	case strings.Contains(ua, "Windows"):
		return "Windows"
	case strings.Contains(ua, "Linux"):
		return "Linux"
	default:
		return ""
	}
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd api && go build ./...`

- [ ] **Step 3: Commit**

```bash
git add api/internal/auth/useragent.go
git commit -m "feat(sessions): add user agent parser for device labels"
```

---

## Task 3: Update sqlc Queries

**Files:**
- Modify: `api/internal/store/queries/api_tokens.sql`

- [ ] **Step 1: Replace the entire query file**

```sql
-- api/internal/store/queries/api_tokens.sql

-- name: CreateAPIToken :one
INSERT INTO api_tokens (id, name, token_hash, token_prefix, user_id, last_ip, last_user_agent, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;

-- name: GetAPITokenByHash :one
SELECT * FROM api_tokens WHERE token_hash = ? LIMIT 1;

-- name: GetAPITokenByID :one
SELECT * FROM api_tokens WHERE id = ? AND user_id = ? LIMIT 1;

-- name: ListAPITokensByUser :many
SELECT id, name, token_prefix, user_id, last_used_at, last_ip, last_user_agent, created_at, updated_at
FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC;

-- name: CountAPITokensByUser :one
SELECT COUNT(*) FROM api_tokens WHERE user_id = ?;

-- name: DeleteAPIToken :exec
DELETE FROM api_tokens WHERE id = ? AND user_id = ?;

-- name: DeleteOtherAPITokens :exec
DELETE FROM api_tokens WHERE user_id = ? AND id != ?;

-- name: UpdateAPITokenActivity :exec
UPDATE api_tokens
SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_ip = ?,
    last_user_agent = ?
WHERE id = ?;
```

- [ ] **Step 2: Regenerate sqlc**

Run: `cd api && sqlc generate`

- [ ] **Step 3: Verify compilation**

Run: `cd api && go build ./...`

- [ ] **Step 4: Commit**

```bash
git add api/internal/store/queries/api_tokens.sql api/internal/store/
git commit -m "feat(sessions): update sqlc queries for activity tracking"
```

---

## Task 4: Middleware — Remove JWT, Add Activity Tracking

**Files:**
- Modify: `api/internal/api/auth_middleware.go`

- [ ] **Step 1: Replace entire auth_middleware.go**

```go
package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

const contextKeyUserID = "userID"
const contextKeyTokenID = "tokenID"

// authMiddleware validates API tokens and sets the userID in context.
func authMiddleware(queries *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing token")
			}
			token := strings.TrimPrefix(header, "Bearer ")
			apiToken, err := resolveToken(c, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, apiToken.UserID)
			c.Set(contextKeyTokenID, apiToken.ID)
			// Fire-and-forget activity update
			go updateTokenActivity(queries, apiToken.ID, c.RealIP(), c.Request().UserAgent())
			return next(c)
		}
	}
}

// authMiddlewareWithQueryParam is like authMiddleware but also accepts ?token= as fallback.
func authMiddlewareWithQueryParam(queries *store.Queries) echo.MiddlewareFunc {
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
			apiToken, err := resolveToken(c, queries, token)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
			}
			c.Set(contextKeyUserID, apiToken.UserID)
			c.Set(contextKeyTokenID, apiToken.ID)
			go updateTokenActivity(queries, apiToken.ID, c.RealIP(), c.Request().UserAgent())
			return next(c)
		}
	}
}

// resolveToken validates an API token by hash lookup.
func resolveToken(c echo.Context, queries *store.Queries, token string) (store.ApiToken, error) {
	if !auth.IsAPIToken(token) {
		return store.ApiToken{}, echo.NewHTTPError(http.StatusUnauthorized, "invalid token format")
	}
	hash := auth.HashAPIToken(token)
	return queries.GetAPITokenByHash(c.Request().Context(), hash)
}

// updateTokenActivity updates last_used_at, last_ip, and last_user_agent.
func updateTokenActivity(queries *store.Queries, tokenID, ip, userAgent string) {
	if err := queries.UpdateAPITokenActivity(context.Background(), store.UpdateAPITokenActivityParams{
		LastIp:        ip,
		LastUserAgent: userAgent,
		ID:            tokenID,
	}); err != nil {
		slog.Debug("failed to update api token activity", "err", err)
	}
}

// getUserID extracts the authenticated user ID from the Echo context.
func getUserID(c echo.Context) string {
	id, _ := c.Get(contextKeyUserID).(string)
	return id
}

// getTokenID extracts the current API token ID from the Echo context.
func getTokenID(c echo.Context) string {
	id, _ := c.Get(contextKeyTokenID).(string)
	return id
}
```

- [ ] **Step 2: Update all middleware references in router.go**

The middleware signature changed — no longer takes `secret string`. Replace all occurrences:
- `authMiddleware(cfg.JWTSecret, h.queries)` → `authMiddleware(h.queries)`
- `authMiddlewareWithQueryParam(cfg.JWTSecret, h.queries)` → `authMiddlewareWithQueryParam(h.queries)`

Use find-and-replace across the file. There are ~24 occurrences.

**Do NOT modify the Jellyfin section** (lines 278-286) — it uses its own JWT-based auth.

- [ ] **Step 3: Verify compilation**

Run: `cd api && go build ./...`

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/auth_middleware.go api/internal/api/router.go
git commit -m "feat(sessions): remove JWT from main API, add activity tracking to middleware"
```

---

## Task 5: Auth Handler — Always Issue API Tokens

**Files:**
- Modify: `api/internal/api/auth_handler.go`

- [ ] **Step 1: Update handleAuthSetup to issue API token**

In `handleAuthSetup` (line 50-91), replace the JWT token-issuing section (lines 83-90) with:

```go
	deviceName := auth.ParseUserAgent(c.Request().UserAgent())
	return h.issueAPIToken(c, user.ID, user.Username, deviceName)
```

Remove the `auth.SignToken` call. The function now returns `http.StatusOK` (via `issueAPIToken`) instead of `http.StatusCreated`. To keep the 201 status for setup, modify `issueAPIToken` to accept a status code parameter, OR create a dedicated setup path. Simpler: just change `issueAPIToken` to return 200 always — setup is a login that also creates the user.

Actually, keep it simple. Change lines 83-90 to:

```go
	deviceName := auth.ParseUserAgent(c.Request().UserAgent())
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}
	_, err = h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:          uuid.NewString(),
		Name:        deviceName,
		TokenHash:   hash,
		TokenPrefix: prefix,
		UserID:      user.ID,
		LastIp:      c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	return c.JSON(http.StatusCreated, authLoginResponse{
		Token: plaintext,
		User:  authUserDTO{ID: user.ID, Username: user.Username},
	})
```

- [ ] **Step 2: Update handleAuthLogin to always issue API token**

Replace lines 114-135 (after password check, the 2FA branch through end of function):

```go
	if user.TwoFactorEnabled == 1 {
		return c.JSON(http.StatusOK, map[string]any{
			"requires_2fa": true,
			"user_id":      user.ID,
		})
	}

	h.sendLoginNotification(c, user.Username)

	deviceName := req.DeviceName
	if deviceName == "" {
		deviceName = auth.ParseUserAgent(c.Request().UserAgent())
	}
	return h.issueAPIToken(c, user.ID, user.Username, deviceName)
```

- [ ] **Step 3: Update handleAuthLogin2FA to always issue API token**

Replace lines 163-176 (after TOTP validation):

```go
	h.sendLoginNotification(c, user.Username)

	deviceName := req.DeviceName
	if deviceName == "" {
		deviceName = auth.ParseUserAgent(c.Request().UserAgent())
	}
	return h.issueAPIToken(c, user.ID, user.Username, deviceName)
```

- [ ] **Step 4: Update issueAPIToken to store IP and user agent**

Replace the `issueAPIToken` method (lines 211-234):

```go
func (h *handler) issueAPIToken(c echo.Context, userID, username, deviceName string) error {
	if len(deviceName) > 100 {
		deviceName = deviceName[:100]
	}
	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}
	_, err = h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          deviceName,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        userID,
		LastIp:        c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
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

- [ ] **Step 5: Remove unused import**

The `auth.SignToken` is no longer called from auth_handler.go. The `auth` import is still needed for `auth.HashPassword`, `auth.CheckPassword`, `auth.GenerateAPIToken`, `auth.ParseUserAgent`. No import changes needed.

- [ ] **Step 6: Verify compilation**

Run: `cd api && go build ./...`

- [ ] **Step 7: Commit**

```bash
git add api/internal/api/auth_handler.go
git commit -m "feat(sessions): login always issues API token with device name from UA"
```

---

## Task 6: API Token Handler — Current Session + Revoke Others

**Files:**
- Modify: `api/internal/api/apitoken_handler.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 1: Update DTO and add new handlers**

Replace entire `apitoken_handler.go`:

```go
package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

type apiTokenDTO struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	TokenPrefix   string  `json:"token_prefix"`
	LastUsedAt    *string `json:"last_used_at"`
	LastIP        string  `json:"last_ip"`
	LastUserAgent string  `json:"last_user_agent"`
	CreatedAt     string  `json:"created_at"`
	IsCurrent     bool    `json:"is_current"`
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
	currentTokenID := getTokenID(c)
	dtos := make([]apiTokenDTO, len(tokens))
	for i, t := range tokens {
		dto := apiTokenDTO{
			ID:            t.ID,
			Name:          t.Name,
			TokenPrefix:   t.TokenPrefix,
			LastIP:        t.LastIp,
			LastUserAgent: t.LastUserAgent,
			CreatedAt:     t.CreatedAt,
			IsCurrent:     t.ID == currentTokenID,
		}
		if t.LastUsedAt.Valid {
			dto.LastUsedAt = &t.LastUsedAt.String
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
	if len(req.Name) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "name must be 100 characters or fewer")
	}

	count, err := h.queries.CountAPITokensByUser(c.Request().Context(), getUserID(c))
	if err != nil {
		return echo.ErrInternalServerError
	}
	if count >= 25 {
		return echo.NewHTTPError(http.StatusBadRequest, "maximum of 25 API tokens reached")
	}

	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}

	token, err := h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          req.Name,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        getUserID(c),
		LastIp:        c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
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

func (h *handler) handleGetCurrentToken(c echo.Context) error {
	tokenID := getTokenID(c)
	token, err := h.queries.GetAPITokenByID(c.Request().Context(), store.GetAPITokenByIDParams{
		ID:     tokenID,
		UserID: getUserID(c),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	dto := apiTokenDTO{
		ID:            token.ID,
		Name:          token.Name,
		TokenPrefix:   token.TokenPrefix,
		LastIP:        token.LastIp,
		LastUserAgent: token.LastUserAgent,
		CreatedAt:     token.CreatedAt,
		IsCurrent:     true,
	}
	if token.LastUsedAt != "" {
		dto.LastUsedAt = &token.LastUsedAt
	}
	return c.JSON(http.StatusOK, dto)
}

func (h *handler) handleDeleteOtherTokens(c echo.Context) error {
	tokenID := getTokenID(c)
	if err := h.queries.DeleteOtherAPITokens(c.Request().Context(), store.DeleteOtherAPITokensParams{
		UserID: getUserID(c),
		ID:     tokenID,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
```

- [ ] **Step 2: Register new routes in router.go**

Update the API Tokens route group (lines 92-96) to:

```go
	// API Tokens — protected
	tokenGroup := v1.Group("/api-tokens", authMiddleware(h.queries))
	tokenGroup.GET("", h.handleListAPITokens)
	tokenGroup.POST("", h.handleCreateAPIToken)
	tokenGroup.GET("/current", h.handleGetCurrentToken)
	tokenGroup.DELETE("/others", h.handleDeleteOtherTokens)
	tokenGroup.DELETE("/:id", h.handleDeleteAPIToken)
```

Note: `/current` and `/others` routes must come BEFORE `/:id` to avoid route conflict.

- [ ] **Step 3: Verify compilation**

Run: `cd api && go build ./...`

- [ ] **Step 4: Commit**

```bash
git add api/internal/api/apitoken_handler.go api/internal/api/router.go
git commit -m "feat(sessions): add current session and revoke-others endpoints"
```

---

## Task 7: Frontend — Account Panel Tab Layout

**Files:**
- Modify: `web/src/pages/settings/AccountPanel.tsx`

- [ ] **Step 1: Restructure AccountPanel with inner tabs**

Replace the entire `AccountPanel` component's return JSX. Keep all imports and the existing `TwoFactorCard` function intact. Only change the `AccountPanel` function body:

```tsx
export function AccountPanel() {
  const { i18n } = useLingui();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [totpCode, setTotpCode] = useState('');
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'account' | 'tokens' | 'sessions'>('account');

  const { data: twoFactorStatus } = useQuery({
    queryKey: ['2fa', 'status'],
    queryFn: () => api.get<TwoFactorStatusResponse>('/api/v1/auth/2fa/status'),
  });

  const twoFactorEnabled = twoFactorStatus?.enabled ?? false;

  const changePassword = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      api.put('/api/v1/auth/password', data),
    onSuccess: () => {
      toast.success(i18n._(msg`account.passwordUpdated`));
      form.reset();
    },
    onError: () => toast.error(i18n._(msg`account.passwordUpdateFailed`)),
  });

  const form = useForm({
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
    onSubmit: async ({ value }) => {
      await changePassword.mutateAsync({
        current_password: value.current_password,
        new_password: value.new_password,
      });
    },
  });

  const INNER_TABS = [
    { id: 'account' as const, label: i18n._(msg`account.tab.account`) },
    { id: 'tokens' as const, label: i18n._(msg`account.tab.tokens`) },
    { id: 'sessions' as const, label: i18n._(msg`account.tab.sessions`) },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-white">
        {i18n._(msg`settings.nav.account`)}
      </h2>
      <p className="mt-1 mb-6 text-xs text-white/35">
        {i18n._(msg`account.subtitle`)}
      </p>

      {/* Inner tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
        {INNER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-white/[0.08] text-white'
                : 'text-white/35 hover:text-white/60'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'account' && (
        <div className="space-y-3">
          {/* Profile */}
          <SettingsCard label={i18n._(msg`account.profile`)}>
            {/* ... existing profile card content ... */}
          </SettingsCard>

          {/* Change Password */}
          <SettingsCard label={i18n._(msg`account.changePassword`)}>
            {/* ... existing password form ... */}
          </SettingsCard>

          {/* 2FA */}
          <TwoFactorCard
            enabled={twoFactorEnabled}
            setupData={setupData}
            setSetupData={setSetupData}
            totpCode={totpCode}
            setTotpCode={setTotpCode}
            queryClient={queryClient}
          />
        </div>
      )}

      {activeTab === 'tokens' && <ApiTokensCard />}

      {activeTab === 'sessions' && <SessionsTab />}
    </div>
  );
}
```

Add imports at top of file:
```tsx
import { cn } from '@/lib/utils';
import { ApiTokensCard } from './ApiTokensCard';
import { SessionsTab } from './SessionsTab';
```

Keep the existing Profile card JSX, password form JSX, and TwoFactorCard component exactly as they are — just wrap them inside the `activeTab === 'account'` conditional.

- [ ] **Step 2: Verify typecheck**

Run: `cd web && bun run typecheck`
(Will fail until SessionsTab exists — that's expected, commit anyway for atomic progress)

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/settings/AccountPanel.tsx
git commit -m "feat(sessions): restructure AccountPanel with inner tabs"
```

---

## Task 8: Frontend — Sessions Tab

**Files:**
- Create: `web/src/pages/settings/SessionsTab.tsx`

- [ ] **Step 1: Create SessionsTab component**

```tsx
// web/src/pages/settings/SessionsTab.tsx
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/core/macro';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  SmartPhone01Icon,
  Computer01Icon,
  Logout02Icon,
} from '@hugeicons/core-free-icons';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

interface SessionDTO {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  last_ip: string;
  last_user_agent: string;
  created_at: string;
  is_current: boolean;
}

export function SessionsTab() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<SessionDTO[]>('/api/v1/api-tokens'),
  });

  const revokeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/api-tokens/${id}`),
    onSuccess: () => {
      toast.success(i18n._(msg`sessions.revoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`sessions.revokeFailed`)),
  });

  const revokeOthers = useMutation({
    mutationFn: () => api.delete('/api/v1/api-tokens/others'),
    onSuccess: () => {
      toast.success(i18n._(msg`sessions.allOthersRevoked`));
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
    onError: () => toast.error(i18n._(msg`sessions.revokeFailed`)),
  });

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return i18n._(msg`sessions.justNow`);
    if (minutes < 60) return i18n._(msg`sessions.minutesAgo`, { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return i18n._(msg`sessions.hoursAgo`, { count: hours });
    const days = Math.floor(hours / 24);
    return i18n._(msg`sessions.daysAgo`, { count: days });
  };

  const isMobile = (ua: string) =>
    /iPhone|iPad|Android|milmil-ios|milmil-android/i.test(ua);

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="space-y-3">
      <SettingsCard label={i18n._(msg`sessions.title`)}>
        <p className="mb-4 text-xs text-white/40">
          {i18n._(msg`sessions.description`)}
        </p>

        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <HugeiconsIcon
                  icon={isMobile(session.last_user_agent) ? SmartPhone01Icon : Computer01Icon}
                  size={18}
                  className={`shrink-0 ${session.is_current ? 'text-mm-accent' : 'text-white/25'}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-white truncate">
                      {session.name}
                    </p>
                    {session.is_current && (
                      <span className="shrink-0 rounded-full bg-mm-accent/15 px-2 py-0.5 text-[10px] font-medium text-mm-accent">
                        {i18n._(msg`sessions.current`)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/25">
                    {session.last_ip && <span>{session.last_ip}</span>}
                    {session.last_used_at && (
                      <span className="ml-2">
                        · {formatRelativeTime(session.last_used_at)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {!session.is_current && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(i18n._(msg`sessions.revokeConfirm`))) {
                      revokeSession.mutate(session.id);
                    }
                  }}
                  disabled={revokeSession.isPending}
                  className="shrink-0 rounded-md p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title={i18n._(msg`sessions.revoke`)}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {otherSessions.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
              onClick={() => {
                if (confirm(i18n._(msg`sessions.revokeAllConfirm`))) {
                  revokeOthers.mutate();
                }
              }}
              disabled={revokeOthers.isPending}
            >
              <HugeiconsIcon icon={Logout02Icon} size={14} className="mr-1.5" />
              {i18n._(msg`sessions.revokeAllOthers`)}
            </Button>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
```

- [ ] **Step 2: Extract and compile i18n**

Run: `cd web && bun run i18n:extract && bun run i18n:compile`

- [ ] **Step 3: Add English translations**

In `web/src/locales/en/messages.po`, add translations for new keys:

```
account.tab.account → "Account"
account.tab.tokens → "API Tokens"
account.tab.sessions → "Sessions"
sessions.title → "Active Sessions"
sessions.description → "Devices currently signed in to your milmil server."
sessions.current → "Current"
sessions.justNow → "Just now"
sessions.minutesAgo → "{count}m ago"
sessions.hoursAgo → "{count}h ago"
sessions.daysAgo → "{count}d ago"
sessions.revoke → "Revoke"
sessions.revoked → "Session revoked"
sessions.revokeConfirm → "Revoke this session? The device will be signed out."
sessions.revokeFailed → "Failed to revoke session"
sessions.revokeAllOthers → "Revoke all other sessions"
sessions.revokeAllConfirm → "Sign out all other devices?"
sessions.allOthersRevoked → "All other sessions revoked"
```

- [ ] **Step 4: Compile i18n and typecheck**

Run: `cd web && bun run i18n:compile && bun run typecheck`

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/settings/SessionsTab.tsx web/src/pages/settings/AccountPanel.tsx web/src/locales/
git commit -m "feat(sessions): add Sessions tab with device list and revoke-all"
```

---

## Task 9: Update ApiTokensCard with Richer Display

**Files:**
- Modify: `web/src/pages/settings/ApiTokensCard.tsx`

- [ ] **Step 1: Update the DTO interface to include new fields**

Update the `ApiTokenDTO` interface:

```tsx
interface ApiTokenDTO {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  last_ip: string;
  last_user_agent: string;
  created_at: string;
  is_current: boolean;
}
```

- [ ] **Step 2: Update the token list display**

In the token list mapping, update each row to show more info. Replace the `<p>` with the prefix/lastUsed line:

```tsx
                  <p className="text-[11px] text-white/25">
                    <span className="font-mono">mlml_{token.token_prefix}...</span>
                    <span className="ml-2 font-sans">
                      · {i18n._(msg`apiTokens.created`)} {formatDate(token.created_at)}
                    </span>
                    {token.last_used_at && (
                      <span className="ml-2 font-sans">
                        · {i18n._(msg`apiTokens.lastUsed`)} {formatDate(token.last_used_at)}
                      </span>
                    )}
                  </p>
```

- [ ] **Step 3: Extract and compile i18n**

Run: `cd web && bun run i18n:extract && bun run i18n:compile`

Add English translation: `apiTokens.created → "Created"`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/settings/ApiTokensCard.tsx web/src/locales/
git commit -m "feat(sessions): enhance API token list with created date"
```

---

## Task 10: E2E Verification

- [ ] **Step 1: Verify backend compiles and runs**

```bash
cd api && go build ./...
```

Start the server and test:

```bash
# Login (now always returns API token, no JWT)
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'
# Response should have "token": "mlml_..."

# Use the token to list sessions (should show IP + user agent)
curl http://localhost:8080/api/v1/api-tokens \
  -H 'Authorization: Bearer mlml_<token>'

# Get current session
curl http://localhost:8080/api/v1/api-tokens/current \
  -H 'Authorization: Bearer mlml_<token>'

# Old JWT tokens should be rejected
curl http://localhost:8080/api/v1/auth/me \
  -H 'Authorization: Bearer eyJ...'
# Should return 401
```

- [ ] **Step 2: Verify frontend**

Open Settings → Account. Verify:
- Three inner tabs: Account, API Tokens, Sessions
- Account tab shows profile, password, 2FA (unchanged)
- API Tokens tab shows enhanced token list with created date, last used
- Sessions tab shows all active sessions with IP, device icon, relative time
- Current session has accent badge, no revoke button
- Can revoke other sessions
- "Revoke all other sessions" button works

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(sessions): e2e verification fixes"
```
