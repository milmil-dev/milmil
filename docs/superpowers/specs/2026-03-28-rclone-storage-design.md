# Rclone Storage Integration — Design Spec

## Goal

Replace milmil's separate SMB and SFTP storage implementations with a unified rclone-based storage backend. This enables support for 10+ storage sources (WebDAV, S3, FTP, HTTP, Google Drive, OneDrive, Dropbox) while reducing code maintenance from multiple protocol implementations to one.

## Architecture

### Storage Provider Layer

Import `github.com/rclone/rclone` as a Go library. Use its `fs.Fs` interface and `vfs.VFS` to implement milmil's existing `storage.Provider` interface.

**Provider mapping:**
- `local` → existing `LocalProvider` (no rclone, direct filesystem)
- All other source types → new `RcloneProvider` wrapping rclone VFS

**Files affected:**
- Delete: `storage/smb.go`, `storage/sftp.go`
- Create: `storage/rclone.go`
- Modify: `storage/factory.go`
- Keep: `storage/local.go`, `storage/provider.go` (interface unchanged)

### RcloneProvider Implementation

```go
// storage/rclone.go
type RcloneProvider struct {
    vfs *vfs.VFS
}

func NewRcloneProvider(sourceType string, configJSON string) (*RcloneProvider, error)
func (p *RcloneProvider) Walk(root string, fn filepath.WalkFunc) error
func (p *RcloneProvider) Stat(path string) (os.FileInfo, error)
func (p *RcloneProvider) Open(path string) (io.ReadCloser, error)
func (p *RcloneProvider) Close() error
```

**Config mapping:** `NewRcloneProvider` takes milmil's source_config JSON and programmatically creates an rclone `fs.Fs` without needing a rclone.conf file. Each source type maps to rclone config parameters:

| milmil source_config field | rclone config parameter |
|---|---|
| `host` | `host` |
| `port` | `port` |
| `username` | `user` |
| `password` | `pass` |
| `endpoint` | `endpoint` |
| `bucket` | (path prefix) |
| etc. | etc. |

For OAuth backends (gdrive, onedrive, dropbox): reads the named remote from the user's `~/.config/rclone/rclone.conf` file.

### Factory Update

```go
// storage/factory.go
func NewProvider(sourceType string, configJSON string) (Provider, error) {
    if sourceType == "local" {
        return NewLocalProvider(), nil
    }
    return NewRcloneProvider(sourceType, configJSON)
}
```

## Supported Source Types

### Credential-based (configured directly in milmil UI)

| Source Type | Display Name | Config Fields | Rclone Backend |
|---|---|---|---|
| `local` | Local Filesystem | path | N/A (direct) |
| `smb` | Network Share (SMB) | host, port, share, username, password, domain | `smb` |
| `sftp` | Remote Server (SFTP) | host, port, username, password | `sftp` |
| `webdav` | WebDAV | url, username, password, vendor | `webdav` |
| `s3` | S3 / MinIO | endpoint, bucket, access_key, secret_key, region | `s3` |
| `ftp` | FTP | host, port, username, password | `ftp` |
| `http` | HTTP (read-only) | url | `http` |

### OAuth-based (imported from rclone config)

| Source Type | Display Name | Config Method | Rclone Backend |
|---|---|---|---|
| `gdrive` | Google Drive | rclone remote name import | `drive` |
| `onedrive` | OneDrive | rclone remote name import | `onedrive` |
| `dropbox` | Dropbox | rclone remote name import | `dropbox` |

OAuth backends require the user to run `rclone config` separately to set up the remote with OAuth tokens. Milmil then references the remote by name.

## Backend Changes

### New Endpoints

None — existing library CRUD endpoints handle all source types. The `source_type` field accepts the new values, and `source_config` carries the type-specific configuration.

### Database

No schema changes needed. The `source_type` column is TEXT (no enum constraint) and `source_config_encrypted` stores arbitrary JSON. New source types are automatically supported.

### Test Connection

The existing `POST /api/v1/libraries/test-connection` endpoint works for all source types by creating a temporary `RcloneProvider` and calling `Stat(".")` on the configured path.

### mDNS Network Discovery

Stays as-is — only used for SMB in the Add Library wizard. Independent of the storage layer.

## Frontend Changes

### Add Library Wizard — Step 1 (Source Selection)

Expand from 3 cards to grouped sections:

**Storage**
- Local Filesystem — Scan a folder on this server
- Network Share (SMB) — Connect to a Windows or NAS share
- Remote Server (SFTP) — Connect via SSH file transfer
- FTP — Connect to an FTP server
- HTTP — Read-only access via URL

**Cloud & WebDAV**
- WebDAV — Connect to Nextcloud, OwnCloud, or WebDAV server
- S3 — Amazon S3, MinIO, Backblaze B2, or compatible

**Import from Rclone**
- Google Drive — Import configured rclone remote
- OneDrive — Import configured rclone remote
- Dropbox — Import configured rclone remote

### Step 2 — Dynamic Form Fields

Each source type shows its specific fields:

**WebDAV:**
- URL (text, placeholder: `https://nextcloud.example.com/remote.php/dav/files/user/`)
- Vendor (dropdown: Nextcloud / OwnCloud / Other)
- Username (text)
- Password (password)

**S3:**
- Endpoint URL (text, placeholder: `https://s3.amazonaws.com` or `https://minio.local:9000`)
- Bucket (text)
- Region (text, placeholder: `us-east-1`)
- Access Key (text)
- Secret Key (password)

**FTP:**
- Host (text)
- Port (number, default: 21)
- Username (text)
- Password (password)

**HTTP:**
- URL (text, placeholder: `https://example.com/media/`)

**Rclone import (gdrive/onedrive/dropbox):**
- Remote Name (text, placeholder: `my-gdrive`)
- Help text: "Run `rclone config` in terminal to set up the remote first"
- Optional: show detected rclone remotes if rclone.conf exists

### API Types

```typescript
type SourceType =
  | 'local' | 'smb' | 'sftp'
  | 'webdav' | 's3' | 'ftp' | 'http'
  | 'gdrive' | 'onedrive' | 'dropbox';
```

Source config interfaces already use `Record<string, unknown>` so no type changes needed for the API layer.

### i18n Keys

New translation keys needed for each source type name, description, and form field labels (en, zh-Hant, zh-Hans).

## Implementation Order

1. **Go library setup**: `go get github.com/rclone/rclone`, create `storage/rclone.go` with Provider implementation using rclone VFS
2. **Migrate SMB/SFTP**: Route SMB and SFTP through RcloneProvider, verify existing tests pass, delete `smb.go` and `sftp.go`
3. **Add new backends**: WebDAV, S3, FTP, HTTP support in RcloneProvider config mapping
4. **Rclone config import**: Add support for reading rclone.conf remotes for OAuth backends (gdrive, onedrive, dropbox). Add `GET /api/v1/rclone/remotes` endpoint to list available remotes.
5. **Frontend wizard**: Expand source type cards with sections, add dynamic form fields per type
6. **i18n**: Add all new translation keys
7. **Integration test**: Test with SMB share at 192.168.50.203, verify scan works through rclone backend

## Risks

- **Binary size**: rclone as a Go dependency adds ~50MB to the binary. Acceptable for a media server.
- **Rclone API stability**: rclone's internal Go API is not versioned for external consumers. Pin to a specific release tag and test on upgrades.
- **OAuth token refresh**: Rclone handles token refresh internally when using rclone.conf, but tokens can expire if the server is offline for extended periods. Surface clear error messages when re-auth is needed.
- **Performance**: Rclone VFS adds a layer of abstraction. For local-network protocols (SMB, SFTP), performance should be comparable. For cloud backends, scan speed depends on API rate limits.
