import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { discoverApi } from '../lib/api/discover';
import { cn } from '../lib/utils';
import { useBgStore } from '../store/bg-store';

type Tab = 'trending' | 'topRated' | 'popular';

const MEDIA_TYPES = ['all', 'TV', 'MOVIE', 'OVA', 'ONA'] as const;

const TAB_CONFIG: Record<Tab, { labelKey: ReturnType<typeof msg>; sort?: string }> = {
  trending: { labelKey: msg`trending.tab.trending` },
  topRated: { labelKey: msg`trending.tab.topRated`, sort: 'SCORE_DESC' },
  popular: { labelKey: msg`trending.tab.popular`, sort: 'POPULARITY_DESC' },
};

export function TrendingPage() {
  const { i18n } = useLingui();
  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [mediaType, setMediaType] = useState<string>('all');

  // Clear any lingering bg glow from other pages on mount/unmount
  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => {
    setImage(null);
    return () => setImage(null);
  }, [setImage]);

  const tabConfig = TAB_CONFIG[activeTab];

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey:
        activeTab === 'trending'
          ? ['discover', 'trending', 'infinite']
          : ['discover', 'browse', activeTab, 'infinite'],
      queryFn: ({ pageParam }) =>
        activeTab === 'trending'
          ? discoverApi.trending(pageParam)
          : discoverApi.browse({ sort: tabConfig.sort, page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (lastPage, _allPages, lastPageParam) =>
        lastPage.length > 0 ? lastPageParam + 1 : undefined,
    });

  // Flatten all pages into a single array
  const allItems = data?.pages.flat() ?? [];

  // Reset when tab changes
  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  // Client-side media type filtering
  const filteredItems =
    mediaType === 'all'
      ? allItems
      : allItems.filter((a) => a.media_type?.toUpperCase() === mediaType);

  const gridItems = filteredItems;

  // Intersection observer for auto-loading
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showSkeleton = isLoading && allItems.length === 0;

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Skeleton ────────────────────────────────── */}
        {showSkeleton && <TrendingPageSkeleton />}

        {/* ── Error ───────────────────────────────────── */}
        {isError && allItems.length === 0 && (
          <div className="text-center py-16 px-8">
            <p className="text-sm mb-3 text-mm-text-secondary">載入失敗</p>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              重試
            </Button>
          </div>
        )}

        {/* ── Main content ────────────────────────────── */}
        {!showSkeleton && allItems.length > 0 && (
          <div className="px-4 md:px-6">
            {/* Tab bar */}
            <div className="flex items-center gap-6 border-b border-white/[0.06] mt-5">
              {(Object.keys(TAB_CONFIG) as Tab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => switchTab(tab)}
                  className={cn(
                    'pb-2.5 text-sm font-semibold transition-colors relative cursor-pointer',
                    activeTab === tab ? 'text-white' : 'text-white/40 hover:text-white/60'
                  )}
                >
                  {i18n._(TAB_CONFIG[tab].labelKey)}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="trending-tab-indicator"
                      className="absolute -bottom-px left-0 right-0 h-[2px] bg-white/70"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Media type filter chips */}
            <div className="flex items-center gap-2 mt-4">
              {MEDIA_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMediaType(type)}
                  className={cn(
                    'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors cursor-pointer',
                    mediaType === type
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                  )}
                >
                  {type === 'all' ? i18n._(msg`trending.filter.all`) : type}
                </button>
              ))}
            </div>

            {/* Ranked poster grid */}
            <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4 mt-6">
              {gridItems.map((anime, i) => (
                <div key={`${anime.bangumi_id}-${i}`} className="relative">
                  <AnimeCard anime={anime} />
                  {/* Rank overlay */}
                  <span className="absolute bottom-0 -left-1 text-[42px] font-black leading-none text-white/[0.12] pointer-events-none select-none tabular-nums">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* Sentinel for auto-loading + loading indicator */}
            <div ref={sentinelRef} className="flex justify-center py-12">
              {isFetchingNextPage && (
                <div className="flex items-center gap-2 text-sm text-mm-text-tertiary">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="31.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  載入中...
                </div>
              )}
              {!hasNextPage && allItems.length > 0 && (
                <p className="text-sm text-mm-text-muted">— · —</p>
              )}
            </div>

            {/* No results after filtering */}
            {filteredItems.length === 0 && !isLoading && (
              <div className="text-center py-16">
                <p className="text-sm text-mm-text-secondary">沒有符合的結果</p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

/* ── Skeleton loading state ───────────────────────────────── */

function TrendingPageSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="px-4 md:px-6">
        {/* Tab skeleton */}
        <div className="flex items-center gap-6 mt-5 border-b border-white/[0.06] pb-2.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Filter chips skeleton */}
        <div className="flex items-center gap-2 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Skeleton key={i} className="h-7 w-14 rounded-md" />
          ))}
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4 mt-6">
          {Array.from({ length: 12 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Skeleton key={i} className="aspect-[6/8] rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
