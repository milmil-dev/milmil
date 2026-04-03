# Built-in Torrent Client — Design Document

**Date:** 2026-04-03  
**Status:** Approved  
**Goal:** Replace external aria2 Docker dependency with an embedded download engine for zero-config UX.

## Problem

aria2 runs as a separate Docker container. This causes:
- Path mismatch errors (host paths don't exist inside the container)
- Users must configure Docker volume mounts, RPC URLs, secrets
- Extra container to deploy and maintain

## Solution

Embed a download engine directly in the Go API server using `anacrolix/torrent` for BitTorrent and `net/http` for direct HTTP downloads.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Download Engine (Go, in-process)           │
│                                             │
│  ┌───────────────┐  ┌───────────────────┐   │
│  │ Torrent Client│  │ HTTP Downloader   │   │
│  │ (anacrolix)   │  │ (net/http)        │   │
│  └───────┬───────┘  └────────┬──────────┘   │
│          └────────┬──────────┘              │
│                   │                         │
│          ┌────────▼────────┐                │
│          │ DownloadManager │ ← unified API  │
│          └────────┬────────┘                │
│                   │                         │
└───────────────────┼─────────────────────────┘
                    │
            ┌───────▼───────┐
            │   SQLite DB   │ ← source of truth
            └───────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Engine | anacrolix/torrent + net/http | Zero-config, same process, same filesystem |
| Persistence | DB-driven (re-add on startup) | Single source of truth, no session files |
| Save location | Direct to library path | Eliminates download→library path mismatch |
| Seeding | Configurable (default ratio 1.0 / 60 min) | Good torrent citizen, matches old aria2 config |
| aria2 | Fully removed | No fallback needed |
| Migration | Automatic (re-add from stored URLs) | Existing downloads resume seamlessly |

## DownloadManager Interface

```go
package downloader

type Manager interface {
    Add(ctx context.Context, url string, opts AddOptions) (string, error)
    Pause(ctx context.Context, gid string) error
    Resume(ctx context.Context, gid string) error
    Remove(ctx context.Context, gid string, deleteFiles bool) error
    Status(ctx context.Context, gid string) (*Status, error)
    Files(ctx context.Context, gid string) ([]FileInfo, error)
    Start(ctx context.Context) error
    Stop() error
}

type AddOptions struct {
    SaveDir string
    Name    string
}

type Status struct {
    GID            string
    Name           string
    Status         string // active, paused, complete, error, waiting
    TotalBytes     int64
    CompletedBytes int64
    SpeedBytes     int64
    SaveDir        string
    Error          string
}

type FileInfo struct {
    Path     string
    Size     int64
    Complete int64
}
```

## Download Routing

```
magnet:?         → torrent client
*.torrent URL    → fetch file via HTTP, then torrent client
everything else  → HTTP downloader
```

## Torrent Client Config

```go
cfg := torrent.NewDefaultClientConfig()
cfg.Seed = true
cfg.ListenPort = 42069  // configurable via TORRENT_LISTEN_PORT
```

Seeding limits checked every 30s by background goroutine:
- `SEED_RATIO` — default 1.0
- `SEED_TIME_MINUTES` — default 60

## Resume on Startup

1. `Manager.Start()` queries DB: `SELECT * FROM downloads WHERE status IN ('active', 'paused', 'waiting')`
2. Re-adds each to torrent client using stored `url`
3. anacrolix checks existing files on disk, resumes from downloaded pieces
4. Paused downloads are added then immediately paused

## Sync Job Simplification

The `DownloadSyncWorker` (runs every 30s) simplifies to:
- For each active download, call `manager.Status(gid)`
- Persist updated bytes/speed to DB
- Detect completion → trigger library scan pipeline
- Detect errors → send notification

No more orphan discovery (manager owns all state).

## Files to Create

| File | Purpose |
|---|---|
| `internal/downloader/manager.go` | Manager interface + engine implementation |
| `internal/downloader/torrent.go` | anacrolix/torrent wrapper |
| `internal/downloader/http.go` | HTTP file downloader |

## Files to Modify

| File | Change |
|---|---|
| `config/config.go` | Remove Aria2 config, add Torrent config |
| `cmd/server/main.go` | Init Manager, call Start/Stop |
| `api/router.go` | Replace aria2.Client with Manager |
| `api/download_handler.go` | Swap aria2 calls to Manager |
| `api/subscribe_handler.go` | Same |
| `api/torrent_handler.go` | Same |
| `api/aria2_handler.go` | Delete, replace with downloader-status |
| `worker/download_sync_job.go` | Simplify to Manager.Status() polling |
| `worker/rss_refresh_job.go` | Swap aria2 calls to Manager |
| `worker/worker.go` | Replace aria2 field with Manager |

## Files to Delete

| File | Reason |
|---|---|
| `internal/integration/aria2/client.go` | Replaced |
| `internal/integration/aria2/types.go` | Replaced |
| `docker-compose.yml` aria2 service | No longer needed |
| `aria2-config/` directory | No longer needed |

## Frontend Changes

- Rename `system/aria2-status` → `system/downloader-status`
- Response: `{engine: "builtin", active: true}`
- All other API endpoints keep the same shape

## New Dependency

```
go get github.com/anacrolix/torrent
```
