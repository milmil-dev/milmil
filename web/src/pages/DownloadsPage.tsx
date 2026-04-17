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
  EyeIcon,
  Link01Icon,
  PauseIcon,
  PlayIcon,
  Refresh03Icon,
  RssIcon,
  Search01Icon,
  TextIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimeCard } from '../components/AnimeCard';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { RuleEditorModal } from '../components/RuleEditorModal';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Drawer, DrawerContent } from '../components/ui/drawer';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useDocumentTitle } from '../hooks/use-document-title';
import { useIsMobile } from '../hooks/use-mobile';
import { useWSEvent } from '../hooks/use-websocket';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import {
  type DownloadGroup,
  downloadApi,
  downloadKeys,
  rssFeedApi,
  ruleApi,
  type SubscribeInput,
  subscribeApi,
} from '../lib/api/downloads';
import { libraryApi, libraryKeys } from '../lib/api/library';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi } from '../lib/api/torrent';
import { api } from '../lib/api-client';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
import type { DownloadsSearch } from '../routes/downloads';
import SubscribedTab from './downloads/SubscribedTab';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatPublishDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

export function SourceBadge({ source }: { source: string }) {
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

const ALL_TORRENT_SOURCES = [
  'all',
  'nyaa',
  'mikan',
  'dmhy',
  'dandanplay',
  'bangumi.moe',
  'acg.rip',
] as const;
const RSS_SOURCES: ('mikan' | 'nyaa' | 'dmhy')[] = ['mikan', 'nyaa', 'dmhy'];
const CJK_SOURCES = [
  'all',
  'mikan',
  'dmhy',
  'bangumi.moe',
  'acg.rip',
  'dandanplay',
  'nyaa',
] as const;
const EN_SOURCES = [
  'all',
  'nyaa',
  'dandanplay',
  'mikan',
  'dmhy',
  'bangumi.moe',
  'acg.rip',
] as const;
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

// ── Shared preview item row (reuses torrent result row style) ────────────

function detectSourceFromUrl(url: string): string {
  if (url.includes('mikan')) return 'mikan';
  if (url.includes('nyaa')) return 'nyaa';
  if (url.includes('dmhy')) return 'dmhy';
  if (url.includes('dandanplay')) return 'dandanplay';
  return '';
}

function PreviewItemRow({
  item,
  index,
  source,
}: {
  item: import('../lib/api/downloads').PreviewItem;
  index: number;
  source?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.5) }}
      className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white break-words leading-relaxed">
          {item.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {source && <SourceBadge source={source} />}
          {item.subgroup && (
            <span className="text-[10px] text-orange-400/60 font-medium">{item.subgroup}</span>
          )}
          {item.size && <span className="text-[10px] text-white/25">{item.size}</span>}
          {item.publish_date && (
            <span className="text-[10px] text-white/25">
              {formatPublishDate(item.publish_date)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function DownloadsPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.autoDownload`));
  const search = useSearch({ strict: false }) as DownloadsSearch;
  const navigate = useNavigate();
  const tab: Tab = search.tab || 'search';
  const animeParam = search.anime;

  const queryClient = useQueryClient();
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
    refetchInterval: 30_000, // Slow fallback; real-time updates come via WebSocket
  });

  // Real-time download progress via WebSocket
  useWSEvent((event) => {
    if (event.type !== 'download:progress') return;
    const batch = event.data as unknown as {
      gid: string;
      status: string;
      total_bytes: number;
      completed_bytes: number;
      speed_bytes: number;
    }[];
    if (!Array.isArray(batch) || batch.length === 0) return;

    const progressMap = new Map(batch.map((p) => [p.gid, p]));

    queryClient.setQueryData<DownloadGroup[]>(['downloads', 'grouped'], (old) => {
      if (!old) return old;
      let changed = false;
      const updated = old.map((group) => {
        const newDownloads = group.downloads.map((dl) => {
          const p = progressMap.get(dl.gid);
          if (!p) return dl;
          if (
            p.status === dl.status &&
            p.completed_bytes === dl.completed_bytes &&
            p.speed_bytes === dl.speed_bytes
          )
            return dl;
          changed = true;
          return {
            ...dl,
            status: p.status,
            total_bytes: p.total_bytes,
            completed_bytes: p.completed_bytes,
            speed_bytes: p.speed_bytes,
          };
        });
        if (newDownloads === group.downloads) return group;
        const activeCount = newDownloads.filter(
          (d) => d.status === 'active' || d.status === 'waiting'
        ).length;
        const completeCount = newDownloads.filter((d) => d.status === 'complete').length;
        return {
          ...group,
          downloads: newDownloads,
          active_count: activeCount,
          complete_count: completeCount,
        };
      });
      return changed ? updated : old;
    });

    // If any download status changed to complete/error, do a full refetch for accurate grouping
    if (batch.some((p) => p.status === 'complete' || p.status === 'error')) {
      queryClient.invalidateQueries({ queryKey: ['downloads', 'grouped'] });
    }
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

  const isEffectivelyComplete = (d: {
    status: string;
    total_bytes: number;
    completed_bytes: number;
  }) => d.status === 'complete' || (d.total_bytes > 0 && d.completed_bytes >= d.total_bytes);

  const activeDownloads = useMemo(
    () =>
      allDownloads
        .filter(
          (d) =>
            (d.status === 'active' || d.status === 'waiting' || d.status === 'paused') &&
            !isEffectivelyComplete(d)
        )
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
    {
      key: 'downloading',
      label: i18n._(msg`autoDownload.subtab.downloads`),
      icon: Download02Icon,
      count: activeDownloads.length,
    },
    {
      key: 'completed',
      label: i18n._(msg`autoDownload.subtab.completed`),
      icon: CheckmarkCircle02Icon,
      count: completedDownloads.length,
    },
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
                  downloaderStatus?.healthy
                    ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.4)]'
                    : 'bg-red-400/60'
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
          <div className="flex items-center pb-px">
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
                        tab === t.key
                          ? 'bg-white/[0.15] text-white'
                          : 'bg-white/[0.08] text-white/40'
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
            <SubscribedTab
              rules={rules}
              feeds={feeds}
              groups={groups}
              isLoading={groupsLoading}
              onSwitchToSearch={() => setTab('search')}
            />
          )}
          {tab === 'downloading' && (
            <DownloadsSubTab downloads={activeDownloads} isLoading={groupsLoading} />
          )}
          {tab === 'completed' && (
            <CompletedSubTab downloads={completedDownloads} isLoading={groupsLoading} />
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
  const [newRuleMenuOpen, setNewRuleMenuOpen] = useState(false);
  const [ruleMode, setRuleMode] = useState<'keyword' | 'rss'>('keyword');
  const [rssUrl, setRssUrl] = useState('');

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

  return (
    <>
      {/* New Rule dropdown + Search input */}
      <div className="flex items-center gap-2 mb-5">
        <Popover open={newRuleMenuOpen} onOpenChange={setNewRuleMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-[11px] text-white/50 bg-white/[0.03] hover:bg-white/[0.06]"
            >
              <HugeiconsIcon icon={ruleMode === 'keyword' ? TextIcon : Link01Icon} size={13} />
              {ruleMode === 'keyword'
                ? i18n._(msg`ruleEditor.keywordMode`)
                : i18n._(msg`ruleEditor.rssUrlMode`)}
              <HugeiconsIcon icon={ArrowDown01Icon} size={10} className="ml-0.5 opacity-40" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-44 p-1.5 border border-white/[0.08] bg-white/[0.06] backdrop-blur-2xl backdrop-saturate-150 rounded-xl shadow-lg shadow-black/40 space-y-0.5"
          >
            <button
              type="button"
              onClick={() => {
                setRuleMode('keyword');
                setNewRuleMenuOpen(false);
              }}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-[12px] rounded-lg transition-colors cursor-pointer',
                ruleMode === 'keyword'
                  ? 'text-white bg-white/[0.1]'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/[0.06]'
              )}
            >
              <HugeiconsIcon
                icon={TextIcon}
                size={13}
                className={ruleMode === 'keyword' ? 'text-white/70' : 'text-white/30'}
              />
              {i18n._(msg`ruleEditor.keywordMode`)}
            </button>
            <button
              type="button"
              onClick={() => {
                setRuleMode('rss');
                setNewRuleMenuOpen(false);
              }}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-[12px] rounded-lg transition-colors cursor-pointer',
                ruleMode === 'rss'
                  ? 'text-white bg-white/[0.1]'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/[0.06]'
              )}
            >
              <HugeiconsIcon
                icon={Link01Icon}
                size={13}
                className={ruleMode === 'rss' ? 'text-white/70' : 'text-white/30'}
              />
              {i18n._(msg`ruleEditor.rssUrlMode`)}
            </button>
          </PopoverContent>
        </Popover>
        {ruleMode === 'keyword' ? (
          <Input
            placeholder={i18n._(msg`autoDownload.searchAnime`)}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-white/[0.03] border-transparent text-white placeholder:text-white/25 flex-1"
          />
        ) : (
          <Input
            placeholder="https://mikanani.me/RSS/Bangumi?bangumiId=..."
            value={rssUrl}
            onChange={(e) => setRssUrl(e.target.value)}
            className="bg-white/[0.03] border-transparent text-white placeholder:text-white/20 flex-1 text-[13px]"
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {ruleMode === 'keyword' ? (
          <motion.div
            key="keyword"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {selectedAnime ? (
              <AnimeTorrentView anime={selectedAnime} onBack={() => setSelectedAnime(null)} />
            ) : (
              <>
                {/* Loading skeleton */}
                {isSearching && query && (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-lg bg-white/[0.03] animate-pulse"
                      >
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
                        <img
                          src={anime.cover_image}
                          alt=""
                          className="w-12 h-auto rounded object-cover shrink-0"
                          style={{ aspectRatio: '3/4' }}
                          loading="lazy"
                        />
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
                    <p className="text-white/25 text-sm">{i18n._(msg`autoDownload.searchHint`)}</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="rss"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <InlineRuleEditor rssUrl={rssUrl} onCreated={() => setRssUrl('')} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Anime Torrent View ────────────────────────────────────────────────────

function AnimeTorrentView({ anime, onBack }: { anime: AnimeSummary; onBack: () => void }) {
  const { i18n } = useLingui();
  const [source, setSource] = useState<string>('all');
  const [resolution, setResolution] = useState<string>('Any');
  const [subgroup, setSubgroup] = useState<string>('all');
  const [showSubscribe, setShowSubscribe] = useState(false);

  const relevantSources = getRelevantSources(anime);

  const { data: torrentData, isLoading } = useQuery({
    queryKey: discoverKeys.animeTorrents(anime.bangumi_id, source),
    queryFn: () =>
      discoverApi.animeTorrents(anime.bangumi_id, source === 'all' ? undefined : source),
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
      <div className="rounded-xl bg-white/[0.02] p-4 mb-6 relative overflow-hidden [&_a]:no-underline [&_a:hover]:no-underline">
        {/* Blurred background from cover */}
        {anime.cover_image && (
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `url(${anime.cover_image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(40px)',
            }}
          />
        )}

        <div className="relative flex gap-4">
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 self-center p-1.5 -ml-1 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
          </button>

          {/* Cover — clickable to anime detail */}
          <Link
            to="/anime/$id"
            params={{ id: String(anime.bangumi_id) }}
            className="shrink-0 hover:opacity-90 transition-opacity no-underline"
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
                <span className="text-[12px] text-white/45">{anime.air_date.slice(0, 7)}</span>
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
              className="bg-white/[0.04] rounded-md text-[12px] text-white/70 px-2.5 py-1.5 outline-none cursor-pointer"
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
        {filteredResults.length > 0 &&
          source !== 'all' &&
          RSS_SOURCES.includes(source as 'mikan' | 'nyaa' | 'dmhy') && (
            <div className="flex items-center gap-3 mt-3 pt-3">
              <button
                type="button"
                onClick={() => setShowSubscribe(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[12px] font-medium text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={RssIcon} size={14} />
                {i18n._(msg`autoDownload.subscribeFilter`)}
              </button>
              <span className="text-[11px] text-white/25">
                {SOURCE_LABELS[source]} ·{' '}
                {resolution !== 'Any' ? resolution : i18n._(msg`autoDownload.anyResolution`)} ·{' '}
                {subgroup !== 'all' ? subgroup : i18n._(msg`autoDownload.allSubgroups`)}
              </span>
            </div>
          )}
        {filteredResults.length > 0 && source === 'all' && (
          <p className="text-[11px] text-white/20 mt-3 pt-3">
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
                  {item.size && <span className="text-[10px] text-white/25">{item.size}</span>}
                  {item.seeders > 0 && (
                    <span className="text-[10px] text-green-400/70">↑{item.seeders}</span>
                  )}
                  {item.leechers > 0 && (
                    <span className="text-[10px] text-red-400/50">↓{item.leechers}</span>
                  )}
                  {item.publish_date && (
                    <span className="text-[10px] text-white/25">
                      {formatPublishDate(item.publish_date)}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={pendingDownloads.has(downloadURL(item)) || !downloadURL(item)}
                onClick={() => addMutation.mutate({ url: downloadURL(item), name: item.title })}
                className="shrink-0 text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
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
  subgroup: initialSubgroup,
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
  const [selectedSubgroup, setSelectedSubgroup] = useState<string>(initialSubgroup);
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

  // Fetch torrent results for the selected RSS source to get valid subgroups
  const { data: sourceData } = useQuery({
    queryKey: discoverKeys.animeTorrents(anime.bangumi_id, rssSource),
    queryFn: () => discoverApi.animeTorrents(anime.bangumi_id, rssSource),
  });

  const sourceSubgroups = useMemo(() => {
    const groups = new Set<string>();
    for (const r of sourceData?.results ?? []) {
      if (r.sub_group) groups.add(r.sub_group);
    }
    return Array.from(groups).sort();
  }, [sourceData]);

  // Reset subgroup when RSS source changes and current selection is invalid
  useEffect(() => {
    if (
      selectedSubgroup !== 'all' &&
      sourceSubgroups.length > 0 &&
      !sourceSubgroups.includes(selectedSubgroup)
    ) {
      setSelectedSubgroup('all');
    }
  }, [rssSource, sourceSubgroups, selectedSubgroup]);

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
      sub_group: selectedSubgroup !== 'all' ? selectedSubgroup : undefined,
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
        className="w-full max-w-md mx-4 rounded-xl bg-zinc-900 p-6 shadow-2xl"
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

          {/* Subgroup picker — only subgroups available in this RSS source */}
          {sourceSubgroups.length > 0 && (
            <div>
              <label className="text-[11px] text-white/40 mb-1.5 block">
                {i18n._(msg`autoDownload.subgroup`)}
              </label>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedSubgroup('all')}
                  className={cn(
                    'px-3 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                    selectedSubgroup === 'all'
                      ? 'bg-white/[0.12] text-white'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  )}
                >
                  {i18n._(msg`autoDownload.allSubgroups`)}
                </button>
                {sourceSubgroups.map((sg) => (
                  <button
                    key={sg}
                    type="button"
                    onClick={() => setSelectedSubgroup(sg)}
                    className={cn(
                      'px-3 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                      selectedSubgroup === sg
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                    )}
                  >
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resolution filter summary */}
          {resolution !== 'Any' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70">
                {resolution}
              </span>
            </div>
          )}

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
          <Button variant="ghost" onClick={onClose} className="text-[13px]">
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={subscribeMutation.isPending}
            className="font-semibold text-[13px]"
          >
            {subscribeMutation.isPending ? '...' : i18n._(msg`autoDownload.confirm`)}
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
export function useAnimeDetail(bangumiId: number | undefined) {
  return useQuery({
    queryKey: discoverKeys.detail(bangumiId!),
    queryFn: () => discoverApi.detail(bangumiId!),
    enabled: !!bangumiId,
    staleTime: 86400000,
  });
}

/** Small cover thumbnail component that fetches anime detail on demand. Clickable → anime detail page. */
export function AnimeCover({ bangumiId, size = 62 }: { bangumiId?: number; size?: number }) {
  const { data } = useAnimeDetail(bangumiId);
  const h = Math.round(size * (4 / 3));
  const placeholder = (
    <div className="rounded bg-white/[0.06] shrink-0" style={{ width: size, height: h }} />
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

// ── Inline Rule Editor (RSS URL mode) ─────────────────────────────────

function InlineRuleEditor({ rssUrl, onCreated }: { rssUrl: string; onCreated: () => void }) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const [ruleName, setRuleName] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [previewItems, setPreviewItems] = useState<import('../lib/api/downloads').PreviewItem[]>(
    []
  );

  // ── Linked anime ──
  const [bangumiId, setBangumiId] = useState<number | null>(null);
  const [animeSearchInput, setAnimeSearchInput] = useState('');
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [animePickerOpen, setAnimePickerOpen] = useState(false);
  const animePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animeSearchInput.trim()) {
      setAnimeSearchQuery('');
      return;
    }
    const timer = setTimeout(() => setAnimeSearchQuery(animeSearchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [animeSearchInput]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (animePickerRef.current && !animePickerRef.current.contains(e.target as Node)) {
        setAnimePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: animeResults = [] } = useQuery({
    queryKey: discoverKeys.search(animeSearchQuery),
    queryFn: () => discoverApi.search(animeSearchQuery),
    enabled: animeSearchQuery.length > 0,
  });

  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

  const selectedLibrary = libraries.find((l) => l.id === libraryId);
  const savePath = selectedLibrary?.path || '';

  const canCreate = !!(rssUrl.trim() && ruleName.trim() && libraryId && bangumiId);
  const creatingRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      if (!ruleName.trim() || !libraryId || !bangumiId) throw new Error('All fields are required');
      const feed = await rssFeedApi.create({ name: ruleName, url: rssUrl, type: 'mikan' });
      try {
        await ruleApi.create({
          name: ruleName,
          enabled: 1,
          rss_feed_id: feed.id,
          filter_regex: '',
          exclude_regex: '',
          save_dir: savePath,
          episode_offset: 0,
          resolution_filter: '',
          subgroup_filter: '',
          min_seeders: 0,
          library_id: libraryId || null,
          bangumi_id: bangumiId,
          match_mode: 'fuzzy',
          episode_filter: 'all',
          episode_range: '',
        });
      } catch (err) {
        // Clean up orphaned feed if rule creation fails
        await rssFeedApi.delete(feed.id).catch(() => {});
        throw err;
      }
      await rssFeedApi.refresh(feed.id);
    },
    onSuccess: () => {
      creatingRef.current = false;
      toast.success(i18n._(msg`ruleEditor.saved`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setRuleName('');
      setLibraryId('');
      setBangumiId(null);
      setSelectedAnime(null);
      onCreated();
    },
    onError: (err: Error) => {
      creatingRef.current = false;
      toast.error(err.message);
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => rssFeedApi.previewUrl(rssUrl),
    onSuccess: (data) => setPreviewItems(data.items),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-5">
      {/* Linked Anime */}
      <InlineSection label={i18n._(msg`ruleEditor.linkedAnime`)}>
        <div ref={animePickerRef} className="relative">
          {bangumiId && selectedAnime ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.04]">
              <img
                src={selectedAnime.cover_image}
                alt=""
                className="w-8 h-11 rounded object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/90 font-medium truncate">
                  {selectedAnime.title || selectedAnime.title_original}
                </p>
                <p className="text-[10px] text-white/30">Bangumi #{bangumiId}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBangumiId(null);
                  setSelectedAnime(null);
                }}
                className="text-white/25 hover:text-white/50 transition-colors cursor-pointer shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </button>
            </div>
          ) : (
            <Input
              value={animeSearchInput}
              onChange={(e) => {
                setAnimeSearchInput(e.target.value);
                setAnimePickerOpen(true);
              }}
              onFocus={() => {
                if (animeSearchQuery) setAnimePickerOpen(true);
              }}
              placeholder={i18n._(msg`ruleEditor.searchAnime`)}
              className="bg-white/[0.03] border-transparent text-white text-[13px] placeholder:text-white/20"
            />
          )}
          <AnimatePresence>
            {animePickerOpen && animeResults.length > 0 && !bangumiId && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-zinc-900 shadow-xl shadow-black/40"
              >
                {animeResults.slice(0, 8).map((anime) => (
                  <button
                    key={anime.bangumi_id}
                    type="button"
                    onClick={() => {
                      setBangumiId(anime.bangumi_id);
                      setSelectedAnime(anime);
                      setAnimePickerOpen(false);
                      setAnimeSearchInput('');
                      setRuleName(anime.title || anime.title_original);
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                  >
                    <img
                      src={anime.cover_image}
                      alt=""
                      className="w-7 h-10 rounded object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-white/80 truncate">
                        {anime.title || anime.title_original}
                      </p>
                      {anime.air_date && (
                        <p className="text-[10px] text-white/25">{anime.air_date.slice(0, 4)}</p>
                      )}
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </InlineSection>

      {/* Rule Name */}
      <InlineSection label={i18n._(msg`ruleEditor.ruleName`)}>
        <Input
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          placeholder={i18n._(msg`ruleEditor.ruleNamePlaceholder`)}
          className="bg-white/[0.03] border-transparent text-white text-[13px] placeholder:text-white/20"
        />
      </InlineSection>

      {/* Destination */}
      <InlineSection label={i18n._(msg`ruleEditor.destination`)}>
        <div className="space-y-2">
          <div className="relative">
            <select
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              className={cn(
                'w-full appearance-none rounded-lg px-3 py-2 pr-8 text-[13px] font-medium',
                'bg-white/[0.04] border border-white/[0.06] text-white/90',
                'focus:outline-none focus:ring-1 focus:ring-white/10',
                'cursor-pointer'
              )}
            >
              <option value="" className="bg-zinc-900">
                {i18n._(msg`ruleEditor.noLibrary`)}
              </option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id} className="bg-zinc-900">
                  {lib.name}
                </option>
              ))}
            </select>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
            />
          </div>
          {savePath && (
            <p className="text-[11px] text-white/30 font-mono truncate px-1">{savePath}</p>
          )}
        </div>
      </InlineSection>

      {/* Preview + Save */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => previewMutation.mutate()}
          disabled={!rssUrl.trim() || previewMutation.isPending}
          className="text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
        >
          <HugeiconsIcon icon={EyeIcon} size={13} />
          {previewMutation.isPending
            ? i18n._(msg`ruleEditor.loading`)
            : i18n._(msg`ruleEditor.preview`)}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          className="text-[11px]"
        >
          {createMutation.isPending ? i18n._(msg`ruleEditor.saving`) : i18n._(msg`ruleEditor.save`)}
        </Button>
      </div>

      {/* Preview results */}
      <AnimatePresence>
        {previewItems.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/25">
                  {i18n._(msg`ruleEditor.preview`)}
                </span>
                <span className="text-[10px] text-white/25 tabular-nums">
                  {previewItems.length} {i18n._(msg`ruleEditor.items`)}
                </span>
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {previewItems.map((item, i) => (
                  <PreviewItemRow
                    key={item.link}
                    item={item}
                    index={i}
                    source={detectSourceFromUrl(rssUrl)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InlineSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/25">{label}</h3>
      {children}
    </div>
  );
}

// ── Add URL Dialog ──────────────────────────────────────────────────────

function AddUrlDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={i18n._(msg`autoDownload.addUrl`)}
      size="sm"
    >
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
          className="font-mono text-sm bg-white/[0.03] border-transparent text-white placeholder:text-white/25"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[12px] text-white/50 hover:bg-white/[0.04]"
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
  const episode: string | null = epMatch ? epMatch[1] || epMatch[2] || epMatch[3] || null : null;

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
  title = title
    .replace(/\s-\s*$/, '')
    .replace(/\s-\s\d{1,3}\s*$/, '')
    .trim();

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

export function DownloadCard({
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
  const pct = dl.total_bytes > 0 ? Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100) : 0;
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
        'group/dl relative rounded-xl overflow-hidden transition-colors',
        selected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Full-width progress bar at top — subtle colored strip */}
      {isActive && dl.total_bytes > 0 && (
        <div className="relative h-[2px] w-full bg-white/[0.04]">
          <motion.div
            className="absolute inset-y-0 left-0"
            animate={{
              width: `${pct}%`,
              backgroundColor:
                dl.status === 'active'
                  ? 'rgba(74,222,128,0.7)'
                  : dl.status === 'paused'
                    ? 'rgba(250,204,21,0.5)'
                    : 'rgba(255,255,255,0.12)',
            }}
            transition={{ type: 'spring', stiffness: 120, damping: 25 }}
          />
          {dl.status === 'active' && dl.speed_bytes > 0 && (
            <motion.div
              className="absolute inset-y-0 w-[40%]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
              }}
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
            />
          )}
        </div>
      )}
      {isActive && dl.total_bytes === 0 && (
        <div className="relative h-[2px] w-full bg-white/[0.04] overflow-hidden">
          <motion.div
            className="absolute inset-y-0 w-[30%] bg-white/[0.08] rounded-full"
            animate={{ x: ['-100%', '450%'] }}
            transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        {onSelect && (
          <div
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(e as unknown as React.MouseEvent);
            }}
          >
            <Checkbox checked={selected} size={18} />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-[13px] font-medium text-white/90 truncate">{parsed.title}</p>
            {parsed.episode && (
              <span className="text-[12px] font-bold text-green-400/80 tabular-nums shrink-0">
                EP {parsed.episode}
              </span>
            )}
          </div>

          {/* Meta row — tags + transfer stats unified */}
          <div className="flex items-center gap-1.5 mt-1">
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

            {/* Spacer pushes transfer stats to the right */}
            <span className="flex-1" />

            {/* Transfer stats inline */}
            {isActive && dl.total_bytes > 0 && (
              <span className="text-[10px] tabular-nums text-white/25 shrink-0">
                {formatBytes(dl.completed_bytes)}
                <span className="text-white/10"> / </span>
                {formatBytes(dl.total_bytes)}
              </span>
            )}
            {isActive && dl.total_bytes === 0 && (
              <span className="text-[10px] text-white/20 shrink-0">
                {dl.status === 'waiting'
                  ? i18n._(msg`autoDownload.waiting`)
                  : i18n._(msg`autoDownload.connecting`)}
              </span>
            )}
          </div>
        </div>

        {/* Right side — speed/pct/actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Speed + ETA */}
          {isActive && dl.status === 'active' && dl.total_bytes > 0 && dl.speed_bytes > 0 && (
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[11px] tabular-nums text-white/40 font-medium">
                {formatSpeed(dl.speed_bytes)}
              </span>
              {dlEta > 0 && (
                <span className="text-[9px] tabular-nums text-white/20">{formatETA(dlEta)}</span>
              )}
            </div>
          )}

          {/* Percentage — circular style */}
          {isActive && dl.total_bytes > 0 && (
            <div className="relative w-9 h-9 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="2.5"
                />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 15}`}
                  animate={{
                    strokeDashoffset: `${2 * Math.PI * 15 * (1 - pct / 100)}`,
                    stroke:
                      dl.status === 'active'
                        ? 'rgba(74,222,128,0.8)'
                        : dl.status === 'paused'
                          ? 'rgba(250,204,21,0.5)'
                          : 'rgba(255,255,255,0.15)',
                  }}
                  transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                />
              </svg>
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums',
                  pct >= 100 ? 'text-green-400/80' : 'text-white/50'
                )}
              >
                {Math.round(pct)}
              </span>
            </div>
          )}

          {/* Action icons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover/dl:opacity-100 transition-opacity">
            {dl.status === 'active' && (
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause();
                }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onResume();
                }}
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
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-white/25 hover:text-red-400/80 cursor-pointer transition-colors"
              title={i18n._(msg`autoDownload.delete`)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
