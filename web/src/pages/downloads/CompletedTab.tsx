import {
  ArrowDown01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  PlayIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { discoverApi } from '../../lib/api/discover';
import { downloadApi, ruleApi } from '../../lib/api/downloads';
import { cn } from '../../lib/utils';
import { AnimeCover, formatBytes, parseDownloadName } from '../DownloadsPage';

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
  library_name?: string;
  save_dir?: string;
  url?: string;
}

interface CompletedGroup {
  key: string;
  ruleId: string | null;
  title: string;
  libraryName: string | null;
  bangumiId?: number;
  subgroup: string | null;
  totalBytes: number;
  latestDate: string;
  episodes: { download: CompletedDownload; parsed: ReturnType<typeof parseDownloadName> }[];
  isSeeding: boolean;
}

type CompletedViewMode = 'grouped' | 'timeline';

// ── Grouping function ────────────────────────────────────────────────────

function groupCompletedDownloads(downloads: CompletedDownload[]): CompletedGroup[] {
  const map = new Map<string, CompletedGroup>();

  for (const dl of downloads) {
    const key = dl.bangumi_id
      ? `bangumi-${dl.bangumi_id}`
      : dl.rule_id
        ? `rule-${dl.rule_id}`
        : `solo-${dl.id}`;

    const parsed = parseDownloadName(dl.name);

    if (!map.has(key)) {
      map.set(key, {
        key,
        ruleId: dl.rule_id || null,
        title: parsed.title,
        bangumiId: dl.bangumi_id,
        libraryName: dl.library_name || null,
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

    if (new Date(dl.created_at) > new Date(group.latestDate)) {
      group.latestDate = dl.created_at;
    }

    if (dl.status === 'active' && dl.completed_bytes >= dl.total_bytes && dl.total_bytes > 0) {
      group.isSeeding = true;
    }
  }

  for (const group of map.values()) {
    group.episodes.sort((a, b) => {
      const epA = a.parsed.episode ? parseInt(a.parsed.episode, 10) : 0;
      const epB = b.parsed.episode ? parseInt(b.parsed.episode, 10) : 0;
      if (epA !== epB) return epB - epA;
      return new Date(b.download.created_at).getTime() - new Date(a.download.created_at).getTime();
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );
}

// ── Date section helper ──────────────────────────────────────────────────

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

// ── CompletedToolbar ─────────────────────────────────────────────────────

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
        <span className="text-[10px] text-white/20 tabular-nums">
          {viewMode === 'grouped' && `${totalSeries} series · `}
          {totalEpisodes} episodes · {formatBytes(totalBytes)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onSelectAll}
          className="text-[11px] h-7 text-white/40 hover:text-white/60"
        >
          {i18n._(msg`autoDownload.completed.selectAll`)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearAll}
          disabled={isClearingAll}
          className="text-[11px] h-7 text-red-400/50 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
          {i18n._(msg`autoDownload.clearAll`)}
        </Button>
      </div>
    </div>
  );
}

// ── SeedStatusDot ────────────────────────────────────────────────────────

function SeedStatusDot({ isSeeding }: { isSeeding: boolean }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          isSeeding ? 'bg-green-400/60 shadow-[0_0_4px_rgba(74,222,128,0.3)]' : 'bg-white/15'
        )}
      />
      <span className={cn('text-[9px]', isSeeding ? 'text-green-400/50' : 'text-white/20')}>
        {isSeeding ? 'Seeding' : 'Idle'}
      </span>
    </div>
  );
}

// ── CompletedEpisodeRow ──────────────────────────────────────────────────

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      className="group/ep flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/[0.025] transition-colors"
    >
      {showCover && <AnimeCover bangumiId={coverBangumiId} size={36} />}

      {parsed.episode && (
        <span className="text-[11px] font-semibold text-mm-accent/70 tabular-nums w-[52px] shrink-0">
          EP {parsed.episode}
        </span>
      )}

      <span className="text-[10px] text-white/30 truncate flex-1 min-w-0">{download.name}</span>

      {showCover && <SeedStatusDot isSeeding={isSeeding} />}

      <span className="text-[10px] text-white/20 tabular-nums shrink-0">
        {formatBytes(download.total_bytes)}
      </span>
      <span className="text-[10px] text-white/15 tabular-nums shrink-0">
        {new Date(download.created_at).toLocaleDateString()}
      </span>

      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/ep:opacity-100 transition-opacity">
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
          onClick={(e) => {
            e.stopPropagation();
            onDelete(download.gid);
          }}
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

// ── CompletedGroupCard ───────────────────────────────────────────────────

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
  const queryClient = useQueryClient();

  // Auto-resolve bangumi_id from title search when missing
  const { data: resolvedAnime } = useQuery({
    queryKey: ['resolve-bangumi', group.title],
    queryFn: async () => {
      const results = await discoverApi.search(group.title);
      return results[0] ?? null;
    },
    enabled: !group.bangumiId && group.title.length > 2,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Persist resolved bangumi_id to the rule so it sticks
  useEffect(() => {
    if (resolvedAnime?.bangumi_id && group.ruleId && !group.bangumiId) {
      ruleApi
        .update(group.ruleId, { bangumi_id: resolvedAnime.bangumi_id })
        .then(() => queryClient.invalidateQueries({ queryKey: ['downloads'] }));
    }
  }, [resolvedAnime, group.ruleId, group.bangumiId, queryClient]);

  const effectiveBangumiId = group.bangumiId ?? resolvedAnime?.bangumi_id;

  const handleViewAnime = () => {
    if (effectiveBangumiId) {
      navigate({ to: '/anime/$id', params: { id: String(effectiveBangumiId) } });
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      className="rounded-[10px] overflow-hidden bg-white/[0.02]"
    >
      <div
        className="w-full flex gap-3 items-start p-3 bg-white/[0.015] hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Cover — stop propagation so the Link inside AnimeCover works */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <AnimeCover bangumiId={effectiveBangumiId} size={52} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            {effectiveBangumiId ? (
              <Link
                to="/anime/$id"
                params={{ id: String(effectiveBangumiId) }}
                className="text-[13px] font-semibold text-white/85 truncate hover:text-white transition-colors no-underline"
                style={{ textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                {group.title}
              </Link>
            ) : (
              <span className="text-[13px] font-semibold text-white/85 truncate">
                {group.title}
              </span>
            )}
            <SeedStatusDot isSeeding={group.isSeeding} />
          </div>
          <div className="text-[10px] text-white/25 mb-2">
            {group.subgroup && <>{group.subgroup} · </>}
            {formatBytes(group.totalBytes)} · Latest:{' '}
            {new Date(group.latestDate).toLocaleDateString()}
            {group.libraryName && (
              <>
                {' '}
                · <span className="text-mm-accent/40">{group.libraryName}</span>
              </>
            )}
          </div>
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

        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          className={cn(
            'text-white/15 shrink-0 mt-1 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-2 pt-1 pb-2">
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

              <div className="flex items-center justify-between pt-2 mt-1 mx-2">
                <div className="flex gap-1.5">
                  {effectiveBangumiId && (
                    <button
                      type="button"
                      onClick={handleViewAnime}
                      className="text-[9px] text-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      View Anime
                    </button>
                  )}
                  {effectiveBangumiId && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: '/watch/$animeId',
                          params: { animeId: String(effectiveBangumiId) },
                        })
                      }
                      className="text-[9px] text-mm-accent/40 bg-mm-accent/[0.06] hover:bg-mm-accent/[0.12] hover:text-mm-accent/70 px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1">
                        <HugeiconsIcon icon={PlayIcon} size={9} />
                        Play
                      </span>
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

// ── CompletedTimelineView ────────────────────────────────────────────────

function CompletedTimelineView({
  downloads,
  onDelete,
  deletingGids,
}: {
  downloads: CompletedDownload[];
  onDelete: (gid: string) => void;
  deletingGids: Set<string>;
}) {
  const sections = useMemo(() => {
    const sectionMap = new Map<
      string,
      { download: CompletedDownload; parsed: ReturnType<typeof parseDownloadName> }[]
    >();

    for (const dl of downloads) {
      const section = getDateSection(dl.created_at);
      if (!sectionMap.has(section)) sectionMap.set(section, []);
      sectionMap.get(section)!.push({ download: dl, parsed: parseDownloadName(dl.name) });
    }

    const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    return order
      .filter((s) => sectionMap.has(s))
      .map((s) => ({ label: s, items: sectionMap.get(s)! }));
  }, [downloads]);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="text-[10px] font-semibold text-white/25 uppercase tracking-wider pb-2 mb-1">
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

// ── Completed Sub-tab ────────────────────────────────────────────────────

function CompletedTab({
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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-3 rounded-[10px] bg-white/[0.02] animate-pulse">
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

  if (downloads.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-white/20 text-sm">{i18n._(msg`autoDownload.noCompletedDownloads`)}</p>
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
        onSelectAll={() => {
          /* batch select — can be wired later */
        }}
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

export default CompletedTab;
