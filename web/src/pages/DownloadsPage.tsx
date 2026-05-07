import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUpDownIcon,
  Cancel01Icon,
  CheckListIcon,
  Copy01Icon,
  Delete02Icon,
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
import LibraryTab from './downloads/LibraryTab';

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

type Tab = 'search' | 'library';

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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
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

/**
 * Match a title against a resolution filter, accepting common aliases.
 * Torrent groups use different labels for the same resolution:
 *   4K  ↔ 2160p ↔ UHD
 *   1080p ↔ FHD ↔ FullHD
 *   720p  ↔ HD
 */
function matchesResolution(title: string, filter: string): boolean {
  const lower = title.toLowerCase();
  const aliases: Record<string, string[]> = {
    '4k': ['4k', '2160p', 'uhd'],
    '1080p': ['1080p', 'fhd', 'fullhd'],
    '720p': ['720p'],
  };
  const key = filter.toLowerCase();
  const needles = aliases[key] ?? [key];
  return needles.some((n) => lower.includes(n));
}

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

  // Downloads without a rule association (manual downloads, etc.)
  const miscDownloads = useMemo(
    () => allDownloads.filter((d) => !d.rule_id || d.rule_id === ''),
    [allDownloads]
  );

  const tabs: { key: Tab; label: string; icon: typeof Search01Icon }[] = [
    { key: 'search', label: i18n._(msg`autoDownload.tab.search`), icon: Search01Icon },
    { key: 'library', label: i18n._(msg`downloads.tab.library`), icon: RssIcon },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-mm-accent">
                milmil
              </p>
              <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
                {i18n._(msg`nav.autoDownload`)}
              </h1>
            </div>
            {/* Page-level actions: downloader status + Add URL */}
            <div className="flex items-center gap-3">
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
              <button
                type="button"
                onClick={() => setAddUrlOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                {i18n._(msg`autoDownload.addUrl`)}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 mb-6">
          <div className="flex items-center pb-px">
            <div className="flex gap-1">
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
                  {tab === t.key && (
                    <motion.div
                      layoutId="auto-download-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-[2px] bg-mm-accent rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Add URL dialog */}
        <AddUrlDialog open={addUrlOpen} onOpenChange={setAddUrlOpen} />

        {/* Tab content */}
        <div className="px-8 pb-16">
          {tab === 'search' && <SearchTab initialAnimeId={animeParam} />}
          {tab === 'library' && (
            <LibraryTab
              rules={rules}
              feeds={feeds}
              groups={groups}
              miscDownloads={miscDownloads as unknown as import('../lib/api/downloads').Download[]}
              isLoading={groupsLoading}
              onSwitchToSearch={() => setTab('search')}
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

  // Client-side filtering — resolution uses aliases (4K ↔ 2160p ↔ UHD, etc.)
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (resolution !== 'Any' && !matchesResolution(r.title, resolution)) {
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
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/25">
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
      <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-white/25">{label}</h3>
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
