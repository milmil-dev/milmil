# Completed Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CompletedSubTab component from a flat list into a grouped-by-anime view with timeline toggle, full actions, and polished UI.

**Architecture:** Replace the existing `CompletedSubTab` function in `DownloadsPage.tsx` with a new implementation that groups downloads by `bangumi_id` → `rule_id` → standalone, supports two view modes (grouped/timeline), and provides per-episode and group-level actions. All work is frontend-only — backend data fields not yet available (seed status, magnet) are handled gracefully with hidden/disabled states.

**Tech Stack:** React 19, TanStack Query, Motion (animations), Hugeicons, Tailwind CSS v4, Lingui i18n

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `web/src/pages/DownloadsPage.tsx` | Modify (lines ~2523-2655) | Replace `CompletedSubTab` + update `parseDownloadName` to also return raw name |
| `web/src/lib/api/downloads.ts` | Read only | Reference `Download`, `DownloadGroup`, `downloadApi` types |

All changes are within the existing `CompletedSubTab` function and its supporting sub-components, defined inline in `DownloadsPage.tsx` following the existing pattern (all other sub-tabs are defined inline in the same file).

## Key Data Available

From the existing `Download` interface in `downloads.ts`:
- `id`, `gid`, `name`, `status`, `total_bytes`, `completed_bytes`, `speed_bytes`, `save_dir`, `url`, `created_at`

From the parent `DownloadsPage`, each completed download is enriched with:
- `rule_id`, `rule_name`, `bangumi_id`

The `save_dir` field enables "open folder". The `url` field contains the torrent/magnet URL for "copy magnet". Seed status is derived from `status` field (`active` with `speed_bytes >= 0` after completion = seeding). The `downloadApi.files(gid)` endpoint returns file details including paths.

---

### Task 1: Grouping Logic & Types

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx` (add above `CompletedSubTab` at ~line 2523)

- [ ] **Step 1: Add the CompletedDownload type and grouping types**

Add these types and the grouping function right before the `CompletedSubTab` function (around line 2523):

```typescript
// ── Completed Sub-tab types ─────────────────────────────────────────────

interface CompletedDownload {
  id: string;
  gid: string;
  name: string;
  status: string;
  total_bytes: number;
  completed_bytes: number;
  speed_bytes: number;
  created_at: string;
  rule_id: string;
  rule_name: string;
  bangumi_id?: number;
  save_dir?: string;
  url?: string;
}

interface CompletedGroup {
  key: string;
  title: string;
  bangumiId?: number;
  subgroup: string | null;
  totalBytes: number;
  latestDate: string;
  episodes: { download: CompletedDownload; parsed: ReturnType<typeof parseDownloadName> }[];
  isSeeding: boolean;
}

type CompletedViewMode = 'grouped' | 'timeline';
```

- [ ] **Step 2: Add the grouping function**

Add right after the types:

```typescript
function groupCompletedDownloads(downloads: CompletedDownload[]): CompletedGroup[] {
  const map = new Map<string, CompletedGroup>();

  for (const dl of downloads) {
    // Group key: bangumi_id > rule_id > individual
    const key = dl.bangumi_id
      ? `bangumi-${dl.bangumi_id}`
      : dl.rule_id
        ? `rule-${dl.rule_id}`
        : `solo-${dl.id}`;

    const parsed = parseDownloadName(dl.name);

    if (!map.has(key)) {
      map.set(key, {
        key,
        title: parsed.title,
        bangumiId: dl.bangumi_id,
        subgroup: parsed.subgroup,
        totalBytes: 0,
        latestDate: dl.created_at,
        episodes: [],
        isSeeding: false,
      });
    }

    const group = map.get(key)!;
    group.totalBytes += dl.total_bytes;
    group.episodes.push({ download: dl, parsed });

    // Update latest date
    if (new Date(dl.created_at) > new Date(group.latestDate)) {
      group.latestDate = dl.created_at;
    }

    // Seeding if any download is still active with completed bytes
    if (dl.status === 'active' && dl.completed_bytes >= dl.total_bytes && dl.total_bytes > 0) {
      group.isSeeding = true;
    }
  }

  // Sort episodes within each group by episode number (desc), then by date (desc)
  for (const group of map.values()) {
    group.episodes.sort((a, b) => {
      const epA = a.parsed.episode ? parseInt(a.parsed.episode, 10) : 0;
      const epB = b.parsed.episode ? parseInt(b.parsed.episode, 10) : 0;
      if (epA !== epB) return epB - epA;
      return new Date(b.download.created_at).getTime() - new Date(a.download.created_at).getTime();
    });
  }

  // Sort groups by latest date (most recent first)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );
}
```

- [ ] **Step 3: Add the date section helper for timeline view**

```typescript
function getDateSection(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Earlier';
}
```

- [ ] **Step 4: Verify the file still compiles**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: No new errors (the types/functions are not yet referenced)

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add grouping logic and types for completed tab redesign"
```

---

### Task 2: Toolbar Component

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx` (add after grouping functions, before CompletedSubTab)

- [ ] **Step 1: Add new icon imports at the top of the file**

Update the hugeicons import block (line 1-16) to add the new icons needed:

```typescript
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUpDownIcon,
  Cancel01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Download02Icon,
  FolderOpenIcon,
  PauseIcon,
  PlayIcon,
  Refresh03Icon,
  RssIcon,
  Search01Icon,
  Tick02Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
```

Note: `ViewIcon` may not exist — check at implementation time. If not, use `ArrowRight01Icon` for "View Anime" action instead.

- [ ] **Step 2: Add the CompletedToolbar component**

Add after the date section helper:

```typescript
function CompletedToolbar({
  viewMode,
  onViewModeChange,
  totalSeries,
  totalEpisodes,
  totalBytes,
  onSelectAll,
  onClearAll,
  isClearingAll,
}: {
  viewMode: CompletedViewMode;
  onViewModeChange: (mode: CompletedViewMode) => void;
  totalSeries: number;
  totalEpisodes: number;
  totalBytes: number;
  onSelectAll: () => void;
  onClearAll: () => void;
  isClearingAll: boolean;
}) {
  const { i18n } = useLingui();

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {/* View mode toggle */}
        <div className="flex bg-white/[0.04] rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => onViewModeChange('grouped')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
              viewMode === 'grouped'
                ? 'bg-white/[0.08] text-white/80'
                : 'text-white/30 hover:text-white/50'
            )}
          >
            {i18n._(msg`autoDownload.completed.grouped`)}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('timeline')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
              viewMode === 'timeline'
                ? 'bg-white/[0.08] text-white/80'
                : 'text-white/30 hover:text-white/50'
            )}
          >
            {i18n._(msg`autoDownload.completed.timeline`)}
          </button>
        </div>
        {/* Stats */}
        <span className="text-[10px] text-white/20 tabular-nums">
          {viewMode === 'grouped' && `${totalSeries} series · `}
          {totalEpisodes} episodes · {formatBytes(totalBytes)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onSelectAll}
          className="text-[11px] h-7 text-white/40 hover:text-white/60"
        >
          {i18n._(msg`autoDownload.completed.selectAll`)}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onClearAll}
          disabled={isClearingAll}
          className="text-[11px] h-7 text-red-400/50 hover:text-red-400 border-red-500/10 hover:border-red-500/20"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
          {i18n._(msg`autoDownload.clearAll`)}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compiles**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add CompletedToolbar with view toggle and stats"
```

---

### Task 3: Seed Status Indicator

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Add the SeedStatusDot component**

Add after `CompletedToolbar`:

```typescript
function SeedStatusDot({ isSeeding }: { isSeeding: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isSeeding
            ? 'bg-green-400/60 shadow-[0_0_4px_rgba(74,222,128,0.3)]'
            : 'bg-white/15'
        )}
      />
      <span
        className={cn(
          'text-[9px]',
          isSeeding ? 'text-green-400/50' : 'text-white/20'
        )}
      >
        {isSeeding ? 'Seeding' : 'Idle'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add SeedStatusDot indicator component"
```

---

### Task 4: Episode Row Component (used in both views)

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Add CompletedEpisodeRow component**

Add after `SeedStatusDot`:

```typescript
function CompletedEpisodeRow({
  download,
  parsed,
  onDelete,
  isDeleting,
  showCover,
  coverBangumiId,
}: {
  download: CompletedDownload;
  parsed: ReturnType<typeof parseDownloadName>;
  onDelete: (gid: string) => void;
  isDeleting: boolean;
  showCover?: boolean;
  coverBangumiId?: number;
}) {
  const isSeeding =
    download.status === 'active' &&
    download.completed_bytes >= download.total_bytes &&
    download.total_bytes > 0;

  const handleCopyMagnet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (download.url) {
      navigator.clipboard.writeText(download.url);
      toast.success('Magnet link copied');
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (download.save_dir) {
      // This would need a backend endpoint to open the folder on the server
      // For now, copy the path to clipboard as a fallback
      navigator.clipboard.writeText(download.save_dir);
      toast.success('Path copied to clipboard');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      className="group/ep flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/[0.025] transition-colors"
    >
      {/* Optional cover for timeline view */}
      {showCover && (
        <AnimeCover bangumiId={coverBangumiId} size={36} />
      )}

      {/* Episode badge */}
      {parsed.episode && (
        <span className="text-[11px] font-semibold text-mm-accent/70 tabular-nums w-[52px] shrink-0">
          EP {parsed.episode}
        </span>
      )}

      {/* Filename */}
      <span className="text-[10px] text-white/30 truncate flex-1 min-w-0">
        {download.name}
      </span>

      {/* Seed status (timeline view) */}
      {showCover && <SeedStatusDot isSeeding={isSeeding} />}

      {/* Meta */}
      <span className="text-[10px] text-white/20 tabular-nums shrink-0">
        {formatBytes(download.total_bytes)}
      </span>
      <span className="text-[10px] text-white/15 tabular-nums shrink-0">
        {new Date(download.created_at).toLocaleDateString()}
      </span>

      {/* Hover actions */}
      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/ep:opacity-100 transition-opacity">
        {download.save_dir && (
          <button
            type="button"
            onClick={handleOpenFolder}
            className="p-1 rounded hover:bg-white/[0.06] text-white/15 hover:text-white/40 transition-colors cursor-pointer"
            title="Open folder"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={13} />
          </button>
        )}
        {download.url && (
          <button
            type="button"
            onClick={handleCopyMagnet}
            className="p-1 rounded hover:bg-white/[0.06] text-white/15 hover:text-white/40 transition-colors cursor-pointer"
            title="Copy magnet link"
          >
            <HugeiconsIcon icon={Copy01Icon} size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(download.gid); }}
          disabled={isDeleting}
          className="p-1 rounded hover:bg-red-500/10 text-white/15 hover:text-red-400/70 transition-colors cursor-pointer"
          title="Delete"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} />
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add CompletedEpisodeRow with hover actions"
```

---

### Task 5: Anime Group Card Component

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Add CompletedGroupCard component**

Add after `CompletedEpisodeRow`:

```typescript
function CompletedGroupCard({
  group,
  onDeleteEpisode,
  onDeleteGroup,
  deletingGids,
}: {
  group: CompletedGroup;
  onDeleteEpisode: (gid: string) => void;
  onDeleteGroup: (group: CompletedGroup) => void;
  deletingGids: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const handleViewAnime = () => {
    if (group.bangumiId) {
      navigate({ to: '/anime/$id', params: { id: String(group.bangumiId) } });
    }
  };

  const handleCopyGroupPath = () => {
    const firstDir = group.episodes[0]?.download.save_dir;
    if (firstDir) {
      navigator.clipboard.writeText(firstDir);
      toast.success('Path copied to clipboard');
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      className="border border-white/[0.06] rounded-[10px] overflow-hidden"
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex gap-3 items-start p-3 bg-white/[0.015] hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
      >
        <AnimeCover bangumiId={group.bangumiId} size={52} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold text-white/85 truncate">
              {group.title}
            </span>
            <SeedStatusDot isSeeding={group.isSeeding} />
          </div>
          <div className="text-[10px] text-white/25 mb-2">
            {group.subgroup && <>{group.subgroup} · </>}
            {formatBytes(group.totalBytes)} · Latest: {new Date(group.latestDate).toLocaleDateString()}
          </div>
          {/* Episode pills */}
          <div className="flex gap-1 flex-wrap">
            {group.episodes.map((ep) => (
              <span
                key={ep.download.id}
                className="text-[10px] px-2 py-0.5 rounded bg-mm-accent/[0.12] text-mm-accent/70 tabular-nums"
              >
                EP {ep.parsed.episode || '?'}
              </span>
            ))}
          </div>
        </div>

        {/* Chevron */}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          className={cn(
            'text-white/15 shrink-0 mt-1 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded episode list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-2 pt-1 pb-2">
              <AnimatePresence mode="popLayout">
                {group.episodes.map((ep) => (
                  <CompletedEpisodeRow
                    key={ep.download.id}
                    download={ep.download}
                    parsed={ep.parsed}
                    onDelete={onDeleteEpisode}
                    isDeleting={deletingGids.has(ep.download.gid)}
                  />
                ))}
              </AnimatePresence>

              {/* Group actions footer */}
              <div className="flex items-center justify-between pt-2 mt-1 mx-2 border-t border-white/[0.03]">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyGroupPath}
                    className="text-[9px] text-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    Open Folder
                  </button>
                  {group.bangumiId && (
                    <button
                      type="button"
                      onClick={handleViewAnime}
                      className="text-[9px] text-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      View Anime
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteGroup(group)}
                  className="text-[9px] text-red-400/35 bg-red-500/[0.04] hover:bg-red-500/[0.08] hover:text-red-400/60 px-2 py-1 rounded transition-colors cursor-pointer"
                >
                  Remove Group
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add CompletedGroupCard with expand/collapse and group actions"
```

---

### Task 6: Timeline View Component

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx`

- [ ] **Step 1: Add CompletedTimelineView component**

Add after `CompletedGroupCard`:

```typescript
function CompletedTimelineView({
  downloads,
  onDelete,
  deletingGids,
}: {
  downloads: CompletedDownload[];
  onDelete: (gid: string) => void;
  deletingGids: Set<string>;
}) {
  // Group by date section
  const sections = useMemo(() => {
    const sectionMap = new Map<string, { download: CompletedDownload; parsed: ReturnType<typeof parseDownloadName> }[]>();

    for (const dl of downloads) {
      const section = getDateSection(dl.created_at);
      if (!sectionMap.has(section)) sectionMap.set(section, []);
      sectionMap.get(section)!.push({ download: dl, parsed: parseDownloadName(dl.name) });
    }

    // Preserve order: Today, Yesterday, This Week, Earlier
    const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    return order
      .filter((s) => sectionMap.has(s))
      .map((s) => ({ label: s, items: sectionMap.get(s)! }));
  }, [downloads]);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.label}>
          {/* Date section header */}
          <div className="text-[10px] font-semibold text-white/25 uppercase tracking-wider pb-2 mb-1 border-b border-white/[0.04]">
            {section.label}
          </div>
          <AnimatePresence mode="popLayout">
            {section.items.map((item) => (
              <CompletedEpisodeRow
                key={item.download.id}
                download={item.download}
                parsed={item.parsed}
                onDelete={onDelete}
                isDeleting={deletingGids.has(item.download.gid)}
                showCover
                coverBangumiId={item.download.bangumi_id}
              />
            ))}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): add CompletedTimelineView with date sections"
```

---

### Task 7: Replace CompletedSubTab

**Files:**
- Modify: `web/src/pages/DownloadsPage.tsx` (lines ~2525-2655 — the existing `CompletedSubTab`)

- [ ] **Step 1: Replace the entire CompletedSubTab function**

Delete the existing `CompletedSubTab` function (lines 2525-2655) and replace with:

```typescript
function CompletedSubTab({
  downloads,
  isLoading,
}: {
  downloads: CompletedDownload[];
  isLoading: boolean;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<CompletedViewMode>('grouped');
  const [deletingGids, setDeletingGids] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupCompletedDownloads(downloads), [downloads]);

  const totalEpisodes = downloads.length;
  const totalBytes = downloads.reduce((sum, d) => sum + d.total_bytes, 0);

  const deleteDlMutation = useMutation({
    mutationFn: downloadApi.delete,
    onMutate: (gid: string) => {
      setDeletingGids((prev) => new Set(prev).add(gid));
    },
    onSettled: (_data, _err, gid) => {
      setDeletingGids((prev) => {
        const next = new Set(prev);
        next.delete(gid);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      for (const dl of downloads) await downloadApi.delete(dl.gid);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const handleDeleteGroup = (group: CompletedGroup) => {
    for (const ep of group.episodes) {
      deleteDlMutation.mutate(ep.download.gid);
    }
  };

  // Skeleton loading
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex gap-3 p-3 rounded-[10px] bg-white/[0.02] animate-pulse border border-white/[0.06]"
          >
            <div className="w-[52px] h-[72px] rounded-md bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 rounded bg-white/[0.06] w-[45%]" />
              <div className="h-2.5 rounded bg-white/[0.04] w-[30%]" />
              <div className="flex gap-1.5 mt-1">
                <div className="h-5 w-12 rounded bg-white/[0.04]" />
                <div className="h-5 w-12 rounded bg-white/[0.04]" />
                <div className="h-5 w-12 rounded bg-white/[0.04]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (downloads.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-white/20 text-sm">
          {i18n._(msg`autoDownload.noCompletedDownloads`)}
        </p>
      </div>
    );
  }

  return (
    <>
      <CompletedToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalSeries={groups.length}
        totalEpisodes={totalEpisodes}
        totalBytes={totalBytes}
        onSelectAll={() => {/* batch select — can be wired later */}}
        onClearAll={() => clearAllMutation.mutate()}
        isClearingAll={clearAllMutation.isPending}
      />

      <AnimatePresence mode="wait">
        {viewMode === 'grouped' ? (
          <motion.div
            key="grouped"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            <AnimatePresence mode="popLayout">
              {groups.map((group) => (
                <CompletedGroupCard
                  key={group.key}
                  group={group}
                  onDeleteEpisode={(gid) => deleteDlMutation.mutate(gid)}
                  onDeleteGroup={handleDeleteGroup}
                  deletingGids={deletingGids}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <CompletedTimelineView
              downloads={downloads}
              onDelete={(gid) => deleteDlMutation.mutate(gid)}
              deletingGids={deletingGids}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Update the CompletedSubTab call site type compatibility**

The parent passes `downloads` with the enriched fields (`rule_id`, `rule_name`, `bangumi_id`). The existing call at line ~339 passes these correctly. However, the parent's `allDownloads` memo (line ~188) also includes `save_dir` and `url` from the original `Download` type since it uses spread. Verify by checking that `allDownloads` spreads all fields from `DownloadGroup.downloads` plus the enrichment.

Check the `allDownloads` useMemo at line ~188. If it doesn't include `save_dir`/`url` (likely since `DownloadGroup.downloads` doesn't have those fields), we need the flat `Download` list. The current data flow uses `groups.flatMap(g => g.downloads)` which only has the subset fields.

For now, the `save_dir` and `url` fields on `CompletedDownload` are optional (`save_dir?: string; url?: string`), so missing data is handled gracefully — the action buttons just won't appear.

- [ ] **Step 3: Verify compiles and renders**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "feat(downloads): replace CompletedSubTab with grouped/timeline redesign"
```

---

### Task 8: Add i18n Translation Keys

**Files:**
- Modify: `web/src/locales/en/messages.po`

- [ ] **Step 1: Extract new translation strings**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:extract`

This will add the new keys to all `.po` files:
- `autoDownload.completed.grouped`
- `autoDownload.completed.timeline`
- `autoDownload.completed.selectAll`

- [ ] **Step 2: Fill in the English translations**

In `web/src/locales/en/messages.po`, find and fill the new entries:

```po
msgid "autoDownload.completed.grouped"
msgstr "Grouped"

msgid "autoDownload.completed.timeline"
msgstr "Timeline"

msgid "autoDownload.completed.selectAll"
msgstr "Select All"
```

- [ ] **Step 3: Fill in translations for other locales**

For each locale (`ja`, `ko`, `zh-CN`, `zh-HK`, `zh-TW`), add appropriate translations. Example for `zh-TW`:

```po
msgid "autoDownload.completed.grouped"
msgstr "按作品"

msgid "autoDownload.completed.timeline"
msgstr "時間線"

msgid "autoDownload.completed.selectAll"
msgstr "全選"
```

For `ja`:
```po
msgid "autoDownload.completed.grouped"
msgstr "グループ"

msgid "autoDownload.completed.timeline"
msgstr "タイムライン"

msgid "autoDownload.completed.selectAll"
msgstr "すべて選択"
```

For `ko`:
```po
msgid "autoDownload.completed.grouped"
msgstr "그룹별"

msgid "autoDownload.completed.timeline"
msgstr "타임라인"

msgid "autoDownload.completed.selectAll"
msgstr "모두 선택"
```

For `zh-CN`:
```po
msgid "autoDownload.completed.grouped"
msgstr "按作品"

msgid "autoDownload.completed.timeline"
msgstr "时间线"

msgid "autoDownload.completed.selectAll"
msgstr "全选"
```

For `zh-HK`:
```po
msgid "autoDownload.completed.grouped"
msgstr "按作品"

msgid "autoDownload.completed.timeline"
msgstr "時間線"

msgid "autoDownload.completed.selectAll"
msgstr "全選"
```

- [ ] **Step 4: Compile translations**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run i18n:compile`

- [ ] **Step 5: Commit**

```bash
git add web/src/locales/
git commit -m "feat(i18n): add translations for completed tab redesign"
```

---

### Task 9: Verify & Visual QA

- [ ] **Step 1: Run full type check**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run linter**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Run build**

Run: `cd /Users/niskan516/Sync/Workspace/dev/milmil/web && bun run build`
Expected: Build succeeds

- [ ] **Step 4: Manual visual QA**

Ask user to run `bun run dev` and verify:
1. Completed tab shows grouped view by default
2. Groups show anime cover, title, episode pills, seed status
3. Clicking a group expands to show episode list with hover actions
4. Group footer shows Open Folder, View Anime, Remove Group buttons
5. Toggling to Timeline shows flat list with date section headers
6. Clear All and delete work correctly
7. Skeleton loading shows on initial load
8. Empty state shows when no completed downloads
9. Animations are smooth (expand/collapse, delete, view toggle)

- [ ] **Step 5: Commit any fixes from QA**

```bash
git add web/src/pages/DownloadsPage.tsx
git commit -m "fix(downloads): polish completed tab from visual QA"
```
