import {
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  PauseIcon,
  PlayIcon,
  RssIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  type Download,
  type DownloadGroup,
  downloadApi,
  downloadKeys,
  rssFeedApi,
  ruleApi,
  subscribeApi,
  type SubscribeInput,
} from '../lib/api/downloads';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi } from '../lib/api/torrent';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';

// ── Types ───────────────────────────────────────────────────────────────────

interface Aria2Status {
  connected: boolean;
  version?: string;
  error?: string;
}

type Tab = 'search' | 'manage';

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

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400',
  waiting: 'bg-yellow-500/15 text-yellow-400',
  paused: 'bg-yellow-600/15 text-yellow-500',
  complete: 'bg-blue-500/15 text-blue-400',
  error: 'bg-red-500/15 text-red-400',
  removed: 'bg-white/5 text-white/30',
};

const ALL_TORRENT_SOURCES = ['all', 'nyaa', 'mikan', 'dmhy', 'dandanplay', 'bangumi.moe', 'acg.rip'] as const;
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

const TABS: { key: Tab; labelKey: ReturnType<typeof msg>; icon: typeof Search01Icon }[] = [
  { key: 'search', labelKey: msg`autoDownload.tab.search`, icon: Search01Icon },
  { key: 'manage', labelKey: msg`autoDownload.tab.manage`, icon: RssIcon },
];

export function DownloadsPage() {
  const { i18n } = useLingui();
  const [tab, setTab] = useState<Tab>('search');

  // Aria2 connection status
  const { data: aria2Status } = useQuery({
    queryKey: ['system', 'aria2-status'],
    queryFn: () => api.get<Aria2Status>('/api/v1/system/aria2-status'),
    refetchInterval: 60000,
  });

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
            {/* Aria2 status badge */}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  aria2Status?.connected ? 'bg-green-400' : 'bg-red-400/60'
                )}
              />
              <span
                className={cn(
                  'text-[11px] font-medium',
                  aria2Status?.connected ? 'text-green-400/80' : 'text-red-400/60'
                )}
              >
                {aria2Status?.connected
                  ? `Aria2 v${aria2Status.version}`
                  : i18n._(msg`settings.download.disconnected`)}
              </span>
            </div>
          </div>
        </div>

        {/* Aria2 not connected banner */}
        {aria2Status && !aria2Status.connected && (
          <div className="px-8 mb-4">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-300/80">
              {i18n._(msg`subscribe.aria2Warning`)}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-8 mb-6">
          <div className="flex gap-1 border-b border-white/[0.06] pb-px">
            {TABS.map((t) => (
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
                {i18n._(t.labelKey)}
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

        {/* Tab content */}
        <div className="px-8 pb-16">
          {tab === 'search' && <SearchTab />}
          {tab === 'manage' && <ManageTab />}
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH TAB — Anime-first flow
// ═══════════════════════════════════════════════════════════════════════════

function SearchTab() {
  const { i18n } = useLingui();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);

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
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mt-1 p-1.5 rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors cursor-pointer shrink-0"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
        </button>
        <img
          src={anime.cover_image}
          alt=""
          className="w-14 h-auto rounded-md object-cover shrink-0"
          style={{ aspectRatio: '3/4' }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-white truncate">{anime.title}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
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
          </div>
        </div>
        <Button
          onClick={() => setShowSubscribe(true)}
          className="shrink-0 font-semibold text-black bg-mm-accent hover:bg-mm-accent/90"
        >
          {i18n._(msg`autoDownload.subscribe`)}
        </Button>
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
  const [libraryId, setLibraryId] = useState<string>('');

  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

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
    const subscribeSource = source === 'all' || source === 'dandanplay' ? 'mikan' : source;
    subscribeMutation.mutate({
      anime_name: anime.title,
      source: subscribeSource as 'mikan' | 'nyaa' | 'dmhy',
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
        className="w-full max-w-md mx-4 rounded-xl border border-white/[0.08] bg-[#111] p-6 shadow-2xl"
      >
        <h3 className="text-lg font-bold text-white mb-4">
          {i18n._(msg`autoDownload.subscribeTitle`)}
        </h3>

        {/* Anime name */}
        <div className="rounded-lg bg-white/[0.03] p-3 mb-4">
          <p className="text-[13px] font-medium text-white">{anime.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {source !== 'all' && <SourceBadge source={source} />}
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
            <span className="text-[10px] text-white/30">
              {i18n._(msg`autoDownload.matchesCount`)} {matchCount}
            </span>
          </div>
        </div>

        {/* Library picker */}
        {libraries.length > 0 && (
          <Field className="mb-4">
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
                      ? 'bg-mm-accent/20 text-mm-accent'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  )}
                >
                  {lib.name}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="text-[13px]">
            {i18n._(msg`autoDownload.cancel`)}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={subscribeMutation.isPending}
            className="font-semibold text-black bg-mm-accent hover:bg-mm-accent/90 text-[13px]"
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
// MANAGE TAB
// ═══════════════════════════════════════════════════════════════════════════

function ManageTab() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState('');

  // Data queries
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

  // Mutations
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
      const feedRules = rules.filter((r) => r.rss_feed_id === feedId);
      for (const r of feedRules) await ruleApi.delete(r.id);
      await rssFeedApi.delete(feedId);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.deleted`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (url: string) => downloadApi.add({ url }),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.downloadAdded`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      setUrlInput('');
    },
    onError: (err: Error) => toast.error(err.message),
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

  const feedMap = new Map(feeds.map((f) => [f.id, f]));

  // Split groups: subscription-linked vs manual
  const subscriptionGroups = groups.filter((g) => g.rule_id);
  const manualGroups = groups.filter((g) => !g.rule_id);

  // Match rules to download groups
  const ruleGroupMap = new Map<string, DownloadGroup>();
  for (const g of subscriptionGroups) {
    if (g.rule_id) ruleGroupMap.set(g.rule_id, g);
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasContent = rules.length > 0 || groups.length > 0;

  return (
    <>
      {/* URL add form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (urlInput.trim()) addMutation.mutate(urlInput.trim());
        }}
        className="flex gap-2 items-end mb-6"
      >
        <Field className="flex-1">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={i18n._(msg`autoDownload.pasteUrl`)}
            className="font-mono text-sm bg-white/[0.03] border-white/[0.06] text-white"
          />
        </Field>
        <Button
          type="submit"
          disabled={addMutation.isPending || !urlInput.trim()}
          className="px-5 font-bold text-black bg-mm-accent shrink-0"
        >
          {i18n._(msg`autoDownload.add`)}
        </Button>
      </form>

      {/* Loading skeleton */}
      {groupsLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-4 animate-pulse bg-white/[0.03] border border-white/[0.06]">
              <div className="h-3.5 rounded bg-white/[0.06] w-[45%] mb-3" />
              <div className="flex gap-2">
                <div className="h-2.5 rounded bg-white/[0.04] w-16" />
                <div className="h-2.5 rounded bg-white/[0.04] w-12" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!groupsLoading && !hasContent && (
        <div className="text-center py-16">
          <HugeiconsIcon icon={RssIcon} size={32} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/25 text-sm mb-2">
            {i18n._(msg`autoDownload.emptyTitle`)}
          </p>
          <p className="text-white/15 text-xs max-w-[300px] mx-auto">
            {i18n._(msg`autoDownload.emptyHint`)}
          </p>
        </div>
      )}

      {/* Subscription cards */}
      {rules.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/30">
            {i18n._(msg`autoDownload.subscriptions`)}
          </h3>
          {rules.map((rule) => {
            const feed = feedMap.get(rule.rss_feed_id);
            const group = ruleGroupMap.get(rule.id);
            const isExpanded = expandedGroups.has(rule.id);
            return (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                {/* Subscription header */}
                <div className="flex items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggleGroup(rule.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          rule.enabled ? 'bg-green-400' : 'bg-white/20'
                        )}
                      />
                      <h4 className="text-[14px] font-semibold text-white truncate">
                        {rule.name}
                      </h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {feed && <SourceBadge source={feed.type} />}
                      {rule.resolution_filter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70">
                          {rule.resolution_filter}
                        </span>
                      )}
                      {rule.subgroup_filter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70">
                          {rule.subgroup_filter}
                        </span>
                      )}
                      {group && group.total_count > 0 && (
                        <span className="text-[10px] text-white/25">
                          {group.complete_count}/{group.total_count}
                        </span>
                      )}
                      {group && group.active_count > 0 && (() => {
                        const totalSpeed = group.downloads
                          .filter((d) => d.status === 'active')
                          .reduce((sum, d) => sum + d.speed_bytes, 0);
                        return totalSpeed > 0 ? (
                          <span className="text-[10px] text-green-400/70">
                            {formatSpeed(totalSpeed)}
                          </span>
                        ) : null;
                      })()}
                      {feed && (
                        <span className="text-[10px] text-white/15">
                          {feed.fetch_interval_minutes}min
                        </span>
                      )}
                      {rule.last_triggered_at && (
                        <span className="text-[10px] text-white/15">
                          {new Date(rule.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                      {group && (
                        <span className="text-[10px] text-white/20">
                          {group.active_count > 0 && `${group.active_count} active, `}
                          {group.total_count} total
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex gap-1.5 shrink-0">
                    {feed && (
                      <button
                        type="button"
                        onClick={() => refreshMutation.mutate(feed.id)}
                        disabled={refreshMutation.isPending}
                        className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                        title={i18n._(msg`autoDownload.refresh`)}
                      >
                        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => feed && deleteFeedMutation.mutate(feed.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors cursor-pointer"
                      title={i18n._(msg`autoDownload.delete`)}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} />
                    </button>
                  </div>
                </div>

                {/* Aggregate progress bar for active downloads */}
                {group && group.active_count > 0 && (() => {
                  const activeDownloads = group.downloads.filter((d) => d.status === 'active' || d.status === 'paused');
                  const totalBytes = activeDownloads.reduce((s, d) => s + d.total_bytes, 0);
                  const completedBytes = activeDownloads.reduce((s, d) => s + d.completed_bytes, 0);
                  const pct = totalBytes > 0 ? Math.min(100, (completedBytes / totalBytes) * 100) : 0;
                  return totalBytes > 0 ? (
                    <div className="px-4 pb-2">
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div className="h-full rounded-full bg-mm-accent" animate={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-white/20">
                        <span>{formatBytes(completedBytes)} / {formatBytes(totalBytes)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Nested downloads */}
                {isExpanded && group && group.downloads.length > 0 && (
                  <div className="border-t border-white/[0.04] px-4 pb-3">
                    {group.downloads.map((dl) => (
                      <DownloadRow
                        key={dl.id}
                        dl={
                          {
                            ...dl,
                            url: '',
                            save_dir: '',
                            rule_id: group.rule_id,
                            updated_at: dl.created_at,
                          } as Download
                        }
                        onPause={() => pauseMutation.mutate(dl.gid)}
                        onResume={() => resumeMutation.mutate(dl.gid)}
                        onDelete={() => deleteDlMutation.mutate(dl.gid)}
                      />
                    ))}
                  </div>
                )}
                {isExpanded && (!group || group.downloads.length === 0) && (
                  <div className="border-t border-white/[0.04] px-4 py-4">
                    <p className="text-[12px] text-white/20 text-center">
                      {i18n._(msg`autoDownload.noDownloadsYet`)}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Manual downloads section */}
      {manualGroups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/30">
            {i18n._(msg`autoDownload.manualDownloads`)}
          </h3>
          {manualGroups.map((group, idx) => {
            const groupKey = `manual-${group.rule_id || idx}`;
            const isExpanded = expandedGroups.has(groupKey);
            return (
              <div
                key={groupKey}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[14px] font-semibold text-white truncate">
                      {group.rule_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {group.active_count > 0 && (
                      <span className="text-[11px] text-green-400/70">
                        {group.active_count} active
                      </span>
                    )}
                    <span className="text-[11px] text-white/25">
                      {group.total_count} total
                    </span>
                    <span className="text-white/20 text-xs">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.04] px-4 pb-3">
                    {group.downloads.map((dl) => (
                      <DownloadRow
                        key={dl.id}
                        dl={
                          {
                            ...dl,
                            url: '',
                            save_dir: '',
                            rule_id: null,
                            updated_at: dl.created_at,
                          } as Download
                        }
                        onPause={() => pauseMutation.mutate(dl.gid)}
                        onResume={() => resumeMutation.mutate(dl.gid)}
                        onDelete={() => deleteDlMutation.mutate(dl.gid)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Download Row ──────────────────────────────────────────────────────────

function DownloadRow({
  dl,
  onPause,
  onResume,
  onDelete,
}: {
  dl: Download;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const { i18n } = useLingui();
  const pct =
    dl.total_bytes > 0 ? Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-lg p-4 bg-white/[0.03] mb-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{dl.name || dl.url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium',
              STATUS_COLOR[dl.status] ?? 'bg-white/5 text-white/30'
            )}
          >
            {dl.status}
          </span>
          {dl.status === 'active' && (
            <button
              type="button"
              onClick={onPause}
              className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 cursor-pointer"
              title={i18n._(msg`autoDownload.pause`)}
            >
              <HugeiconsIcon icon={PauseIcon} size={12} />
            </button>
          )}
          {dl.status === 'paused' && (
            <button
              type="button"
              onClick={onResume}
              className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 cursor-pointer"
              title={i18n._(msg`autoDownload.resume`)}
            >
              <HugeiconsIcon icon={PlayIcon} size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-500/10 text-red-400/40 hover:text-red-400 cursor-pointer"
            title={i18n._(msg`autoDownload.delete`)}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>
      {(dl.status === 'active' || dl.status === 'paused') && dl.total_bytes > 0 && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-mm-accent"
              animate={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-white/25">
            <span>
              {formatBytes(dl.completed_bytes)} / {formatBytes(dl.total_bytes)}
            </span>
            <span>{formatSpeed(dl.speed_bytes)}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
