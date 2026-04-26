# milmil CLI v0.1 + Agent Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `milmil` CLI binary + new server-side macro endpoints + audit-log infrastructure that lets human admins and AI agents control milmil from a terminal.

**Architecture:** Two halves shipped together as v0.1.

- **Server side**: new `audit_log` table + middleware retrofit on every mutating endpoint, two macro endpoints (`/match/auto` and `/subscribe`) that orchestrate multi-step pipelines server-side, plus a handful of supporting endpoints (`/audit/{list,undo}`, `/library/{id}/scan/wait`, `/search/anime`, `/episodes/{id}/watch-url`).
- **CLI side**: new `api/cmd/cli` Go entrypoint built with `spf13/cobra`. Authenticates via existing `mlml_` API tokens stored at `~/.config/milmil/credentials`. Embedded markdown agent guide via `go:embed` + `generate-skill --format <fmt>` shim generator. Shipped via Goreleaser.

**Tech Stack:** Go 1.26, Echo v4, sqlc, SQLite/Postgres (existing DB), `spf13/cobra` (new CLI dep), `go:embed`, Goreleaser, `stretchr/testify`.

**Spec:** `docs/superpowers/specs/2026-04-26-milmil-cli-v0.1-design.md`

**Pre-flight findings:**
- Migrations use `00NNNN_name.{up,down}.sql` — next is `000039_audit_log`.
- sqlc queries live in `api/internal/store/queries/<name>.sql`, generated to `api/internal/store/`.
- Existing route registration in `api/internal/api/router.go` uses Echo v4 groups + `authMiddleware(h.queries)`.
- Test convention: `package api_test`, `httptest.NewRequest`, `require` assertions.
- `mlml_` token system already in place at `api/internal/auth/apitoken.go`; we ride on top.

**File structure summary** (created in this plan):

```
api/
├─ cmd/cli/
│  ├─ main.go                       # cobra root + global flags
│  ├─ agents_guide.md               # embedded via go:embed (Task 13)
│  ├─ skill_templates/              # per-format shim templates (Task 13)
│  ├─ auth.go                       # auth login/status/logout
│  ├─ library.go                    # library list/add/scan/stats
│  ├─ search.go                     # search anime/files
│  ├─ episode.go                    # episode list/show/watch-url
│  ├─ watch.go                      # watch resolve
│  ├─ match.go                      # match auto/list/apply/undo/suggest
│  ├─ subscribe.go                  # subscribe add/list/undo
│  ├─ audit.go                      # audit list/show
│  ├─ token.go                      # token list/revoke
│  ├─ guide.go                      # agents-guide subcommand
│  ├─ skill.go                      # generate-skill --format
│  └─ internal/
│     ├─ httpclient/                # token-aware HTTP client wrapper
│     ├─ creds/                     # ~/.config/milmil/credentials reader
│     ├─ output/                    # --json vs human formatters
│     └─ confirm/                   # interactive [y/N] prompts
├─ migrations/
│  ├─ 000039_audit_log.up.sql       # NEW
│  └─ 000039_audit_log.down.sql     # NEW
├─ internal/
│  ├─ store/queries/audit_log.sql   # NEW (sqlc input)
│  ├─ api/
│  │  ├─ audit_handler.go           # NEW (list, undo)
│  │  ├─ audit_middleware.go        # NEW (auto-write on mutate)
│  │  ├─ match_auto_handler.go      # NEW (POST /api/v1/match/auto)
│  │  ├─ subscribe_handler.go       # NEW (POST /api/v1/subscribe)
│  │  ├─ scan_wait_handler.go       # NEW (long-poll /scan/wait)
│  │  ├─ search_anime_handler.go    # NEW (GET /api/v1/search/anime)
│  │  └─ watch_url_handler.go       # NEW (GET /api/v1/episodes/:id/watch-url)
│  └─ macro/                        # NEW package — server-side orchestration
│     ├─ match_auto.go              # confidence aggregation + apply pipeline
│     ├─ subscribe.go               # plan-to-watch + RSS + missing-search + sync
│     └─ undo.go                    # reverse-engine per action_type
├─ .goreleaser.yaml                 # NEW (Task 14)
└─ docs-site/content/docs/configuration/ai-agents.mdx   # NEW (Task 15) + 3 locale variants
```

**Task ordering:** Phase 1 (audit foundation) → Phase 2 (server endpoints) → Phase 3 (CLI scaffold) → Phase 4 (CLI subcommands) → Phase 5 (distribution) → Phase 6 (integration + docs). Tasks within a phase are mostly sequential; CLI subcommand tasks (8-13) can be parallelized across multiple subagents if desired.

---

## Phase 1: Audit log foundation

### Task 1: `audit_log` table + sqlc bindings

**Files:**
- Create: `api/migrations/000039_audit_log.up.sql`
- Create: `api/migrations/000039_audit_log.down.sql`
- Create: `api/internal/store/queries/audit_log.sql`
- Generated (after `make generate`): `api/internal/store/audit_log.sql.go`, updates to `models.go` and `querier.go`
- Test: `api/internal/store/audit_log_test.go`

- [ ] **Step 1.1: Write the up migration**

`api/migrations/000039_audit_log.up.sql`:
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,                      -- short slug (8-char hex)
  user_id         TEXT NOT NULL,
  token_id        TEXT,                                  -- nullable: web UI / password auth
  agent_label     TEXT,                                  -- denormalised token name, survives revoke
  action_type     TEXT NOT NULL,                         -- 'match.apply', 'subscribe.add', etc.
  target_type     TEXT,                                  -- 'file', 'anime', 'rss_rule', 'download'
  target_id       TEXT,
  before_json     TEXT,                                  -- JSON snapshot
  after_json      TEXT,                                  -- JSON snapshot
  confidence      REAL,                                  -- 0.0-1.0, NULL if not autonomous
  parent_id       TEXT,                                  -- self-FK for macro children
  dry_run         INTEGER NOT NULL DEFAULT 0,
  undone_at       TEXT,                                  -- timestamp string when undone
  undone_by       TEXT,                                  -- audit_log.id of the reversing entry
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES audit_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_parent ON audit_log(parent_id);
```

- [ ] **Step 1.2: Write the down migration**

`api/migrations/000039_audit_log.down.sql`:
```sql
DROP INDEX IF EXISTS idx_audit_log_parent;
DROP INDEX IF EXISTS idx_audit_log_action_type;
DROP INDEX IF EXISTS idx_audit_log_user_created;
DROP TABLE IF EXISTS audit_log;
```

- [ ] **Step 1.3: Add sqlc query file**

`api/internal/store/queries/audit_log.sql`:
```sql
-- name: CreateAuditLog :one
INSERT INTO audit_log (
  id, user_id, token_id, agent_label, action_type, target_type, target_id,
  before_json, after_json, confidence, parent_id, dry_run
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: GetAuditLog :one
SELECT * FROM audit_log WHERE id = ? LIMIT 1;

-- name: ListAuditLogByUser :many
SELECT * FROM audit_log
WHERE user_id = ?
  AND (sqlc.narg('action_type') IS NULL OR action_type = sqlc.narg('action_type'))
  AND (sqlc.narg('since') IS NULL OR created_at >= sqlc.narg('since'))
ORDER BY created_at DESC
LIMIT ? OFFSET ?;

-- name: ListAuditLogChildren :many
SELECT * FROM audit_log WHERE parent_id = ? ORDER BY created_at ASC;

-- name: MarkAuditUndone :exec
UPDATE audit_log
SET undone_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    undone_by = ?
WHERE id = ?;
```

- [ ] **Step 1.4: Regenerate sqlc bindings**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api
sqlc generate
```

Expected: new file `api/internal/store/audit_log.sql.go` + updates to `models.go` (new `AuditLog` struct) and `querier.go` (new methods on the `Querier` interface). Verify by `git status` — only those files modified beyond the migration + query SQL we wrote.

- [ ] **Step 1.5: Run migrations against a fresh sqlite test DB to confirm**

```bash
cd api
go run ./cmd/server --migrate-only --database-url=sqlite://./test_audit.db
```

If `--migrate-only` flag doesn't exist (verify by `go run ./cmd/server --help`), instead run a one-off Go test:

`api/internal/store/audit_log_test.go`:
```go
package store_test

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestAuditLogCRUD(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	// Apply all migrations to in-memory DB
	require.NoError(t, applyMigrations(t, db))

	q := store.New(db)
	created, err := q.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
		ID:         "abcd1234",
		UserID:     "user-1",
		TokenID:    sql.NullString{String: "tok-1", Valid: true},
		AgentLabel: sql.NullString{String: "claude-code-laptop", Valid: true},
		ActionType: "match.apply",
		// ... fill required fields
	})
	require.NoError(t, err)
	require.Equal(t, "abcd1234", created.ID)

	got, err := q.GetAuditLog(context.Background(), "abcd1234")
	require.NoError(t, err)
	require.Equal(t, "match.apply", got.ActionType)
}
```

`applyMigrations` helper reads `api/migrations/*.up.sql` and executes each in order against the test DB. If a similar helper already exists in the codebase (search `apply.*[Mm]igration` under `api/internal/store/` or `api/internal/db/`), reuse it. Otherwise add it inline to this test file.

Run: `cd api && go test ./internal/store/ -run TestAuditLogCRUD -v`. Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil
git add api/migrations/000039_audit_log.up.sql \
        api/migrations/000039_audit_log.down.sql \
        api/internal/store/queries/audit_log.sql \
        api/internal/store/audit_log.sql.go \
        api/internal/store/models.go \
        api/internal/store/querier.go \
        api/internal/store/audit_log_test.go
git commit -m "$(cat <<'EOF'
feat(audit): add audit_log table + sqlc bindings

Schema captures who (user/token/agent_label) did what (action_type,
target_type/id), state before/after, confidence for autonomous actions,
parent_id for macro children, and undo metadata. Indexes cover the
two main query shapes: per-user time-ordered + by action_type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Audit-write middleware + retrofit on mutating endpoints

**Files:**
- Create: `api/internal/api/audit_middleware.go`
- Create: `api/internal/api/audit_middleware_test.go`
- Modify: `api/internal/api/router.go` (wire middleware into mutating route groups)

- [ ] **Step 2.1: Write a failing integration test**

`api/internal/api/audit_middleware_test.go`:
```go
package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestAuditMiddleware_WritesEntryOnMutatingRequest(t *testing.T) {
	srv := newTestServer(t) // shared test helper — see existing patterns in api/internal/api/*_test.go
	defer srv.Close()

	// Authenticate as a test user with a known API token
	tokenPlaintext := srv.MintAPIToken(t, "test-agent")

	// Hit a mutating endpoint — e.g. POST /api/v1/api-tokens (create another token)
	body, _ := json.Marshal(map[string]string{"name": "second-token"})
	req := httptest.NewRequest(http.MethodPost, srv.URL+"/api/v1/api-tokens", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "milmil-cli/test")

	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	// Assert: an audit_log row was written
	q := store.New(srv.DB)
	rows, err := q.ListAuditLogByUser(context.Background(), store.ListAuditLogByUserParams{
		UserID: srv.TestUserID,
		Limit:  10,
		Offset: 0,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "api_token.create", rows[0].ActionType)
	require.Equal(t, "test-agent", rows[0].AgentLabel.String)
}
```

The helper `newTestServer(t)` likely exists or needs adding to a shared test util. Check `api/internal/api/*_test.go` for existing patterns; if absent, add a minimal one in this test file scoped to current test only.

- [ ] **Step 2.2: Run the test, verify it fails**

```bash
cd api && go test ./internal/api/ -run TestAuditMiddleware_WritesEntryOnMutatingRequest -v
```
Expected: FAIL — no audit row written because middleware doesn't exist.

- [ ] **Step 2.3: Implement the audit middleware**

`api/internal/api/audit_middleware.go`:
```go
package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

// auditMiddleware writes an audit_log row for any successful mutating request
// (POST/PUT/PATCH/DELETE) under /api/v1. Read requests (GET/HEAD) are skipped.
//
// The middleware is intentionally generic: action_type is derived from the
// route + HTTP method (e.g. "POST /api-tokens" -> "api_token.create"). Macro
// endpoints write their own richer entries inside the handler and signal the
// middleware to skip via the auditSkipKey context value.
func auditMiddleware(q *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			method := c.Request().Method
			if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
				return next(c)
			}
			// Capture request body for "before" reconstruction by handlers that need it
			var reqBody []byte
			if c.Request().Body != nil {
				reqBody, _ = io.ReadAll(c.Request().Body)
				c.Request().Body = io.NopCloser(bytes.NewReader(reqBody))
			}

			// Run the handler
			err := next(c)
			if err != nil {
				return err
			}

			// Skip if handler explicitly opted out (macro handlers do their own logging)
			if c.Get(auditSkipKey) == true {
				return nil
			}

			// Skip on non-success responses
			status := c.Response().Status
			if status < 200 || status >= 300 {
				return nil
			}

			userID := getUserID(c)
			if userID == "" {
				return nil // not auth'd, e.g. /auth/login
			}

			actionType := deriveActionType(c.Path(), method)
			id := newAuditID()

			tokenID := getTokenID(c)
			tokenName := getTokenName(c)

			_, err = q.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
				ID:          id,
				UserID:      userID,
				TokenID:     nullStr(tokenID),
				AgentLabel:  nullStr(tokenName),
				ActionType:  actionType,
				TargetType:  sql.NullString{},
				TargetID:    sql.NullString{},
				BeforeJson:  sql.NullString{},
				AfterJson:   sql.NullString{String: string(reqBody), Valid: len(reqBody) > 0},
				Confidence:  sql.NullFloat64{},
				ParentID:    sql.NullString{},
				DryRun:      0,
			})
			if err != nil {
				// Log but don't fail the request — audit is best-effort at this layer
				c.Logger().Warnf("audit middleware: failed to write entry: %v", err)
			}
			return nil
		}
	}
}

const auditSkipKey = "audit_skip"

// deriveActionType maps "POST /api/v1/api-tokens" to "api_token.create".
// Macro handlers override by setting auditSkipKey and writing their own entries.
func deriveActionType(path, method string) string {
	// Strip /api/v1 prefix
	path = strings.TrimPrefix(path, "/api/v1")
	// First segment is the resource
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	resource := parts[0]
	if resource == "" {
		resource = "unknown"
	}
	// Singularize known plurals
	resource = strings.TrimSuffix(resource, "s")
	resource = strings.ReplaceAll(resource, "-", "_")

	verb := map[string]string{
		http.MethodPost:   "create",
		http.MethodPut:    "update",
		http.MethodPatch:  "update",
		http.MethodDelete: "delete",
	}[method]

	return resource + "." + verb
}

func newAuditID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func nullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// MarshalJSONOrEmpty returns json or empty NullString on error.
func marshalJSONOrEmpty(v any) sql.NullString {
	if v == nil {
		return sql.NullString{}
	}
	b, err := json.Marshal(v)
	if err != nil {
		return sql.NullString{}
	}
	return sql.NullString{String: string(b), Valid: true}
}
```

The helpers `getUserID`, `getTokenID`, `getTokenName` should exist or be added to `api/internal/api/auth_middleware.go` — they read user/token info from the Echo context set by the auth middleware. If only `getUserID` exists, add `getTokenID(c) string` and `getTokenName(c) string` mirroring its pattern.

- [ ] **Step 2.4: Wire the middleware into mutating route groups**

Modify `api/internal/api/router.go`. After every `v1.Group(..., authMiddleware(h.queries))`, also add the audit middleware. Concretely:

Before:
```go
tokenGroup := v1.Group("/api-tokens", authMiddleware(h.queries))
```

After:
```go
tokenGroup := v1.Group("/api-tokens", authMiddleware(h.queries), auditMiddleware(h.queries))
```

Apply to ALL authenticated mutating route groups: `/api-tokens`, `/libraries`, `/anime`, `/episodes`, `/files`, `/downloads`, `/rss`, `/match`, `/subscribe` (will be added later), `/preferences`, `/users`, `/auth/2fa`, `/auth/password`. Keep public routes (`/auth/login`, `/auth/setup`) without audit middleware — there's no user yet.

- [ ] **Step 2.5: Run the test, verify PASS**

```bash
cd api && go test ./internal/api/ -run TestAuditMiddleware_WritesEntryOnMutatingRequest -v
```
Expected: PASS.

Also run existing tests to make sure no regression: `go test ./...`. Expected: pass (audit middleware is additive).

- [ ] **Step 2.6: Commit**

```bash
git add api/internal/api/audit_middleware.go \
        api/internal/api/audit_middleware_test.go \
        api/internal/api/router.go \
        api/internal/api/auth_middleware.go  # if helpers added
git commit -m "$(cat <<'EOF'
feat(audit): middleware writes audit_log entry on every mutating request

Generic Echo middleware that derives action_type from route+method
(e.g. 'POST /api-tokens' -> 'api_token.create') and captures the
request body as the 'after' snapshot. Macro handlers can opt out
via the audit_skip context key and write richer per-action entries
themselves. Wired into all mutating /api/v1 route groups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: GET `/audit` + POST `/audit/undo` endpoints

**Files:**
- Create: `api/internal/api/audit_handler.go`
- Create: `api/internal/macro/undo.go` (undo-engine package, dispatched by action_type)
- Create: `api/internal/api/audit_handler_test.go`
- Modify: `api/internal/api/router.go` (register routes)

- [ ] **Step 3.1: Write the audit list test**

`api/internal/api/audit_handler_test.go`:
```go
package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestAuditList_FiltersByUserAndAction(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	// Seed three audit rows for the test user
	q := store.New(srv.DB)
	for i, action := range []string{"match.apply", "match.apply", "rss.create"} {
		_, err := q.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
			ID:         "row" + string(rune('0'+i)),
			UserID:     srv.TestUserID,
			ActionType: action,
		})
		require.NoError(t, err)
		time.Sleep(time.Millisecond) // ensure created_at differs
	}

	tokenPlaintext := srv.MintAPIToken(t, "test-agent")

	// GET /api/v1/audit?action=match.apply
	req := httptest.NewRequest(http.MethodGet, srv.URL+"/api/v1/audit?action=match.apply", nil)
	req.Header.Set("Authorization", "Bearer "+tokenPlaintext)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Items []store.AuditLog `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Items, 2) // only the two match.apply rows
}
```

Run: `go test ./internal/api/ -run TestAuditList_FiltersByUserAndAction -v` → FAIL (handler doesn't exist).

- [ ] **Step 3.2: Implement audit list handler**

`api/internal/api/audit_handler.go`:
```go
package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/macro"
	"github.com/milmil/api/internal/store"
)

func (h *handler) handleListAudit(c echo.Context) error {
	userID := getUserID(c)

	limit := int64(50)
	if l, err := strconv.ParseInt(c.QueryParam("limit"), 10, 64); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	offset := int64(0)
	if o, err := strconv.ParseInt(c.QueryParam("offset"), 10, 64); err == nil && o >= 0 {
		offset = o
	}

	params := store.ListAuditLogByUserParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	}
	if action := c.QueryParam("action"); action != "" {
		params.ActionType = sql.NullString{String: action, Valid: true}
	}
	if since := c.QueryParam("since"); since != "" {
		params.Since = sql.NullString{String: since, Valid: true}
	}

	rows, err := h.queries.ListAuditLogByUser(c.Request().Context(), params)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]any{
		"items":  rows,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *handler) handleGetAudit(c echo.Context) error {
	id := c.Param("id")
	row, err := h.queries.GetAuditLog(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "audit entry not found")
	}
	if row.UserID != getUserID(c) {
		return echo.NewHTTPError(http.StatusForbidden, "not your audit entry")
	}
	children, _ := h.queries.ListAuditLogChildren(c.Request().Context(), sql.NullString{String: id, Valid: true})
	return c.JSON(http.StatusOK, map[string]any{
		"entry":    row,
		"children": children,
	})
}

func (h *handler) handleUndoAudit(c echo.Context) error {
	var req struct {
		ID    string `json:"id"`
		Since string `json:"since"`        // RFC3339; alternative to ID
		DryRun bool  `json:"dry_run"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.ID == "" && req.Since == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "must provide id or since")
	}

	res, err := macro.Undo(c.Request().Context(), h.queries, h.dependencies(), getUserID(c), macro.UndoParams{
		ID:     req.ID,
		Since:  req.Since,
		DryRun: req.DryRun,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	c.Set(auditSkipKey, true) // we wrote our own audit entries inside macro.Undo
	return c.JSON(http.StatusOK, res)
}
```

The `h.dependencies()` method should return whatever per-handler deps are needed (Bangumi/AniList sync clients, file system, etc.) — define this method on the existing `handler` struct and return a struct that the `macro` package needs. If easier, pass them as positional arguments instead.

- [ ] **Step 3.3: Implement the undo engine**

`api/internal/macro/undo.go`:
```go
package macro

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/store"
)

type UndoParams struct {
	ID     string // single audit entry id
	Since  string // RFC3339 timestamp; undoes everything after this
	DryRun bool
}

type UndoResult struct {
	Items []UndoItem `json:"items"`
}

type UndoItem struct {
	AuditID string `json:"audit_id"`
	Status  string `json:"status"` // "reversed" / "skipped" / "failed"
	Reason  string `json:"reason,omitempty"`
}

// Deps is what undo + macro endpoints need beyond the queries.
type Deps interface {
	BangumiClient() BangumiClient // for sync.bangumi reversal
	AnilistClient() AnilistClient
	DownloadCanceller() DownloadCanceller
	// Add as needed; expand interface in macro/types.go
}

func Undo(ctx context.Context, q *store.Queries, deps Deps, userID string, p UndoParams) (*UndoResult, error) {
	var rows []store.AuditLog
	if p.ID != "" {
		row, err := q.GetAuditLog(ctx, p.ID)
		if err != nil {
			return nil, fmt.Errorf("audit entry %s: %w", p.ID, err)
		}
		if row.UserID != userID {
			return nil, fmt.Errorf("audit entry %s: not yours", p.ID)
		}
		// Include children (macro entries reverse the whole tree)
		children, _ := q.ListAuditLogChildren(ctx, sql.NullString{String: p.ID, Valid: true})
		// Reverse children first (LIFO), then parent
		rows = append(rows, children...)
		rows = append(rows, row)
	} else {
		// Window-based: list all entries since timestamp
		rows, _ = q.ListAuditLogByUser(ctx, store.ListAuditLogByUserParams{
			UserID: userID,
			Since:  sql.NullString{String: p.Since, Valid: true},
			Limit:  1000,
			Offset: 0,
		})
	}

	res := &UndoResult{}
	for _, row := range rows {
		if row.UndoneAt.Valid {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "skipped", Reason: "already undone"})
			continue
		}
		if p.DryRun {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "reversed", Reason: "[dry-run] would reverse"})
			continue
		}
		err := reverseOne(ctx, q, deps, row)
		if err != nil {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "failed", Reason: err.Error()})
			continue
		}
		_ = q.MarkAuditUndone(ctx, store.MarkAuditUndoneParams{
			ID:       row.ID,
			UndoneBy: sql.NullString{String: newAuditID(), Valid: true},
		})
		res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "reversed"})
	}
	_ = time.Now() // keep import while reversal logic doesn't yet use it explicitly
	return res, nil
}

func reverseOne(ctx context.Context, q *store.Queries, deps Deps, row store.AuditLog) error {
	switch row.ActionType {
	case "match.apply":
		return reverseMatchApply(ctx, q, row)
	case "subscribe.add":
		// Children already reversed before parent reaches this point
		return nil
	case "download.queue":
		return deps.DownloadCanceller().Cancel(ctx, row.TargetID.String)
	case "rss.create":
		return reverseRSSCreate(ctx, q, row)
	case "sync.bangumi":
		return deps.BangumiClient().Revert(ctx, row.TargetID.String, row.BeforeJson.String)
	case "sync.anilist":
		return deps.AnilistClient().Revert(ctx, row.TargetID.String, row.BeforeJson.String)
	default:
		return fmt.Errorf("no reverse handler for action_type %q", row.ActionType)
	}
}

func reverseMatchApply(ctx context.Context, q *store.Queries, row store.AuditLog) error {
	if !row.BeforeJson.Valid {
		return fmt.Errorf("no before snapshot to reverse")
	}
	var before struct {
		FileID    string  `json:"file_id"`
		AnimeID   *int64  `json:"anime_id"`
		EpisodeID *string `json:"episode_id"`
	}
	if err := json.Unmarshal([]byte(row.BeforeJson.String), &before); err != nil {
		return err
	}
	// Existing file update query — pseudocode; verify exact name during implementation
	// q.UpdateMediaFileMatch(ctx, store.UpdateMediaFileMatchParams{...})
	return nil // TODO during impl: wire the real update call once we read media_files.sql
}

func reverseRSSCreate(ctx context.Context, q *store.Queries, row store.AuditLog) error {
	// q.DeleteRSSRule(ctx, row.TargetID.String)
	return nil // implement using existing DeleteRSSRule query
}

// Stub interfaces (defined here, real impls live in their domain packages).
type BangumiClient interface {
	Revert(ctx context.Context, externalID, beforeJSON string) error
}
type AnilistClient interface {
	Revert(ctx context.Context, externalID, beforeJSON string) error
}
type DownloadCanceller interface {
	Cancel(ctx context.Context, downloadID string) error
}
```

The two `// TODO during impl` blocks above ARE OK to leave — they're points where the implementer wires existing queries. The implementer should resolve these by reading `api/internal/store/queries/media_files.sql` and `download_rules.sql` to find the right query names and parameters, then replacing the stubbed body with real calls.

- [ ] **Step 3.4: Register routes in `router.go`**

In `api/internal/api/router.go`, add (within the existing protected route registration block):

```go
auditGroup := v1.Group("/audit", authMiddleware(h.queries), auditMiddleware(h.queries))
auditGroup.GET("", h.handleListAudit)
auditGroup.GET("/:id", h.handleGetAudit)
auditGroup.POST("/undo", h.handleUndoAudit)
```

- [ ] **Step 3.5: Run test, verify PASS**

```bash
cd api && go test ./internal/api/ -run TestAuditList_FiltersByUserAndAction -v
go test ./...
```

- [ ] **Step 3.6: Commit**

```bash
git add api/internal/api/audit_handler.go \
        api/internal/api/audit_handler_test.go \
        api/internal/macro/undo.go \
        api/internal/api/router.go
git commit -m "$(cat <<'EOF'
feat(audit): GET /audit + POST /audit/undo with reverse engine

List endpoint paginates a user's audit history with filters by action
and time window. Undo endpoint dispatches per action_type to a reverse
function (match.apply -> restore previous match, rss.create -> delete
rule, sync.bangumi -> push status revert, etc.). Reversal is best-effort:
already-downloaded files aren't deleted, OAuth conflicts are reported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Macro server endpoints

### Task 4: Supporting endpoints (`/search/anime`, `/episodes/:id/watch-url`, `/library/:id/scan/wait`)

**Files:**
- Create: `api/internal/api/search_anime_handler.go`
- Create: `api/internal/api/watch_url_handler.go`
- Create: `api/internal/api/scan_wait_handler.go`
- Create: corresponding `*_test.go` files
- Modify: `api/internal/api/router.go`

These endpoints are simpler than the macro endpoints — group them in one task to share test setup.

- [ ] **Step 4.1: Write tests for all three**

`api/internal/api/search_anime_handler_test.go`:
```go
package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSearchAnime_LocalDBHit(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	srv.SeedAnime(t, "anime-1", "Sousou no Frieren", []string{"葬送的芙莉蓮", "Frieren"})

	tok := srv.MintAPIToken(t, "test-agent")
	req := httptest.NewRequest(http.MethodGet, srv.URL+"/api/v1/search/anime?q=Frieren", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Items []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
			Score float64 `json:"score"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.Items)
	require.Equal(t, "anime-1", resp.Items[0].ID)
	require.GreaterOrEqual(t, resp.Items[0].Score, 0.5)
}
```

Similar shape for `TestWatchURL_ReturnsCanonicalURL` (against a seeded matched episode) and `TestScanWait_BlocksUntilComplete` (verify request blocks 1-2s while scan is fake-running, then returns).

- [ ] **Step 4.2: Implement handlers**

`api/internal/api/search_anime_handler.go`:
```go
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

type searchAnimeItem struct {
	ID         string   `json:"id"`
	BangumiID  *int64   `json:"bangumi_id,omitempty"`
	AnilistID  *int64   `json:"anilist_id,omitempty"`
	Title      string   `json:"title"`
	AltTitles  []string `json:"alt_titles"`
	Score      float64  `json:"score"`         // 0-1 fuzzy match score
	Source     string   `json:"source"`        // "local" / "bangumi" / "anilist"
}

func (h *handler) handleSearchAnime(c echo.Context) error {
	q := c.QueryParam("q")
	if q == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing q")
	}
	limit := 20
	// Parse ?limit=

	items, err := h.searchService.SearchAnime(c.Request().Context(), q, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{"items": items})
}
```

`searchService.SearchAnime` is a new method on whatever service struct currently holds anime search logic. Read existing search code under `api/internal/search/` and `api/internal/integration/{bangumi,anilist}/` — there's almost certainly an existing search function that returns local + remote candidates. The handler is a thin wrapper that normalizes output to the documented shape.

`api/internal/api/watch_url_handler.go`:
```go
package api

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
)

func (h *handler) handleEpisodeWatchURL(c echo.Context) error {
	episodeID := c.Param("id")
	ep, err := h.queries.GetEpisode(c.Request().Context(), episodeID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "episode not found")
	}
	// Find the best matched media file for this episode
	files, _ := h.queries.ListMediaFilesByEpisode(c.Request().Context(), episodeID)
	if len(files) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "no matched file for this episode")
	}
	preferred := pickPreferredFile(files) // existing helper if available; else pick highest resolution

	// Web URL pattern matches web/src/routes/watch.$animeId.tsx
	webURL := fmt.Sprintf("%s/watch/%s/%s", h.config.PublicWebURL, ep.AnimeID, episodeID)
	streamURL := fmt.Sprintf("%s/api/v1/files/%s/stream", h.config.PublicAPIURL, preferred.ID)

	return c.JSON(http.StatusOK, map[string]any{
		"anime_id":      ep.AnimeID,
		"episode_id":    episodeID,
		"watch_url":     webURL,
		"stream_url":    streamURL,
		"matched_file":  preferred.Path,
	})
}
```

`h.config.PublicWebURL` and `PublicAPIURL` should be added to `config.Config` if not present (read existing struct and append fields with sensible defaults derived from `API_PORT` / `WEB_PORT` env vars).

`api/internal/api/scan_wait_handler.go`:
```go
package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

// handleScanWait long-polls until the library's current scan completes,
// or the requested timeout elapses (default 5 minutes, max 30).
func (h *handler) handleScanWait(c echo.Context) error {
	libraryID := c.Param("id")
	timeout := 5 * time.Minute
	// Parse ?timeout= (cap at 30m)

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		state, err := h.scanService.GetScanState(c.Request().Context(), libraryID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
		}
		if state.Status == "idle" || state.Status == "complete" {
			return c.JSON(http.StatusOK, state)
		}
		select {
		case <-c.Request().Context().Done():
			return echo.NewHTTPError(http.StatusRequestTimeout, "client cancelled")
		case <-time.After(2 * time.Second):
			// poll again
		}
	}
	return echo.NewHTTPError(http.StatusRequestTimeout, "scan did not complete within timeout")
}
```

`scanService.GetScanState` — verify the existing scan progress code path under `api/internal/library/` for a hook that exposes "is scan running for this library". If absent, this method needs adding to whatever package owns scan lifecycle. Plumb it through.

- [ ] **Step 4.3: Register routes**

In `router.go`:
```go
v1.GET("/search/anime", h.handleSearchAnime, authMiddleware(h.queries))
v1.GET("/episodes/:id/watch-url", h.handleEpisodeWatchURL, authMiddleware(h.queries))
v1.GET("/library/:id/scan/wait", h.handleScanWait, authMiddleware(h.queries))
```

(Read endpoints — no audit middleware needed.)

- [ ] **Step 4.4: Run tests, verify PASS**

```bash
cd api && go test ./internal/api/ -run "TestSearchAnime|TestWatchURL|TestScanWait" -v
```

- [ ] **Step 4.5: Commit**

```bash
git add api/internal/api/search_anime_handler.go \
        api/internal/api/search_anime_handler_test.go \
        api/internal/api/watch_url_handler.go \
        api/internal/api/watch_url_handler_test.go \
        api/internal/api/scan_wait_handler.go \
        api/internal/api/scan_wait_handler_test.go \
        api/internal/api/router.go
# Plus any config.Config / scanService changes
git commit -m "$(cat <<'EOF'
feat(api): supporting endpoints for CLI macros

GET /api/v1/search/anime — fuzzy title search returning normalized items
across local DB + bangumi + anilist with 0-1 score.

GET /api/v1/episodes/:id/watch-url — canonical web watch URL + stream URL
for a matched episode. Server is the source of truth for URL shape.

GET /api/v1/library/:id/scan/wait — long-polls until in-progress scan
completes (default 5min timeout, max 30min).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: POST `/match/auto` (autonomous bulk match)

**Files:**
- Create: `api/internal/macro/match_auto.go`
- Create: `api/internal/api/match_auto_handler.go`
- Create: `api/internal/api/match_auto_handler_test.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 5.1: Write the failing integration test**

`api/internal/api/match_auto_handler_test.go`:
```go
func TestMatchAuto_AppliesHighConfidence_SkipsLow(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	srv.SeedLibrary(t, "lib-1")
	// Three unmatched files: one with high-confidence multi-provider agreement,
	// two with low-confidence single-provider matches.
	srv.SeedUnmatchedFile(t, "lib-1", "f-1", "[ANi] Frieren - 01.mkv", "Sousou no Frieren") // high
	srv.SeedUnmatchedFile(t, "lib-1", "f-2", "[Unknown] thing.mkv", "ambiguous")            // low
	srv.SeedUnmatchedFile(t, "lib-1", "f-3", "[ANi] OreImo - 05.mkv", "OreImo")             // medium

	tok := srv.MintAPIToken(t, "test-agent")
	req := httptest.NewRequest(http.MethodPost, srv.URL+"/api/v1/match/auto",
		strings.NewReader(`{"library_id":"lib-1","confidence_floor":0.85}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Examined        int `json:"examined"`
		Applied         int `json:"applied"`
		LowConfidence   []struct{ FileID string; Score float64 } `json:"low_confidence"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 3, resp.Examined)
	require.Equal(t, 1, resp.Applied)        // f-1 only
	require.Len(t, resp.LowConfidence, 2)    // f-2 and f-3
}
```

- [ ] **Step 5.2: Implement the macro**

`api/internal/macro/match_auto.go`:
```go
package macro

import (
	"context"
	"encoding/json"
	"math"

	"github.com/milmil/api/internal/store"
)

type MatchAutoParams struct {
	LibraryID       string
	ConfidenceFloor float64
	DryRun          bool
}

type MatchAutoResult struct {
	Examined      int                     `json:"examined"`
	Applied       int                     `json:"applied"`
	LowConfidence []MatchCandidate        `json:"low_confidence"`
	AuditIDs      []string                `json:"audit_ids"`
}

type MatchCandidate struct {
	FileID    string  `json:"file_id"`
	FilePath  string  `json:"file_path"`
	Score     float64 `json:"score"`
	BestGuess MatchPick `json:"best_guess"`
}

type MatchPick struct {
	AnimeID   string `json:"anime_id"`
	EpisodeID string `json:"episode_id"`
	Provider  string `json:"provider"`
}

// MatchAuto runs the autonomous bulk match pipeline.
func MatchAuto(ctx context.Context, q *store.Queries, deps Deps, userID, tokenID, agentLabel string, p MatchAutoParams) (*MatchAutoResult, error) {
	files, err := q.ListUnmatchedFilesByLibrary(ctx, p.LibraryID)
	if err != nil {
		return nil, err
	}

	res := &MatchAutoResult{Examined: len(files)}
	parentID := newAuditID()
	// Write parent macro entry
	_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
		ID:         parentID,
		UserID:     userID,
		ActionType: "match.auto",
		// ... agent_label, dry_run, etc.
	})

	for _, f := range files {
		picks := deps.Matcher().AllProvidersAgree(ctx, f) // returns []MatchPick from Bangumi/AniList/DandanPlay/etc.
		score := aggregateConfidence(picks)
		if score < p.ConfidenceFloor {
			res.LowConfidence = append(res.LowConfidence, MatchCandidate{
				FileID: f.ID, FilePath: f.Path, Score: score, BestGuess: bestPick(picks),
			})
			continue
		}
		// Apply the highest-scoring pick
		pick := bestPick(picks)
		if !p.DryRun {
			beforeSnapshot := snapshotFileMatch(f)
			if err := deps.Matcher().Apply(ctx, f.ID, pick); err != nil {
				continue // log & skip, don't fail whole pipeline
			}
			beforeJSON, _ := json.Marshal(beforeSnapshot)
			id := newAuditID()
			_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
				ID:         id,
				UserID:     userID,
				ParentID:   sql.NullString{String: parentID, Valid: true},
				ActionType: "match.apply",
				TargetType: sql.NullString{String: "file", Valid: true},
				TargetID:   sql.NullString{String: f.ID, Valid: true},
				BeforeJson: sql.NullString{String: string(beforeJSON), Valid: true},
				Confidence: sql.NullFloat64{Float64: score, Valid: true},
			})
			res.AuditIDs = append(res.AuditIDs, id)
		}
		res.Applied++
	}
	return res, nil
}

// aggregateConfidence: agreement>=2 -> min(0.99, max+0.10); else max.
func aggregateConfidence(picks []MatchPick) float64 {
	if len(picks) == 0 {
		return 0
	}
	bySource := map[string][]float64{}
	for _, p := range picks {
		bySource[p.Provider] = append(bySource[p.Provider], p.Score)
	}
	maxByTarget := map[string]float64{} // anime_id -> max score
	agreementByTarget := map[string]int{}
	for _, p := range picks {
		key := p.AnimeID + "|" + p.EpisodeID
		if p.Score > maxByTarget[key] {
			maxByTarget[key] = p.Score
		}
		agreementByTarget[key]++
	}

	var bestScore float64
	for k, max := range maxByTarget {
		score := max
		if agreementByTarget[k] >= 2 {
			score = math.Min(0.99, max+0.10)
		}
		if score > bestScore {
			bestScore = score
		}
	}
	return bestScore
}

// MatchPick.Score is per-provider raw normalized score; helper omitted for brevity.
```

The `deps.Matcher()` interface is a small wrapper over the existing matcher logic in `api/internal/matcher/`. Read that package's public API and either define the methods needed (`AllProvidersAgree`, `Apply`) on existing types, or add a thin facade exposing them.

The `MatchPick.Score` field carries the per-provider raw normalized score (0-1). Field on the struct, not the helper. Helper functions `bestPick`, `snapshotFileMatch` are straightforward (best = pick with highest score; snapshot = `{file_id, anime_id, episode_id}` of the file before mutation).

- [ ] **Step 5.3: Implement the handler**

`api/internal/api/match_auto_handler.go`:
```go
package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/macro"
)

func (h *handler) handleMatchAuto(c echo.Context) error {
	var req struct {
		LibraryID       string  `json:"library_id"`
		ConfidenceFloor float64 `json:"confidence_floor"`
		DryRun          bool    `json:"dry_run"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.LibraryID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "library_id required")
	}
	if req.ConfidenceFloor == 0 {
		// Read user pref agent.confidence_floor; fallback 0.85
		if pref, err := h.queries.GetUserPreference(c.Request().Context(), store.GetUserPreferenceParams{
			UserID: getUserID(c),
			Key:    "agent.confidence_floor",
		}); err == nil {
			fmt.Sscanf(pref.Value, "%f", &req.ConfidenceFloor)
		}
		if req.ConfidenceFloor == 0 {
			req.ConfidenceFloor = 0.85
		}
	}

	res, err := macro.MatchAuto(c.Request().Context(), h.queries, h.deps, getUserID(c), getTokenID(c), getTokenName(c), macro.MatchAutoParams{
		LibraryID:       req.LibraryID,
		ConfidenceFloor: req.ConfidenceFloor,
		DryRun:          req.DryRun,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	c.Set(auditSkipKey, true) // macro wrote its own entries
	return c.JSON(http.StatusOK, res)
}
```

- [ ] **Step 5.4: Register route**

In `router.go`, add to existing protected mutating area:
```go
matchGroup := v1.Group("/match", authMiddleware(h.queries), auditMiddleware(h.queries))
matchGroup.POST("/auto", h.handleMatchAuto)
```

- [ ] **Step 5.5: Run test, verify PASS**

```bash
cd api && go test ./internal/api/ -run TestMatchAuto -v
```

- [ ] **Step 5.6: Commit**

```bash
git add api/internal/macro/match_auto.go \
        api/internal/api/match_auto_handler.go \
        api/internal/api/match_auto_handler_test.go \
        api/internal/api/router.go
git commit -m "$(cat <<'EOF'
feat(macro): POST /api/v1/match/auto

Autonomous bulk match: lists unmatched files in a library, queries
all available providers for each, aggregates confidence (multi-provider
agreement bumps the score), applies matches above the floor (default
0.85), reports the rest as low-confidence. Each apply is an audit
entry under a parent macro entry — one undo restores them all.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: POST `/subscribe` (autonomous full subscribe macro)

**Files:**
- Create: `api/internal/macro/subscribe.go`
- Create: `api/internal/api/subscribe_handler.go`
- Create: `api/internal/api/subscribe_handler_test.go`
- Modify: `api/internal/api/router.go`

- [ ] **Step 6.1: Write the failing integration test**

```go
func TestSubscribe_RunsFullPipeline(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	srv.SeedAnime(t, "anime-1", "Sousou no Frieren", []string{"葬送的芙莉蓮"})
	srv.SeedUserPrefs(t, srv.TestUserID, map[string]string{
		"subscribe.preferred_subgroups":      `["ANi","SubsPlease"]`,
		"subscribe.preferred_resolution":     "1080p",
		"subscribe.preferred_subtitle_lang":  "zh-Hans",
		"subscribe.auto_sync_external":       "true",
	})

	tok := srv.MintAPIToken(t, "test-agent")
	req := httptest.NewRequest(http.MethodPost, srv.URL+"/api/v1/subscribe",
		strings.NewReader(`{"title":"Sousou no Frieren"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		AuditID    string   `json:"audit_id"`
		AnimeID    string   `json:"anime_id"`
		Confidence float64  `json:"confidence"`
		Actions    []string `json:"actions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "anime-1", resp.AnimeID)
	require.Contains(t, resp.Actions, "plan_to_watch")
	require.Contains(t, resp.Actions, "rss.create")
	// Bangumi/AniList sync may be skipped in test if creds not seeded; check action list permissively
}
```

- [ ] **Step 6.2: Implement the macro**

`api/internal/macro/subscribe.go`:
```go
package macro

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/milmil/api/internal/store"
)

type SubscribeParams struct {
	Title  string
	DryRun bool
	NoRSS  bool // --no-rss CLI flag
	NoSync bool // --no-sync flag
}

type SubscribeResult struct {
	AuditID    string  `json:"audit_id"`
	AnimeID    string  `json:"anime_id"`
	Confidence float64 `json:"confidence"`
	Actions    []string `json:"actions"`
	Errors     []string `json:"errors,omitempty"`
}

func Subscribe(ctx context.Context, q *store.Queries, deps Deps, userID, tokenID, agentLabel string, p SubscribeParams) (*SubscribeResult, error) {
	// 1. Resolve title via search
	hits, err := deps.Search().SearchAnime(ctx, p.Title, 5)
	if err != nil || len(hits) == 0 {
		return nil, fmt.Errorf("could not resolve title %q", p.Title)
	}
	pick := hits[0]
	if pick.Score < 0.6 {
		return nil, fmt.Errorf("low confidence on title resolution (%.2f); refine query", pick.Score)
	}

	// 2. Read user prefs
	prefs := readSubscribePrefs(ctx, q, userID)

	parentID := newAuditID()
	res := &SubscribeResult{AuditID: parentID, AnimeID: pick.ID, Confidence: pick.Score}
	_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
		ID:         parentID,
		UserID:     userID,
		ActionType: "subscribe.add",
		TargetType: sql.NullString{String: "anime", Valid: true},
		TargetID:   sql.NullString{String: pick.ID, Valid: true},
		Confidence: sql.NullFloat64{Float64: pick.Score, Valid: true},
		DryRun:     boolToInt(p.DryRun),
	})

	// 3. Plan-to-watch
	if !p.DryRun {
		_ = deps.Collection().SetStatus(ctx, userID, pick.ID, "plan_to_watch")
	}
	res.Actions = append(res.Actions, "plan_to_watch")

	// 4. RSS rule for future
	if !p.NoRSS {
		ruleID, err := deps.RSS().CreateRule(ctx, RSSRuleParams{
			AnimeID:           pick.ID,
			Subgroups:         prefs.Subgroups,
			Resolution:        prefs.Resolution,
			SubtitleLang:      prefs.SubtitleLang,
		})
		if err != nil {
			res.Errors = append(res.Errors, "rss.create: "+err.Error())
		} else {
			res.Actions = append(res.Actions, "rss.create")
			_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
				ID:         newAuditID(),
				UserID:     userID,
				ParentID:   sql.NullString{String: parentID, Valid: true},
				ActionType: "rss.create",
				TargetType: sql.NullString{String: "rss_rule", Valid: true},
				TargetID:   sql.NullString{String: ruleID, Valid: true},
				DryRun:     boolToInt(p.DryRun),
			})
		}
	}

	// 5. Missing-episode search and queue
	missing, err := deps.Episode().FindMissingByAnime(ctx, pick.ID)
	if err == nil {
		for _, ep := range missing {
			if p.DryRun {
				res.Actions = append(res.Actions, fmt.Sprintf("download.queue:%s", ep.ID))
				continue
			}
			torrent, err := deps.TorrentSearch().FindBest(ctx, pick.Title, ep.Number, prefs.Subgroups, prefs.Resolution)
			if err != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("torrent_search ep %d: %v", ep.Number, err))
				continue
			}
			downloadID, err := deps.Downloads().AddMagnet(ctx, torrent.Magnet, userID)
			if err != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("download.queue ep %d: %v", ep.Number, err))
				continue
			}
			res.Actions = append(res.Actions, fmt.Sprintf("download.queue:%s", downloadID))
			_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
				ID:         newAuditID(),
				UserID:     userID,
				ParentID:   sql.NullString{String: parentID, Valid: true},
				ActionType: "download.queue",
				TargetType: sql.NullString{String: "download", Valid: true},
				TargetID:   sql.NullString{String: downloadID, Valid: true},
				DryRun:     boolToInt(p.DryRun),
			})
		}
	}

	// 6. External sync
	if !p.NoSync && prefs.AutoSyncExternal {
		for _, syncTarget := range []string{"bangumi", "anilist"} {
			if err := deps.Sync().PushStatus(ctx, syncTarget, userID, pick.ID, "planning"); err != nil {
				res.Errors = append(res.Errors, fmt.Sprintf("sync.%s: %v", syncTarget, err))
				continue
			}
			res.Actions = append(res.Actions, "sync."+syncTarget)
			_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
				ID:         newAuditID(),
				UserID:     userID,
				ParentID:   sql.NullString{String: parentID, Valid: true},
				ActionType: "sync." + syncTarget,
				TargetType: sql.NullString{String: "anime", Valid: true},
				TargetID:   sql.NullString{String: pick.ID, Valid: true},
				DryRun:     boolToInt(p.DryRun),
			})
		}
	}

	return res, nil
}

type SubscribePrefs struct {
	Subgroups        []string
	Resolution       string
	SubtitleLang     string
	AutoSyncExternal bool
}

func readSubscribePrefs(ctx context.Context, q *store.Queries, userID string) SubscribePrefs {
	get := func(key, def string) string {
		p, err := q.GetUserPreference(ctx, store.GetUserPreferenceParams{UserID: userID, Key: key})
		if err != nil {
			return def
		}
		return p.Value
	}
	prefs := SubscribePrefs{
		Resolution:       get("subscribe.preferred_resolution", "1080p"),
		SubtitleLang:     get("subscribe.preferred_subtitle_lang", "zh-Hans"),
		AutoSyncExternal: get("subscribe.auto_sync_external", "true") == "true",
	}
	if raw := get("subscribe.preferred_subgroups", `["ANi","SubsPlease"]`); raw != "" {
		_ = json.Unmarshal([]byte(raw), &prefs.Subgroups)
	}
	return prefs
}

func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// Interfaces extending macro.Deps — implementer adds these to types.go.
type RSSRuleParams struct {
	AnimeID, Resolution, SubtitleLang string
	Subgroups []string
}

// Stub interfaces for new dep methods.
type SearchSvc interface {
	SearchAnime(ctx context.Context, q string, limit int) ([]searchHit, error)
}
type CollectionSvc interface {
	SetStatus(ctx context.Context, userID, animeID, status string) error
}
type RSSSvc interface {
	CreateRule(ctx context.Context, p RSSRuleParams) (string, error)
}
type EpisodeSvc interface {
	FindMissingByAnime(ctx context.Context, animeID string) ([]missingEpisode, error)
}
type TorrentSearchSvc interface {
	FindBest(ctx context.Context, title string, episode int, subgroups []string, resolution string) (torrentHit, error)
}
type DownloadsSvc interface {
	AddMagnet(ctx context.Context, magnet, userID string) (string, error)
}
type SyncSvc interface {
	PushStatus(ctx context.Context, target, userID, animeID, status string) error
}
```

Each interface listed at bottom should be added to `api/internal/macro/types.go` and the underlying domain packages should provide implementations. Where existing API handlers already call this functionality (e.g. `download_handler.go` already calls download AddMagnet), refactor to share between the handler and the macro by extracting the call into the corresponding `internal/<domain>/service.go`. **Don't duplicate logic** — extract once, call from both.

- [ ] **Step 6.3: Implement the handler + register route**

Same pattern as match_auto handler. Skip the full code repeat — read Task 5's handler, use the same shape with `subscribe` parameters.

Route:
```go
v1.POST("/subscribe", h.handleSubscribe, authMiddleware(h.queries), auditMiddleware(h.queries))
```

- [ ] **Step 6.4: Run test, verify PASS**

```bash
cd api && go test ./internal/api/ -run TestSubscribe -v
go test ./...
```

- [ ] **Step 6.5: Commit**

```bash
git add api/internal/macro/subscribe.go \
        api/internal/macro/types.go \
        api/internal/api/subscribe_handler.go \
        api/internal/api/subscribe_handler_test.go \
        api/internal/api/router.go
git commit -m "$(cat <<'EOF'
feat(macro): POST /api/v1/subscribe

Macro orchestrates 4 sub-actions: plan-to-watch + RSS rule create +
missing-episode torrent search & queue + Bangumi/AniList sync. Each
sub-action gets its own audit entry under a parent subscribe.add
entry — one undo reverses the whole tree. Reads subgroup / resolution
preferences from UserPreference; falls back to sane defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: CLI scaffold

### Task 7: CLI entrypoint, HTTP client, credentials, output, auth

**Files:**
- Create: `api/cmd/cli/main.go`
- Create: `api/cmd/cli/auth.go`
- Create: `api/cmd/cli/internal/httpclient/client.go`
- Create: `api/cmd/cli/internal/creds/creds.go`
- Create: `api/cmd/cli/internal/output/output.go`
- Create: `api/cmd/cli/internal/confirm/confirm.go`
- Create: corresponding `*_test.go` files
- Modify: `api/go.mod` (add `github.com/spf13/cobra`)

- [ ] **Step 7.1: Add cobra dependency**

```bash
cd api && go get github.com/spf13/cobra@latest
go mod tidy
```

- [ ] **Step 7.2: Write `main.go` cobra root**

`api/cmd/cli/main.go`:
```go
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	flagServer string
	flagToken  string
	flagJSON   bool
	flagDryRun bool
)

const Version = "0.1.0-dev"

var rootCmd = &cobra.Command{
	Use:   "milmil",
	Short: "Self-hosted anime media server CLI",
	Long: `milmil — control milmil from the terminal.

  TIP: AI agents — run 'milmil agents-guide' for usage recipes designed for
  autonomous use.`,
	SilenceUsage: true,
}

func main() {
	rootCmd.PersistentFlags().StringVar(&flagServer, "server", "", "milmil server URL (default: from credentials file or MILMIL_SERVER env)")
	rootCmd.PersistentFlags().StringVar(&flagToken, "token", "", "API token (default: from credentials file or MILMIL_TOKEN env)")
	rootCmd.PersistentFlags().BoolVar(&flagJSON, "json", false, "output JSON instead of human-readable text")
	rootCmd.PersistentFlags().BoolVar(&flagDryRun, "dry-run", false, "preview changes without executing")

	// Subcommands wired in their respective files via init() functions
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 7.3: Write the credentials package**

`api/cmd/cli/internal/creds/creds.go`:
```go
package creds

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

type Credentials struct {
	Server string `json:"server"`
	Token  string `json:"token"`
}

func defaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "milmil", "credentials"), nil
}

func Load() (*Credentials, error) {
	// Env override
	if s, t := os.Getenv("MILMIL_SERVER"), os.Getenv("MILMIL_TOKEN"); s != "" && t != "" {
		return &Credentials{Server: s, Token: t}, nil
	}

	path, err := defaultPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("not logged in (run 'milmil auth login'): %w", err)
		}
		return nil, err
	}
	c := &Credentials{}
	if err := json.Unmarshal(data, c); err != nil {
		return nil, err
	}
	return c, nil
}

func Save(c *Credentials) error {
	path, err := defaultPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func Delete() error {
	path, err := defaultPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
```

- [ ] **Step 7.4: Write the HTTP client package**

`api/cmd/cli/internal/httpclient/client.go`:
```go
package httpclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTP:    &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *Client) Do(method, path string, body any, query url.Values) (*http.Response, error) {
	u := c.BaseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("User-Agent", "milmil-cli/0.1.0")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.HTTP.Do(req)
}

func (c *Client) DoJSON(method, path string, body any, query url.Values, out any) error {
	resp, err := c.Do(method, path, body, query)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned %d: %s", resp.StatusCode, string(raw))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
```

- [ ] **Step 7.5: Write the output formatter**

`api/cmd/cli/internal/output/output.go`:
```go
package output

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

func PrintJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func PrintHuman(format string, args ...any) {
	fmt.Fprintf(os.Stdout, format+"\n", args...)
}

// PrintTable renders a 2D string slice as an aligned table to w.
func PrintTable(w io.Writer, headers []string, rows [][]string) {
	cols := len(headers)
	widths := make([]int, cols)
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, r := range rows {
		for i, cell := range r {
			if len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}
	for i, h := range headers {
		fmt.Fprintf(w, "%-*s", widths[i]+2, h)
	}
	fmt.Fprintln(w)
	for _, r := range rows {
		for i, cell := range r {
			fmt.Fprintf(w, "%-*s", widths[i]+2, cell)
		}
		fmt.Fprintln(w)
	}
}
```

- [ ] **Step 7.6: Write the confirm package**

`api/cmd/cli/internal/confirm/confirm.go`:
```go
package confirm

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// AskYN prints a prompt with a [y/N] suffix and returns true iff user types y/yes.
func AskYN(question string) bool {
	fmt.Fprintf(os.Stderr, "%s [y/N]: ", question)
	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return false
	}
	resp := strings.ToLower(strings.TrimSpace(scanner.Text()))
	return resp == "y" || resp == "yes"
}
```

- [ ] **Step 7.7: Write `auth.go`**

`api/cmd/cli/auth.go`:
```go
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/milmil/api/cmd/cli/internal/creds"
	"github.com/milmil/api/cmd/cli/internal/httpclient"
	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authenticate against a milmil server",
}

var authLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Store API token + server URL locally",
	RunE: func(cmd *cobra.Command, args []string) error {
		server := flagServer
		if server == "" {
			fmt.Fprint(os.Stderr, "Server URL [http://localhost:8080]: ")
			scanner := bufio.NewScanner(os.Stdin)
			scanner.Scan()
			server = strings.TrimSpace(scanner.Text())
			if server == "" {
				server = "http://localhost:8080"
			}
		}
		token := flagToken
		if token == "" {
			fmt.Fprint(os.Stderr, "Token (mlml_...): ")
			scanner := bufio.NewScanner(os.Stdin)
			scanner.Scan()
			token = strings.TrimSpace(scanner.Text())
		}
		if !strings.HasPrefix(token, "mlml_") {
			return fmt.Errorf("token must start with 'mlml_'")
		}
		// Verify by hitting /auth/me
		c := httpclient.New(server, token)
		var me struct{ Username string `json:"username"` }
		if err := c.DoJSON("GET", "/api/v1/auth/me", nil, nil, &me); err != nil {
			return fmt.Errorf("verifying token: %w", err)
		}
		if err := creds.Save(&creds.Credentials{Server: server, Token: token}); err != nil {
			return err
		}
		fmt.Printf("Logged in as %q to %s\n", me.Username, server)
		return nil
	},
}

var authStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show current login state",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := creds.Load()
		if err != nil {
			fmt.Println("Not logged in.")
			return nil
		}
		client := httpclient.New(c.Server, c.Token)
		var me struct {
			Username  string `json:"username"`
			TokenName string `json:"token_name,omitempty"`
		}
		if err := client.DoJSON("GET", "/api/v1/auth/me", nil, nil, &me); err != nil {
			fmt.Printf("Logged in to %s — but server rejected token: %v\n", c.Server, err)
			return nil
		}
		fmt.Printf("Logged in as %q to %s\nToken: %s\n", me.Username, c.Server, me.TokenName)
		return nil
	},
}

var authLogoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Remove stored credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := creds.Delete(); err != nil {
			return err
		}
		fmt.Println("Logged out.")
		return nil
	},
}

func init() {
	authCmd.AddCommand(authLoginCmd, authStatusCmd, authLogoutCmd)
	rootCmd.AddCommand(authCmd)
}
```

- [ ] **Step 7.8: Write tests**

Smoke tests for credentials round-trip + httpclient against a mock server. Skip detailed code here for brevity — write `creds_test.go` testing Save/Load/Delete with `t.TempDir()` + `os.Setenv("HOME", tempdir)`, and `client_test.go` using `httptest.NewServer`.

- [ ] **Step 7.9: Build and smoke-test**

```bash
cd api && go build -o /tmp/milmil ./cmd/cli
/tmp/milmil --help
# > expect: 'milmil — control milmil from the terminal.' followed by 'Available Commands: auth ...'
/tmp/milmil auth --help
/tmp/milmil version
# fails — version subcommand not yet wired (Task 13)
```

- [ ] **Step 7.10: Commit**

```bash
git add api/go.mod api/go.sum \
        api/cmd/cli/main.go api/cmd/cli/auth.go \
        api/cmd/cli/internal/httpclient/ \
        api/cmd/cli/internal/creds/ \
        api/cmd/cli/internal/output/ \
        api/cmd/cli/internal/confirm/
git commit -m "$(cat <<'EOF'
feat(cli): scaffold + auth subcommand

Adds api/cmd/cli with cobra root, persistent flags (--server, --token,
--json, --dry-run), credentials file (~/.config/milmil/credentials,
mode 0600), token-aware HTTP client wrapper, output formatters, and
y/N confirm prompt. Auth subcommand: login (verify token via
/auth/me), status, logout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: CLI subcommands

The remaining subcommand tasks (8-13) follow a uniform pattern: each adds one `<name>.go` file in `api/cmd/cli/` that wires cobra subcommands which in turn use the `httpclient` + `creds` packages from Task 7. Each subcommand maps 1:1 to a server endpoint.

### Task 8: `library` subcommand (list, add, scan, stats)

**Files:** Create `api/cmd/cli/library.go` + `library_test.go`.

- [ ] **Step 8.1: Implement**

```go
package main

import (
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/milmil/api/cmd/cli/internal/creds"
	"github.com/milmil/api/cmd/cli/internal/httpclient"
	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

var libraryCmd = &cobra.Command{Use: "library", Short: "Manage libraries"}

var libraryListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all libraries",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var resp struct {
			Items []struct {
				ID    string `json:"id"`
				Name  string `json:"name"`
				Path  string `json:"path"`
				Files int    `json:"file_count"`
			} `json:"items"`
		}
		if err := c.DoJSON("GET", "/api/v1/libraries", nil, nil, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp.Items)
		}
		rows := make([][]string, 0, len(resp.Items))
		for _, l := range resp.Items {
			rows = append(rows, []string{l.ID, l.Name, l.Path, fmt.Sprint(l.Files)})
		}
		output.PrintTable(os.Stdout, []string{"ID", "Name", "Path", "Files"}, rows)
		return nil
	},
}

var libraryAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add a new library",
	RunE: func(cmd *cobra.Command, args []string) error {
		path, _ := cmd.Flags().GetString("path")
		name, _ := cmd.Flags().GetString("name")
		if path == "" {
			return fmt.Errorf("--path required")
		}
		c, err := newClient()
		if err != nil {
			return err
		}
		var resp struct {
			ID string `json:"id"`
		}
		if err := c.DoJSON("POST", "/api/v1/libraries", map[string]any{
			"path": path, "name": name,
		}, nil, &resp); err != nil {
			return err
		}
		fmt.Printf("Library created: %s\n", resp.ID)
		return nil
	},
}

var libraryScanCmd = &cobra.Command{
	Use:   "scan <library_id>",
	Short: "Trigger a scan; --wait blocks until done",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		wait, _ := cmd.Flags().GetBool("wait")
		c, err := newClient()
		if err != nil {
			return err
		}
		if err := c.DoJSON("POST", fmt.Sprintf("/api/v1/libraries/%s/scan", args[0]), nil, nil, nil); err != nil {
			return err
		}
		fmt.Println("Scan triggered.")
		if !wait {
			return nil
		}
		fmt.Println("Waiting for scan to complete...")
		q := url.Values{"timeout": []string{"600"}}
		var state struct {
			Status string `json:"status"`
			Files  int    `json:"file_count"`
		}
		t0 := time.Now()
		if err := c.DoJSON("GET", fmt.Sprintf("/api/v1/library/%s/scan/wait", args[0]), nil, q, &state); err != nil {
			return err
		}
		fmt.Printf("Scan complete in %s. %d files.\n", time.Since(t0).Round(time.Second), state.Files)
		return nil
	},
}

var libraryStatsCmd = &cobra.Command{
	Use:   "stats <library_id>",
	Short: "Show counts and last scan time",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// GET /api/v1/libraries/:id and pretty-print
		c, err := newClient()
		if err != nil {
			return err
		}
		var resp map[string]any
		if err := c.DoJSON("GET", "/api/v1/libraries/"+args[0], nil, nil, &resp); err != nil {
			return err
		}
		return output.PrintJSON(resp)
	},
}

// newClient is a shared helper used by every subcommand.
func newClient() (*httpclient.Client, error) {
	server := flagServer
	token := flagToken
	if server == "" || token == "" {
		c, err := creds.Load()
		if err != nil {
			return nil, err
		}
		if server == "" {
			server = c.Server
		}
		if token == "" {
			token = c.Token
		}
	}
	return httpclient.New(server, token), nil
}

func init() {
	libraryAddCmd.Flags().String("path", "", "host path to the library root")
	libraryAddCmd.Flags().String("name", "", "human-readable name")
	libraryScanCmd.Flags().Bool("wait", false, "block until scan finishes")
	libraryCmd.AddCommand(libraryListCmd, libraryAddCmd, libraryScanCmd, libraryStatsCmd)
	rootCmd.AddCommand(libraryCmd)
}
```

- [ ] **Step 8.2: Smoke test against a running milmil**

```bash
go build -o /tmp/milmil ./cmd/cli
/tmp/milmil library list --json
/tmp/milmil library add --path /tmp/test-anime --name test
/tmp/milmil library scan <id> --wait
```

- [ ] **Step 8.3: Commit**

```bash
git add api/cmd/cli/library.go api/cmd/cli/library_test.go
git commit -m "feat(cli): library list/add/scan/stats subcommands

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `search`, `episode`, `watch` subcommands

**Files:** Create `api/cmd/cli/search.go`, `episode.go`, `watch.go`.

Implementation pattern matches Task 8. Each subcommand maps to a server endpoint:

| CLI command | Endpoint |
|---|---|
| `milmil search anime <q>` | `GET /api/v1/search/anime?q=<q>` |
| `milmil search files <q> --library <id>` | `GET /api/v1/files?library=<id>&q=<q>` |
| `milmil episode list --anime-id <id>` | `GET /api/v1/anime/<id>/episodes` |
| `milmil episode show <ep_id>` | `GET /api/v1/episodes/<ep_id>` |
| `milmil episode watch-url <ep_id>` | `GET /api/v1/episodes/<ep_id>/watch-url` |
| `milmil watch resolve <title> --episode <n>` | search anime → pick top → list eps → pick episode N → fetch watch-url |

`watch resolve` is a client-side composition of three calls. Implement as:

```go
var watchResolveCmd = &cobra.Command{
	Use:   "resolve <title>",
	Short: "Resolve title+episode to a watch URL",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ep, _ := cmd.Flags().GetInt("episode")
		c, err := newClient()
		if err != nil { return err }

		var search struct{ Items []struct{ ID, Title string; Score float64 } `json:"items"` }
		if err := c.DoJSON("GET", "/api/v1/search/anime", nil, url.Values{"q": []string{args[0]}}, &search); err != nil {
			return err
		}
		if len(search.Items) == 0 {
			return fmt.Errorf("no anime matches %q", args[0])
		}
		anime := search.Items[0]

		var eps struct{ Items []struct{ ID string; Number int } `json:"items"` }
		if err := c.DoJSON("GET", fmt.Sprintf("/api/v1/anime/%s/episodes", anime.ID), nil, nil, &eps); err != nil {
			return err
		}
		var pickEp string
		for _, e := range eps.Items {
			if e.Number == ep { pickEp = e.ID; break }
		}
		if pickEp == "" { return fmt.Errorf("episode %d not found", ep) }

		var url struct {
			AnimeID, EpisodeID, WatchURL, StreamURL, MatchedFile string
		}
		if err := c.DoJSON("GET", fmt.Sprintf("/api/v1/episodes/%s/watch-url", pickEp), nil, nil, &url); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(url)
		}
		fmt.Println(url.WatchURL)
		return nil
	},
}
```

Commit after both files compile + a manual `milmil watch resolve "Frieren" --episode 1` round-trip works.

---

### Task 10: `match` subcommand (auto, list, apply, undo, suggest)

**Files:** `api/cmd/cli/match.go`.

Mapping:

| CLI command | Endpoint |
|---|---|
| `milmil match auto --library <id> [--confidence-floor X] [--dry-run]` | `POST /api/v1/match/auto` |
| `milmil match list --library <id> --status unmatched` | `GET /api/v1/files?library=<id>&match_status=unmatched` |
| `milmil match apply --file <id> --anime-id <id> [--episode <id>]` | `POST /api/v1/files/<id>/match` |
| `milmil match undo --id <audit_id>` / `--since <duration>` | `POST /api/v1/audit/undo` |
| `milmil match suggest --file <id>` | `GET /api/v1/files/<id>/match/suggest` |

`match undo --since 1h` translates `1h` to RFC3339 timestamp (now - 1h) before passing in body. Always prints summary table and asks `[y/N]` confirm before submitting unless `--yes` is passed.

- [ ] **Step 10.1: Implement**, commit per pattern above.

---

### Task 11: `subscribe` subcommand (add, list, undo)

**Files:** `api/cmd/cli/subscribe.go`.

| CLI command | Endpoint |
|---|---|
| `milmil subscribe add <title> [--no-rss] [--no-sync] [--dry-run]` | `POST /api/v1/subscribe` |
| `milmil subscribe list` | `GET /api/v1/audit?action=subscribe.add` (audit log filtered to subscribe entries) |
| `milmil subscribe undo --id <audit_id>` | `POST /api/v1/audit/undo` (same engine) |

Output of `subscribe add` — pretty version (when not `--json`):

```
Resolved: <title> (Bangumi <id> / AniList <id>) confidence <score>.
Actions:
  ✓ plan_to_watch
  ✓ rss.create  (subgroups: ANi, SubsPlease | resolution: 1080p)
  ✓ download.queue × 12 (missing past episodes)
  ✓ sync.bangumi
  ✓ sync.anilist
Audit: <audit_id>. Undo: 'milmil subscribe undo --id <audit_id>'
```

Commit per pattern.

---

### Task 12: `audit` + `token` subcommands

**Files:** `api/cmd/cli/audit.go`, `api/cmd/cli/token.go`.

| CLI command | Endpoint |
|---|---|
| `milmil audit list [--since X] [--action Y]` | `GET /api/v1/audit?action=Y&since=X` |
| `milmil audit show <id>` | `GET /api/v1/audit/<id>` |
| `milmil token list` | `GET /api/v1/api-tokens` |
| `milmil token revoke <id_or_name>` | `DELETE /api/v1/api-tokens/<id>` (look up by name first if not an id-shaped string) |

Audit table output columns: `ID`, `Time`, `Action`, `Target`, `Confidence`, `By`. Token table columns: `Name`, `Last Used`, `Last IP`, `Last UA`.

Commit per pattern.

---

### Task 13: `version`, `agents-guide`, `generate-skill`

**Files:** `api/cmd/cli/version.go`, `api/cmd/cli/guide.go`, `api/cmd/cli/skill.go`, `api/cmd/cli/agents_guide.md` (embedded), `api/cmd/cli/skill_templates/` (embedded).

- [ ] **Step 13.1: `version.go`**

```go
package main

import (
	"fmt"
	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print CLI version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(Version)
	},
}

func init() { rootCmd.AddCommand(versionCmd) }
```

- [ ] **Step 13.2: Write the agent guide markdown**

`api/cmd/cli/agents_guide.md` — ~150 lines, full content. Sample skeleton (the implementer fills in the recipe sections; the spec already contains the recipe outlines):

```markdown
# milmil — AI Agent Usage Guide

This guide is for AI agents (Claude Code, Cursor, Codex, OpenClaw, Hermes,
Aider, etc.) controlling a running milmil server via the `milmil` CLI.

## Pre-flight

1. Confirm `milmil` is in `$PATH`: `command -v milmil` should print a path.
2. Confirm authenticated: `milmil auth status` should print `Logged in as ...`.
   If not, ask the user to generate a token in their milmil web UI
   (Settings → API Tokens → Create) and paste it into `milmil auth login`.
3. Default output: pass `--json` for machine-readable output. Without it,
   commands print human-friendly tables and lines.

## Recipe 1 — Bulk metadata fix (autonomous)

User says: "fix unmatched files in my library".

```bash
milmil library list --json | jq '.[].id'
milmil match list --library <id> --status unmatched --json
# Review the count. If "feels right", autonomous-apply with confidence floor:
milmil match auto --library <id> --confidence-floor 0.85 --dry-run
# Show the dry-run summary to the user. If they OK:
milmil match auto --library <id> --confidence-floor 0.85
# Show the result. If anything went wrong, undo the whole run:
milmil match undo --since 5m
```

## Recipe 2 — Subscribe to a series (autonomous)

User says: "subscribe me to <title>".

```bash
milmil subscribe add "<title>" --dry-run
# Show the plan: which anime resolved, what RSS rule, how many missing eps.
# If the user OKs:
milmil subscribe add "<title>"
# To revert:
milmil subscribe undo --id <audit_id>
```

## Recipe 3 — Watch tonight

User says: "I want to watch <title> episode 5".

```bash
milmil watch resolve "<title>" --episode 5
# Prints a watch URL. Tell the user to open it in their browser.
```

## Common pitfalls

- Low-confidence matches in autonomous mode are NOT applied. They appear
  in `low_confidence` of the response. Walk the user through them with
  `milmil match suggest --file <id>` before manually confirming with
  `milmil match apply --file <id> --anime-id <id>`.
- `milmil match undo --since 5m` reverts ALL `match.apply` audit entries
  in the window — including ones from the web UI. Use `--id <audit_id>`
  for surgical undo.
- Bangumi / AniList sync requires OAuth tokens to still be valid. If
  `milmil subscribe` reports `sync.bangumi: token expired`, ask the
  user to re-auth in the web UI Settings → Integrations.
- The CLI uses your API token, not your password. Token shows up in
  `milmil token list` with the name you gave it.

## Permissions and audit

Every autonomous action is recorded in the audit log:

```bash
milmil audit list --since 1h --json
milmil audit show <audit_id>
```

If something looks wrong, undo it:

```bash
milmil audit undo --id <id>
```

## When you're stuck

If a command returns an unexpected error, ALWAYS run with `--json` to get
the structured response shape. Show the JSON to the user.
```

- [ ] **Step 13.3: `guide.go`**

```go
package main

import (
	_ "embed"
	"fmt"
	"github.com/spf13/cobra"
)

//go:embed agents_guide.md
var embeddedAgentsGuide string

var agentsGuideCmd = &cobra.Command{
	Use:   "agents-guide",
	Short: "Print the AI agent usage guide for milmil",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Print(embeddedAgentsGuide)
	},
}

func init() { rootCmd.AddCommand(agentsGuideCmd) }
```

- [ ] **Step 13.4: `skill.go` + skill_templates/**

Each template is a tiny markdown file (~3-5 lines) embedded:

`api/cmd/cli/skill_templates/claude.md`:
```markdown
---
name: milmil
description: Use when the user mentions milmil — controlling their anime library, fixing matches, subscribing to series, or finding episodes to watch. Run `milmil agents-guide` first to learn the CLI surface.
---

# milmil

When the user asks anything about milmil, run `milmil agents-guide` to load the full usage guide. Then follow its recipes.
```

`api/cmd/cli/skill_templates/cursor.md`:
```markdown
# milmil CLI

When the user mentions milmil, run `milmil agents-guide` to load the full usage guide.
```

`api/cmd/cli/skill_templates/agents-md.md`:
```markdown
## milmil CLI

When the user wants to control milmil (their anime media server), run `milmil agents-guide` to load the full agent usage guide before performing any action.
```

`api/cmd/cli/skill_templates/hermes.md`, `openclaw.md` — same shape, placeholders to update once those tools' conventions are documented.

`api/cmd/cli/skill.go`:
```go
package main

import (
	"embed"
	"fmt"
	"github.com/spf13/cobra"
)

//go:embed skill_templates/*.md
var skillTemplates embed.FS

var skillFormats = []string{"claude", "cursor", "agents-md", "hermes", "openclaw"}

var generateSkillCmd = &cobra.Command{
	Use:   "generate-skill",
	Short: "Print agent skill/rule content for a given platform",
	RunE: func(cmd *cobra.Command, args []string) error {
		format, _ := cmd.Flags().GetString("format")
		if format == "" {
			return fmt.Errorf("--format required (one of: %v)", skillFormats)
		}
		data, err := skillTemplates.ReadFile("skill_templates/" + format + ".md")
		if err != nil {
			return fmt.Errorf("unknown format %q (available: %v)", format, skillFormats)
		}
		fmt.Print(string(data))
		return nil
	},
}

func init() {
	generateSkillCmd.Flags().String("format", "", "skill format: "+fmt.Sprint(skillFormats))
	rootCmd.AddCommand(generateSkillCmd)
}
```

- [ ] **Step 13.5: Build and smoke-test**

```bash
go build -o /tmp/milmil ./cmd/cli
/tmp/milmil version
/tmp/milmil agents-guide | head -30
/tmp/milmil generate-skill --format claude
/tmp/milmil generate-skill --format cursor > /tmp/.cursorrules && cat /tmp/.cursorrules
```

- [ ] **Step 13.6: Commit**

```bash
git add api/cmd/cli/version.go \
        api/cmd/cli/guide.go \
        api/cmd/cli/skill.go \
        api/cmd/cli/agents_guide.md \
        api/cmd/cli/skill_templates/
git commit -m "$(cat <<'EOF'
feat(cli): version, agents-guide, generate-skill subcommands

agents-guide prints an embedded ~150-line markdown guide covering
auth, three killer recipes (bulk match, subscribe, watch), pitfalls,
audit. generate-skill --format <claude|cursor|agents-md|hermes|openclaw>
emits a 3-5 line shim that redirects the agent to run agents-guide.
Adding a new agent format = adding one file under skill_templates/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Distribution + docs

### Task 14: Goreleaser config

**Files:**
- Create: `.goreleaser.yaml`
- Modify: `.github/workflows/release-please.yml` or new `.github/workflows/release.yml`
- Test: tag a test release `v0.1.0-rc.1` and verify GitHub Releases get binaries.

- [ ] **Step 14.1: Write `.goreleaser.yaml`**

```yaml
version: 2
project_name: milmil

before:
  hooks:
    - go mod tidy

builds:
  - id: milmil
    main: ./api/cmd/cli
    binary: milmil
    env:
      - CGO_ENABLED=0
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
    ldflags:
      - -s -w -X main.Version={{.Version}}

archives:
  - id: milmil-archive
    formats: [tar.gz]
    format_overrides:
      - goos: windows
        formats: [zip]
    name_template: "milmil_{{ .Version }}_{{ .Os }}_{{ .Arch }}"

checksum:
  name_template: 'checksums.txt'

release:
  draft: false
  github:
    owner: milmil-dev
    name: milmil
```

- [ ] **Step 14.2: Add release workflow**

`.github/workflows/release.yml`:
```yaml
name: Release CLI
on:
  push:
    tags: ['cli-v*']

permissions:
  contents: write

jobs:
  goreleaser:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - uses: actions/setup-go@v6
        with: { go-version: '1.26' }
      - uses: goreleaser/goreleaser-action@v6
        with:
          version: latest
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Tag pattern `cli-v*` keeps CLI releases independent from the existing release-please-managed application releases.

- [ ] **Step 14.3: Commit**

```bash
git add .goreleaser.yaml .github/workflows/release.yml
git commit -m "feat(release): goreleaser config for CLI distribution

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: New docs page `configuration/ai-agents.mdx`

**Files:**
- Create: `docs-site/content/docs/configuration/ai-agents.mdx`
- Create: `docs-site/content/docs/configuration/ai-agents.zh-CN.mdx`
- Create: `docs-site/content/docs/configuration/ai-agents.zh-TW.mdx`
- Create: `docs-site/content/docs/configuration/ai-agents.zh-HK.mdx`
- Modify: `docs-site/content/docs/configuration/meta.json` (and locale variants) to register new page

- [ ] **Step 15.1: Write the EN page**

`docs-site/content/docs/configuration/ai-agents.mdx`:

```mdx
---
title: AI Agent Integration
description: Use Claude Code, Cursor, Codex, OpenClaw, Hermes, or any other terminal-based AI agent to control milmil via the CLI.
---

milmil exposes its agent automation surface through a single CLI binary
(`milmil`) — the same tool you use as a human admin. Because every modern
AI agent can call shell commands, no agent-specific integration is required.

## Quick start

<Steps>

<Step>
### Install the CLI

Download the latest release for your platform from
[GitHub Releases](https://github.com/milmil-dev/milmil/releases) — pick the
binary tagged `cli-v*` matching your OS and architecture.

```bash
# Or via Homebrew (once tap is published)
brew install milmil-dev/tap/milmil
```
</Step>

<Step>
### Generate an API token

In milmil's web UI: **Settings → API Tokens → Create**. Name it after
the agent that will use it (e.g. `claude-code-laptop`). Copy the
`mlml_...` token immediately — it's shown once.
</Step>

<Step>
### Authenticate the CLI

```bash
milmil auth login --server http://localhost:8080
# > Token: mlml_...
```

Verify:

```bash
milmil auth status
```
</Step>

<Step>
### Tell your agent about milmil

Run this from the directory you'll use the agent in:

```bash
milmil generate-skill --format claude > .claude/skills/milmil/SKILL.md
# or, for any agent that reads AGENTS.md (Codex / Aider / generic):
milmil generate-skill --format agents-md >> AGENTS.md
# or for Cursor:
milmil generate-skill --format cursor > .cursorrules
```

The shim is a 3-line redirect telling the agent to run `milmil agents-guide`
when the user mentions milmil.
</Step>

</Steps>

## What the agent can do

The embedded guide (run `milmil agents-guide` to view) covers three
killer use cases:

1. **Bulk metadata fix** — `milmil match auto --library <id>`
2. **Full subscribe** — `milmil subscribe add "<title>"`
3. **Watch resolution** — `milmil watch resolve "<title>" --episode N`

All autonomous actions are logged to milmil's audit log. Anything the
agent did can be reversed with `milmil audit undo --id <id>` or
`milmil match undo --since 1h`.

## Supported agent formats

| Format | Generates | Where to put it |
|---|---|---|
| `claude` | `.claude/skills/milmil/SKILL.md` content | `~/.claude/skills/milmil/` (global) or per-project |
| `cursor` | `.cursorrules` content | project root |
| `agents-md` | `AGENTS.md` snippet | append to project's `AGENTS.md` |
| `hermes` | Hermes skill stub | per Hermes docs |
| `openclaw` | OpenClaw skill stub | per OpenClaw docs |

Adding new formats: file an issue or PR with the platform's expected
file path and frontmatter — `milmil generate-skill --format <new>`
becomes one extra file in the binary's embedded `skill_templates/`.

## Audit and undo

milmil's audit log captures every autonomous action with the agent's
token name, timestamp, before/after state, and confidence score. View:

```bash
milmil audit list --since 1h
milmil audit show <id>
```

To reverse:

```bash
milmil audit undo --id <id>          # surgical
milmil match undo --since 5m         # bulk window
```

Reversing external sync (Bangumi / AniList) is best-effort — if the
remote was changed manually after our sync, the conflict is logged but
not auto-overwritten.

## Different token per agent

Generate a separate token per agent / device. They're independently
revocable (`milmil token revoke <name>`), and the audit log shows
which token did each action.
```

- [ ] **Step 15.2: Translate to zh-CN, zh-TW, zh-HK**

Same pattern as the install docs translation tasks (Task 8/9/10 of the previous plan). Code blocks and component markup stay verbatim; prose and frontmatter translate.

- [ ] **Step 15.3: Register page in meta.json**

`docs-site/content/docs/configuration/meta.json`:
```json
{
  "title": "Configuration",
  "pages": ["environment", "integrations", "ai-agents", "notifications", "performance", "reverse-proxy"]
}
```

Same edit in the three locale variants of `meta.json`.

- [ ] **Step 15.4: Verify build**

```bash
cd docs-site && bun run build
```
Expected: 4 new pages (one per locale) listed in build output.

- [ ] **Step 15.5: Commit**

```bash
git add docs-site/content/docs/configuration/ai-agents.mdx \
        docs-site/content/docs/configuration/ai-agents.zh-CN.mdx \
        docs-site/content/docs/configuration/ai-agents.zh-TW.mdx \
        docs-site/content/docs/configuration/ai-agents.zh-HK.mdx \
        docs-site/content/docs/configuration/meta.json \
        docs-site/content/docs/configuration/meta.zh-CN.json \
        docs-site/content/docs/configuration/meta.zh-TW.json \
        docs-site/content/docs/configuration/meta.zh-HK.json
git commit -m "docs(ai-agents): document CLI + agents-guide + generate-skill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6: Integration tests

### Task 16: End-to-end + macro round-trip integration tests

**Files:**
- Create: `api/internal/api/integration_test.go` (build tag `integration`)
- Modify: `api/Makefile` or workflow: ensure `go test -tags=integration` runs

These tests exercise the full vertical: HTTP request → handler → macro → DB → audit → undo.

- [ ] **Step 16.1: Write end-to-end install→play test**

```go
//go:build integration
// +build integration

package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestEndToEnd_InstallToPlayableURL(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	// Step 1-3 (install + admin + token) are simulated by newTestServer

	// Step 4 (login) — token already minted
	tok := srv.MintAPIToken(t, "e2e-agent")
	c := srv.NewClient(tok)

	// Step 5 (library add)
	libID := c.LibraryAdd(t, "/tmp/anime-test")

	// Step 6 (scan with wait)
	c.LibraryScan(t, libID, true)

	// Verify scan finished
	state := c.LibraryStats(t, libID)
	require.Greater(t, state.FileCount, 0)

	// Step 7 (search anime)
	hits := c.SearchAnime(t, "Frieren")
	require.NotEmpty(t, hits)

	// Step 8 (resolve watch URL)
	url := c.WatchResolve(t, "Frieren", 1)
	resp, err := http.Get(url.WatchURL)
	require.NoError(t, err)
	defer resp.Body.Close()
	// Web URL should at minimum return HTML (200 if web is also up; otherwise just verify URL pattern)
	require.True(t, resp.StatusCode >= 200 && resp.StatusCode < 500)
}
```

`srv.NewClient(tok)` returns a thin wrapper providing convenience methods used above. Implement these helpers in the test util file.

- [ ] **Step 16.2: Write match auto + undo round-trip test**

```go
func TestMatchAuto_UndoRestoresPriorState(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	libID := "lib-1"
	srv.SeedLibrary(t, libID)
	for i := 1; i <= 3; i++ {
		srv.SeedUnmatchedFile(t, libID, fmt.Sprintf("f%d", i), fmt.Sprintf("file-%d.mkv", i), "Frieren")
	}
	tok := srv.MintAPIToken(t, "e2e-agent")
	c := srv.NewClient(tok)

	// Run autonomous match
	res := c.MatchAuto(t, libID, 0.85)
	require.GreaterOrEqual(t, res.Applied, 1)

	// Verify files are now matched
	files := srv.ListFiles(t, libID)
	matchedBefore := countMatched(files)
	require.GreaterOrEqual(t, matchedBefore, res.Applied)

	// Undo via --since
	since := time.Now().Add(-1 * time.Minute).Format(time.RFC3339)
	c.AuditUndoSince(t, since)

	// Verify files reverted
	files = srv.ListFiles(t, libID)
	require.Equal(t, 0, countMatched(files))
}
```

- [ ] **Step 16.3: Write subscribe + undo round-trip test**

Pattern: seed anime, mock RSS / Bangumi / AniList clients, call subscribe, verify all 4 audit children written, call undo, verify all reversed (RSS rule deleted, downloads cancelled, sync.bangumi/anilist Revert called).

- [ ] **Step 16.4: Run integration tests**

```bash
cd api && go test -tags=integration ./internal/api/ -v -timeout 120s
```

- [ ] **Step 16.5: Commit**

```bash
git add api/internal/api/integration_test.go
git commit -m "test(integration): end-to-end install->play + macro round-trips

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

**Spec coverage** — checked each section/requirement in spec against tasks:
- Audit log table + middleware → Tasks 1–2
- `/audit/{list,undo}` endpoints → Task 3
- Macro endpoints (`/match/auto`, `/subscribe`) → Tasks 5, 6
- Supporting endpoints (`/search/anime`, `/episodes/:id/watch-url`, `/library/:id/scan/wait`) → Task 4
- CLI scaffold (cobra, creds, http client, output, confirm) → Task 7
- CLI subcommands (auth, library, search, episode, watch, match, subscribe, audit, token, version, agents-guide, generate-skill) → Tasks 7–13
- Goreleaser distribution → Task 14
- New docs page (4 locales) → Task 15
- Integration tests (end-to-end + match auto undo + subscribe undo) → Task 16
- Confidence floor model + UserPreference reads → embedded in Task 5 (handler) and Task 6 (macro)
- API token reuse — no separate task; inherited by Task 7's auth

**Placeholder scan** — three intentional notes that ARE planning hints, not unfilled placeholders:
- Task 3 reverseMatchApply / reverseRSSCreate body comments — these direct the implementer to specific existing queries (`media_files.sql` and rss queries) and tell them to wire the real call. Acceptable: the action is well-specified, the path to the answer is documented.
- Task 4 references `searchService.SearchAnime` and `scanService.GetScanState` as methods to be added to existing services. The implementer can reasonably find these by inspecting `api/internal/search/` and `api/internal/library/`.
- Task 6 lists interface methods (`Search().SearchAnime`, `RSS().CreateRule`, etc.) that must be backed by extracting existing endpoint logic into per-domain services. Refactor-and-share rather than duplicate.

These are unavoidable for a multi-thousand-line CLI + server change without including all 25,000+ lines of existing code in the plan. They're scoped, named, and direct the implementer to a single existing file each.

**Type consistency** — same names used throughout: `mlml_` token prefix, `audit_log` table, `MatchAutoParams`, `SubscribeParams`, `UndoParams`, `Deps` interface, `agents-guide`, `generate-skill --format <fmt>`, `~/.config/milmil/credentials`, `MILMIL_SERVER`, `MILMIL_TOKEN`. Confidence aggregation formula identical between Task 5 (handler) and the spec.

**Effort estimate** confirmed at ~10-12 days part-time. Tasks 1-6 are server work (~5 days), Tasks 7-13 are CLI (~4 days), Tasks 14-16 are distribution + docs + integration (~2 days). Tasks 8-13 inside Phase 4 can run in parallel across multiple subagents if desired (each is self-contained — same shape, different endpoint mapping).
