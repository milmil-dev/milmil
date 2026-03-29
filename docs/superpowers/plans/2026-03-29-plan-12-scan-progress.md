# Real-Time Scan Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time scan progress so users see files being discovered, hashed, and matched — with per-library progress on the library list page and a "Scan All" button.

**Architecture:** Backend makes scan async (goroutine), broadcasts granular WebSocket events during scan/hash/match phases. Frontend uses `react-use-websocket` for reliable WS connection and a Zustand `scan-store` to hold per-library progress state. Library cards and detail page both read from the store to show live progress.

**Tech Stack:** Go (goroutine, ws.Hub), react-use-websocket, Zustand, es-toolkit (debounce/throttle), TanStack Router useSearch

**Spec:** `docs/superpowers/specs/2026-03-29-scan-progress-design.md`

---

### Task 1: Backend — Make Scan Async + Progress Callback Interface

**Files:**
- Modify: `api/internal/scanner/scanner.go`
- Modify: `api/internal/api/library_handler.go`

- [ ] **Step 1: Define progress callback interface in scanner.go**

Add a `ProgressFunc` type and `ScanOptions` to scanner.go:

```go
// ProgressFunc is called during scan with progress events
type ProgressFunc func(event ProgressEvent)

type ProgressEvent struct {
    Type       string `json:"type"`       // "scan:progress", "scan:hash", "scan:completed", "scan:error"
    LibraryID  string `json:"library_id"`
    LibraryName string `json:"library_name"`
    FilesFound int    `json:"files_found,omitempty"`
    FilesHashed int   `json:"files_hashed,omitempty"`
    FilesTotal int    `json:"files_total,omitempty"`
    CurrentFile string `json:"current_file,omitempty"`
    Error      string `json:"error,omitempty"`
}
```

- [ ] **Step 2: Add progress callbacks throughout ScanLibrary**

Modify `ScanLibrary` to accept an optional `ProgressFunc`. Emit events:
- After every file found during Walk: `scan:progress` (throttle to every 5 files or 1 second)
- After each file hash computed: `scan:hash`
- On error: `scan:error`
- At completion: `scan:completed`

Use a counter + time check to throttle progress events (don't flood WebSocket):
```go
var lastProgressTime time.Time
filesFound := 0

provider.Walk(root, func(path string, info os.FileInfo, err error) error {
    filesFound++
    if time.Since(lastProgressTime) > time.Second || filesFound%5 == 0 {
        if onProgress != nil {
            onProgress(ProgressEvent{
                Type: "scan:progress",
                LibraryID: library.ID,
                LibraryName: library.Name,
                FilesFound: filesFound,
                CurrentFile: info.Name(),
            })
        }
        lastProgressTime = time.Now()
    }
    // ... existing walk logic
})
```

- [ ] **Step 3: Make handleScanLibrary async**

In `library_handler.go`, change `handleScanLibrary` to:
1. Start scan in a goroutine
2. Return `202 Accepted` immediately
3. Pass a progress callback that broadcasts to wsHub

```go
func (h *handler) handleScanLibrary(c echo.Context) error {
    // ... get library, decrypt config ...

    go func() {
        sc := scanner.New(h.queries)
        onProgress := func(event scanner.ProgressEvent) {
            h.wsHub.Broadcast(ws.Event{
                Type: event.Type,
                Data: event,
            })
        }

        // Emit scan:started
        onProgress(scanner.ProgressEvent{
            Type: "scan:started",
            LibraryID: lib.ID,
            LibraryName: lib.Name,
        })

        err := sc.ScanLibrary(context.Background(), lib, configJSON, onProgress)
        if err != nil {
            onProgress(scanner.ProgressEvent{
                Type: "scan:error",
                LibraryID: lib.ID,
                Error: err.Error(),
            })
            return
        }

        // Auto-match with progress
        if h.matcher != nil {
            // ... match with progress events
        }

        // Emit scan:completed
        onProgress(scanner.ProgressEvent{
            Type: "scan:completed",
            LibraryID: lib.ID,
            LibraryName: lib.Name,
        })
    }()

    return c.JSON(http.StatusAccepted, map[string]string{
        "status": "scanning",
        "library_id": lib.ID,
    })
}
```

**Important:** Use `context.Background()` for the goroutine (not the request context, which is cancelled when the HTTP response is sent).

- [ ] **Step 4: Add match progress to matcher**

Modify `api/internal/matcher/matcher.go` — add `ProgressFunc` parameter to `MatchLibrary`:
```go
func (m *Matcher) MatchLibrary(ctx context.Context, libraryID string, onProgress scanner.ProgressFunc) (*MatchSummary, error)
```

Emit `match:progress` events during matching:
```go
onProgress(scanner.ProgressEvent{
    Type: "match:progress",
    LibraryID: libraryID,
    FilesMatched: matched,
    FilesTotal: total,
    CurrentFile: file.Filename,
})
```

- [ ] **Step 5: Build and test**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && export PATH="/Users/niskan516/.local/share/mise/installs/go/1.26.1/bin:$PATH" && go build ./...
```

Run tests: `go test ./internal/scanner/ ./internal/matcher/ ./internal/api/ -v 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add api/internal/
git commit -m "feat(api): async scan with real-time progress events via WebSocket"
```

---

### Task 2: Frontend — Zustand Scan Store

**Files:**
- Create: `web/src/store/scan-store.ts`

- [ ] **Step 1: Create scan-store**

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ScanProgress {
  libraryId: string;
  libraryName: string;
  phase: 'scanning' | 'hashing' | 'matching' | 'completed' | 'error';
  filesFound: number;
  filesHashed: number;
  filesMatched: number;
  filesTotal: number;
  currentFile: string;
  error?: string;
}

interface ScanStore {
  scans: Record<string, ScanProgress>; // keyed by library_id

  // Actions
  handleEvent: (event: { type: string; data: any }) => void;
  isScanning: (libraryId: string) => boolean;
  getProgress: (libraryId: string) => ScanProgress | null;
  clearCompleted: () => void;
}

export const useScanStore = create<ScanStore>()(
  devtools(
    (set, get) => ({
      scans: {},

      handleEvent: (event) => {
        const { type, data } = event;
        const libId = data?.library_id;
        if (!libId) return;

        set((state) => {
          const prev = state.scans[libId] || {
            libraryId: libId,
            libraryName: data.library_name || '',
            phase: 'scanning',
            filesFound: 0, filesHashed: 0, filesMatched: 0, filesTotal: 0,
            currentFile: '',
          };

          switch (type) {
            case 'scan:started':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'scanning', filesFound: 0, currentFile: '' } } };
            case 'scan:progress':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'scanning', filesFound: data.files_found || prev.filesFound, currentFile: data.current_file || '' } } };
            case 'scan:hash':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'hashing', filesHashed: data.files_hashed || prev.filesHashed, filesTotal: data.files_total || prev.filesTotal, currentFile: data.current_file || '' } } };
            case 'match:progress':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'matching', filesMatched: data.files_matched || prev.filesMatched, filesTotal: data.files_total || prev.filesTotal, currentFile: data.current_file || '' } } };
            case 'scan:completed':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'completed' } } };
            case 'scan:error':
              return { scans: { ...state.scans, [libId]: { ...prev, phase: 'error', error: data.error } } };
            default:
              return state;
          }
        }, false, `scan/${type}`);
      },

      isScanning: (libraryId) => {
        const scan = get().scans[libraryId];
        return scan ? scan.phase !== 'completed' && scan.phase !== 'error' : false;
      },

      getProgress: (libraryId) => get().scans[libraryId] || null,

      clearCompleted: () => {
        set((state) => {
          const scans = { ...state.scans };
          for (const [id, scan] of Object.entries(scans)) {
            if (scan.phase === 'completed' || scan.phase === 'error') {
              delete scans[id];
            }
          }
          return { scans };
        });
      },
    }),
    { name: 'scan-store' }
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add web/src/store/scan-store.ts
git commit -m "feat(web): add Zustand scan progress store"
```

---

### Task 3: Frontend — Replace useWebSocket with react-use-websocket + Wire to Store

**Files:**
- Modify: `web/src/hooks/use-websocket.ts`
- Modify: `web/src/routes/__root.tsx`

- [ ] **Step 1: Rewrite use-websocket.ts using react-use-websocket**

```typescript
import useWebSocket from 'react-use-websocket';
import { useScanStore } from '@/store/scan-store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export function useMillilWebSocket() {
  const handleEvent = useScanStore((s) => s.handleEvent);

  const { lastJsonMessage } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectAttempts: Infinity,
    reconnectInterval: 3000,
    share: true, // share single connection across components
  });

  // Route events to scan store
  useEffect(() => {
    if (lastJsonMessage && lastJsonMessage.type) {
      handleEvent(lastJsonMessage);
    }
  }, [lastJsonMessage, handleEvent]);

  return lastJsonMessage;
}
```

- [ ] **Step 2: Update __root.tsx to use new hook**

Replace the old `useWebSocket` usage with `useMillilWebSocket`. Keep the existing `scan:completed` query invalidation but also handle it through the store:

```typescript
function RootLayout() {
  const queryClient = useQueryClient();
  const lastEvent = useMillilWebSocket();

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'scan:completed') {
      toast.success(`掃描完成: ${lastEvent.data?.library_name}`);
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
    }
    if (lastEvent.type === 'download:added') {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    }
  }, [lastEvent, queryClient]);
  // ...
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/use-websocket.ts web/src/routes/__root.tsx
git commit -m "feat(web): replace custom WebSocket with react-use-websocket + wire to scan store"
```

---

### Task 4: Frontend — Scan Progress UI on Library Cards

**Files:**
- Modify: `web/src/pages/LibrariesPage.tsx`

- [ ] **Step 1: Show scan progress on library cards**

Import `useScanStore` and read per-library progress:

```typescript
const scanProgress = useScanStore((s) => s.getProgress(lib.id));
const isScanning = useScanStore((s) => s.isScanning(lib.id));
```

Replace the current `scanning` prop (which was based on `scanningId` state) with the store-based `isScanning`.

When `isScanning` is true, show a progress overlay on the card:
- Phase label: "Scanning..." / "Hashing..." / "Matching..."
- Current file name (truncated)
- File count: "142 files found" or "8/42 matched"
- Thin progress bar (if filesTotal > 0: filesMatched/filesTotal)

- [ ] **Step 2: Replace scanningId state with store**

Remove the local `scanningId` state. The scan store now tracks which libraries are scanning. Update the `scanMutation` to not set local state — the WebSocket events handle it.

- [ ] **Step 3: Add "Scan All" button**

In the library list header, add a "Scan All" button next to "+ Add Library":

```typescript
const scanAllMutation = useMutation({
  mutationFn: async () => {
    for (const lib of libraries) {
      await libraryApi.scan(lib.id);
    }
  },
});
```

Note: Since scan is now async (202), `libraryApi.scan()` returns immediately. The mutations fire sequentially but each returns instantly — the actual scans run in parallel on the backend.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LibrariesPage.tsx
git commit -m "feat(web): show real-time scan progress on library cards + Scan All button"
```

---

### Task 5: Frontend — Scan Progress on Detail Page

**Files:**
- Modify: `web/src/pages/LibraryDetailPage.tsx`

- [ ] **Step 1: Add progress banner to detail page**

When a scan is in progress for this library, show a progress banner between the header and the stat cards:

```tsx
const scanProgress = useScanStore((s) => s.getProgress(id));
const isScanning = useScanStore((s) => s.isScanning(id));

{isScanning && scanProgress && (
  <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.06]">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-white/70">
        {phase label based on scanProgress.phase}
      </span>
      <span className="text-xs text-white/40">
        {scanProgress.filesFound} files found
      </span>
    </div>
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div className="h-full rounded-full bg-mm-accent transition-all duration-300"
        style={{ width: `${percentage}%` }} />
    </div>
    <p className="text-xs text-white/30 mt-2 truncate font-mono">
      {scanProgress.currentFile}
    </p>
  </div>
)}
```

- [ ] **Step 2: Auto-refresh stats after scan completes**

When `scanProgress.phase` changes to `'completed'`, invalidate the library detail and media files queries:

```typescript
useEffect(() => {
  if (scanProgress?.phase === 'completed') {
    queryClient.invalidateQueries({ queryKey: libraryKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: libraryKeys.mediaFiles(id) });
  }
}, [scanProgress?.phase]);
```

- [ ] **Step 3: Update "Scan Now" button state**

Disable "Scan Now" when already scanning. Show "Scanning..." text:

```tsx
<button disabled={isScanning}>
  {isScanning ? i18n._(msg`library.scanning`) : i18n._(msg`library.detail.scanNow`)}
</button>
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LibraryDetailPage.tsx
git commit -m "feat(web): add scan progress banner to library detail page"
```

---

### Task 6: i18n + Final Integration Test

**Files:**
- Modify: `web/src/locales/en/messages.po`
- Modify: `web/src/locales/zh-Hant/messages.po`
- Modify: `web/src/locales/zh-Hans/messages.po`

- [ ] **Step 1: Add i18n keys for scan progress**

| Key | English | zh-Hant | zh-Hans |
|-----|---------|---------|---------|
| scan.phase.scanning | Scanning files... | 掃描檔案中... | 扫描文件中... |
| scan.phase.hashing | Computing hashes... | 計算雜湊中... | 计算哈希中... |
| scan.phase.matching | Matching anime... | 匹配動畫中... | 匹配动画中... |
| scan.filesFound | {count} files found | 發現 {count} 個檔案 | 发现 {count} 个文件 |
| scan.scanAll | Scan All | 全部掃描 | 全部扫描 |
| scan.scanAllProgress | Scanning {current}/{total}... | 掃描中 {current}/{total}... | 扫描中 {current}/{total}... |

- [ ] **Step 2: Extract and compile**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract && bun run i18n:compile
```

- [ ] **Step 3: Full build test**

```bash
cd /Users/niskan516/Sync/Workspace/dev/milmil/api && export PATH="/Users/niskan516/.local/share/mise/installs/go/1.26.1/bin:$PATH" && go build ./... && go test ./... 2>&1 | tail -20
cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/locales/
git commit -m "feat(web): add i18n keys for scan progress"
```
