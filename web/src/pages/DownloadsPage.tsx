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
  PauseIcon,
  PlayIcon,
  Refresh03Icon,
  RssIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Modal } from '../components/Modal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Drawer, DrawerContent } from '../components/ui/drawer';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { useIsMobile } from '../hooks/use-mobile';
import {
  type DownloadGroup,
  downloadApi,
  downloadKeys,
  rssFeedApi,
  ruleApi,
  subscribeApi,
  type SubscribeInput,
} from '../lib/api/downloads';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { libraryApi, libraryKeys } from '../lib/api/library';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi } from '../lib/api/torrent';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';
import { RuleEditorModal } from '../components/RuleEditorModal';
import type { DownloadsSearch } from '../routes/downloads';

// ── Types ───────────────────────────────────────────────────────────────────

interface DownloaderStatus {
  engine: string;
  healthy: boolean;
}

type Tab = 'search' | 'subscriptions' | 'downloading' | 'completed';

// ── Source config ───────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  all: 'All',
  nyaa: 'Nyaa',
  dmhy: 'DMHY',
  mikan: 'Mikan',
  dandanplay: 'DanDanPlay',
};

const SOURCE_COLORS: Record<string, string> = {
  nyaa: 'bg-green-500/15 text-green-400',
  dmhy: 'bg-blue-500/15 text-blue-400',
  mikan: 'bg-orange-500/15 text-orange-400',
  dandanplay: 'bg-cyan-500/15 text-cyan-400',
};

const MEDIA_TYPE_COLORS: Record<string, string> = {
  TV: 'bg-blue-500/15 text-blue-400',
  MOVIE: 'bg-purple-500/15 text-purple-400',
  OVA: 'bg-teal-500/15 text-teal-400',
  ONA: 'bg-indigo-500/15 text-indigo-400',
  SPECIAL: 'bg-pink-500/15 text-pink-400',
};

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
        SOURCE_COLORS[source] ?? 'bg-white/10 text-white/60'
      )}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

function MediaTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
        MEDIA_TYPE_COLORS[type] ?? 'bg-white/10 text-white/60'
      )}
    >
      {type}
    </span>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

const ALL_TORRENT_SOURCES = ['all', 'nyaa', 'mikan', 'dmhy', 'dandanplay', 'bangumi.moe', 'acg.rip'] as const;
const RSS_SOURCES: ('mikan' | 'nyaa' | 'dmhy')[] = ['mikan', 'nyaa', 'dmhy'];
const CJK_SOURCES = ['all', 'mikan', 'dmhy', 'bangumi.moe', 'acg.rip', 'dandanplay', 'nyaa'] as const;
const EN_SOURCES = ['all', 'nyaa', 'dandanplay', 'mikan', 'dmhy', 'bangumi.moe', 'acg.rip'] as const;
const RESOLUTIONS = ['Any', '1080p', '720p', '4K'] as const;

function isCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
}

/** Return source list ordered by relevance for the anime's title language. */
function getRelevantSources(anime: { title: string; title_en?: string }): readonly string[] {
  if (isCJK(anime.title)) return CJK_SOURCES;
  if (anime.title_en) return EN_SOURCES;
  return ALL_TORRENT_SOURCES;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function DownloadsPage() {
  const { i18n } = useLingui();
  const search = useSearch({ strict: false }) as DownloadsSearch;
  const navigate = useNavigate();
  const tab: Tab = search.tab || 'search';
  const animeParam = search.anime;

  const [addUrlOpen, setAddUrlOpen] = useState(false);

  const setTab = (t: Tab) => {
    navigate({ to: '/downloads', search: { tab: t, anime: animeParam }, replace: true });
  };

  // Aria2 connection status
  const { data: downloaderStatus } = useQuery({
    queryKey: ['system', 'downloader-status'],
    queryFn: () => api.get<DownloaderStatus>('/api/v1/system/downloader-status'),
    refetchInterval: 60000,
  });

  // Data queries — shared by subscriptions/downloads/completed tabs
  const { data: feeds = [] } = useQuery({
    queryKey: downloadKeys.feeds(),
    queryFn: () => rssFeedApi.list(),
  });

  const { data: rules = [] } = useQuery({
    queryKey: downloadKeys.rules(),
    queryFn: () => ruleApi.list(),
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['downloads', 'grouped'],
    queryFn: () => downloadApi.grouped(),
    refetchInterval: 5000,
  });

  const allDownloads = useMemo(() => {
    return groups.flatMap((g) =>
      g.downloads.map((dl) => ({
        ...dl,
        rule_id: g.rule_id,
        rule_name: g.rule_name,
        bangumi_id: g.bangumi_id,
        library_name: g.library_name,
      }))
    );
  }, [groups]);

  const isEffectivelyComplete = (d: { status: string; total_bytes: number; completed_bytes: number }) =>
    d.status === 'complete' || (d.total_bytes > 0 && d.completed_bytes >= d.total_bytes);

  const activeDownloads = useMemo(
    () =>
      allDownloads
        .filter((d) => (d.status === 'active' || d.status === 'waiting' || d.status === 'paused') && !isEffectivelyComplete(d))
        .sort((a, b) => {
          const order: Record<string, number> = { active: 0, waiting: 1, paused: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        }),
    [allDownloads]
  );

  const completedDownloads = useMemo(
    () =>
      allDownloads
        .filter((d) => isEffectivelyComplete(d))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allDownloads]
  );

  const tabs: { key: Tab; label: string; icon: typeof Search01Icon; count?: number }[] = [
    { key: 'search', label: i18n._(msg`autoDownload.tab.search`), icon: Search01Icon },
    { key: 'subscriptions', label: i18n._(msg`autoDownload.subtab.subscriptions`), icon: RssIcon },
    { key: 'downloading', label: i18n._(msg`autoDownload.subtab.downloads`), icon: Download02Icon, count: activeDownloads.length },
    { key: 'completed', label: i18n._(msg`autoDownload.subtab.completed`), icon: CheckmarkCircle02Icon, count: completedDownloads.length },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">
                milmil
              </p>
              <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
                {i18n._(msg`nav.autoDownload`)}
              </h1>
            </div>
            {/* Downloader status */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                downloaderStatus?.healthy
                  ? 'bg-white/[0.03]'
                  : 'bg-red-500/[0.06] border border-red-500/10'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  downloaderStatus?.healthy ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.4)]' : 'bg-red-400/60'
                )}
              />
              <span
                className={cn(
                  'text-[11px] font-medium',
                  downloaderStatus?.healthy ? 'text-white/50' : 'text-red-400/70'
                )}
              >
                {downloaderStatus?.healthy
                  ? `${downloaderStatus.engine === 'builtin' ? 'Built-in' : downloaderStatus.engine}`
                  : i18n._(msg`settings.download.disconnected`)}
              </span>
            </div>
          </div>
        </div>


        {/* Tabs */}
        <div className="px-8 mb-6">
          <div className="flex items-center border-b border-white/[0.06] pb-px">
            <div className="flex gap-1 flex-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors relative cursor-pointer',
                    tab === t.key ? 'text-white' : 'text-white/35 hover:text-white/55'
                  )}
                >
                  <HugeiconsIcon icon={t.icon} size={14} />
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-px rounded-full font-semibold',
                        tab === t.key ? 'bg-white/[0.15] text-white' : 'bg-white/[0.08] text-white/40'
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                  {tab === t.key && (
                    <motion.div
                      layoutId="auto-download-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-[2px] bg-mm-accent rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAddUrlOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer mb-px"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} />
              {i18n._(msg`autoDownload.addUrl`)}
            </button>
          </div>
        </div>

        {/* Add URL dialog */}
        <AddUrlDialog open={addUrlOpen} onOpenChange={setAddUrlOpen} />

        {/* Tab content */}
        <div className="px-8 pb-16">
          {tab === 'search' && <SearchTab initialAnimeId={animeParam} />}
          {tab === 'subscriptions' && (
            <SubscriptionsSubTab
              rules={rules}
              feeds={feeds}
              groups={groups}
              isLoading={groupsLoading}
              onSwitchToSearch={() => setTab('search')}
            />
          )}
          {tab === 'downloading' && (
            <DownloadsSubTab
              downloads={activeDownloads}
              isLoading={groupsLoading}
            />
          )}
          {tab === 'completed' && (
            <CompletedSubTab
              downloads={completedDownloads}
              isLoading={groupsLoading}
            />
          )}
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH TAB — Anime-first flow
// ═══════════════════════════════════════════════════════════════════════════

function SearchTab({ initialAnimeId }: { initialAnimeId?: string }) {
  const { i18n } = useLingui();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);

  // Auto-select anime from URL param (e.g. from anime detail page)
  const numericAnimeId = initialAnimeId ? Number(initialAnimeId) : undefined;
  const { data: linkedAnime } = useQuery({
    queryKey: discoverKeys.detail(numericAnimeId!),
    queryFn: () => discoverApi.detail(numericAnimeId!),
    enabled: !!numericAnimeId && !selectedAnime,
  });

  useEffect(() => {
    if (linkedAnime && !selectedAnime) {
      setSelectedAnime(linkedAnime);
    }
  }, [linkedAnime, selectedAnime]);

  // 500ms debounce
  useEffect(() => {
    if (!input.trim()) {
      setQuery('');
      return;
    }
    const timer = setTimeout(() => setQuery(input.trim()), 500);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: animeResults = [], isLoading: isSearching } = useQuery({
    queryKey: discoverKeys.search(query),
    queryFn: () => discoverApi.search(query),
    enabled: query.length > 0,
  });

  if (selectedAnime) {
    return (
      <AnimeTorrentView
        anime={selectedAnime}
        onBack={() => setSelectedAnime(null)}
      />
    );
  }

  return (
    <>
      {/* Search input */}
      <Input
        placeholder={i18n._(msg`autoDownload.searchAnime`)}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/25 mb-5"
      />

      {/* Loading skeleton */}
      {isSearching && query && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-white/[0.03] animate-pulse">
              <div className="w-12 h-16 rounded bg-white/[0.06] shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 rounded bg-white/[0.06] w-[60%]" />
                <div className="h-2.5 rounded bg-white/[0.04] w-[40%]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isSearching && animeResults.length > 0 && (
        <div className="space-y-1.5">
          {animeResults.map((anime, i) => (
            <motion.button
              key={anime.bangumi_id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              onClick={() => setSelectedAnime(anime)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              {/* Cover thumbnail */}
              <img
                src={anime.cover_image}
                alt=""
                className="w-12 h-auto rounded object-cover shrink-0"
                style={{ aspectRatio: '3/4' }}
                loading="lazy"
              />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white truncate">
                  {anime.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {anime.media_type && <MediaTypeBadge type={anime.media_type} />}
                  {anime.score > 0 && (
                    <span className="text-[11px] text-yellow-400/80">
                      ★ {anime.score.toFixed(1)}
                    </span>
                  )}
                  {anime.episode_count > 0 && (
                    <span className="text-[11px] text-white/30">
                      {anime.episode_count} eps
                    </span>
                  )}
                  {anime.air_date && (
                    <span className="text-[11px] text-white/20">{anime.air_date}</span>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* No results */}
      {query && !isSearching && animeResults.length === 0 && (
        <p className="text-sm text-white/40 text-center py-8">
          {i18n._(msg`autoDownload.noResults`)}
        </p>
      )}

      {/* Empty state */}
      {!query && (
        <div className="text-center py-16">
          <HugeiconsIcon
            icon={Search01Icon}
            size={32}
            className="mx-auto mb-4 text-white/10"
          />
          <p className="text-white/25 text-sm">
            {i18n._(msg`autoDownload.searchHint`)}
          </p>
        </div>
      )}
    </>
  );
}

// ── Anime Torrent View ────────────────────────────────────────────────────

function AnimeTorrentView({
  anime,
  onBack,
}: {
  anime: AnimeSummary;
  onBack: () => void;
}) {
  const { i18n } = useLingui();
  const [source, setSource] = useState<string>('all');
  const [resolution, setResolution] = useState<string>('Any');
  const [subgroup, setSubgroup] = useState<string>('all');
  const [showSubscribe, setShowSubscribe] = useState(false);

  const relevantSources = getRelevantSources(anime);

  const { data: torrentData, isLoading } = useQuery({
    queryKey: discoverKeys.animeTorrents(anime.bangumi_id, source),
    queryFn: () => discoverApi.animeTorrents(anime.bangumi_id, source === 'all' ? undefined : source),
  });

  const results = torrentData?.results ?? [];

  // Extract unique subgroups
  const subgroups = useMemo(() => {
    const groups = new Set<string>();
    for (const r of results) {
      if (r.sub_group) groups.add(r.sub_group);
    }
    return Array.from(groups).sort();
  }, [results]);

  // Client-side filtering
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (resolution !== 'Any' && !r.title.toLowerCase().includes(resolution.toLowerCase())) {
        return false;
      }
      if (subgroup !== 'all' && r.sub_group !== subgroup) {
        return false;
      }
      return true;
    });
  }, [results, resolution, subgroup]);

  const [pendingDownloads, setPendingDownloads] = useState<Set<string>>(new Set());

  const addMutation = useMutation({
    mutationFn: (item: { url: string; name: string }) => torrentApi.add(item),
    onMutate: (item) => {
      setPendingDownloads((prev) => new Set(prev).add(item.url));
    },
    onSuccess: (_data, item) => {
      toast.success(i18n._(msg`autoDownload.downloadAdded`));
      setPendingDownloads((prev) => {
        const next = new Set(prev);
        next.delete(item.url);
        return next;
      });
    },
    onError: (err: Error, item) => {
      toast.error(err.message);
      setPendingDownloads((prev) => {
        const next = new Set(prev);
        next.delete(item.url);
        return next;
      });
    },
  });

  const downloadURL = (item: TorrentResult) => item.magnet || item.torrent_url;

  return (
    <>
      {/* Anime context header */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-6 relative overflow-hidden [&_a]:no-underline [&_a:hover]:no-underline">
        {/* Blurred background from cover */}
        {anime.cover_image && (
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: `url(${anime.cover_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px)',
          }} />
        )}

        <div className="relative flex gap-4">
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            className="absolute -left-1 -top-1 p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors cursor-pointer z-10"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          </button>

          {/* Cover — clickable to anime detail */}
          <Link
            to="/anime/$id"
            params={{ id: String(anime.bangumi_id) }}
            className="shrink-0 ml-5 hover:opacity-90 transition-opacity no-underline"
            style={{ textDecoration: 'none' }}
          >
            <img
              src={anime.cover_image}
              alt=""
              className="w-[80px] h-auto rounded-lg object-cover shadow-lg"
              style={{ aspectRatio: '3/4' }}
            />
          </Link>

          {/* Info */}
          <div className="flex-1 min-w-0 py-0.5">
            <h2 className="text-[17px] font-bold text-white leading-tight line-clamp-2">
              {anime.title}
            </h2>
            {anime.title_original && anime.title_original !== anime.title && (
              <p className="text-[11px] text-white/35 mt-0.5 truncate">{anime.title_original}</p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {anime.media_type && <MediaTypeBadge type={anime.media_type} />}
              {anime.score > 0 && (
                <span className="text-[12px] font-semibold text-yellow-400/90 tabular-nums">
                  ★ {anime.score.toFixed(1)}
                </span>
              )}
              {anime.episode_count > 0 && (
                <span className="text-[12px] text-white/45">
                  {anime.episode_count} {i18n._(msg`common.ep`)}
                </span>
              )}
              {anime.air_date && (
                <span className="text-[12px] text-white/45">
                  {anime.air_date.slice(0, 7)}
                </span>
              )}
            </div>

            {/* Description snippet */}
            {anime.description && (
              <p className="text-[11px] text-white/30 mt-2 line-clamp-2 leading-relaxed max-w-[500px]">
                {anime.description}
              </p>
            )}

            {/* Torrent count summary */}
            {!isLoading && results.length > 0 && (
              <p className="text-[11px] text-white/25 mt-2">
                {results.length} {i18n._(msg`autoDownload.torrentsFound`)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="space-y-3 mb-5">
        {/* Source */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/30 w-16 shrink-0">
            {i18n._(msg`autoDownload.source`)}
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {relevantSources.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer',
                  source === s
                    ? 'bg-white/[0.12] text-white'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                )}
              >
                {SOURCE_LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/30 w-16 shrink-0">
            {i18n._(msg`autoDownload.resolution`)}
          </span>
          <div className="flex gap-1.5">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(r)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer',
                  resolution === r
                    ? 'bg-white/[0.12] text-white'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Subgroup */}
        {subgroups.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/30 w-16 shrink-0">
              {i18n._(msg`autoDownload.subgroup`)}
            </span>
            <select
              value={subgroup}
              onChange={(e) => setSubgroup(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-md text-[12px] text-white/70 px-2.5 py-1.5 outline-none cursor-pointer"
            >
              <option value="all">{i18n._(msg`autoDownload.allSubgroups`)}</option>
              {subgroups.map((sg) => (
                <option key={sg} value={sg}>
                  {sg}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subscribe action — only when a specific RSS source is selected */}
        {filteredResults.length > 0 && source !== 'all' && RSS_SOURCES.includes(source as 'mikan' | 'nyaa' | 'dmhy') && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setShowSubscribe(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[12px] font-medium text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <HugeiconsIcon icon={RssIcon} size={14} />
              {i18n._(msg`autoDownload.subscribeFilter`)}
            </button>
            <span className="text-[11px] text-white/25">
              {SOURCE_LABELS[source]} · {resolution !== 'Any' ? resolution : i18n._(msg`autoDownload.anyResolution`)} · {subgroup !== 'all' ? subgroup : i18n._(msg`autoDownload.allSubgroups`)}
            </span>
          </div>
        )}
        {filteredResults.length > 0 && source === 'all' && (
          <p className="text-[11px] text-white/20 mt-3 pt-3 border-t border-white/[0.04]">
            {i18n._(msg`autoDownload.selectSourceToSubscribe`)}
          </p>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-white/[0.03] animate-pulse">
              <div className="h-3 rounded bg-white/[0.06] w-[70%] mb-2" />
              <div className="h-2.5 rounded bg-white/[0.04] w-[45%]" />
            </div>
          ))}
        </div>
      )}

      {/* Torrent list */}
      {!isLoading && filteredResults.length > 0 && (
        <div className="space-y-1.5">
          {filteredResults.map((item, i) => (
            <motion.div
              key={`${item.info_hash || item.torrent_url || item.magnet}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
              className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white break-words leading-relaxed">
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <SourceBadge source={item.source_site} />
                  {item.sub_group && (
                    <span className="text-[10px] text-white/30">{item.sub_group}</span>
                  )}
                  {item.size && (
                    <span className="text-[10px] text-white/25">{item.size}</span>
                  )}
                  {item.seeders > 0 && (
                    <span className="text-[10px] text-green-400/70">
                      ↑{item.seeders}
                    </span>
                  )}
                  {item.leechers > 0 && (
                    <span className="text-[10px] text-red-400/50">
                      ↓{item.leechers}
                    </span>
                  )}
                  {item.publish_date && (
                    <span className="text-[10px] text-white/15">{item.publish_date}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pendingDownloads.has(downloadURL(item)) || !downloadURL(item)}
                onClick={() =>
                  addMutation.mutate({ url: downloadURL(item), name: item.title })
                }
                className="shrink-0 text-[11px]"
              >
                {i18n._(msg`autoDownload.download`)}
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      {/* No results */}
      {!isLoading && filteredResults.length === 0 && results.length > 0 && (
        <p className="text-sm text-white/40 text-center py-8">
          {i18n._(msg`autoDownload.noFilteredResults`)}
        </p>
      )}
      {!isLoading && results.length === 0 && (
        <p className="text-sm text-white/40 text-center py-8">
          {i18n._(msg`autoDownload.noTorrents`)}
        </p>
      )}

      {/* Subscribe confirmation modal */}
      <AnimatePresence>
        {showSubscribe && (
          <SubscribePanel
            anime={anime}
            source={source}
            resolution={resolution}
            subgroup={subgroup}
            matchCount={filteredResults.length}
            onClose={() => setShowSubscribe(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Subscribe Confirmation Panel ──────────────────────────────────────────

function SubscribePanel({
  anime,
  source,
  resolution,
  subgroup,
  matchCount,
  onClose,
}: {
  anime: AnimeSummary;
  source: string;
  resolution: string;
  subgroup: string;
  matchCount: number;
  onClose: () => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  // Default RSS source: use current filter source if it supports RSS, otherwise mikan
  const defaultSource = RSS_SOURCES.includes(source as 'mikan' | 'nyaa' | 'dmhy')
    ? (source as 'mikan' | 'nyaa' | 'dmhy')
    : 'mikan';
  const [rssSource, setRssSource] = useState<'mikan' | 'nyaa' | 'dmhy'>(defaultSource);
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

  // Default to first library so downloads auto-trigger the scan pipeline
  const [libraryId, setLibraryId] = useState<string>('');
  useEffect(() => {
    if (libraries.length > 0 && !libraryId) {
      setLibraryId(libraries[0].id);
    }
  }, [libraries, libraryId]);

  const subscribeMutation = useMutation({
    mutationFn: (data: SubscribeInput) => subscribeApi.subscribe(data),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.subscribeSuccess`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleConfirm = () => {
    subscribeMutation.mutate({
      anime_name: anime.title,
      source: rssSource,
      bangumi_id: anime.bangumi_id,
      sub_group: subgroup !== 'all' ? subgroup : undefined,
      resolution: resolution !== 'Any' ? resolution : undefined,
      library_id: libraryId || undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-4 rounded-xl border border-white/[0.08] bg-zinc-900 p-6 shadow-2xl"
      >
        {/* Header with anime cover */}
        <div className="flex gap-3 mb-5">
          {anime.cover_image && (
            <img
              src={anime.cover_image}
              alt=""
              className="w-12 h-[68px] rounded-md object-cover shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-white truncate">{anime.title}</h3>
            {anime.title_original && anime.title_original !== anime.title && (
              <p className="text-[11px] text-white/30 truncate mt-0.5">{anime.title_original}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {anime.media_type && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">
                  {anime.media_type}
                </span>
              )}
              {matchCount > 0 && (
                <span className="text-[10px] text-white/30">
                  {matchCount} {i18n._(msg`autoDownload.torrentsFound`)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* RSS Source picker — user must explicitly choose */}
          <div>
            <label className="text-[11px] text-white/40 mb-1.5 block">
              {i18n._(msg`autoDownload.rssSource`)}
            </label>
            <div className="flex gap-1.5">
              {RSS_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRssSource(s)}
                  className={cn(
                    'flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                    rssSource === s
                      ? 'bg-white/[0.12] text-white'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  )}
                >
                  {SOURCE_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          </div>

          {/* Current filters summary */}
          <div className="flex flex-wrap items-center gap-2">
            {subgroup !== 'all' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70">
                {subgroup}
              </span>
            )}
            {resolution !== 'Any' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70">
                {resolution}
              </span>
            )}
            {subgroup === 'all' && resolution === 'Any' && (
              <span className="text-[10px] text-white/25">{i18n._(msg`autoDownload.noFilters`)}</span>
            )}
          </div>

          {/* Library picker */}
          {libraries.length > 0 && (
            <div>
              <label className="text-[11px] text-white/40 mb-1.5 block">
                {i18n._(msg`autoDownload.library`)}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLibraryId('')}
                  className={cn(
                    'px-3 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                    !libraryId
                      ? 'bg-white/[0.12] text-white'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  )}
                >
                  {i18n._(msg`autoDownload.noLibrary`)}
                </button>
                {libraries.map((lib) => (
                  <button
                    key={lib.id}
                    type="button"
                    onClick={() => setLibraryId(lib.id)}
                    className={cn(
                      'px-3 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                      libraryId === lib.id
                        ? 'bg-white/[0.12] text-white'
                        : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                    )}
                  >
                    {lib.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end mt-6">
          <Button variant="outline" onClick={onClose} className="text-[13px]">
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={subscribeMutation.isPending}
            className="font-semibold text-[13px]"
          >
            {subscribeMutation.isPending
              ? '...'
              : i18n._(msg`autoDownload.confirm`)}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED CHECKBOX
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatETA(seconds: number): string {
  if (seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Hook to fetch anime cover by bangumi_id with 24h cache. */
function useAnimeDetail(bangumiId: number | undefined) {
  return useQuery({
    queryKey: discoverKeys.detail(bangumiId!),
    queryFn: () => discoverApi.detail(bangumiId!),
    enabled: !!bangumiId,
    staleTime: 86400000,
  });
}

/** Small cover thumbnail component that fetches anime detail on demand. Clickable → anime detail page. */
function AnimeCover({ bangumiId, size = 62 }: { bangumiId?: number; size?: number }) {
  const { data } = useAnimeDetail(bangumiId);
  const h = Math.round(size * (4 / 3));
  const placeholder = (
    <div
      className="rounded bg-white/[0.06] shrink-0"
      style={{ width: size, height: h }}
    />
  );
  if (!data?.cover_image) return placeholder;

  const img = (
    <img
      src={data.cover_image}
      alt=""
      className="rounded object-cover shrink-0"
      style={{ width: size, height: h }}
      loading="lazy"
    />
  );

  if (bangumiId) {
    return (
      <Link
        to="/anime/$id"
        params={{ id: String(bangumiId) }}
        className="shrink-0 hover:opacity-80 transition-opacity no-underline"
        style={{ textDecoration: 'none' }}
      >
        {img}
      </Link>
    );
  }
  return img;
}

// ── Subscriptions Sub-tab ────────────────────────────────────────────────

/** Wrapper card for subscriptions — fetches anime detail and renders AnimeCard or gradient fallback. */
function SubscriptionAnimeCard({
  rule,
  feed,
  group,
  index,
  onClick,
}: {
  rule: import('../lib/api/downloads').DownloadRule;
  feed?: import('../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  index: number;
  onClick: () => void;
}) {
  const bangumiId = group?.bangumi_id ?? rule.bangumi_id ?? undefined;
  const { data: animeDetail } = useAnimeDetail(bangumiId);

  // Build AnimeSummary from detail response or fallback to placeholder
  if (animeDetail && bangumiId) {
    const summary: AnimeSummary = {
      bangumi_id: bangumiId,
      title: animeDetail.title || rule.name,
      title_original: animeDetail.title_original || '',
      cover_image: animeDetail.cover_image || '',
      episode_count: animeDetail.episode_count || 0,
      score: animeDetail.score || 0,
      genres: animeDetail.genres,
      air_date: animeDetail.air_date,
      media_type: animeDetail.media_type,
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.025, duration: 0.3 }}
      >
        <AnimeCard anime={summary} onClick={onClick}>
          {/* Status dot + source badge overlay */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                rule.enabled ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-white/30'
              )}
            />
            {feed && <SourceBadge source={feed.type} />}
          </div>
          {/* Episode progress */}
          {group && group.complete_count > 0 && (
            <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-mm-accent tabular-nums backdrop-blur-md">
              {group.complete_count} / {animeDetail.episode_count || group.total_count}
            </span>
          )}
        </AnimeCard>
      </motion.div>
    );
  }

  // Fallback card for rules without bangumi_id or while loading
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
    >
      <button
        type="button"
        onClick={onClick}
        className="group/media-entry-card relative flex flex-col w-full text-left cursor-pointer"
      >
        <div
          className="relative aspect-[6/8] rounded-md overflow-hidden"
          style={{ background: animeGradient(rule.name) }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <span className="text-[11px] font-medium text-white/50 text-center line-clamp-3">
              {rule.name}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#0c0c0c] to-transparent opacity-90" />
          {/* Status dot + source */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                rule.enabled ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-white/30'
              )}
            />
            {feed && <SourceBadge source={feed.type} />}
          </div>
        </div>
        <div className="mt-1.5 px-0.5 text-center">
          <p className="text-sm font-medium text-[--foreground] line-clamp-2 leading-snug">
            {rule.name}
          </p>
        </div>
      </button>
    </motion.div>
  );
}

/** Shared content for subscription detail — used by both Sheet (desktop) and Modal (mobile). */
function SubscriptionDetailContent({
  rule,
  feed,
  group,
  onClose,
}: {
  rule: import('../lib/api/downloads').DownloadRule;
  feed?: import('../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  onClose: () => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const bangumiId = group?.bangumi_id ?? rule.bangumi_id ?? undefined;
  const { data: animeDetail } = useAnimeDetail(bangumiId);

  const refreshMutation = useMutation({
    mutationFn: (id: string) => rssFeedApi.refresh(id),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: async (feedId: string) => {
      const allRules = queryClient.getQueryData<import('../lib/api/downloads').DownloadRule[]>(downloadKeys.rules()) ?? [];
      const feedRules = allRules.filter((r) => r.rss_feed_id === feedId);
      for (const r of feedRules) await ruleApi.delete(r.id);
      await rssFeedApi.delete(feedId);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.deleted`));
      onClose();
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: downloadApi.pause,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const resumeMutation = useMutation({
    mutationFn: downloadApi.resume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const deleteDlMutation = useMutation({
    mutationFn: downloadApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const hasCover = animeDetail?.cover_image?.startsWith('http');
  const totalEps = animeDetail?.episode_count || group?.total_count || 0;
  const completedEps = group?.complete_count ?? 0;
  const progressPct = totalEps > 0 ? Math.round((completedEps / totalEps) * 100) : 0;

  return (
    <div className="space-y-0">
      {/* ── Cover hero ── */}
      <motion.div
        className="relative -mx-6 -mt-6 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Blurred background */}
        <div className="absolute inset-0">
          {hasCover ? (
            <img
              src={animeDetail!.cover_image}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'blur(32px) saturate(1.3) brightness(0.35)', transform: 'scale(1.4)' }}
            />
          ) : (
            <div className="w-full h-full" style={{ background: animeGradient(rule.name) }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--mm-bg)]/60 to-[var(--mm-bg)]" />
        </div>

        {/* Content over blur */}
        <div className="relative z-[1] px-6 pt-10 pb-5">
          <div className="flex items-end gap-4">
            {/* Poster */}
            <motion.div
              className="shrink-0 w-[90px] h-[126px] rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.08]"
              style={hasCover ? undefined : { background: animeGradient(rule.name) }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {hasCover ? (
                <img src={animeDetail!.cover_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <span className="text-[10px] text-white/40 text-center line-clamp-3">{rule.name}</span>
                </div>
              )}
            </motion.div>

            <motion.div
              className="min-w-0 flex-1 pb-0.5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <h2 className="text-[17px] font-bold text-white leading-snug line-clamp-2">
                {animeDetail?.title || rule.name}
              </h2>
              {animeDetail?.title_original && animeDetail.title_original !== animeDetail.title && (
                <p className="text-[11px] text-white/30 truncate mt-0.5">{animeDetail.title_original}</p>
              )}
              {/* Inline meta */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {animeDetail && animeDetail.score > 0 && (
                  <span className="text-[13px] font-bold text-mm-accent tabular-nums">
                    ♡ {animeDetail.score.toFixed(1)}
                  </span>
                )}
                {totalEps > 0 && (
                  <span className="text-[11px] text-white/35 tabular-nums">
                    {totalEps} {i18n._(msg`common.ep`)}
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ── Status + badges row ── */}
      <motion.div
        className="flex items-center gap-1.5 flex-wrap pt-4 pb-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md',
            rule.enabled
              ? 'bg-green-500/10 text-green-400/90'
              : 'bg-white/[0.06] text-white/35'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', rule.enabled ? 'bg-green-400' : 'bg-white/25')} />
          {rule.enabled ? i18n._(msg`autoDownload.active`) : i18n._(msg`autoDownload.paused`)}
        </span>
        {feed && <SourceBadge source={feed.type} />}
        {rule.resolution_filter && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70 font-medium">
            {rule.resolution_filter}
          </span>
        )}
        {rule.subgroup_filter && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70 font-medium">
            {rule.subgroup_filter}
          </span>
        )}
      </motion.div>

      {/* ── Episode progress bar ── */}
      {totalEps > 0 && (
        <motion.div
          className="pb-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px] text-white/40">{i18n._(msg`autoDownload.episodes`)}</span>
            <span className="text-[12px] text-white/60 font-medium tabular-nums">
              {completedEps}<span className="text-white/20"> / </span>{totalEps}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-mm-accent/80"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ delay: 0.4, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          </div>
        </motion.div>
      )}

      {/* ── Stats row ── */}
      <motion.div
        className="flex items-center gap-4 text-[11px] pb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div>
          <span className="text-white/25">{i18n._(msg`autoDownload.interval`)}</span>
          <span className="text-white/60 font-medium ml-1.5">{feed?.fetch_interval_minutes ?? 30}m</span>
        </div>
        {rule.last_triggered_at && (
          <>
            <span className="text-white/10">·</span>
            <div>
              <span className="text-white/25">{i18n._(msg`autoDownload.lastTriggered`)}</span>
              <span className="text-white/60 font-medium ml-1.5">{new Date(rule.last_triggered_at).toLocaleDateString()}</span>
            </div>
          </>
        )}
        <span className="text-white/10">·</span>
        <span className="text-white/60 font-medium capitalize">{feed?.type ?? '—'}</span>
      </motion.div>

      {/* ── Actions ── */}
      <motion.div
        className="flex items-center gap-2 pb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {bangumiId && (
          <Link
            to="/anime/$id"
            params={{ id: String(bangumiId) }}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            {i18n._(msg`autoDownload.viewAnime`)}
          </Link>
        )}
        {feed && (
          <button
            type="button"
            onClick={() => refreshMutation.mutate(feed.id)}
            disabled={refreshMutation.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors cursor-pointer',
              'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
            )}
          >
            <HugeiconsIcon icon={Refresh03Icon} size={13} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            {i18n._(msg`autoDownload.refresh`)}
          </button>
        )}
        <button
          type="button"
          onClick={() => feed && deleteFeedMutation.mutate(feed.id)}
          disabled={deleteFeedMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg bg-white/[0.04] text-white/30 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer ml-auto"
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
        </button>
      </motion.div>

      {/* ── Downloads ── */}
      <motion.div
        className="border-t border-white/[0.06] pt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25">
            {i18n._(msg`autoDownload.subtab.downloads`)}
          </h3>
          {group && group.downloads.length > 0 && (
            <span className="text-[10px] text-white/20 tabular-nums">{group.downloads.length}</span>
          )}
        </div>
        {group && group.downloads.length > 0 ? (
          <div className="space-y-1">
            {group.downloads.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.04, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <DownloadCard
                  dl={dl}
                  onPause={() => pauseMutation.mutate(dl.gid)}
                  onResume={() => resumeMutation.mutate(dl.gid)}
                  onDelete={() => deleteDlMutation.mutate(dl.gid)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <HugeiconsIcon icon={RssIcon} size={24} className="mx-auto mb-2 text-white/[0.08]" />
            <p className="text-[12px] text-white/20">
              {i18n._(msg`autoDownload.noDownloadsYet`)}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Responsive subscription detail — bottom drawer on mobile, right drawer on desktop.
 * Kept for potential future use; currently replaced by RuleEditorModal. */
// @ts-expect-error TS6133 — retained for future use
function SubscriptionDetailModal({
  rule,
  feed,
  group,
  open,
  onClose,
}: {
  rule: import('../lib/api/downloads').DownloadRule;
  feed?: import('../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      direction={isMobile ? 'bottom' : 'right'}
    >
      <DrawerContent className="overflow-y-auto p-6">
        <SubscriptionDetailContent rule={rule} feed={feed} group={group} onClose={onClose} />
      </DrawerContent>
    </Drawer>
  );
}

function SubscriptionsSubTab({
  rules,
  feeds,
  groups,
  isLoading,
  onSwitchToSearch,
}: {
  rules: import('../lib/api/downloads').DownloadRule[];
  feeds: import('../lib/api/downloads').RSSFeed[];
  groups: DownloadGroup[];
  isLoading: boolean;
  onSwitchToSearch: () => void;
}) {
  const { i18n } = useLingui();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);

  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const ruleGroupMap = new Map<string, DownloadGroup>();
  for (const g of groups) {
    if (g.rule_id) ruleGroupMap.set(g.rule_id, g);
  }

  const selectedRule = rules.find((r) => r.id === selectedRuleId);

  // Loading skeleton — card grid
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[6/8] w-full rounded-md" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-white/[0.04]">
            <HugeiconsIcon icon={RssIcon} size={24} className="text-white/15" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white/50 mb-1">
              {i18n._(msg`autoDownload.noSubscriptions`)}
            </p>
            <p className="text-[12px] text-white/25">
              {i18n._(msg`autoDownload.noSubscriptionsHint`)}
            </p>
          </div>
          <Button
            onClick={onSwitchToSearch}
            variant="outline"
            className="shrink-0 text-[12px]"
          >
            {i18n._(msg`autoDownload.goToSearch`)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with New Rule button */}
      <div className="flex items-center justify-end mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreateRuleOpen(true)}
          className="text-[11px] text-white/50 border-white/[0.08] hover:bg-white/[0.04]"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} />
          {i18n._(msg`ruleEditor.newRule`)}
        </Button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
        {rules.map((rule, i) => (
          <SubscriptionAnimeCard
            key={rule.id}
            rule={rule}
            feed={feedMap.get(rule.rss_feed_id)}
            group={ruleGroupMap.get(rule.id)}
            index={i}
            onClick={() => setSelectedRuleId(rule.id)}
          />
        ))}
      </div>

      {/* Rule editor modal (edit) */}
      {selectedRule && (
        <RuleEditorModal
          rule={selectedRule}
          feed={feedMap.get(selectedRule.rss_feed_id)}
          open={!!selectedRuleId}
          onClose={() => setSelectedRuleId(null)}
        />
      )}

      {/* Rule editor modal (create new) */}
      <RuleEditorModal
        open={createRuleOpen}
        onClose={() => setCreateRuleOpen(false)}
      />
    </>
  );
}

// ── Add URL Dialog ──────────────────────────────────────────────────────

function AddUrlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [urlInput, setUrlInput] = useState('');

  const addMutation = useMutation({
    mutationFn: (url: string) => downloadApi.add({ url }),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.downloadAdded`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setUrlInput('');
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} title={i18n._(msg`autoDownload.addUrl`)} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (urlInput.trim()) addMutation.mutate(urlInput.trim());
        }}
        className="space-y-4"
      >
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={i18n._(msg`autoDownload.pasteUrl`)}
          className="font-mono text-sm bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/25"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-[12px] text-white/50 border-white/[0.08] hover:bg-white/[0.04]"
          >
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            type="submit"
            disabled={addMutation.isPending || !urlInput.trim()}
            className="text-[12px] font-semibold text-black bg-mm-accent hover:bg-mm-accent/90"
          >
            {addMutation.isPending
              ? i18n._(msg`autoDownload.adding`)
              : i18n._(msg`autoDownload.add`)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Downloads Sub-tab ────────────────────────────────────────────────────

function DownloadsSubTab({
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
      list = list.filter((d) => d.name.toLowerCase().includes(q) || d.rule_name?.toLowerCase().includes(q));
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
  const targets = hasSelection
    ? downloads.filter((d) => selected.has(d.gid))
    : downloads;

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
  const [deleteTargetFiles, setDeleteTargetFiles] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('milmil:autoDeleteFiles') === 'true'
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
  const autoDeleteFiles = typeof window !== 'undefined' && localStorage.getItem('milmil:autoDeleteFiles') === 'true';
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
            <HugeiconsIcon icon={Search01Icon} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={i18n._(msg`autoDownload.searchDownloads`)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] font-medium text-white/40 hover:text-white/60 hover:border-white/[0.12] transition-colors cursor-pointer"
            >
              <HugeiconsIcon icon={ArrowUpDownIcon} size={12} />
              {sortLabels[sortBy]}
            </button>
            {sortMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-lg bg-[#1a1a1e] border border-white/[0.08] py-1 shadow-xl">
                  {(Object.keys(sortLabels) as (typeof sortBy)[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setSortBy(key); setSortMenuOpen(false); }}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer',
                        sortBy === key ? 'text-mm-accent bg-white/[0.04]' : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]'
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
                <span>{activeCount} {i18n._(msg`autoDownload.downloading`)}</span>
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
              <span>{downloads.length} {i18n._(msg`autoDownload.items`)}</span>
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
                  <TooltipContent side="bottom">{i18n._(msg`autoDownload.resumeAll`)}</TooltipContent>
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
                  <TooltipContent side="bottom">{i18n._(msg`autoDownload.pauseAll`)}</TooltipContent>
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
                <TooltipContent side="bottom">{i18n._(msg`autoDownload.refreshAll`)}</TooltipContent>
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
                    onClick={() => { setDeleteDialogOpen(true); setDeleteFiles(autoDeleteFiles); }}
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
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  size={18}
                />
                <span className="text-[12px] font-medium text-white/70">
                  {selected.size} {i18n._(msg`autoDownload.selected`)}
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] text-mm-accent/70 hover:text-mm-accent cursor-pointer transition-colors"
                >
                  {allSelected ? i18n._(msg`autoDownload.deselectAll`) : i18n._(msg`autoDownload.selectAll`)}
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
                  onClick={() => { setDeleteDialogOpen(true); setDeleteFiles(autoDeleteFiles); }}
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
        onClose={() => { setDeleteDialogOpen(false); setDeleteFiles(false); }}
        title={hasSelection
          ? `${i18n._(msg`autoDownload.deleteSelected`)} (${selected.size})`
          : i18n._(msg`autoDownload.deleteAll`)}
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
            variant="outline"
            onClick={() => { setDeleteDialogOpen(false); setDeleteFiles(false); }}
            className="text-[12px] text-white/50 border-white/[0.08] hover:bg-white/[0.04]"
          >
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            type="button"
            onClick={() => hasSelection ? deleteSelectedMutation.mutate() : deleteAllMutation.mutate()}
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
          <Checkbox checked={deleteTargetFiles} onCheckedChange={(v) => setDeleteTargetFiles(v)} size={16} />
          <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors select-none">
            {i18n._(msg`autoDownload.alsoDeleteFiles`)}
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTargetGid(null)}
            className="text-[12px] text-white/50 border-white/[0.08] hover:bg-white/[0.04]"
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
          <p className="text-white/25 text-sm">
            {i18n._(msg`autoDownload.noResults`)}
          </p>
        </div>
      ) : (
        <div className="text-center py-12">
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={32}
            className="mx-auto mb-3 text-white/10"
          />
          <p className="text-white/25 text-sm">
            {i18n._(msg`autoDownload.noActiveDownloads`)}
          </p>
        </div>
      )}

      {/* Download detail drawer */}
      <DownloadDetailModal
        dl={detailGid ? filteredDownloads.find((d) => d.gid === detailGid) : undefined}
        ruleName={detailGid ? filteredDownloads.find((d) => d.gid === detailGid)?.rule_name : undefined}
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

  if (!d) return <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}><SheetContent side="right" className="!w-[480px] !max-w-[90vw]" /></Sheet>;

  const parsed = parseDownloadName(d.name);
  const pct = d.total_bytes > 0 ? Math.min(100, (d.completed_bytes / d.total_bytes) * 100) : 0;
  const remaining = d.total_bytes > 0 ? d.total_bytes - d.completed_bytes : 0;
  const eta = d.speed_bytes > 0 ? remaining / d.speed_bytes : 0;
  const isActive = d.status === 'active' || d.status === 'paused' || d.status === 'waiting';

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="!w-[480px] !max-w-[90vw]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-white truncate">{parsed.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                {parsed.episode && (
                  <span className="text-[12px] font-semibold text-mm-accent tabular-nums">EP {parsed.episode}</span>
                )}
                <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                  <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_INDICATOR[d.status] ?? 'bg-white/10')} />
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
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                />
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] tabular-nums text-white/40">
                {formatBytes(d.completed_bytes)} / {formatBytes(d.total_bytes)}
              </span>
              <span className="text-[11px] tabular-nums text-white/50 font-medium">{Math.round(pct)}%</span>
            </div>
          </div>
        )}

        {/* Activity stats — speed, ETA, connections */}
        {d.status === 'active' && (
          <div className="px-5 pb-3 flex items-center gap-4">
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-wider">{i18n._(msg`autoDownload.detail.speed`)}</p>
              <p className="text-[13px] tabular-nums text-white/70 font-medium">{formatSpeed(d.speed_bytes)}</p>
            </div>
            {eta > 0 && (
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-wider">ETA</p>
                <p className="text-[13px] tabular-nums text-white/70 font-medium">{formatETA(eta)}</p>
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
          <InfoRow label={i18n._(msg`autoDownload.detail.created`)} value={new Date(d.created_at).toLocaleString()} />
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
                        <p className="text-[11px] text-white/50 truncate" title={f.path}>{fileName}</p>
                      </div>
                      <span className="text-[10px] tabular-nums text-white/25 shrink-0">{formatBytes(f.size)}</span>
                      {f.size > 0 && (
                        <span className={cn(
                          'text-[10px] tabular-nums w-8 text-right shrink-0',
                          filePct >= 100 ? 'text-green-400/50' : 'text-white/20'
                        )}>
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
                  variant="outline"
                  onClick={() => pauseMutation.mutate(d.gid)}
                  disabled={pauseMutation.isPending}
                  className="text-[11px] border-white/[0.08] text-white/50 hover:text-white/80"
                >
                  <HugeiconsIcon icon={PauseIcon} size={12} />
                  {i18n._(msg`autoDownload.pause`)}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resumeMutation.mutate(d.gid)}
                  disabled={resumeMutation.isPending}
                  className="text-[11px] border-white/[0.08] text-white/50 hover:text-white/80"
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
      <p className={cn('text-[12px] text-white/60 break-all', mono && 'font-mono text-[11px]')}>{value}</p>
    </div>
  );
}

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

// ── SeedStatusDot ────────────────────────────────────────────────────────

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
      {showCover && (
        <AnimeCover bangumiId={coverBangumiId} size={36} />
      )}

      {parsed.episode && (
        <span className="text-[11px] font-semibold text-mm-accent/70 tabular-nums w-[52px] shrink-0">
          EP {parsed.episode}
        </span>
      )}

      <span className="text-[10px] text-white/30 truncate flex-1 min-w-0">
        {download.name}
      </span>

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
      className="border border-white/[0.06] rounded-[10px] overflow-hidden"
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
            {formatBytes(group.totalBytes)} · Latest: {new Date(group.latestDate).toLocaleDateString()}
            {group.libraryName && (
              <> · <span className="text-mm-accent/40">{group.libraryName}</span></>
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

              <div className="flex items-center justify-between pt-2 mt-1 mx-2 border-t border-white/[0.03]">
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
                      onClick={() => navigate({ to: '/watch/$animeId', params: { animeId: String(effectiveBangumiId) } })}
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
    const sectionMap = new Map<string, { download: CompletedDownload; parsed: ReturnType<typeof parseDownloadName> }[]>();

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

// ── Completed Sub-tab ────────────────────────────────────────────────────

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

// ── Filename parser — extract episode, subgroup, resolution from torrent names ──

function parseDownloadName(name: string): {
  title: string;
  subgroup: string | null;
  episode: string | null;
  tags: string[];
} {
  // Extract [SubGroup] prefix
  const subgroupMatch = name.match(/^\[([^\]]+)\]\s*/);
  const subgroup: string | null = subgroupMatch?.[1] || null;
  let rest = subgroupMatch ? name.slice(subgroupMatch[0].length) : name;

  // Remove file extension
  rest = rest.replace(/\.(mkv|mp4|avi|flv|wmv|ts|m2ts)$/i, '');

  // Extract episode number patterns like " - 34 " or "[36]" or "S01E05"
  const epMatch = rest.match(/\s-\s(\d{1,3})\b|\[(\d{1,3})\]|S\d{1,2}E(\d{1,3})/i);
  const episode: string | null = epMatch ? (epMatch[1] || epMatch[2] || epMatch[3] || null) : null;

  // Extract bracketed tags like [1080p], [HEVC-10bit], [WebRip]
  const tagMatches = rest.match(/\[([^\]]+)\]/g) || [];
  const tags = tagMatches
    .map((t) => t.slice(1, -1))
    .filter((t) => /\d{3,4}p|HEVC|AVC|10bit|WebRip|BDRip|FLAC|AAC|x264|x265|ASSx?\d?/i.test(t));

  // Clean title: remove all brackets and trim
  let title = rest
    .replace(/\[([^\]]*)\]/g, '')
    .replace(/\(([^)]*)\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Trim trailing episode separator
  title = title.replace(/\s-\s*$/, '').replace(/\s-\s\d{1,3}\s*$/, '').trim();

  return { title: title || name, subgroup, episode, tags };
}

// ── Status indicator colors ──

const STATUS_INDICATOR: Record<string, string> = {
  active: 'bg-green-400',
  waiting: 'bg-amber-400',
  paused: 'bg-white/20',
  complete: 'bg-blue-400',
  error: 'bg-red-400',
  removed: 'bg-white/10',
};

// ── Download Card (shared by Downloads sub-tab & Subscription expand) ────

function DownloadCard({
  dl,
  ruleName,
  selected,
  onSelect,
  onClick,
  onPause,
  onResume,
  onDelete,
}: {
  dl: {
    id: string;
    gid: string;
    name: string;
    status: string;
    total_bytes: number;
    completed_bytes: number;
    speed_bytes: number;
    created_at: string;
  };
  ruleName?: string;
  selected?: boolean;
  onSelect?: (e?: React.MouseEvent) => void;
  onClick?: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const { i18n } = useLingui();
  const pct =
    dl.total_bytes > 0 ? Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100) : 0;
  const remaining = dl.total_bytes > 0 ? dl.total_bytes - dl.completed_bytes : 0;
  const dlEta = dl.speed_bytes > 0 ? remaining / dl.speed_bytes : 0;

  const isActive = dl.status === 'active' || dl.status === 'paused' || dl.status === 'waiting';
  const parsed = parseDownloadName(dl.name);
  const hasRuleName = ruleName && ruleName !== 'Manual Downloads';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={cn(
        'group/dl relative flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors',
        selected && 'bg-white/[0.04]',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Checkbox */}
      {onSelect && (
        <div
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onSelect(e as unknown as React.MouseEvent); }}
        >
          <Checkbox checked={selected} size={18} />
        </div>
      )}


      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[13px] font-medium text-white/90 truncate">
            {parsed.title}
          </p>
          {parsed.episode && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[12px] font-semibold text-mm-accent tabular-nums shrink-0"
            >
              EP {parsed.episode}
            </motion.span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {parsed.subgroup && (
            <span className="text-[10px] text-white/30 truncate max-w-[120px]">
              {parsed.subgroup}
            </span>
          )}
          {parsed.subgroup && parsed.tags.length > 0 && (
            <span className="text-white/10 text-[10px]">/</span>
          )}
          {parsed.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-1 py-px rounded bg-white/[0.04] text-white/25 font-medium uppercase tracking-wide"
            >
              {tag}
            </span>
          ))}
          {!parsed.subgroup && parsed.tags.length === 0 && hasRuleName && (
            <span className="text-[10px] text-white/25 truncate">{ruleName}</span>
          )}
        </div>

        {/* Progress bar with inline stats */}
        {isActive && dl.total_bytes > 0 && (
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="relative flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                animate={{
                  width: `${pct}%`,
                  backgroundColor: dl.status === 'active' ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.15)',
                }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              />
              {/* Shimmer on active downloads */}
              {dl.status === 'active' && dl.speed_bytes > 0 && (
                <motion.div
                  className="absolute inset-y-0 w-[60%] rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                  }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
                />
              )}
            </div>
            <motion.span
              className="text-[10px] tabular-nums text-white/30 shrink-0"
              key={formatBytes(dl.completed_bytes)}
            >
              {formatBytes(dl.completed_bytes)}
              <span className="text-white/15"> / </span>
              {formatBytes(dl.total_bytes)}
            </motion.span>
          </div>
        )}
        {isActive && dl.total_bytes === 0 && (
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="relative flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="absolute inset-y-0 w-[40%] rounded-full bg-white/[0.08]"
                animate={{ x: ['-100%', '350%'] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
              />
            </div>
            <span className="text-[10px] text-white/20 shrink-0">
              {dl.status === 'waiting'
                ? i18n._(msg`autoDownload.waiting`)
                : i18n._(msg`autoDownload.connecting`)}
            </span>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Speed + ETA — only when we have size info */}
        {isActive && dl.status === 'active' && dl.total_bytes > 0 && (
          <motion.span
            className="text-[11px] tabular-nums text-white/30 hidden sm:inline"
            animate={{ opacity: dl.speed_bytes > 0 ? 1 : 0.5 }}
          >
            {formatSpeed(dl.speed_bytes)}
            {dlEta > 0 && <span className="text-white/15"> · {formatETA(dlEta)}</span>}
          </motion.span>
        )}

        {/* Percentage */}
        {isActive && dl.total_bytes > 0 && (
          <motion.span
            className={cn(
              'text-[11px] font-medium tabular-nums min-w-[32px] text-right',
              pct >= 100 ? 'text-green-400/60' : 'text-white/40'
            )}
            animate={pct >= 100 ? { scale: [1, 1.1, 1] } : undefined}
            transition={{ duration: 0.3 }}
          >
            {Math.round(pct)}%
          </motion.span>
        )}


        {/* Action icons */}
        {dl.status === 'active' && (
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPause(); }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/70 cursor-pointer transition-colors"
            title={i18n._(msg`autoDownload.pause`)}
          >
            <HugeiconsIcon icon={PauseIcon} size={14} />
          </motion.button>
        )}
        {(dl.status === 'paused' || dl.status === 'waiting') && (
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResume(); }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/70 cursor-pointer transition-colors"
            title={i18n._(msg`autoDownload.resume`)}
          >
            <HugeiconsIcon icon={PlayIcon} size={14} />
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className="p-1.5 rounded-md hover:bg-red-500/10 text-white/25 hover:text-red-400/80 cursor-pointer transition-colors"
          title={i18n._(msg`autoDownload.delete`)}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}
