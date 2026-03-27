# Library Storage Providers Design

**Date:** 2026-03-27
**Area:** `api/`, `web/`
**Status:** Draft

## Goal

Extend milmil's library system to support multiple storage backends (SMB, SFTP, FTP, NFS, WebDAV, S3) and media server imports (Plex, Jellyfin, Emby) beyond the current local filesystem-only approach.

## Architecture

### StorageProvider Interface

All file operations go through an abstract interface:

```go
type StorageProvider interface {
    Walk(root string, fn filepath.WalkFunc) error
    Stat(path string) (os.FileInfo, error)
    Open(path string) (io.ReadCloser, error)
    Close() error
}
```

Implementations:
- `LocalProvider` — current `filepath.Walk` / `os.Open` (default)
- `SMBProvider` — `github.com/hirochachacha/go-smb2`
- `SFTPProvider` — `github.com/pkg/sftp` + `golang.org/x/crypto/ssh`
- `FTPProvider` — `github.com/jlaffaye/ftp`
- `NFSProvider` — `github.com/vmware/go-nfs-client`
- `WebDAVProvider` — `github.com/studio-b12/gowebdav`
- `S3Provider` — `github.com/aws/aws-sdk-go-v2`

### Media Server Importers

Separate from StorageProvider — these import catalog metadata via API, not scan files:

```go
type MediaServerImporter interface {
    TestConnection() error
    ListLibraries() ([]ImportableLibrary, error)
    ImportLibrary(libraryID string) ([]ImportedMedia, error)
}
```

Implementations:
- `PlexImporter` — Plex Media Server API (`/library/sections`)
- `JellyfinImporter` — Jellyfin REST API (`/Library/VirtualFolders`)
- `EmbyImporter` — Emby REST API (similar to Jellyfin)

### Database Changes

**Migration: `000010_library_source_type.up.sql`**

```sql
ALTER TABLE libraries ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local';
ALTER TABLE libraries ADD COLUMN source_config_encrypted TEXT;
```

**Source types:** `local`, `smb`, `sftp`, `ftp`, `nfs`, `webdav`, `s3`, `plex`, `jellyfin`, `emby`

**`source_config_encrypted`** stores AES-256-GCM encrypted JSON with connection details per type:

| Source Type | Config Fields |
|-------------|--------------|
| local | `{}` (uses `path` field) |
| smb | `host, port, share, username, password, domain` |
| sftp | `host, port, username, password, private_key` |
| ftp | `host, port, username, password, tls` |
| nfs | `host, export_path` |
| webdav | `url, username, password` |
| s3 | `endpoint, bucket, region, access_key, secret_key, prefix` |
| plex | `url, token` |
| jellyfin | `url, api_key, user_id` |
| emby | `url, api_key, user_id` |

### Credential Encryption

- AES-256-GCM encryption using a server-level key
- Key derived from `MILMIL_ENCRYPTION_KEY` env var (or auto-generated and stored in data dir on first run)
- Encrypted at write, decrypted at read — never stored in plaintext
- New package: `api/internal/crypto/encrypt.go`

### Scanner Changes

`scanner.go` currently uses `filepath.Walk()` and `os.Stat()` directly. Changes:

1. `Scanner` struct gains a `providerFactory` function
2. On scan start, create the appropriate `StorageProvider` from `library.SourceType` + decrypted config
3. Replace `filepath.Walk()` with `provider.Walk()`
4. Replace `os.Stat()` with `provider.Stat()`
5. Replace `os.Open()` (for hashing) with `provider.Open()`
6. `Close()` provider after scan completes

For media server imports (plex/jellyfin/emby), scanning is replaced entirely by the importer flow — no filesystem walk.

### API Changes

**Create Library** (`POST /api/v1/libraries`):

```json
{
  "name": "Anime NAS",
  "path": "/anime",
  "source_type": "smb",
  "source_config": {
    "host": "192.168.1.100",
    "share": "media",
    "username": "user",
    "password": "pass"
  },
  "scan_interval_minutes": 60
}
```

- `source_config` is received as plaintext JSON, encrypted before storage
- `path` is the root path within the storage (e.g., `/anime` inside the SMB share)
- For `local` type, behavior is unchanged (backward compatible)

**New endpoint: Test Connection** (`POST /api/v1/libraries/test-connection`):

```json
{
  "source_type": "smb",
  "source_config": { "host": "192.168.1.100", "share": "media", ... },
  "path": "/anime"
}
```

Returns `{ "ok": true }` or `{ "ok": false, "error": "connection refused" }`

**New endpoint: Plex/Jellyfin Libraries** (`POST /api/v1/import/libraries`):

```json
{
  "source_type": "plex",
  "source_config": { "url": "http://localhost:32400", "token": "..." }
}
```

Returns available libraries from the media server for the user to select.

### Frontend Changes

**Add Library Modal** redesign:

1. **Source type selector** — grid of icons/cards: Local, SMB, SFTP, FTP, NFS, WebDAV, S3, Plex, Jellyfin, Emby
2. **Dynamic form** — fields change based on selected source type
3. **Test Connection button** — validates settings before saving
4. **For media servers** — shows available libraries to import after connection test

**Library card** — shows source type icon/badge so user can distinguish local vs network vs imported

### Error Handling

- Connection failures: show clear error with troubleshooting hints (firewall, credentials, hostname)
- Scan failures on network storage: retry with exponential backoff, mark library as errored after 3 failures
- Credential errors: prompt to re-enter, don't expose encrypted data

### Phases

**Phase 1: Foundation + SMB/SFTP**
- StorageProvider interface
- LocalProvider (refactor existing code)
- SMBProvider, SFTPProvider
- Credential encryption
- Database migration
- Frontend source type selector + dynamic form
- Test connection endpoint

**Phase 2: Remaining protocols**
- FTPProvider, NFSProvider, WebDAVProvider, S3Provider
- Frontend form fields for each

**Phase 3: Media server imports**
- PlexImporter, JellyfinImporter, EmbyImporter
- Import flow UI (select libraries, preview, import)
- Imported libraries show source attribution

## Success Criteria

- Existing local libraries continue to work unchanged (backward compatible)
- User can add an SMB share and scan it for anime files
- Credentials are encrypted at rest
- Test connection gives immediate feedback
- Frontend clearly shows what type each library is
- Plex/Jellyfin users can import their existing libraries
