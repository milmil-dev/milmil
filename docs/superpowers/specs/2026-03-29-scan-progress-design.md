# Real-Time Scan Progress — Design Spec

## Goal

Add real-time scan progress feedback so users can see what's happening during library scans — files found, matching status, errors — instead of staring at a spinning indicator for minutes.

## Architecture

### Backend: WebSocket Events

The backend already has a `ws.Hub` for broadcasting events. Extend it to broadcast scan progress events during library scanning.

**Event types:**

```json
// Scan started
{ "type": "scan:started", "library_id": "xxx", "library_name": "Anime" }

// File discovery progress (every 10 files or every 2 seconds)
{ "type": "scan:progress", "library_id": "xxx", "files_found": 42, "current_path": "Jigokuraku S01E05.mkv" }

// File hash computed
{ "type": "scan:hash", "library_id": "xxx", "file": "Jigokuraku S01E05.mkv", "files_hashed": 15, "files_total": 42 }

// Auto-match progress
{ "type": "match:progress", "library_id": "xxx", "file": "Jigokuraku S01E05.mkv", "matched_to": "地獄樂 EP05", "files_matched": 8, "files_total": 42 }

// Scan completed
{ "type": "scan:completed", "library_id": "xxx", "files_found": 276, "files_matched": 180, "files_unmatched": 96, "duration_seconds": 45 }

// Scan error
{ "type": "scan:error", "library_id": "xxx", "error": "connection timeout", "file": "path/to/file.mkv" }
```

**Implementation locations:**
- `scanner/scanner.go` — emit `scan:started`, `scan:progress`, `scan:completed`, `scan:error`
- `scanner/hash.go` — emit `scan:hash` during file hash computation
- `matcher/matcher.go` — emit `match:progress` during auto-matching

The scanner already has access to `wsHub` via the handler chain. Pass it through or use a progress callback interface.

### Backend: Make Scan Async

Currently `POST /libraries/:id/scan` blocks until the scan completes. Change to:
1. Start scan in a goroutine
2. Return `202 Accepted` immediately with `{ "scan_id": "xxx" }`
3. Progress is streamed via WebSocket
4. Scan completion event includes summary

This fixes the HTTP timeout issue for large SMB libraries.

### Frontend: WebSocket Client

Create a `useWebSocket` hook that connects to `ws://localhost:8080/ws` and receives events.

```typescript
// hooks/use-scan-progress.ts
function useScanProgress(libraryId?: string) {
  // Connects to WebSocket, filters events by library_id
  // Returns: { scanning: boolean, progress: ScanProgress | null }
}
```

**ScanProgress type:**
```typescript
interface ScanProgress {
  library_id: string;
  phase: 'scanning' | 'hashing' | 'matching' | 'completed' | 'error';
  files_found: number;
  files_hashed: number;
  files_matched: number;
  files_total: number;
  current_file: string;
  matched_anime?: string;
  error?: string;
  duration_seconds?: number;
}
```

### Frontend: Progress UI

**Library list page — per-card progress:**
- When a library is scanning, the card shows a progress section instead of the hover overlay:
  - Phase indicator: "Scanning files..." / "Computing hashes..." / "Matching..."
  - File count: "142 / 276 files"
  - Current file name (truncated)
  - Thin progress bar at bottom (based on files_found/estimated or files_matched/total)

**Library detail page — progress banner:**
- Full-width banner below the header when scanning:
  - Phase + progress bar
  - Current file being processed
  - Live updating stats (files found, matched, unmatched)
  - Cancel button (optional, v2)

**"Scan All" on library list page:**
- Button in the header: "Scan All"
- Triggers sequential scan for each library
- Each card shows its individual progress
- Overall progress: "Scanning 2/5 libraries..."

### Library List Page: Bulk Actions

Move scan/match actions to the list page header:
- **Scan All** — scans all libraries sequentially, shows per-card progress
- **Scan** button on each card (already exists in hover overlay, keep it)

## Implementation Order

1. Backend: Make scan async (return 202, run in goroutine)
2. Backend: Add progress events to scanner/matcher with wsHub.Broadcast
3. Frontend: WebSocket hook (useWebSocket, useScanProgress)
4. Frontend: Progress UI on library cards
5. Frontend: Progress banner on detail page
6. Frontend: "Scan All" button on list page
7. i18n for progress messages

## WebSocket Connection

The backend already has a WebSocket endpoint. Check:
- `api/internal/ws/` — WebSocket hub implementation
- `api/internal/api/router.go` — WS route registration

The frontend needs to connect once on app mount and maintain the connection.

## Risks

- **WebSocket reconnection** — if connection drops during a scan, progress is lost. Use reconnect with exponential backoff.
- **Multiple simultaneous scans** — need to handle multiple libraries scanning at once. Each event has `library_id` for filtering.
- **SMB connection limits** — scanning + browsing simultaneously may hit SMB max connections again. The async scan should be the only active connection per library.
