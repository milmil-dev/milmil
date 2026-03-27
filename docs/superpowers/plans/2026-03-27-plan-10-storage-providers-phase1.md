# Library Storage Providers (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-protocol storage support (SMB, SFTP) to the library system with credential encryption, test connection, and a redesigned frontend form — while keeping existing local libraries backward-compatible.

**Architecture:** Introduce a `StorageProvider` interface that abstracts filesystem operations (`Walk`, `Stat`, `Open`). Refactor the scanner to use this interface. Add `source_type` and encrypted `source_config` columns to the libraries table. Frontend gets a source type selector with dynamic form fields per protocol.

**Tech Stack:** Go (echo, go-smb2, pkg/sftp, x/crypto), SQLite (sqlc), AES-256-GCM, React 19, TanStack Router/Query/Form, Tailwind CSS v4, Lingui v5

---

### Task 1: Credential Encryption Package

**Files:**
- Create: `api/internal/crypto/encrypt.go`
- Create: `api/internal/crypto/encrypt_test.go`

- [ ] **Step 1: Write the failing test**

```go
package crypto

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	key := DeriveKey("test-secret-key-1234567890abcdef")
	plaintext := `{"host":"192.168.1.100","username":"user","password":"pass"}`

	encrypted, err := Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}
	if encrypted == plaintext {
		t.Fatal("encrypted should differ from plaintext")
	}

	decrypted, err := Decrypt(key, encrypted)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}
	if decrypted != plaintext {
		t.Fatalf("want %q, got %q", plaintext, decrypted)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := DeriveKey("key-one-1234567890abcdef12345678")
	key2 := DeriveKey("key-two-1234567890abcdef12345678")

	encrypted, _ := Encrypt(key1, "secret")
	_, err := Decrypt(key2, encrypted)
	if err == nil {
		t.Fatal("should fail with wrong key")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && go test ./internal/crypto/ -v`
Expected: FAIL — package doesn't exist

- [ ] **Step 3: Write minimal implementation**

```go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
)

// DeriveKey creates a 32-byte AES-256 key from an arbitrary string.
func DeriveKey(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// Encrypt encrypts plaintext using AES-256-GCM and returns base64-encoded ciphertext.
func Encrypt(key []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt decrypts base64-encoded AES-256-GCM ciphertext.
func Decrypt(key []byte, encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aead.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	plaintext, err := aead.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return "", fmt.Errorf("decrypt failed: %w", err)
	}
	return string(plaintext), nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && go test ./internal/crypto/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/crypto/
git commit -m "feat(api): add AES-256-GCM credential encryption package"
```

---

### Task 2: Database Migration — Add source_type and source_config

**Files:**
- Create: `api/migrations/000016_library_source_type.up.sql`
- Create: `api/migrations/000016_library_source_type.down.sql`
- Modify: `api/internal/store/queries/libraries.sql`
- Regenerate: `api/internal/store/` (sqlc)

- [ ] **Step 1: Create migration files**

Up migration:
```sql
ALTER TABLE libraries ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local';
ALTER TABLE libraries ADD COLUMN source_config_encrypted TEXT;
```

Down migration:
```sql
ALTER TABLE libraries DROP COLUMN source_type;
ALTER TABLE libraries DROP COLUMN source_config_encrypted;
```

- [ ] **Step 2: Update SQL queries**

Update `CreateLibrary` to include new columns:
```sql
-- name: CreateLibrary :one
INSERT INTO libraries (id, name, path, enabled, scan_interval_minutes, source_type, source_config_encrypted, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
RETURNING *;
```

Update `UpdateLibrary` to include new columns:
```sql
-- name: UpdateLibrary :one
UPDATE libraries
SET name = ?, path = ?, enabled = ?, scan_interval_minutes = ?,
    source_type = ?, source_config_encrypted = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = ?
RETURNING *;
```

- [ ] **Step 3: Regenerate sqlc**

Run: `cd api && sqlc generate`

- [ ] **Step 4: Fix any compilation errors from new fields**

Update `library_handler.go` create/update calls to pass the new params:
- `CreateLibraryParams` now needs `SourceType` and `SourceConfigEncrypted`
- `UpdateLibraryParams` now needs same
- For backward compat, default `SourceType` to `"local"` and `SourceConfigEncrypted` to `sql.NullString{}`

- [ ] **Step 5: Verify build and existing tests pass**

Run: `cd api && go build ./... && go test ./...`

- [ ] **Step 6: Commit**

```bash
git add api/migrations/ api/internal/store/
git commit -m "feat(api): add source_type and source_config_encrypted to libraries"
```

---

### Task 3: StorageProvider Interface + LocalProvider

**Files:**
- Create: `api/internal/storage/provider.go`
- Create: `api/internal/storage/local.go`
- Create: `api/internal/storage/local_test.go`
- Create: `api/internal/storage/factory.go`

- [ ] **Step 1: Write the interface and LocalProvider**

`provider.go`:
```go
package storage

import (
	"io"
	"os"
	"path/filepath"
)

type Provider interface {
	Walk(root string, fn filepath.WalkFunc) error
	Stat(path string) (os.FileInfo, error)
	Open(path string) (io.ReadCloser, error)
	Close() error
}
```

`local.go`:
```go
package storage

import (
	"io"
	"os"
	"path/filepath"
)

type LocalProvider struct{}

func NewLocalProvider() *LocalProvider { return &LocalProvider{} }

func (p *LocalProvider) Walk(root string, fn filepath.WalkFunc) error {
	return filepath.Walk(root, fn)
}

func (p *LocalProvider) Stat(path string) (os.FileInfo, error) {
	return os.Stat(path)
}

func (p *LocalProvider) Open(path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (p *LocalProvider) Close() error { return nil }
```

- [ ] **Step 2: Write LocalProvider test**

```go
package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocalProvider_Walk(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.mkv"), []byte("video"), 0644)

	p := NewLocalProvider()
	defer p.Close()

	var found []string
	err := p.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() { return err }
		found = append(found, info.Name())
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0] != "test.mkv" {
		t.Fatalf("expected [test.mkv], got %v", found)
	}
}
```

- [ ] **Step 3: Write factory**

`factory.go`:
```go
package storage

import (
	"encoding/json"
	"fmt"
)

func NewProvider(sourceType string, configJSON string) (Provider, error) {
	switch sourceType {
	case "local", "":
		return NewLocalProvider(), nil
	case "smb":
		var cfg SMBConfig
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return nil, fmt.Errorf("invalid smb config: %w", err)
		}
		return NewSMBProvider(cfg)
	case "sftp":
		var cfg SFTPConfig
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return nil, fmt.Errorf("invalid sftp config: %w", err)
		}
		return NewSFTPProvider(cfg)
	default:
		return nil, fmt.Errorf("unsupported source type: %s", sourceType)
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd api && go test ./internal/storage/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/internal/storage/
git commit -m "feat(api): add StorageProvider interface with LocalProvider"
```

---

### Task 4: SMB Provider

**Files:**
- Create: `api/internal/storage/smb.go`
- Create: `api/internal/storage/smb_test.go`

- [ ] **Step 1: Add go-smb2 dependency**

Run: `cd api && go get github.com/hirochachacha/go-smb2`

- [ ] **Step 2: Implement SMBProvider**

```go
package storage

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/hirochachacha/go-smb2"
)

type SMBConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Share    string `json:"share"`
	Username string `json:"username"`
	Password string `json:"password"`
	Domain   string `json:"domain"`
}

type SMBProvider struct {
	conn    net.Conn
	session *smb2.Session
	share   *smb2.Share
}

func NewSMBProvider(cfg SMBConfig) (*SMBProvider, error) {
	port := cfg.Port
	if port == 0 { port = 445 }
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", cfg.Host, port))
	if err != nil {
		return nil, fmt.Errorf("smb connect: %w", err)
	}
	d := &smb2.Dialer{
		Initiator: &smb2.NTLMInitiator{
			User:     cfg.Username,
			Password: cfg.Password,
			Domain:   cfg.Domain,
		},
	}
	sess, err := d.Dial(conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("smb auth: %w", err)
	}
	share, err := sess.Mount(cfg.Share)
	if err != nil {
		sess.Logoff()
		conn.Close()
		return nil, fmt.Errorf("smb mount %q: %w", cfg.Share, err)
	}
	return &SMBProvider{conn: conn, session: sess, share: share}, nil
}

func (p *SMBProvider) Walk(root string, fn filepath.WalkFunc) error {
	return p.walk(root, fn)
}

func (p *SMBProvider) walk(dir string, fn filepath.WalkFunc) error {
	entries, err := p.share.ReadDir(dir)
	if err != nil {
		return fn(dir, nil, err)
	}
	for _, entry := range entries {
		path := dir + "/" + entry.Name()
		if strings.HasPrefix(path, "/") { path = path[1:] }
		fullPath := dir + "/" + entry.Name()
		if err := fn(fullPath, entry, nil); err != nil {
			return err
		}
		if entry.IsDir() {
			if err := p.walk(fullPath, fn); err != nil {
				return err
			}
		}
	}
	return nil
}

func (p *SMBProvider) Stat(path string) (os.FileInfo, error) {
	return p.share.Stat(path)
}

func (p *SMBProvider) Open(path string) (io.ReadCloser, error) {
	return p.share.Open(path)
}

func (p *SMBProvider) Close() error {
	if p.share != nil { p.share.Umount() }
	if p.session != nil { p.session.Logoff() }
	if p.conn != nil { p.conn.Close() }
	return nil
}
```

- [ ] **Step 3: Write unit test (connection test skipped without real SMB server)**

```go
package storage

import "testing"

func TestSMBConfig_Defaults(t *testing.T) {
	cfg := SMBConfig{Host: "192.168.1.1", Share: "media", Username: "user", Password: "pass"}
	if cfg.Port != 0 {
		t.Fatal("default port should be 0 (resolved to 445 in constructor)")
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add api/internal/storage/smb.go api/internal/storage/smb_test.go api/go.mod api/go.sum
git commit -m "feat(api): add SMB storage provider"
```

---

### Task 5: SFTP Provider

**Files:**
- Create: `api/internal/storage/sftp.go`
- Create: `api/internal/storage/sftp_test.go`

- [ ] **Step 1: Add sftp dependency**

Run: `cd api && go get github.com/pkg/sftp golang.org/x/crypto`

- [ ] **Step 2: Implement SFTPProvider**

```go
package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	PrivateKey string `json:"private_key"`
}

type SFTPProvider struct {
	sshClient  *ssh.Client
	sftpClient *sftp.Client
}

func NewSFTPProvider(cfg SFTPConfig) (*SFTPProvider, error) {
	port := cfg.Port
	if port == 0 { port = 22 }

	var authMethods []ssh.AuthMethod
	if cfg.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(cfg.PrivateKey))
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if cfg.Password != "" {
		authMethods = append(authMethods, ssh.Password(cfg.Password))
	}

	sshCfg := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", cfg.Host, port), sshCfg)
	if err != nil {
		return nil, fmt.Errorf("ssh connect: %w", err)
	}
	sc, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("sftp client: %w", err)
	}
	return &SFTPProvider{sshClient: client, sftpClient: sc}, nil
}

func (p *SFTPProvider) Walk(root string, fn filepath.WalkFunc) error {
	walker := p.sftpClient.Walk(root)
	for walker.Step() {
		if err := walker.Err(); err != nil {
			continue
		}
		if err := fn(walker.Path(), walker.Stat(), nil); err != nil {
			return err
		}
	}
	return nil
}

func (p *SFTPProvider) Stat(path string) (os.FileInfo, error) {
	return p.sftpClient.Stat(path)
}

func (p *SFTPProvider) Open(path string) (io.ReadCloser, error) {
	return p.sftpClient.Open(path)
}

func (p *SFTPProvider) Close() error {
	if p.sftpClient != nil { p.sftpClient.Close() }
	if p.sshClient != nil { p.sshClient.Close() }
	return nil
}
```

- [ ] **Step 3: Commit**

```bash
git add api/internal/storage/sftp.go api/internal/storage/sftp_test.go api/go.mod api/go.sum
git commit -m "feat(api): add SFTP storage provider"
```

---

### Task 6: Refactor Scanner to Use StorageProvider

**Files:**
- Modify: `api/internal/scanner/scanner.go`
- Modify: `api/internal/scanner/hash.go` (if exists)
- Modify: `api/internal/api/library_handler.go`

- [ ] **Step 1: Update Scanner struct to accept Provider**

Change the `Scanner` struct:
```go
type Scanner struct {
	queries         *store.Queries
	providerFactory func(sourceType, configJSON string) (storage.Provider, error)
}

func New(queries *store.Queries) *Scanner {
	return &Scanner{
		queries:         queries,
		providerFactory: storage.NewProvider,
	}
}
```

- [ ] **Step 2: Replace filepath.Walk with provider.Walk in ScanLibrary**

In `ScanLibrary`:
```go
func (s *Scanner) ScanLibrary(ctx context.Context, library store.Library) error {
	// Create storage provider
	configJSON := ""
	if library.SourceConfigEncrypted.Valid {
		// Decrypt happens in the handler before calling scan — configJSON is passed in
		configJSON = library.SourceConfigEncrypted.String
	}
	provider, err := s.providerFactory(library.SourceType, configJSON)
	if err != nil {
		return fmt.Errorf("create storage provider: %w", err)
	}
	defer provider.Close()

	// ... rest of scan logic using provider.Walk instead of filepath.Walk
```

Replace `filepath.Walk(library.Path, ...)` with `provider.Walk(library.Path, ...)`

Replace `ComputeFileHash(path)` to use `provider.Open(path)` instead of `os.Open(path)`.

- [ ] **Step 3: Update library_handler.go — decrypt config before scanning**

In `handleScanLibrary`, decrypt the config before passing to scanner:
```go
configJSON := ""
if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
	decrypted, err := crypto.Decrypt(h.encryptionKey, lib.SourceConfigEncrypted.String)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to decrypt config")
	}
	configJSON = decrypted
}
```

Pass `configJSON` to the scanner (add it to a new `ScanLibraryWithConfig` method or store decrypted config in the library struct temporarily).

- [ ] **Step 4: Verify existing local scans still work**

Run: `cd api && go test ./internal/scanner/ -v`
Run: `cd api && go test ./internal/api/ -v`

- [ ] **Step 5: Commit**

```bash
git add api/internal/scanner/ api/internal/api/library_handler.go
git commit -m "refactor(api): scanner uses StorageProvider interface"
```

---

### Task 7: API — Create/Update Library with source_type + Test Connection

**Files:**
- Modify: `api/internal/api/library_handler.go`
- Modify: `api/internal/api/router.go`
- Create: `api/internal/api/library_handler_test.go` (extend)

- [ ] **Step 1: Update request types**

```go
type createLibraryRequest struct {
	Name                string                 `json:"name"`
	Path                string                 `json:"path"`
	SourceType          string                 `json:"source_type"`
	SourceConfig        map[string]interface{} `json:"source_config"`
	ScanIntervalMinutes int64                  `json:"scan_interval_minutes"`
}
```

- [ ] **Step 2: Update handleCreateLibrary — encrypt config, validate by source type**

For `local` type: validate path with `os.Stat()` (current behavior).
For `smb`/`sftp`: encrypt `source_config` JSON and store in `source_config_encrypted`.
Skip `os.Stat()` for non-local types.

- [ ] **Step 3: Add test connection endpoint**

```go
type testConnectionRequest struct {
	SourceType   string                 `json:"source_type"`
	SourceConfig map[string]interface{} `json:"source_config"`
	Path         string                 `json:"path"`
}

func (h *handler) handleTestConnection(c echo.Context) error {
	var req testConnectionRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	configJSON, _ := json.Marshal(req.SourceConfig)
	provider, err := storage.NewProvider(req.SourceType, string(configJSON))
	if err != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": err.Error()})
	}
	defer provider.Close()
	_, statErr := provider.Stat(req.Path)
	if statErr != nil {
		return c.JSON(http.StatusOK, map[string]interface{}{"ok": false, "error": statErr.Error()})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"ok": true})
}
```

- [ ] **Step 4: Register route**

Add to `router.go`:
```go
libraries.POST("/test-connection", h.handleTestConnection)
```

- [ ] **Step 5: Verify**

Run: `cd api && go build ./... && go test ./internal/api/ -v`

- [ ] **Step 6: Commit**

```bash
git add api/internal/api/
git commit -m "feat(api): create library with source_type + test connection endpoint"
```

---

### Task 8: Frontend — Source Type Selector + Dynamic Form

**Files:**
- Modify: `web/src/lib/api/library.ts`
- Modify: `web/src/pages/LibrariesPage.tsx`

- [ ] **Step 1: Update API types**

```typescript
export type SourceType = 'local' | 'smb' | 'sftp';

export interface CreateLibraryInput {
  name: string;
  path: string;
  source_type?: SourceType;
  source_config?: Record<string, unknown>;
  scan_interval_minutes?: number;
}

export interface Library {
  // ... existing fields ...
  source_type: string;
}

// Add test connection API
export const libraryApi = {
  // ... existing ...
  testConnection: (data: { source_type: string; source_config: Record<string, unknown>; path: string }) =>
    api.post<{ ok: boolean; error?: string }>('/api/v1/libraries/test-connection', data),
};
```

- [ ] **Step 2: Build source type config map**

```typescript
const SOURCE_TYPE_FIELDS: Record<SourceType, { label: string; fields: Array<{ key: string; label: string; type: 'text' | 'password' | 'number'; placeholder: string; required?: boolean }> }> = {
  local: { label: 'Local', fields: [] },
  smb: {
    label: 'SMB / CIFS',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: '192.168.1.100', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '445' },
      { key: 'share', label: 'Share', type: 'text', placeholder: 'media', required: true },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'user', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: '', required: true },
      { key: 'domain', label: 'Domain', type: 'text', placeholder: '' },
    ],
  },
  sftp: {
    label: 'SFTP',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: '192.168.1.100', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '22' },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'user', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: '' },
    ],
  },
};
```

- [ ] **Step 3: Redesign LibraryForm with source type selector**

Add a source type selector at the top of the form (grid of cards/buttons):
```tsx
<div className="grid grid-cols-3 gap-2 mb-4">
  {(['local', 'smb', 'sftp'] as SourceType[]).map((type) => (
    <button
      key={type}
      type="button"
      onClick={() => setSourceType(type)}
      className={cn(
        'px-3 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer',
        sourceType === type ? 'bg-mm-accent text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'
      )}
    >
      {SOURCE_TYPE_FIELDS[type].label}
    </button>
  ))}
</div>
```

Render dynamic fields based on selected type.

- [ ] **Step 4: Add Test Connection button**

After the form fields, before submit:
```tsx
<button
  type="button"
  onClick={handleTestConnection}
  className="text-[12px] text-mm-accent hover:text-mm-accent/80 transition-colors cursor-pointer"
>
  Test Connection
</button>
```

Shows ✓ or ✗ result inline.

- [ ] **Step 5: Add source type badge to library cards**

Show a small badge on each library card indicating its source type (e.g., "SMB", "SFTP", "Local").

- [ ] **Step 6: Add i18n keys for all new labels**

Add to all 3 locale files:
- `library.sourceType.local` → 本機 / 本机 / Local
- `library.sourceType.smb` → SMB / CIFS
- `library.sourceType.sftp` → SFTP
- `library.testConnection` → 測試連線 / 测试连接 / Test Connection
- `library.testConnection.success` → 連線成功 / 连接成功 / Connected
- `library.testConnection.failed` → 連線失敗 / 连接失败 / Connection failed

Run: `cd web && bun run i18n:extract && bun run i18n:compile`

- [ ] **Step 7: Verify**

Run: `cd web && bun run typecheck && bun vitest run && bun run build`

- [ ] **Step 8: Commit**

```bash
git add web/src/
git commit -m "feat(web): source type selector + dynamic form + test connection"
```

---

### Task 9: Verify Full Flow + Final Checks

**Files:**
- All modified files

- [ ] **Step 1: Run all backend tests**

Run: `cd api && go test ./... -v`

- [ ] **Step 2: Run all frontend checks**

Run: `cd web && bun run typecheck && bun vitest run && bun run lint && bun run build`

- [ ] **Step 3: Manual verification checklist**

- [ ] Create a local library — works as before
- [ ] Create library form shows source type selector
- [ ] Selecting SMB shows host/port/share/username/password fields
- [ ] Selecting SFTP shows host/port/username/password fields
- [ ] Test Connection button works for local paths
- [ ] Library cards show source type badge
- [ ] Existing libraries still scan correctly

- [ ] **Step 4: Commit final cleanup**

```bash
git add -A
git commit -m "feat: library storage providers Phase 1 — SMB, SFTP, local"
```
