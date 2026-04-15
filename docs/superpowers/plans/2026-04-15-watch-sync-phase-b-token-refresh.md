# Watch Sync Phase B — Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reactively refresh expired AniList/Bangumi OAuth access tokens when the worker hits 401, persist the new token, retry the push once, and fall back to a `sync:needs_reauth` ws event if refresh itself fails.

**Architecture:** Add `Provider.RefreshToken` to the existing sync provider interface. Replace the read-only `TokenLoader` function with a `TokenStore` interface that supports Get / Put / LoadCreds. Wrap 401 responses in a sentinel `ErrNeedsReauth` so the worker can distinguish auth failure from other fatal errors and trigger one refresh-then-retry cycle.

**Tech Stack:** Go 1.24, existing `sync`, `sync/providers`, and `store.Queries` packages. No DB migrations.

**Spec:** `docs/superpowers/specs/2026-04-15-watch-sync-phase-b-token-refresh-design.md`

---

## File Structure

Files to create:

- `api/internal/sync/tokenstore.go` — `TokenStore` interface
- `api/internal/sync/tokenstore_settings.go` — `SettingsTokenStore` (SQLite-backed)
- `api/internal/sync/tokenstore_test.go`

Files to modify:

- `api/internal/sync/provider.go` — add `RefreshToken` method to `Provider` interface, `OAuthCreds`, `RefreshedToken`, `ErrNeedsReauth`
- `api/internal/sync/providers/anilist.go` — implement `RefreshToken`, wrap 401 with `ErrNeedsReauth`
- `api/internal/sync/providers/bangumi.go` — implement `RefreshToken`, wrap 401 with `ErrNeedsReauth`
- `api/internal/sync/providers/anilist_test.go` — add refresh + 401-wrap tests
- `api/internal/sync/providers/bangumi_test.go` — same
- `api/internal/sync/service.go` — constructor takes `TokenStore`, remove `TokenLoader` type
- `api/internal/sync/worker.go` — refresh-on-401 loop + `sync:needs_reauth` ws broadcast
- `api/internal/sync/worker_test.go` — refresh-success / refresh-fail / no-refresh-token / refresh-transient tests
- `api/internal/sync/integration_test.go` — update for new constructor signature
- `api/cmd/server/main.go` — swap closure for `SettingsTokenStore`
- `api/internal/worker/worker.go` — if it instantiates a token loader, update the type
- `web/src/pages/settings/IntegrationsPanel.tsx` — listen for `sync:needs_reauth` ws event and surface a toast

---

## Task 1: Provider interface additions

**Files:**
- Modify: `api/internal/sync/provider.go`

- [ ] **Step 1: Extend the interface + add types**

At the end of `provider.go`:

```go
// OAuthCreds is the configured client id/secret for a provider.
type OAuthCreds struct {
    ClientID     string
    ClientSecret string
}

// RefreshedToken is what a provider returns from RefreshToken. An empty
// RefreshToken means the caller should keep its previous one.
type RefreshedToken struct {
    AccessToken  string
    RefreshToken string
    ExpiresIn    time.Duration
}

// ErrNeedsReauth is returned by providers on 401/403 and by the worker when
// a refresh attempt itself fails. Callers use errors.Is to detect it.
var ErrNeedsReauth = errors.New("sync: needs reauth")
```

Extend the `Provider` interface (same file):

```go
type Provider interface {
    Name() ProviderName
    Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error
    FetchList(ctx context.Context, tok string) ([]RemoteEntry, error)
    // NEW
    RefreshToken(ctx context.Context, creds OAuthCreds, refreshToken string) (RefreshedToken, error)
}
```

- [ ] **Step 2: Build**

```bash
cd api && go build ./internal/sync/...
```

Expected: fail at the provider adapters because they don't yet implement `RefreshToken`. Don't commit yet — fix in Tasks 2 and 3.

---

## Task 2: AniList `RefreshToken` + `ErrNeedsReauth` wrap

**Files:**
- Modify: `api/internal/sync/providers/anilist.go`
- Modify: `api/internal/sync/providers/anilist_test.go`

- [ ] **Step 1: Write failing tests**

Append to `anilist_test.go`:

```go
func TestAniListRefreshTokenSuccess(t *testing.T) {
    var body string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        b, _ := io.ReadAll(r.Body)
        body = string(b)
        w.Header().Set("Content-Type", "application/json")
        _, _ = io.WriteString(w, `{"access_token":"new-a","refresh_token":"new-r","expires_in":31536000}`)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    tok, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{ClientID: "cid", ClientSecret: "sec"}, "old-r")
    if err != nil { t.Fatal(err) }
    if tok.AccessToken != "new-a" || tok.RefreshToken != "new-r" {
        t.Errorf("bad token: %+v", tok)
    }
    if tok.ExpiresIn != 31536000*time.Second {
        t.Errorf("bad expires_in: %v", tok.ExpiresIn)
    }
    for _, want := range []string{`"grant_type":"refresh_token"`, `"refresh_token":"old-r"`, `"client_id":"cid"`, `"client_secret":"sec"`} {
        if !strings.Contains(body, want) {
            t.Errorf("body missing %q: %s", want, body)
        }
    }
}

func TestAniListRefreshInvalidGrantFatal(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    _, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{ClientID: "cid", ClientSecret: "sec"}, "bad-r")
    if err == nil { t.Fatal("expected error") }
    if !errors.Is(err, milmilsync.ErrNeedsReauth) {
        t.Errorf("expected ErrNeedsReauth wrap, got %v", err)
    }
    if _, ok := milmilsync.IsTransient(err); ok {
        t.Error("invalid_grant must be fatal, not transient")
    }
}

func TestAniListRefresh5xxTransient(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "boom", http.StatusInternalServerError)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    _, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "r")
    if _, ok := milmilsync.IsTransient(err); !ok {
        t.Errorf("5xx must be transient")
    }
}

func TestAniListPush401IsErrNeedsReauth(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "nope", http.StatusUnauthorized)
    }))
    defer srv.Close()

    p := NewAniList(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1},
        milmilsync.ExternalIDs{AniList: 1})
    if err == nil { t.Fatal("expected error") }
    if !errors.Is(err, milmilsync.ErrNeedsReauth) {
        t.Errorf("Push on 401 must wrap ErrNeedsReauth, got %v", err)
    }
}
```

Add imports to the test file: `"errors"`, `"strings"` (both likely already present or added easily).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && go test -count=1 ./internal/sync/providers/ -run 'TestAniListRefresh|TestAniListPush401' -v
```

Expected: FAIL — `RefreshToken` undefined, `ErrNeedsReauth` not wrapped.

- [ ] **Step 3: Implement `RefreshToken` and update 401 path in `anilist.go`**

Add to `anilist.go` (end of file):

```go
func (p *AniList) RefreshToken(ctx context.Context, creds milmilsync.OAuthCreds, refreshToken string) (milmilsync.RefreshedToken, error) {
    body, _ := json.Marshal(map[string]string{
        "grant_type":    "refresh_token",
        "client_id":     creds.ClientID,
        "client_secret": creds.ClientSecret,
        "refresh_token": refreshToken,
    })
    tokenURL := p.baseURL
    // AniList uses a different path for token vs. graphql; support a test
    // server that serves both at the same URL (httptest uses one endpoint).
    if !strings.HasSuffix(tokenURL, "/api/v2/oauth/token") && p.baseURL == defaultAniListURL {
        tokenURL = "https://anilist.co/api/v2/oauth/token"
    }
    req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, bytes.NewReader(body))
    if err != nil { return milmilsync.RefreshedToken{}, err }
    req.Header.Set("Content-Type", "application/json")
    resp, err := p.http.Do(req)
    if err != nil {
        return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: err}
    }
    defer resp.Body.Close()
    raw, _ := io.ReadAll(resp.Body)

    switch {
    case resp.StatusCode == 200:
        var out struct {
            AccessToken  string `json:"access_token"`
            RefreshToken string `json:"refresh_token"`
            ExpiresIn    int64  `json:"expires_in"`
        }
        if err := json.Unmarshal(raw, &out); err != nil {
            return milmilsync.RefreshedToken{}, fmt.Errorf("anilist refresh decode: %w", err)
        }
        return milmilsync.RefreshedToken{
            AccessToken:  out.AccessToken,
            RefreshToken: out.RefreshToken,
            ExpiresIn:    time.Duration(out.ExpiresIn) * time.Second,
        }, nil
    case resp.StatusCode == 400, resp.StatusCode == 401, resp.StatusCode == 403:
        return milmilsync.RefreshedToken{}, fmt.Errorf("%w: anilist refresh %d: %s", milmilsync.ErrNeedsReauth, resp.StatusCode, raw)
    case resp.StatusCode >= 500:
        return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: fmt.Errorf("anilist refresh %d: %s", resp.StatusCode, raw)}
    default:
        return milmilsync.RefreshedToken{}, fmt.Errorf("anilist refresh %d: %s", resp.StatusCode, raw)
    }
}
```

In `doGraphQL`, replace the `401, 403` branch:

```go
case 401, 403:
    return fmt.Errorf("%w: anilist %d: %s", milmilsync.ErrNeedsReauth, resp.StatusCode, raw)
```

- [ ] **Step 4: Simplify — let the test server override the token URL**

The `tokenURL` fallback above is awkward for tests. Cleaner: just use `p.baseURL` as-is for the token endpoint too (the httptest server handles both POSTs by path-agnostic behavior). Revise:

```go
func (p *AniList) RefreshToken(ctx context.Context, creds milmilsync.OAuthCreds, refreshToken string) (milmilsync.RefreshedToken, error) {
    tokenURL := p.baseURL
    if tokenURL == defaultAniListURL {
        tokenURL = "https://anilist.co/api/v2/oauth/token"
    }
    // ...rest unchanged...
}
```

This way `NewAniList(srv.Client(), srv.URL)` in tests hits the test server, and production hits the real token endpoint.

- [ ] **Step 5: Run tests + regression**

```bash
cd api && go test -count=1 ./internal/sync/providers/ -v
```

Expected: all existing AniList tests still pass AND the 4 new ones. If an older test like `TestAniListAuthErrorFatal` still checks `!IsTransient`, it should still pass because `ErrNeedsReauth` wrap doesn't make it transient.

- [ ] **Step 6: Commit**

```bash
git add api/internal/sync/provider.go api/internal/sync/providers/anilist.go api/internal/sync/providers/anilist_test.go
git commit -m "feat(sync): add AniList RefreshToken + wrap 401 with ErrNeedsReauth"
```

---

## Task 3: Bangumi `RefreshToken` + `ErrNeedsReauth` wrap

**Files:**
- Modify: `api/internal/sync/providers/bangumi.go`
- Modify: `api/internal/sync/providers/bangumi_test.go`

- [ ] **Step 1: Write failing tests**

Append to `bangumi_test.go`:

```go
func TestBangumiRefreshTokenSuccess(t *testing.T) {
    var form string
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        b, _ := io.ReadAll(r.Body)
        form = string(b)
        w.Header().Set("Content-Type", "application/json")
        _, _ = io.WriteString(w, `{"access_token":"new-a","refresh_token":"new-r","expires_in":604800}`)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    tok, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{ClientID: "cid", ClientSecret: "sec"}, "old-r")
    if err != nil { t.Fatal(err) }
    if tok.AccessToken != "new-a" || tok.RefreshToken != "new-r" {
        t.Errorf("bad token: %+v", tok)
    }
    if tok.ExpiresIn != 604800*time.Second {
        t.Errorf("bad expires_in: %v", tok.ExpiresIn)
    }
    for _, want := range []string{"grant_type=refresh_token", "client_id=cid", "client_secret=sec", "refresh_token=old-r"} {
        if !strings.Contains(form, want) {
            t.Errorf("form missing %q: %s", want, form)
        }
    }
}

func TestBangumiRefreshInvalidGrantFatal(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    _, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "bad")
    if !errors.Is(err, milmilsync.ErrNeedsReauth) {
        t.Errorf("expected ErrNeedsReauth, got %v", err)
    }
}

func TestBangumiRefresh5xxTransient(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "boom", http.StatusInternalServerError)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    _, err := p.RefreshToken(context.Background(), milmilsync.OAuthCreds{}, "r")
    if _, ok := milmilsync.IsTransient(err); !ok {
        t.Errorf("5xx must be transient")
    }
}

func TestBangumi401WrapsErrNeedsReauth(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "nope", http.StatusUnauthorized)
    }))
    defer srv.Close()

    p := NewBangumi(srv.Client(), srv.URL)
    err := p.Push(context.Background(), "tok", milmilsync.SyncOp{
        Kind: milmilsync.KindProgress, Status: milmilsync.StatusWatching, Progress: 1,
    }, milmilsync.ExternalIDs{Bangumi: 500, BangumiEpisodeIDs: []int64{1001}})
    if !errors.Is(err, milmilsync.ErrNeedsReauth) {
        t.Errorf("Push on 401 must wrap ErrNeedsReauth, got %v", err)
    }
}
```

- [ ] **Step 2: Run to verify fail**

```bash
cd api && go test -count=1 ./internal/sync/providers/ -run 'TestBangumiRefresh|TestBangumi401Wraps' -v
```

- [ ] **Step 3: Implement in `bangumi.go`**

Append:

```go
func (p *Bangumi) RefreshToken(ctx context.Context, creds milmilsync.OAuthCreds, refreshToken string) (milmilsync.RefreshedToken, error) {
    tokenURL := p.baseURL + "/oauth/access_token"
    if p.baseURL == defaultBangumiURL {
        tokenURL = "https://bgm.tv/oauth/access_token"
    }
    form := url.Values{}
    form.Set("grant_type", "refresh_token")
    form.Set("client_id", creds.ClientID)
    form.Set("client_secret", creds.ClientSecret)
    form.Set("refresh_token", refreshToken)
    req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
    if err != nil { return milmilsync.RefreshedToken{}, err }
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    resp, err := p.http.Do(req)
    if err != nil { return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: err} }
    defer resp.Body.Close()
    raw, _ := io.ReadAll(resp.Body)

    switch {
    case resp.StatusCode == 200:
        var out struct {
            AccessToken  string `json:"access_token"`
            RefreshToken string `json:"refresh_token"`
            ExpiresIn    int64  `json:"expires_in"`
        }
        if err := json.Unmarshal(raw, &out); err != nil {
            return milmilsync.RefreshedToken{}, fmt.Errorf("bangumi refresh decode: %w", err)
        }
        return milmilsync.RefreshedToken{
            AccessToken:  out.AccessToken,
            RefreshToken: out.RefreshToken,
            ExpiresIn:    time.Duration(out.ExpiresIn) * time.Second,
        }, nil
    case resp.StatusCode == 400, resp.StatusCode == 401, resp.StatusCode == 403:
        return milmilsync.RefreshedToken{}, fmt.Errorf("%w: bangumi refresh %d: %s", milmilsync.ErrNeedsReauth, resp.StatusCode, raw)
    case resp.StatusCode >= 500:
        return milmilsync.RefreshedToken{}, &milmilsync.TransientError{Err: fmt.Errorf("bangumi refresh %d: %s", resp.StatusCode, raw)}
    default:
        return milmilsync.RefreshedToken{}, fmt.Errorf("bangumi refresh %d: %s", resp.StatusCode, raw)
    }
}
```

Imports: add `"net/url"` and `"strings"` if not already present.

In `classifyBangumiStatus`, replace the `401, 403` branch:

```go
case resp.StatusCode == 401 || resp.StatusCode == 403:
    return fmt.Errorf("%w: bangumi auth %d", milmilsync.ErrNeedsReauth, resp.StatusCode)
```

- [ ] **Step 4: Run tests**

```bash
cd api && go test -count=1 ./internal/sync/providers/ -v
```

All green. `TestBangumi401Fatal` (existing) still passes because `ErrNeedsReauth` is not a `*TransientError`.

- [ ] **Step 5: Commit**

```bash
git add api/internal/sync/providers/bangumi.go api/internal/sync/providers/bangumi_test.go
git commit -m "feat(sync): add Bangumi RefreshToken + wrap 401 with ErrNeedsReauth"
```

---

## Task 4: `TokenStore` interface

**Files:**
- Create: `api/internal/sync/tokenstore.go`

- [ ] **Step 1: Write the interface**

```go
package sync

import (
    "context"
    "time"
)

// TokenStore reads and writes provider OAuth tokens for sync users.
// Implementations must be safe for concurrent use.
type TokenStore interface {
    // Get returns the current (access, refresh) pair for (user, provider).
    // Returns ErrNoToken if the user has not connected this provider.
    Get(ctx context.Context, userID string, p ProviderName) (access, refresh string, err error)

    // Put persists a refreshed token. expiresAt may be zero if the provider
    // did not return expires_in. Implementations should persist both tokens
    // atomically.
    Put(ctx context.Context, userID string, p ProviderName, access, refresh string, expiresAt time.Time) error

    // LoadCreds returns the configured OAuth client id/secret for p.
    LoadCreds(ctx context.Context, p ProviderName) (OAuthCreds, error)
}
```

- [ ] **Step 2: Build**

```bash
cd api && go build ./internal/sync/...
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/sync/tokenstore.go
git commit -m "feat(sync): add TokenStore interface"
```

---

## Task 5: `SettingsTokenStore` implementation

**Files:**
- Create: `api/internal/sync/tokenstore_settings.go`
- Create: `api/internal/sync/tokenstore_test.go`

- [ ] **Step 1: Write failing tests**

`tokenstore_test.go`:

```go
package sync

import (
    "context"
    "encoding/json"
    "testing"
    "time"

    "github.com/milmil/api/internal/store"
)

func seedOAuthCreds(t *testing.T, q *store.Queries, provider string, id, secret string) {
    t.Helper()
    payload, _ := json.Marshal(map[string]string{"client_id": id, "client_secret": secret})
    _, err := q.UpsertSetting(context.Background(), store.UpsertSettingParams{
        Key: provider + "_oauth", Value: string(payload),
    })
    if err != nil { t.Fatal(err) }
}

func seedToken(t *testing.T, q *store.Queries, provider string, access, refresh string) {
    t.Helper()
    payload, _ := json.Marshal(map[string]any{
        "access_token":  access,
        "refresh_token": refresh,
        "expires_in":    3600,
    })
    _, err := q.UpsertSetting(context.Background(), store.UpsertSettingParams{
        Key: provider + "_token", Value: string(payload),
    })
    if err != nil { t.Fatal(err) }
}

func TestSettingsTokenStoreGet(t *testing.T) {
    q, _, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    seedToken(t, q, "anilist", "access1", "refresh1")

    ts := NewSettingsTokenStore(q)
    a, r, err := ts.Get(context.Background(), "u", ProviderAniList)
    if err != nil { t.Fatal(err) }
    if a != "access1" || r != "refresh1" {
        t.Errorf("got (%q, %q)", a, r)
    }
}

func TestSettingsTokenStoreGetMissing(t *testing.T) {
    q, _, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    ts := NewSettingsTokenStore(q)
    _, _, err := ts.Get(context.Background(), "u", ProviderAniList)
    if err == nil { t.Fatal("expected error") }
    if err != ErrNoToken {
        t.Errorf("want ErrNoToken, got %v", err)
    }
}

func TestSettingsTokenStorePutRoundTrip(t *testing.T) {
    q, _, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    ts := NewSettingsTokenStore(q)

    expiresAt := time.Now().Add(time.Hour).UTC()
    if err := ts.Put(context.Background(), "u", ProviderAniList, "a2", "r2", expiresAt); err != nil {
        t.Fatal(err)
    }
    a, r, err := ts.Get(context.Background(), "u", ProviderAniList)
    if err != nil { t.Fatal(err) }
    if a != "a2" || r != "r2" {
        t.Errorf("round-trip lost: (%q, %q)", a, r)
    }
}

func TestSettingsTokenStoreLoadCreds(t *testing.T) {
    q, _, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    seedOAuthCreds(t, q, "bangumi", "cid", "sec")

    ts := NewSettingsTokenStore(q)
    creds, err := ts.LoadCreds(context.Background(), ProviderBangumi)
    if err != nil { t.Fatal(err) }
    if creds.ClientID != "cid" || creds.ClientSecret != "sec" {
        t.Errorf("bad creds: %+v", creds)
    }
}

func TestSettingsTokenStoreLoadCredsMissing(t *testing.T) {
    q, _, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    ts := NewSettingsTokenStore(q)
    _, err := ts.LoadCreds(context.Background(), ProviderAniList)
    if err == nil { t.Fatal("expected error") }
}
```

- [ ] **Step 2: Implement**

`tokenstore_settings.go`:

```go
package sync

import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "time"

    "github.com/milmil/api/internal/store"
)

// SettingsTokenStore reads and writes tokens against the settings table.
// userID is not used as a key today — settings are global per provider —
// but the interface keeps userID so multi-user support is a clean extension.
type SettingsTokenStore struct {
    q *store.Queries
}

func NewSettingsTokenStore(q *store.Queries) *SettingsTokenStore {
    return &SettingsTokenStore{q: q}
}

type tokenPayload struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int64  `json:"expires_in,omitempty"`
    ExpiresAt    string `json:"expires_at,omitempty"`
}

func (s *SettingsTokenStore) Get(ctx context.Context, _ string, p ProviderName) (string, string, error) {
    setting, err := s.q.GetSetting(ctx, string(p)+"_token")
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return "", "", ErrNoToken
        }
        return "", "", err
    }
    var tp tokenPayload
    if err := json.Unmarshal([]byte(setting.Value), &tp); err != nil {
        return "", "", fmt.Errorf("token payload: %w", err)
    }
    if tp.AccessToken == "" {
        return "", "", ErrNoToken
    }
    return tp.AccessToken, tp.RefreshToken, nil
}

func (s *SettingsTokenStore) Put(ctx context.Context, _ string, p ProviderName, access, refresh string, expiresAt time.Time) error {
    tp := tokenPayload{
        AccessToken:  access,
        RefreshToken: refresh,
    }
    if !expiresAt.IsZero() {
        tp.ExpiresAt = expiresAt.UTC().Format(time.RFC3339)
    }
    payload, err := json.Marshal(tp)
    if err != nil { return err }
    _, err = s.q.UpsertSetting(ctx, store.UpsertSettingParams{
        Key:   string(p) + "_token",
        Value: string(payload),
    })
    return err
}

type credsPayload struct {
    ClientID     string `json:"client_id"`
    ClientSecret string `json:"client_secret"`
}

func (s *SettingsTokenStore) LoadCreds(ctx context.Context, p ProviderName) (OAuthCreds, error) {
    setting, err := s.q.GetSetting(ctx, string(p)+"_oauth")
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return OAuthCreds{}, fmt.Errorf("sync: no %s OAuth creds configured", p)
        }
        return OAuthCreds{}, err
    }
    var cp credsPayload
    if err := json.Unmarshal([]byte(setting.Value), &cp); err != nil {
        return OAuthCreds{}, fmt.Errorf("creds payload: %w", err)
    }
    if cp.ClientID == "" {
        return OAuthCreds{}, fmt.Errorf("sync: empty client id for %s", p)
    }
    return OAuthCreds{ClientID: cp.ClientID, ClientSecret: cp.ClientSecret}, nil
}
```

- [ ] **Step 3: Run tests**

```bash
cd api && go test -count=1 ./internal/sync/ -run TestSettingsTokenStore -v
```

All 5 pass.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/tokenstore_settings.go api/internal/sync/tokenstore_test.go
git commit -m "feat(sync): add settings-backed TokenStore with tests"
```

---

## Task 6: Swap service + worker to use `TokenStore`

**Files:**
- Modify: `api/internal/sync/service.go`
- Modify: `api/internal/sync/worker.go`
- Modify: `api/internal/sync/worker_test.go`
- Modify: `api/internal/sync/integration_test.go`
- Modify: `api/cmd/server/main.go`

- [ ] **Step 1: Replace `TokenLoader` in `service.go`**

Delete the `TokenLoader` type alias and all references. Update `Service`:

```go
type Service struct {
    q         *store.Queries
    db        *sql.DB
    queue     *Queue
    providers map[ProviderName]Provider
    tokens    TokenStore
    wsHub     WSHub // optional; may be nil — used for broadcasting needs_reauth
}

// WSHub is the minimal hook the worker needs to broadcast events. Kept as an
// interface to avoid a hard import of api/internal/ws into sync.
type WSHub interface {
    Broadcast(eventType string, payload map[string]any)
}

func NewService(q *store.Queries, db *sql.DB, providers []Provider, tokens TokenStore, hub WSHub) *Service {
    m := make(map[ProviderName]Provider, len(providers))
    for _, p := range providers {
        m[p.Name()] = p
    }
    return &Service{
        q: q, db: db, queue: NewQueue(q, db),
        providers: m, tokens: tokens, wsHub: hub,
    }
}
```

Replace all `s.loadToken(...)` calls with `s.tokens.Get(...)`. In `OnProgressUpdate` and `FlushUser`:

```go
if _, _, err := s.tokens.Get(ctx, userID, name); err != nil { continue }
```

(Only the access token is needed for enqueue decisions; ignore refresh.)

- [ ] **Step 2: Update worker — refresh-on-401 loop**

In `worker.go`, replace the body of `processRow`:

```go
func (s *Service) processRow(ctx context.Context, row store.SyncOutbox) time.Duration {
    prov, ok := s.providers[ProviderName(row.Provider)]
    if !ok {
        s.failRow(ctx, row, "unknown provider", true)
        return 0
    }
    access, refresh, err := s.tokens.Get(ctx, row.UserID, ProviderName(row.Provider))
    if err != nil {
        s.failRow(ctx, row, "no token: "+err.Error(), true)
        s.broadcastNeedsReauth(row)
        return 0
    }

    var op SyncOp
    if err := json.Unmarshal([]byte(row.Payload), &op); err != nil {
        s.failRow(ctx, row, "bad payload: "+err.Error(), true)
        return 0
    }

    if op.Kind == KindImport {
        if err := s.runImport(ctx, row.UserID, prov, access); err != nil {
            return s.handlePushError(ctx, row, prov, access, refresh, err, func(newAccess string) error {
                return s.runImport(ctx, row.UserID, prov, newAccess)
            })
        }
        s.completeRow(ctx, row)
        return 0
    }

    anime, err := s.q.GetAnime(ctx, row.AnimeID)
    if err != nil {
        s.failRow(ctx, row, "no anime: "+err.Error(), true)
        return 0
    }
    rawEpIDs, _ := s.q.ListBangumiEpisodeIDsForAnimeWatchedByUser(ctx,
        store.ListBangumiEpisodeIDsForAnimeWatchedByUserParams{
            AnimeID: row.AnimeID, UserID: row.UserID,
        })
    epIDs := make([]int64, 0, len(rawEpIDs))
    for _, n := range rawEpIDs {
        if n.Valid { epIDs = append(epIDs, n.Int64) }
    }
    ids := ExternalIDs{
        AniList: nullInt(anime.AnilistID),
        Bangumi: nullInt(anime.BangumiID),
        MAL:     nullInt(anime.MalID),
        TMDB:    nullInt(anime.TmdbID),
        AniDB:   nullInt(anime.AnidbID),
        BangumiEpisodeIDs: epIDs,
    }

    if err := prov.Push(ctx, access, op, ids); err != nil {
        return s.handlePushError(ctx, row, prov, access, refresh, err, func(newAccess string) error {
            return prov.Push(ctx, newAccess, op, ids)
        })
    }
    s.completeRow(ctx, row)
    return 0
}

// handlePushError performs the one-shot refresh-then-retry if err is
// ErrNeedsReauth and a refresh token is present. Returns the RetryAfter for
// group rate-limit deferral, or 0.
func (s *Service) handlePushError(
    ctx context.Context,
    row store.SyncOutbox,
    prov Provider,
    originalAccess, refresh string,
    err error,
    retry func(newAccess string) error,
) time.Duration {
    if errors.Is(err, ErrNeedsReauth) && refresh != "" {
        creds, cerr := s.tokens.LoadCreds(ctx, ProviderName(row.Provider))
        if cerr != nil {
            s.failRow(ctx, row, "no creds: "+cerr.Error(), true)
            s.broadcastNeedsReauth(row)
            return 0
        }
        refreshed, rerr := prov.RefreshToken(ctx, creds, refresh)
        if rerr != nil {
            if te, ok := IsTransient(rerr); ok {
                s.retryRow(ctx, row, te)
                return te.RetryAfter
            }
            s.failRow(ctx, row, "refresh failed: "+rerr.Error(), true)
            s.broadcastNeedsReauth(row)
            return 0
        }
        newRefresh := refreshed.RefreshToken
        if newRefresh == "" { newRefresh = refresh }
        expiresAt := time.Time{}
        if refreshed.ExpiresIn > 0 {
            expiresAt = time.Now().Add(refreshed.ExpiresIn)
        }
        if perr := s.tokens.Put(ctx, row.UserID, ProviderName(row.Provider), refreshed.AccessToken, newRefresh, expiresAt); perr != nil {
            s.failRow(ctx, row, "persist token: "+perr.Error(), true)
            return 0
        }
        if rerr := retry(refreshed.AccessToken); rerr != nil {
            if errors.Is(rerr, ErrNeedsReauth) {
                s.failRow(ctx, row, "refresh succeeded but retry 401", true)
                s.broadcastNeedsReauth(row)
                return 0
            }
            if te, ok := IsTransient(rerr); ok {
                s.retryRow(ctx, row, te)
                return te.RetryAfter
            }
            s.failRow(ctx, row, rerr.Error(), false)
            return 0
        }
        s.completeRow(ctx, row)
        return 0
    }

    // No refresh path — fall through to existing transient/fatal handling.
    if errors.Is(err, ErrNeedsReauth) {
        s.failRow(ctx, row, err.Error(), true)
        s.broadcastNeedsReauth(row)
        return 0
    }
    if te, ok := IsTransient(err); ok {
        s.retryRow(ctx, row, te)
        return te.RetryAfter
    }
    s.failRow(ctx, row, err.Error(), false)
    return 0
}

func (s *Service) broadcastNeedsReauth(row store.SyncOutbox) {
    if s.wsHub == nil { return }
    s.wsHub.Broadcast("sync:needs_reauth", map[string]any{
        "user_id":  row.UserID,
        "provider": row.Provider,
    })
}
```

Add `"errors"` import.

- [ ] **Step 3: Update `worker_test.go` fakes**

The existing `staticTokenLoader()` helper becomes `staticTokenStore(access, refresh string)`. Add (in worker_test.go or the shared harness):

```go
type staticTS struct {
    access, refresh string
    creds           OAuthCreds
    onPut           func(access, refresh string, expires time.Time)
}

func (s *staticTS) Get(_ context.Context, _ string, _ ProviderName) (string, string, error) {
    if s.access == "" { return "", "", ErrNoToken }
    return s.access, s.refresh, nil
}
func (s *staticTS) Put(_ context.Context, _ string, _ ProviderName, access, refresh string, exp time.Time) error {
    s.access, s.refresh = access, refresh
    if s.onPut != nil { s.onPut(access, refresh, exp) }
    return nil
}
func (s *staticTS) LoadCreds(_ context.Context, _ ProviderName) (OAuthCreds, error) {
    return s.creds, nil
}
```

Replace `staticTokenLoader()` usages across worker_test.go, import_test.go, integration_test.go, etc. Example:

```go
// Before:
s := NewService(q, db, []Provider{fp}, staticTokenLoader())
// After:
s := NewService(q, db, []Provider{fp}, &staticTS{access: "tok"}, nil)
```

The `nil` is the new `WSHub` param (tests don't need it unless they assert on broadcasts).

Also update `fakeProvider` to implement `RefreshToken`:

```go
func (p *fakeProvider) RefreshToken(_ context.Context, _ OAuthCreds, _ string) (RefreshedToken, error) {
    return RefreshedToken{}, nil // tests that need behavior will substitute
}
```

Extend `fakeProvider` with a `refresh func(...) (RefreshedToken, error)` field so specific tests can plug in refresh behavior.

- [ ] **Step 4: Update `integration_test.go`**

Replace the `tokenLoader := func(...)` closure with a `staticTS{}`. Update the `NewService` call to the new 5-arg signature.

- [ ] **Step 5: Update `main.go`**

Replace:

```go
tokenLoader := func(ctx context.Context, userID string, p milmilsync.ProviderName) (string, error) { ... }
syncSvc := milmilsync.NewService(queries, db, []milmilsync.Provider{alProvider, bgmProvider}, tokenLoader)
```

With:

```go
tokenStore := milmilsync.NewSettingsTokenStore(queries)
syncSvc := milmilsync.NewService(queries, db, []milmilsync.Provider{alProvider, bgmProvider}, tokenStore, wsHubAdapter{hub: wsHub})
```

Where `wsHubAdapter` adapts `*ws.Hub` to `milmilsync.WSHub`. Define near the existing ws setup in main.go:

```go
type wsHubAdapter struct{ hub *ws.Hub }
func (a wsHubAdapter) Broadcast(t string, p map[string]any) {
    a.hub.Broadcast(ws.Event{Type: t, Payload: p})
}
```

Check the actual `ws.Event` struct (it may have a different field name than `Payload`); adjust accordingly.

- [ ] **Step 6: Build + test**

```bash
cd api && go build ./... && go vet ./...
cd api && go test -count=1 ./internal/sync/...
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add api/internal/sync/ api/cmd/server/main.go
git commit -m "refactor(sync): swap TokenLoader for TokenStore, wire WSHub into service"
```

---

## Task 7: Worker refresh-on-401 tests

**Files:**
- Modify: `api/internal/sync/worker_test.go`

- [ ] **Step 1: Add 4 refresh-flow tests**

```go
func TestWorkerRefreshOn401ThenRetrySucceeds(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)

    calls := 0
    fp := &fakeProvider{
        name: ProviderAniList,
        pushFn: func(access string) error {
            calls++
            if calls == 1 {
                return fmt.Errorf("%w: 401", ErrNeedsReauth)
            }
            return nil
        },
        refreshFn: func() (RefreshedToken, error) {
            return RefreshedToken{AccessToken: "new-a", RefreshToken: "new-r", ExpiresIn: time.Hour}, nil
        },
    }
    ts := &staticTS{access: "old-a", refresh: "old-r", creds: OAuthCreds{ClientID: "c", ClientSecret: "s"}}
    hub := &spyHub{}
    s := NewService(q, db, []Provider{fp}, ts, hub)

    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})
    s.Drain(context.Background(), 10)

    if calls != 2 { t.Errorf("expected 2 push attempts, got %d", calls) }
    if ts.access != "new-a" || ts.refresh != "new-r" {
        t.Errorf("token not persisted: (%q, %q)", ts.access, ts.refresh)
    }
    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 { t.Errorf("row not completed: %+v", rows) }
    if len(hub.events) != 0 { t.Errorf("unexpected broadcast: %+v", hub.events) }
}

func TestWorkerRefreshFailureDeadLetters(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)

    fp := &fakeProvider{
        name:   ProviderAniList,
        pushFn: func(string) error { return fmt.Errorf("%w: 401", ErrNeedsReauth) },
        refreshFn: func() (RefreshedToken, error) {
            return RefreshedToken{}, fmt.Errorf("%w: invalid_grant", ErrNeedsReauth)
        },
    }
    ts := &staticTS{access: "a", refresh: "r", creds: OAuthCreds{ClientID: "c"}}
    hub := &spyHub{}
    s := NewService(q, db, []Provider{fp}, ts, hub)

    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})
    s.Drain(context.Background(), 10)

    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 { t.Errorf("expected row dead-lettered, got ready: %+v", rows) }
    if len(hub.events) == 0 || hub.events[0].Type != "sync:needs_reauth" {
        t.Errorf("expected sync:needs_reauth broadcast, got %+v", hub.events)
    }
}

func TestWorkerNoRefreshTokenDeadLetters(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)

    refreshCalls := 0
    fp := &fakeProvider{
        name:   ProviderAniList,
        pushFn: func(string) error { return fmt.Errorf("%w: 401", ErrNeedsReauth) },
        refreshFn: func() (RefreshedToken, error) {
            refreshCalls++
            return RefreshedToken{}, nil
        },
    }
    ts := &staticTS{access: "a", refresh: ""} // no refresh token
    hub := &spyHub{}
    s := NewService(q, db, []Provider{fp}, ts, hub)

    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})
    s.Drain(context.Background(), 10)

    if refreshCalls != 0 {
        t.Errorf("should not call RefreshToken without a refresh token, got %d calls", refreshCalls)
    }
    if len(hub.events) == 0 || hub.events[0].Type != "sync:needs_reauth" {
        t.Errorf("expected sync:needs_reauth broadcast, got %+v", hub.events)
    }
}

func TestWorkerRefreshTransientRetries(t *testing.T) {
    q, db, cleanup := newTestQueriesWithDB(t)
    defer cleanup()
    mustInsertAnime(t, q, "a1", 12, 42, 0)

    fp := &fakeProvider{
        name:   ProviderAniList,
        pushFn: func(string) error { return fmt.Errorf("%w: 401", ErrNeedsReauth) },
        refreshFn: func() (RefreshedToken, error) {
            return RefreshedToken{}, &TransientError{Err: fmt.Errorf("500")}
        },
    }
    ts := &staticTS{access: "a", refresh: "r", creds: OAuthCreds{ClientID: "c"}}
    s := NewService(q, db, []Provider{fp}, ts, &spyHub{})

    _ = s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{Kind: KindProgress, Progress: 1})
    s.Drain(context.Background(), 10)

    rows, _ := q.ListReadySyncOps(context.Background(), 10)
    if len(rows) != 0 {
        t.Errorf("row should be rescheduled (not ready immediately), got %d", len(rows))
    }
}
```

Adjust `fakeProvider` in worker_test.go to have `pushFn func(string) error` and `refreshFn func() (RefreshedToken, error)` fields:

```go
type fakeProvider struct {
    name      ProviderName
    pushFn    func(access string) error
    refreshFn func() (RefreshedToken, error)
    fetched   []RemoteEntry
    fetchErr  error
}

func (p *fakeProvider) Name() ProviderName { return p.name }
func (p *fakeProvider) Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error {
    if p.pushFn != nil { return p.pushFn(tok) }
    return nil
}
func (p *fakeProvider) FetchList(ctx context.Context, tok string) ([]RemoteEntry, error) {
    return p.fetched, p.fetchErr
}
func (p *fakeProvider) RefreshToken(_ context.Context, _ OAuthCreds, _ string) (RefreshedToken, error) {
    if p.refreshFn != nil { return p.refreshFn() }
    return RefreshedToken{}, nil
}
```

Existing tests that set `pushErr` must be updated — replace with `pushFn: func(string) error { return fixedErr }`. (Mechanical find/replace.)

Add a `spyHub`:

```go
type spyHub struct {
    events []struct {
        Type    string
        Payload map[string]any
    }
}

func (h *spyHub) Broadcast(t string, p map[string]any) {
    h.events = append(h.events, struct {
        Type    string
        Payload map[string]any
    }{Type: t, Payload: p})
}
```

- [ ] **Step 2: Run**

```bash
cd api && go test -count=1 ./internal/sync/ -run 'TestWorkerRefresh|TestWorkerNoRefresh' -v
```

All 4 pass.

- [ ] **Step 3: Run full sync tests**

```bash
cd api && go test -count=1 ./internal/sync/...
```

Everything green.

- [ ] **Step 4: Commit**

```bash
git add api/internal/sync/worker_test.go
git commit -m "test(sync): cover refresh-on-401 worker flow"
```

---

## Task 8: Frontend — listen for `sync:needs_reauth`

**Files:**
- Modify: `web/src/pages/settings/IntegrationsPanel.tsx`

- [ ] **Step 1: Find the existing ws subscription pattern**

```bash
grep -rln "'sync:\|scan:started\|anidb:refreshed" web/src
```

Expected: there's a Zustand store or a hook that subscribes to the global ws connection. Use the same mechanism.

- [ ] **Step 2: Hook `sync:needs_reauth` into the integrations panel**

In `IntegrationsPanel.tsx`, subscribe to the event. On receipt, display a toast (use the existing toast library — grep for `toast(` to find it) and invalidate the sync-status query so the UI reflects the broken connection:

```tsx
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent"; // or whatever the existing hook is

// inside the component:
const qc = useQueryClient();
useWebSocketEvent("sync:needs_reauth", (payload) => {
  const provider = payload.provider as string;
  toast.error(t`Please reconnect ${provider}: your authorization has expired.`);
  qc.invalidateQueries({ queryKey: ["sync-status"] });
});
```

Adapt to whatever ws hook/store already exists. If no hook exists, look for the pattern used by `scan:started` — that already works end to end.

- [ ] **Step 3: Visual verification**

Start dev server; trigger a `sync:needs_reauth` broadcast manually by revoking a test AniList token remotely, then push a watch-progress update. Confirm the toast fires and the Integrations card shows "disconnected" after the query invalidation.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/settings/IntegrationsPanel.tsx
git commit -m "feat(web): show toast on sync:needs_reauth ws event"
```

---

## Task 9: Full validation + PR

- [ ] **Step 1: Full build + test**

```bash
cd api && go build ./... && go vet ./... && go test -count=1 ./...
cd web && bunx tsc --noEmit 2>&1 | grep -v '@serwist\|baseUrl' | head -20
```

Expected: zero regressions. The baseline cleanup already fixed all existing failures.

- [ ] **Step 2: Manual end-to-end**

1. Connect AniList. Watch an episode → sync_outbox row processed → new watched entry on AniList.
2. Invalidate the access token (shorten expiry in provider admin, or wait it out in a dev env with a short lifetime).
3. Watch another episode. Worker logs should show a refresh round-trip and the second push succeeding. `sync_outbox` row should complete.
4. Revoke the refresh token remotely. Watch another episode. Worker logs show refresh failure, ws event fires, UI toast appears, Integrations card shows disconnected.

- [ ] **Step 3: PR**

```bash
gh pr create --title "feat: watch sync Phase B — token refresh" --body-file -
```

Reference the spec and plan.

---

## Self-review notes

- **Spec coverage:** Provider interface + OAuthCreds + RefreshedToken + ErrNeedsReauth ✓, AniList + Bangumi refresh ✓, TokenStore interface + SettingsTokenStore ✓, service constructor swap ✓, worker refresh-on-401 loop ✓, dead-letter + ws broadcast ✓, frontend toast ✓.
- **Known follow-ups not in scope:** proactive expiry refresh, refresh throttling, Trakt / MAL, UI token-expiry warning.
- **Concurrency note:** two simultaneous 401s for the same user both fire refresh; last-write-wins on the settings row. Acceptable per spec.
