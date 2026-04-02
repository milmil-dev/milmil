import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Delete02Icon,
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
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';
import type { DownloadsSearch } from '../routes/downloads';

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
  const search = useSearch({ strict: false }) as DownloadsSearch;
  const navigate = useNavigate();
  const tab: Tab = search.tab || 'search';
  const animeParam = search.anime;

  const setTab = (t: Tab) => {
    navigate({ to: '/downloads', search: { tab: t, anime: animeParam }, replace: true });
  };

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
          {tab === 'search' && <SearchTab initialAnimeId={animeParam} />}
          {tab === 'manage' && <ManageTab onSwitchToSearch={() => setTab('search')} />}
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

            {/* Subscribe button — inline */}
            {results.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSubscribe(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[12px] font-medium text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={RssIcon} size={13} />
                {i18n._(msg`autoDownload.subscribe`)}
              </button>
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

const RSS_SOURCES: ('mikan' | 'nyaa' | 'dmhy')[] = ['mikan', 'nyaa', 'dmhy'];

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
// MANAGE TAB
// ═══════════════════════════════════════════════════════════════════════════

type ManageSubTab = 'subscriptions' | 'downloads' | 'completed';

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

function ManageTab({ onSwitchToSearch }: { onSwitchToSearch: () => void }) {
  const { i18n } = useLingui();
  const [subTab, setSubTab] = useState<ManageSubTab>('subscriptions');

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

  // Derive all downloads from groups
  const allDownloads = useMemo(() => {
    return groups.flatMap((g) =>
      g.downloads.map((dl) => ({
        ...dl,
        rule_id: g.rule_id,
        rule_name: g.rule_name,
        bangumi_id: g.bangumi_id,
      }))
    );
  }, [groups]);

  const activeDownloads = useMemo(
    () =>
      allDownloads
        .filter((d) => d.status === 'active' || d.status === 'waiting' || d.status === 'paused')
        .sort((a, b) => {
          const order: Record<string, number> = { active: 0, waiting: 1, paused: 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        }),
    [allDownloads]
  );

  const completedDownloads = useMemo(
    () =>
      allDownloads
        .filter((d) => d.status === 'complete')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allDownloads]
  );

  const subTabs: { key: ManageSubTab; label: string; count?: number }[] = [
    { key: 'subscriptions', label: i18n._(msg`autoDownload.subtab.subscriptions`) },
    {
      key: 'downloads',
      label: i18n._(msg`autoDownload.subtab.downloads`),
      count: activeDownloads.length,
    },
    {
      key: 'completed',
      label: i18n._(msg`autoDownload.subtab.completed`),
      count: completedDownloads.length,
    },
  ];

  return (
    <>
      {/* Sub-tab bar */}
      <div className="flex gap-1.5 mb-6">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer flex items-center gap-1.5',
              subTab === t.key
                ? 'bg-white/[0.12] text-white'
                : 'text-white/35 hover:text-white/55 hover:bg-white/[0.04]'
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span
                className={cn(
                  'text-[10px] px-1.5 py-px rounded-full font-semibold',
                  subTab === t.key ? 'bg-white/[0.15] text-white' : 'bg-white/[0.08] text-white/40'
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'subscriptions' && (
        <SubscriptionsSubTab
          rules={rules}
          feeds={feeds}
          groups={groups}
          isLoading={groupsLoading}
          onSwitchToSearch={onSwitchToSearch}
        />
      )}
      {subTab === 'downloads' && (
        <DownloadsSubTab
          downloads={activeDownloads}
          isLoading={groupsLoading}
        />
      )}
      {subTab === 'completed' && (
        <CompletedSubTab
          downloads={completedDownloads}
          isLoading={groupsLoading}
        />
      )}
    </>
  );
}

// ── Subscriptions Sub-tab ────────────────────────────────────────────────

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
  const queryClient = useQueryClient();
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const ruleGroupMap = new Map<string, DownloadGroup>();
  for (const g of groups) {
    if (g.rule_id) ruleGroupMap.set(g.rule_id, g);
  }

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

  const toggleRule = (id: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.06]">
            <div className="w-12 h-16 rounded bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3.5 rounded bg-white/[0.06] w-[55%]" />
              <div className="flex gap-2">
                <div className="h-2.5 rounded bg-white/[0.04] w-14" />
                <div className="h-2.5 rounded bg-white/[0.04] w-10" />
              </div>
              <div className="h-2.5 rounded bg-white/[0.04] w-[30%]" />
            </div>
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
    <div className="space-y-3">
      {rules.map((rule) => {
        const feed = feedMap.get(rule.rss_feed_id);
        const group = ruleGroupMap.get(rule.id);
        const isExpanded = expandedRules.has(rule.id);

        return (
          <motion.div
            key={rule.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
          >
            {/* Card header */}
            <button
              type="button"
              onClick={() => toggleRule(rule.id)}
              className="w-full flex items-start gap-3 p-4 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              <AnimeCover bangumiId={group?.bangumi_id} size={48} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
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
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
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
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/25">
                  {feed && <span>{feed.fetch_interval_minutes}min</span>}
                  {rule.last_triggered_at && (
                    <span>{new Date(rule.last_triggered_at).toLocaleString()}</span>
                  )}
                  {group && (
                    <SubscriptionEpisodeCount group={group} bangumiId={group.bangumi_id} />
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
            </button>

            {/* Expanded nested downloads */}
            {isExpanded && group && group.downloads.length > 0 && (
              <div className="border-t border-white/[0.04] px-4 pb-3 space-y-1.5 pt-2">
                {group.downloads.slice(0, 10).map((dl) => (
                  <DownloadCard
                    key={dl.id}
                    dl={dl}
                    ruleName={group.rule_name}
                    bangumiId={group.bangumi_id}
                    showCover={false}
                    onPause={() => pauseMutation.mutate(dl.gid)}
                    onResume={() => resumeMutation.mutate(dl.gid)}
                    onDelete={() => deleteDlMutation.mutate(dl.gid)}
                  />
                ))}
                {group.downloads.length > 10 && (
                  <p className="text-[11px] text-white/20 text-center py-1">
                    +{group.downloads.length - 10} more
                  </p>
                )}
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
  );
}

/** Displays "N/M episodes" using anime detail for total episode count. */
function SubscriptionEpisodeCount({
  group,
  bangumiId,
}: { group: DownloadGroup; bangumiId?: number }) {
  const { data: animeDetail } = useAnimeDetail(bangumiId);
  const total = animeDetail?.episode_count ?? 0;
  if (total > 0) {
    return (
      <span className="text-[10px] text-white/25">
        {group.complete_count}/{total} eps
      </span>
    );
  }
  if (group.total_count > 0) {
    return (
      <span className="text-[10px] text-white/25">
        {group.complete_count}/{group.total_count}
      </span>
    );
  }
  return null;
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
  const [urlInput, setUrlInput] = useState('');

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
  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      const active = downloads.filter((d) => d.status === 'active');
      for (const d of active) await downloadApi.pause(d.gid);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
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
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.06]">
            <div className="w-10 h-[53px] rounded bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 rounded bg-white/[0.06] w-[65%]" />
              <div className="h-2 rounded bg-white/[0.04] w-[40%]" />
              <div className="h-1.5 rounded bg-white/[0.04] w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Global summary bar */}
      {activeCount > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-[12px] text-white/60">
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="text-green-400/80" />
            <span>
              {activeCount} {i18n._(msg`autoDownload.downloading`)}
            </span>
            <span className="text-white/20">·</span>
            <span>{formatSpeed(totalSpeed)}</span>
            {eta > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>~{formatETA(eta)}</span>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pauseAllMutation.mutate()}
            disabled={pauseAllMutation.isPending}
            className="text-[11px] h-7"
          >
            <HugeiconsIcon icon={PauseIcon} size={12} />
            {i18n._(msg`autoDownload.pauseAll`)}
          </Button>
        </div>
      )}

      {/* URL add form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (urlInput.trim()) addMutation.mutate(urlInput.trim());
        }}
        className="flex gap-2 items-end mb-5"
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

      {/* Download cards */}
      {downloads.length > 0 ? (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {downloads.map((dl) => (
              <DownloadCard
                key={dl.id}
                dl={dl}
                ruleName={dl.rule_name}
                bangumiId={dl.bangumi_id}
                showCover
                onPause={() => pauseMutation.mutate(dl.gid)}
                onResume={() => resumeMutation.mutate(dl.gid)}
                onDelete={() => deleteDlMutation.mutate(dl.gid)}
              />
            ))}
          </AnimatePresence>
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
    </>
  );
}

// ── Completed Sub-tab ────────────────────────────────────────────────────

function CompletedSubTab({
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

  const deleteDlMutation = useMutation({
    mutationFn: downloadApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      for (const dl of downloads) await downloadApi.delete(dl.gid);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.06]">
            <div className="w-10 h-[53px] rounded bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 rounded bg-white/[0.06] w-[60%]" />
              <div className="h-2.5 rounded bg-white/[0.04] w-[35%]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (downloads.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/25 text-sm">
          {i18n._(msg`autoDownload.noCompletedDownloads`)}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Header with Clear All */}
      <div className="flex items-center justify-end mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => clearAllMutation.mutate()}
          disabled={clearAllMutation.isPending}
          className="text-[11px] h-7 text-red-400/60 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
          {i18n._(msg`autoDownload.clearAll`)}
        </Button>
      </div>

      {/* Completed cards */}
      <div className="space-y-2">
        {downloads.map((dl) => (
          <motion.div
            key={dl.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.04] transition-colors"
          >
            <AnimeCover bangumiId={dl.bangumi_id} size={40} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate">
                {dl.name}
              </p>
              {dl.rule_name && (
                <p className="text-[11px] text-white/30 truncate mt-0.5">
                  {dl.rule_name}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[10px] text-white/20">
                <span>{formatBytes(dl.total_bytes)}</span>
                <span className="text-white/10">·</span>
                <span>{new Date(dl.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => deleteDlMutation.mutate(dl.gid)}
              className="p-1.5 rounded hover:bg-red-500/10 text-white/15 hover:text-red-400 transition-colors cursor-pointer shrink-0"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </>
  );
}

// ── Download Card (shared by Downloads sub-tab & Subscription expand) ────

function DownloadCard({
  dl,
  ruleName,
  bangumiId,
  showCover,
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
  bangumiId?: number;
  showCover?: boolean;
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.04] transition-colors"
    >
      {showCover && <AnimeCover bangumiId={bangumiId} size={40} />}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate">
          {dl.name}
        </p>
        {ruleName && (
          <p className="text-[11px] text-white/30 truncate mt-0.5">
            {ruleName}
          </p>
        )}
        {/* Progress bar */}
        {isActive && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              {dl.total_bytes > 0 ? (
                <motion.div
                  className="h-full rounded-full bg-mm-accent"
                  animate={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full w-full bg-mm-accent/30 animate-pulse rounded-full" />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-white/25">
              <span>
                {dl.total_bytes > 0
                  ? `${formatBytes(dl.completed_bytes)} / ${formatBytes(dl.total_bytes)} · ${formatSpeed(dl.speed_bytes)}${dlEta > 0 ? ` · ~${formatETA(dlEta)}` : ''}`
                  : dl.status === 'waiting'
                    ? i18n._(msg`autoDownload.waiting`)
                    : i18n._(msg`autoDownload.connecting`)}
              </span>
            </div>
          </div>
        )}
      </div>
      {/* Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-medium',
            STATUS_COLOR[dl.status] ?? 'bg-white/5 text-white/30'
          )}
        >
          {dl.status}
        </span>
        {dl.status === 'active' && (
          <button
            type="button"
            onClick={onPause}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 cursor-pointer text-[11px]"
          >
            <HugeiconsIcon icon={PauseIcon} size={12} />
            {i18n._(msg`autoDownload.pause`)}
          </button>
        )}
        {(dl.status === 'paused' || dl.status === 'waiting') && (
          <button
            type="button"
            onClick={onResume}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 cursor-pointer text-[11px]"
          >
            <HugeiconsIcon icon={PlayIcon} size={12} />
            {i18n._(msg`autoDownload.resume`)}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded hover:bg-red-500/10 text-red-400/40 hover:text-red-400 cursor-pointer"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} />
        </button>
      </div>
    </motion.div>
  );
}
