import {
  ArrowDown01Icon,
  ArrowUpDownIcon,
  Cancel01Icon,
  CheckListIcon,
  Delete02Icon,
  PauseIcon,
  PlayIcon,
  Refresh03Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import type { Download, DownloadGroup } from '../../lib/api/downloads';
import { downloadApi } from '../../lib/api/downloads';
import { cn } from '../../lib/utils';
import {
  DownloadCard,
  formatBytes,
  formatETA,
  formatSpeed,
  parseDownloadName,
  STATUS_INDICATOR,
} from '../DownloadsPage';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { aggregateActiveStats, toActiveProps } from './shared/adapters';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';

// ── New DownloadingTab — renders AnimeDownloadCard per active group ───────

export default function DownloadingTab({
  groups,
  miscDownloads,
  isLoading,
}: {
  groups: DownloadGroup[];
  miscDownloads: Download[];
  isLoading: boolean;
}) {
  const activeGroups = useMemo(
    () => groups.filter((g) => g.active_count > 0),
    [groups],
  );
  const expandAll = useDownloadsUIStore((s) => s.expandAll);

  // Auto-expand all active groups whenever the set changes (by rule_id fingerprint)
  const fingerprint = activeGroups.map((g) => g.rule_id).join(',');
  useEffect(() => {
    expandAll(activeGroups.map((g) => g.rule_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, expandAll]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[160px] rounded-[14px] bg-white/[0.02] border border-white/[0.06] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (activeGroups.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="text-center py-12">
        <HugeiconsIcon icon={ArrowDown01Icon} size={32} className="mx-auto mb-3 text-white/10" />
        <p className="text-white/25 text-sm">No active downloads</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {activeGroups.map((g) => (
        <DownloadingCard key={g.rule_id} group={g} />
      ))}
      <MiscDownloadsSection
        downloads={miscDownloads}
        mode="active"
        onDelete={(_gid) => {/* TODO wire PR 4 */}}
      />
    </div>
  );
}

function DownloadingCard({ group }: { group: DownloadGroup }) {
  const { coverUrl } = useAnimeCover(group.bangumi_id);
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(group.rule_id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const active = useMemo(
    () =>
      group.downloads.filter(
        (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
      ),
    [group.downloads],
  );
  const stats = useMemo(() => aggregateActiveStats(active), [active]);

  const chips = [group.subgroup_filter, group.resolution_filter].filter(
    (s): s is string => !!s && s.trim() !== '',
  );

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={group.rule_name}
      subChips={chips}
      stats={{
        mode: 'downloading',
        percent: stats.percent,
        speedBytes: stats.speed,
        downloadedBytes: stats.downloaded,
        totalBytes: stats.total,
        etaSeconds: stats.etaSeconds,
        activeCount: active.length,
        live: stats.speed > 0,
      }}
      expanded={expanded}
      onToggle={() => toggle(group.rule_id)}
    >
      {active.map((d) => (
        <EpisodeRowActive
          key={d.gid}
          {...toActiveProps(d)}
          onPause={() => {/* TODO wire PR 4 */}}
          onResume={() => {/* TODO wire PR 4 */}}
          onDelete={() => {/* TODO wire PR 4 */}}
        />
      ))}
    </AnimeDownloadCard>
  );
}

// ── Old Downloads Sub-tab body (kept for Task 19 cleanup) ────────────────

function _LegacyDownloadingTab({
  downloads,
  isLoading,
}: {
  downloads: {
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
  }[];
  isLoading: boolean;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'status' | 'name' | 'size' | 'date'>('status');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [detailGid, setDetailGid] = useState<string | null>(null);

  // Filter + sort
  const filteredDownloads = useMemo(() => {
    let list = downloads;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.rule_name?.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'size':
        sorted.sort((a, b) => b.total_bytes - a.total_bytes);
        break;
      case 'date':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'status':
      default: {
        const order: Record<string, number> = { active: 0, waiting: 1, paused: 2 };
        sorted.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
        break;
      }
    }
    return sorted;
  }, [downloads, searchQuery, sortBy]);

  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);

  const toggleSelect = (gid: string, e?: React.MouseEvent) => {
    const idx = filteredDownloads.findIndex((d) => d.gid === gid);
    setSelected((prev) => {
      const next = new Set(prev);
      // Shift+click: range select
      if (e?.shiftKey && lastSelectedIdx !== null && idx !== -1) {
        const [start, end] = [Math.min(lastSelectedIdx, idx), Math.max(lastSelectedIdx, idx)];
        for (let i = start; i <= end; i++) {
          const item = filteredDownloads[i];
          if (item) next.add(item.gid);
        }
        return next;
      }
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
    if (idx !== -1) setLastSelectedIdx(idx);
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredDownloads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredDownloads.map((d) => d.gid)));
    }
  };

  const clearSelection = () => {
    setSelected(new Set());
    setLastSelectedIdx(null);
    setSelectionMode(false);
  };

  const enterSelectionMode = () => {
    setSelectionMode(true);
  };

  const hasSelection = selected.size > 0;
  const allSelected = filteredDownloads.length > 0 && selected.size === filteredDownloads.length;

  const pauseMutation = useMutation({
    mutationFn: downloadApi.pause,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const resumeMutation = useMutation({
    mutationFn: downloadApi.resume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  // Targets: selected items if any, otherwise all
  const targets = hasSelection ? downloads.filter((d) => selected.has(d.gid)) : downloads;

  const pauseTargets = targets.filter((d) => d.status === 'active');
  const resumeTargets = targets.filter((d) => d.status === 'paused' || d.status === 'waiting');

  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      for (const d of pauseTargets) await downloadApi.pause(d.gid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setSelected(new Set());
    },
  });
  const resumeAllMutation = useMutation({
    mutationFn: async () => {
      for (const d of resumeTargets) await downloadApi.resume(d.gid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setSelected(new Set());
    },
  });
  const deleteSelectedMutation = useMutation({
    mutationFn: async () => {
      const toDelete = hasSelection ? targets : downloads;
      for (const d of toDelete) await downloadApi.delete(d.gid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setSelected(new Set());
      setDeleteDialogOpen(false);
      setDeleteFiles(false);
    },
  });
  // Single-item delete confirm
  const [deleteTargetGid, setDeleteTargetGid] = useState<string | null>(null);
  const [deleteTargetFiles, setDeleteTargetFiles] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('milmil:autoDeleteFiles') === 'true'
  );
  const deleteSingleMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTargetGid) return;
      if (deleteTargetFiles) {
        await downloadApi.deleteWithFiles(deleteTargetGid);
      } else {
        await downloadApi.delete(deleteTargetGid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setDeleteTargetGid(null);
    },
  });

  // Batch delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const autoDeleteFiles =
    typeof window !== 'undefined' && localStorage.getItem('milmil:autoDeleteFiles') === 'true';
  const [deleteFiles, setDeleteFiles] = useState(autoDeleteFiles);
  const deleteAllMutation = useMutation({
    mutationFn: () => downloadApi.batchDelete(deleteFiles),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.deletedAll`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setDeleteDialogOpen(false);
      setDeleteFiles(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Global summary calculations
  const activeCount = downloads.filter((d) => d.status === 'active').length;
  const totalSpeed = downloads
    .filter((d) => d.status === 'active')
    .reduce((sum, d) => sum + d.speed_bytes, 0);
  const totalRemaining = downloads
    .filter((d) => d.status === 'active')
    .reduce((sum, d) => sum + Math.max(0, d.total_bytes - d.completed_bytes), 0);
  const eta = totalSpeed > 0 ? totalRemaining / totalSpeed : 0;

  if (isLoading) {
    return (
      <div className="divide-y divide-white/[0.04]">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
            <div className="w-1 h-8 rounded-full bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 rounded bg-white/[0.06]" style={{ width: `${40 + i * 8}%` }} />
              <div className="h-2 rounded bg-white/[0.04] w-[30%]" />
              <div className="h-[3px] rounded-full bg-white/[0.04] w-full" />
            </div>
            <div className="h-3 w-16 rounded bg-white/[0.04] shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    );
  }

  const sortLabels: Record<typeof sortBy, string> = {
    status: i18n._(msg`autoDownload.sort.status`),
    name: i18n._(msg`autoDownload.sort.name`),
    size: i18n._(msg`autoDownload.sort.size`),
    date: i18n._(msg`autoDownload.sort.date`),
  };

  return (
    <>
      {/* Search + Sort bar */}
      {downloads.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={i18n._(msg`autoDownload.searchDownloads`)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white/[0.03] text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:bg-white/[0.05] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 cursor-pointer"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </button>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortMenuOpen((p) => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.03] text-[11px] font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <HugeiconsIcon icon={ArrowUpDownIcon} size={12} />
              {sortLabels[sortBy]}
            </button>
            {sortMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-lg bg-[#1a1a1e] py-1 shadow-xl">
                  {(Object.keys(sortLabels) as (typeof sortBy)[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSortBy(key);
                        setSortMenuOpen(false);
                      }}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer',
                        sortBy === key
                          ? 'text-mm-accent bg-white/[0.04]'
                          : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]'
                      )}
                    >
                      {sortLabels[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Default toolbar — stats + actions */}
      {filteredDownloads.length > 0 && !selectionMode && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 text-[12px] text-white/40">
            {activeCount > 0 ? (
              <>
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="text-green-400/80" />
                <span>
                  {activeCount} {i18n._(msg`autoDownload.downloading`)}
                </span>
                {totalSpeed > 0 && (
                  <>
                    <span className="text-white/15">·</span>
                    <span className="tabular-nums">{formatSpeed(totalSpeed)}</span>
                  </>
                )}
                {eta > 0 && (
                  <>
                    <span className="text-white/15">·</span>
                    <span className="tabular-nums">~{formatETA(eta)}</span>
                  </>
                )}
              </>
            ) : (
              <span>
                {downloads.length} {i18n._(msg`autoDownload.items`)}
              </span>
            )}
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-0.5">
              {resumeTargets.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => resumeAllMutation.mutate()}
                      disabled={resumeAllMutation.isPending}
                      className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={PlayIcon} size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {i18n._(msg`autoDownload.resumeAll`)}
                  </TooltipContent>
                </Tooltip>
              )}
              {pauseTargets.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => pauseAllMutation.mutate()}
                      disabled={pauseAllMutation.isPending}
                      className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={PauseIcon} size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {i18n._(msg`autoDownload.pauseAll`)}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['downloads'] })}
                    className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors cursor-pointer"
                  >
                    <HugeiconsIcon icon={Refresh03Icon} size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n._(msg`autoDownload.refreshAll`)}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={enterSelectionMode}
                    className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors cursor-pointer"
                  >
                    <HugeiconsIcon icon={CheckListIcon} size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{i18n._(msg`autoDownload.select`)}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialogOpen(true);
                      setDeleteFiles(autoDeleteFiles);
                    }}
                    className="p-1.5 rounded-md text-red-400/30 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors cursor-pointer"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{i18n._(msg`autoDownload.deleteAll`)}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Selection bar — visible when in selection mode */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="overflow-hidden mb-2"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} size={18} />
                <span className="text-[12px] font-medium text-white/70">
                  {selected.size} {i18n._(msg`autoDownload.selected`)}
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] text-mm-accent/70 hover:text-mm-accent cursor-pointer transition-colors"
                >
                  {allSelected
                    ? i18n._(msg`autoDownload.deselectAll`)
                    : i18n._(msg`autoDownload.selectAll`)}
                </button>
              </div>
              <div className="flex items-center gap-1">
                {resumeTargets.length > 0 && (
                  <motion.button
                    type="button"
                    onClick={() => resumeAllMutation.mutate()}
                    disabled={resumeAllMutation.isPending}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={PlayIcon} size={12} />
                    {i18n._(msg`autoDownload.resume`)}
                  </motion.button>
                )}
                {pauseTargets.length > 0 && (
                  <motion.button
                    type="button"
                    onClick={() => pauseAllMutation.mutate()}
                    disabled={pauseAllMutation.isPending}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={PauseIcon} size={12} />
                    {i18n._(msg`autoDownload.pause`)}
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  onClick={() => {
                    setDeleteDialogOpen(true);
                    setDeleteFiles(autoDeleteFiles);
                  }}
                  disabled={!hasSelection}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={12} />
                  {i18n._(msg`autoDownload.delete`)}
                </motion.button>
                <div className="w-px h-4 bg-white/[0.08] mx-1" />
                <motion.button
                  type="button"
                  onClick={clearSelection}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <Modal
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteFiles(false);
        }}
        title={
          hasSelection
            ? `${i18n._(msg`autoDownload.deleteSelected`)} (${selected.size})`
            : i18n._(msg`autoDownload.deleteAll`)
        }
        size="sm"
      >
        <p className="text-[13px] text-white/40 leading-relaxed mb-3">
          {hasSelection
            ? i18n._(msg`autoDownload.deleteSelectedDesc`)
            : i18n._(msg`autoDownload.deleteAllDesc`)}
        </p>
        <label className="flex items-center gap-2.5 py-2 cursor-pointer group">
          <Checkbox checked={deleteFiles} onCheckedChange={(v) => setDeleteFiles(v)} size={16} />
          <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors select-none">
            {i18n._(msg`autoDownload.alsoDeleteFiles`)}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteFiles(false);
            }}
            className="text-[12px] text-white/50 hover:bg-white/[0.04]"
          >
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            type="button"
            onClick={() =>
              hasSelection ? deleteSelectedMutation.mutate() : deleteAllMutation.mutate()
            }
            disabled={deleteAllMutation.isPending || deleteSelectedMutation.isPending}
            className={cn(
              'text-[12px] font-semibold',
              deleteFiles
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-white/[0.1] hover:bg-white/[0.15] text-white'
            )}
          >
            {deleteAllMutation.isPending
              ? i18n._(msg`autoDownload.deleting`)
              : i18n._(msg`autoDownload.confirmDelete`)}
          </Button>
        </div>
      </Modal>

      {/* Single item delete confirm modal */}
      <Modal
        open={deleteTargetGid !== null}
        onClose={() => setDeleteTargetGid(null)}
        title={i18n._(msg`autoDownload.deleteItem`)}
        size="sm"
      >
        <p className="text-[13px] text-white/40 leading-relaxed truncate mb-3">
          {deleteTargetGid && filteredDownloads.find((d) => d.gid === deleteTargetGid)?.name}
        </p>
        <label className="flex items-center gap-2.5 py-2 cursor-pointer group">
          <Checkbox
            checked={deleteTargetFiles}
            onCheckedChange={(v) => setDeleteTargetFiles(v)}
            size={16}
          />
          <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors select-none">
            {i18n._(msg`autoDownload.alsoDeleteFiles`)}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDeleteTargetGid(null)}
            className="text-[12px] text-white/50 hover:bg-white/[0.04]"
          >
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            type="button"
            onClick={() => deleteSingleMutation.mutate()}
            disabled={deleteSingleMutation.isPending}
            className={cn(
              'text-[12px] font-semibold',
              deleteTargetFiles
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-white/[0.1] hover:bg-white/[0.15] text-white'
            )}
          >
            {deleteSingleMutation.isPending
              ? i18n._(msg`autoDownload.deleting`)
              : i18n._(msg`autoDownload.confirmDelete`)}
          </Button>
        </div>
      </Modal>

      {/* Download list */}
      {filteredDownloads.length > 0 ? (
        <div className="space-y-1">
          <AnimatePresence mode="popLayout">
            {filteredDownloads.map((dl) => (
              <DownloadCard
                key={dl.id}
                dl={dl}
                ruleName={dl.rule_name}
                selected={selected.has(dl.gid)}
                onSelect={selectionMode ? (e) => toggleSelect(dl.gid, e) : undefined}
                onClick={selectionMode ? () => toggleSelect(dl.gid) : () => setDetailGid(dl.gid)}
                onPause={() => pauseMutation.mutate(dl.gid)}
                onResume={() => resumeMutation.mutate(dl.gid)}
                onDelete={() => {
                  setDeleteTargetGid(dl.gid);
                  setDeleteTargetFiles(autoDeleteFiles);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : downloads.length > 0 ? (
        <div className="text-center py-8">
          <p className="text-white/25 text-sm">{i18n._(msg`autoDownload.noResults`)}</p>
        </div>
      ) : (
        <div className="text-center py-12">
          <HugeiconsIcon icon={ArrowDown01Icon} size={32} className="mx-auto mb-3 text-white/10" />
          <p className="text-white/25 text-sm">{i18n._(msg`autoDownload.noActiveDownloads`)}</p>
        </div>
      )}

      {/* Download detail drawer */}
      <DownloadDetailModal
        dl={detailGid ? filteredDownloads.find((d) => d.gid === detailGid) : undefined}
        ruleName={
          detailGid ? filteredDownloads.find((d) => d.gid === detailGid)?.rule_name : undefined
        }
        open={!!detailGid}
        onClose={() => setDetailGid(null)}
      />
    </>
  );
}

// ── Download Detail Drawer (Motrix-style) ────────────────────────────────

function DownloadDetailModal({
  dl,
  ruleName,
  open,
  onClose,
}: {
  dl?: {
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
  };
  ruleName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  // Keep last valid dl so content stays during close animation
  const lastDl = useRef(dl);
  if (dl) lastDl.current = dl;
  const d = dl ?? lastDl.current;

  const { data: fileInfo, isLoading: filesLoading } = useQuery({
    queryKey: ['downloads', d?.gid, 'files'],
    queryFn: () => downloadApi.files(d!.gid),
    enabled: !!d?.gid && open,
    refetchInterval: d?.status === 'active' ? 3000 : false,
  });

  const pauseMutation = useMutation({
    mutationFn: downloadApi.pause,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const resumeMutation = useMutation({
    mutationFn: downloadApi.resume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  if (!d)
    return (
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <SheetContent side="right" className="!w-[480px] !max-w-[90vw]" />
      </Sheet>
    );

  const parsed = parseDownloadName(d.name);
  const pct = d.total_bytes > 0 ? Math.min(100, (d.completed_bytes / d.total_bytes) * 100) : 0;
  const remaining = d.total_bytes > 0 ? d.total_bytes - d.completed_bytes : 0;
  const eta = d.speed_bytes > 0 ? remaining / d.speed_bytes : 0;
  const isActive = d.status === 'active' || d.status === 'paused' || d.status === 'waiting';

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" showCloseButton={false} className="!w-[480px] !max-w-[90vw]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-white truncate">{parsed.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                {parsed.episode && (
                  <span className="text-[12px] font-semibold text-mm-accent tabular-nums">
                    EP {parsed.episode}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      STATUS_INDICATOR[d.status] ?? 'bg-white/10'
                    )}
                  />
                  <span className="capitalize">{d.status}</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.06] cursor-pointer transition-colors shrink-0"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          </div>
        </div>

        {/* Progress section */}
        {isActive && d.total_bytes > 0 && (
          <div className="px-5 pb-3">
            <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  d.status === 'active' ? 'bg-green-400/80' : 'bg-white/15'
                )}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              />
              {d.status === 'active' && d.speed_bytes > 0 && (
                <motion.div
                  className="absolute inset-y-0 w-[60%] rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
                  }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                />
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] tabular-nums text-white/40">
                {formatBytes(d.completed_bytes)} / {formatBytes(d.total_bytes)}
              </span>
              <span className="text-[11px] tabular-nums text-white/50 font-medium">
                {Math.round(pct)}%
              </span>
            </div>
          </div>
        )}

        {/* Activity stats — speed, ETA, connections */}
        {d.status === 'active' && (
          <div className="px-5 pb-3 flex items-center gap-4">
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-wider">
                {i18n._(msg`autoDownload.detail.speed`)}
              </p>
              <p className="text-[13px] tabular-nums text-white/70 font-medium">
                {formatSpeed(d.speed_bytes)}
              </p>
            </div>
            {eta > 0 && (
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-wider">ETA</p>
                <p className="text-[13px] tabular-nums text-white/70 font-medium">
                  {formatETA(eta)}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="h-px bg-white/[0.06] mx-5" />

        {/* General info */}
        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          <InfoRow label={i18n._(msg`autoDownload.detail.name`)} value={d.name} mono />
          {ruleName && ruleName !== 'Manual Downloads' && (
            <InfoRow label={i18n._(msg`autoDownload.detail.rule`)} value={ruleName} />
          )}
          <InfoRow label="GID" value={d.gid} mono />
          <InfoRow
            label={i18n._(msg`autoDownload.detail.created`)}
            value={new Date(d.created_at).toLocaleString()}
          />
          {fileInfo?.dir && (
            <InfoRow label={i18n._(msg`autoDownload.detail.saveDir`)} value={fileInfo.dir} mono />
          )}

          {/* Files section */}
          {filesLoading && (
            <div className="space-y-2 pt-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-8 rounded bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          )}
          {fileInfo && fileInfo.files.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-2">
                {i18n._(msg`autoDownload.detail.files`)} ({fileInfo.files.length})
              </p>
              <div className="space-y-0.5">
                {fileInfo.files.map((f, idx) => {
                  const filePct = f.size > 0 ? (f.complete / f.size) * 100 : 0;
                  const fileName = f.path.split('/').pop() || f.path;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/50 truncate" title={f.path}>
                          {fileName}
                        </p>
                      </div>
                      <span className="text-[10px] tabular-nums text-white/25 shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      {f.size > 0 && (
                        <span
                          className={cn(
                            'text-[10px] tabular-nums w-8 text-right shrink-0',
                            filePct >= 100 ? 'text-green-400/50' : 'text-white/20'
                          )}
                        >
                          {Math.round(filePct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        {isActive && (
          <>
            <div className="h-px bg-white/[0.06]" />
            <div className="px-5 py-3 flex items-center justify-end gap-2">
              {d.status === 'active' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => pauseMutation.mutate(d.gid)}
                  disabled={pauseMutation.isPending}
                  className="text-[11px] text-white/50 hover:text-white/80"
                >
                  <HugeiconsIcon icon={PauseIcon} size={12} />
                  {i18n._(msg`autoDownload.pause`)}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resumeMutation.mutate(d.gid)}
                  disabled={resumeMutation.isPending}
                  className="text-[11px] text-white/50 hover:text-white/80"
                >
                  <HugeiconsIcon icon={PlayIcon} size={12} />
                  {i18n._(msg`autoDownload.resume`)}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn('text-[12px] text-white/60 break-all', mono && 'font-mono text-[11px]')}>
        {value}
      </p>
    </div>
  );
}

// export default DownloadingTab; — replaced by new export default at top of file
