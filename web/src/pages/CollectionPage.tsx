import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bookmark, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageAtmosphere } from '../components/PageAtmosphere';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/use-document-title';
import { type CollectionAnime, collectionApi, collectionKeys } from '../lib/api/collection';
import type { AnimeSummary } from '../lib/api/discover';
import { cn } from '../lib/utils';

/* ── Status config ─────────────────────────────────────────── */

const STATUS_TAB_KEYS = [
  { value: '', msgKey: msg`collection.all` },
  { value: 'watching', msgKey: msg`collection.watching` },
  { value: 'planning', msgKey: msg`collection.planning` },
  { value: 'completed', msgKey: msg`collection.completed` },
  { value: 'paused', msgKey: msg`collection.paused` },
  { value: 'dropped', msgKey: msg`collection.dropped` },
] as const;

const STATUS_COLORS: Record<string, string> = {
  watching: 'bg-blue-500/80',
  planning: 'bg-amber-500/80',
  completed: 'bg-green-500/80',
  paused: 'bg-zinc-500/80',
  dropped: 'bg-red-500/80',
};

const STATUS_LABEL_KEYS: Record<string, ReturnType<typeof msg>> = {
  watching: msg`collection.watching`,
  planning: msg`collection.planning`,
  completed: msg`collection.completed`,
  paused: msg`collection.paused`,
  dropped: msg`collection.dropped`,
};

/* ── Status change dropdown ────────────────────────────────── */

function StatusDropdown({
  bangumiId,
  currentStatus,
  onClose,
}: {
  bangumiId: number;
  currentStatus: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (status: string) => collectionApi.updateStatus(bangumiId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
      onClose();
    },
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const { i18n: i18nDropdown } = useLingui();
  const options = STATUS_TAB_KEYS.filter((t) => t.value !== '');

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.93, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: 4 }}
      transition={{ duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="absolute top-8 left-1.5 z-50 bg-zinc-900/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(opt.value)}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors cursor-pointer',
            currentStatus === opt.value
              ? 'text-white bg-white/10'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              STATUS_COLORS[opt.value] ?? 'bg-white/30'
            )}
          />
          {i18nDropdown._(opt.msgKey)}
        </button>
      ))}
    </motion.div>
  );
}

/* ── Helper: map CollectionAnime → AnimeSummary ───────────── */

function toAnimeSummary(anime: CollectionAnime): AnimeSummary {
  return {
    bangumi_id: anime.bangumi_id ?? 0,
    title: anime.title_zh || anime.title,
    title_original: anime.title,
    cover_image: anime.cover_image_url ?? '',
    episode_count: anime.total_episodes ?? 0,
    score: anime.score || 0,
  };
}

/* ── Anime card ────────────────────────────────────────────── */

function CollectionAnimeCard({ anime, index }: { anime: CollectionAnime; index: number }) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [hovered, setHovered] = useState(false);

  const summary = toAnimeSummary(anime);
  const isWatching = anime.watch_status === 'watching';

  function handleCardClick() {
    if (!showDropdown && anime.bangumi_id) {
      navigate({ to: '/anime/$id', params: { id: String(anime.bangumi_id) } });
    }
  }

  function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setShowDropdown((v) => !v);
  }

  return (
    <motion.div
      key={anime.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
      className="group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setShowDropdown(false);
      }}
    >
      <AnimeCard anime={summary} onClick={handleCardClick}>
        {/* Watch status badge — always visible for non-watching, show on hover for watching */}
        {anime.watch_status && (!isWatching || hovered || showDropdown) && (
          <button
            type="button"
            onClick={handleStatusClick}
            className={cn(
              'absolute top-1.5 left-1.5 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded text-white backdrop-blur-md cursor-pointer transition-all hover:opacity-80',
              isWatching ? 'bg-black/50' : (STATUS_COLORS[anime.watch_status] ?? 'bg-zinc-500/80')
            )}
          >
            {STATUS_LABEL_KEYS[anime.watch_status]
              ? i18n._(STATUS_LABEL_KEYS[anime.watch_status]!)
              : anime.watch_status}
          </button>
        )}

        {/* Status dropdown — appears below the badge */}
        <AnimatePresence>
          {showDropdown && anime.bangumi_id && (
            <StatusDropdown
              bangumiId={anime.bangumi_id}
              currentStatus={anime.watch_status}
              onClose={() => setShowDropdown(false)}
            />
          )}
        </AnimatePresence>
      </AnimeCard>
    </motion.div>
  );
}

/* ── Skeleton loader ───────────────────────────────────────── */

function CollectionSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tab skeletons */}
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>
      {/* Search row skeleton */}
      <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
      {/* Card grid skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[3/4] rounded-lg" />
            <Skeleton className="h-3 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
            <Skeleton className="h-2.5 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */

export function CollectionPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.collection`));

  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('recent');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data: anime,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: collectionKeys.list({ status: selectedStatus, search: debouncedSearch, sort }),
    queryFn: () => collectionApi.list({ status: selectedStatus, search: debouncedSearch, sort }),
    placeholderData: keepPreviousData,
  });

  const { data: statusCounts } = useQuery({
    queryKey: collectionKeys.statusCounts(),
    queryFn: collectionApi.statusCounts,
  });

  function getCount(status: string): number | undefined {
    if (!statusCounts) return undefined;
    if (status === '') return statusCounts.reduce((sum, s) => sum + s.count, 0);
    return statusCounts.find((s) => s.watch_status === status)?.count;
  }

  const isEmpty = !isLoading && (!anime || anime.length === 0);
  const isOverallEmpty = isEmpty && !debouncedSearch && !selectedStatus;

  return (
    <PageTransition>
      <div className="relative min-h-screen px-4 md:px-6 pt-6 pb-16">
        <PageAtmosphere preset="collection" />
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full bg-gradient-to-b from-mm-accent to-mm-accent/30" />
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {i18n._(msg`collection.title`)}
              </h1>
              {statusCounts && (
                <p className="text-[13px] text-mm-accent/50 mt-0.5">
                  {getCount('')} {i18n._(msg`collection.totalShows`)}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {isLoading && <CollectionSkeleton />}

        {!isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
          >
            {/* Status tabs */}
            <div className="flex items-end gap-0 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none border-b border-white/[0.06] mb-5">
              {STATUS_TAB_KEYS.map((tab) => {
                const isActive = selectedStatus === tab.value;
                const count = getCount(tab.value);
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setSelectedStatus(tab.value)}
                    className={cn(
                      'relative shrink-0 flex items-center gap-1.5 px-4 pb-2.5 pt-2 text-[13px] font-semibold cursor-pointer transition-colors duration-200',
                      isActive
                        ? 'text-mm-accent'
                        : 'text-mm-text-tertiary hover:text-mm-text-secondary'
                    )}
                  >
                    {i18n._(tab.msgKey)}
                    {count !== undefined && count > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full',
                          isActive
                            ? 'bg-mm-accent/20 text-mm-accent'
                            : 'bg-white/[0.06] text-white/40'
                        )}
                      >
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="collection-underline"
                        className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search + Sort row */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={i18n._(msg`collection.searchPlaceholder`)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-mm-accent/40 focus:bg-white/[0.07] transition-colors"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-white/70 focus:outline-none focus:border-mm-accent/40 cursor-pointer appearance-none transition-colors hover:bg-white/[0.07]"
              >
                <option value="recent" className="bg-zinc-900 text-white">
                  {i18n._(msg`collection.sortByRecent`)}
                </option>
                <option value="name" className="bg-zinc-900 text-white">
                  {i18n._(msg`collection.sortByName`)}
                </option>
              </select>
            </div>

            {/* Empty state */}
            {isEmpty && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 text-center"
              >
                <Bookmark className="w-10 h-10 text-white/20 mb-4" />
                <p className="text-[15px] font-medium text-white/50 mb-1">
                  {i18n._(msg`collection.empty`)}
                </p>
                <p className="text-[13px] text-white/30 mb-5">
                  {i18n._(msg`collection.emptyDesc`)}
                </p>
                {isOverallEmpty && (
                  <a
                    href="/libraries"
                    className="text-sm font-semibold text-mm-accent hover:text-mm-accent/80 transition-colors"
                  >
                    {i18n._(msg`collection.goToLibraries`)} →
                  </a>
                )}
              </motion.div>
            )}

            {/* Anime card grid */}
            {!isEmpty && (
              <div
                className={cn(
                  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 transition-opacity duration-200',
                  isFetching && 'opacity-50'
                )}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
              >
                {anime?.map((item, index) => (
                  <CollectionAnimeCard key={item.id} anime={item} index={index} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
