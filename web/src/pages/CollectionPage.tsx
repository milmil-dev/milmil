import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bookmark, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { type CollectionAnime, collectionApi, collectionKeys } from '../lib/api/collection';
import { animeGradient } from '../lib/gradient';
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
      className="absolute bottom-2 right-2 z-50 bg-zinc-900/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md"
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

/* ── Anime card ────────────────────────────────────────────── */

function AnimeCard({ anime, index }: { anime: CollectionAnime; index: number }) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [hovered, setHovered] = useState(false);

  const hasCover = anime.cover_image_url?.startsWith('http');
  const displayTitle = anime.title_zh || anime.title;

  function handleCardClick() {
    if (!showDropdown && anime.bangumi_id) {
      navigate({ to: '/anime/$id', params: { id: String(anime.bangumi_id) } });
    }
  }

  function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation();
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
      onClick={handleCardClick}
    >
      {/* Poster */}
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden">
        {hasCover ? (
          <img
            src={anime.cover_image_url!}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full" style={{ background: animeGradient(anime.title) }} />
        )}

        {/* Watch status badge — top right */}
        {anime.watch_status && (
          <span
            className={cn(
              'absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded text-white backdrop-blur-md',
              STATUS_COLORS[anime.watch_status] ?? 'bg-zinc-500/80'
            )}
          >
            {STATUS_LABEL_KEYS[anime.watch_status]
              ? i18n._(STATUS_LABEL_KEYS[anime.watch_status]!)
              : anime.watch_status}
          </span>
        )}

        {/* Status change button — bottom right, appears on hover */}
        <AnimatePresence>
          {hovered && anime.bangumi_id && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              type="button"
              onClick={handleStatusClick}
              className="absolute bottom-2 right-2 z-10 w-6 h-6 rounded bg-black/70 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/90 transition-colors cursor-pointer"
              title={i18n._(msg`collection.changeStatus`)}
            >
              <span className="text-[10px] font-bold">…</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Status dropdown */}
        <AnimatePresence>
          {showDropdown && anime.bangumi_id && (
            <StatusDropdown
              bangumiId={anime.bangumi_id}
              currentStatus={anime.watch_status}
              onClose={() => setShowDropdown(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Info below poster */}
      <div className="mt-1.5 px-0.5">
        <p className="text-sm text-white/80 line-clamp-2 leading-snug">{displayTitle}</p>
        <p className="text-xs text-white/40 mt-0.5">
          {anime.local_file_count}/{anime.total_episodes ?? '?'} 集
        </p>
      </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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

  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('recent');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: anime, isLoading } = useQuery({
    queryKey: collectionKeys.list({ status: selectedStatus, search: debouncedSearch, sort }),
    queryFn: () => collectionApi.list({ status: selectedStatus, search: debouncedSearch, sort }),
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
      <div className="min-h-screen px-4 md:px-6 pt-6 pb-16">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {anime?.map((item, index) => (
                  <AnimeCard key={item.id} anime={item} index={index} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
