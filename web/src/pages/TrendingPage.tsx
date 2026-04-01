import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { type AnimeSummary, discoverApi } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
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

  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => () => setImage(null), [setImage]);

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

  // Hero item is #1, grid starts at #2
  const heroItem = filteredItems[0] ?? null;
  const gridItems = filteredItems.slice(1);

  // Set atmospheric background from hero
  useEffect(() => {
    if (heroItem) {
      const img = heroItem.banner_image || heroItem.cover_image;
      if (img?.startsWith('http')) setImage(img);
    }
  }, [heroItem, setImage]);

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
          <>
            {/* Hero banner for #1 */}
            {heroItem && (
              <TrendingHero anime={heroItem} tabLabel={i18n._(TAB_CONFIG[activeTab].labelKey)} />
            )}

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

              {/* Ranked poster grid (#2 onward) */}
              <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4 mt-6">
                {gridItems.map((anime, i) => (
                  <div key={`${anime.bangumi_id}-${i}`} className="relative">
                    <AnimeCard anime={anime} />
                    {/* Rank overlay */}
                    <span className="absolute bottom-0 -left-1 text-[42px] font-black leading-none text-white/[0.12] pointer-events-none select-none tabular-nums">
                      {i + 2}
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
          </>
        )}
      </div>
    </PageTransition>
  );
}

/* ── Compact hero banner for #1 trending ──────────────────── */

function TrendingHero({ anime, tabLabel }: { anime: AnimeSummary; tabLabel: string }) {
  const { i18n } = useLingui();
  const bannerSrc = anime.banner_image || anime.cover_image;
  const hasBanner = !!anime.banner_image;

  return (
    <Link
      to={`/anime/${anime.bangumi_id}` as string}
      className="block relative w-full overflow-hidden group"
      style={{ height: 'clamp(180px, 22vh, 240px)' }}
    >
      {/* Background image */}
      {bannerSrc?.startsWith('http') ? (
        <img
          src={bannerSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          style={
            !hasBanner
              ? { filter: 'blur(24px) saturate(1.2) brightness(0.3)', transform: 'scale(1.4)' }
              : { filter: 'brightness(0.3) saturate(1.1)' }
          }
        />
      ) : (
        <div className="absolute inset-0" style={{ background: animeGradient(anime.title) }} />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--mm-bg)] via-[var(--mm-bg)]/40 to-[var(--mm-bg)]/50" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--mm-bg)]/80 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 md:px-6 pb-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {/* Rank badge */}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/70 bg-white/[0.08] backdrop-blur-sm rounded px-2 py-0.5 mb-2">
            #1 {tabLabel}
          </span>

          {/* Title */}
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight line-clamp-1 mb-1.5">
            {anime.title}
          </h1>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {anime.media_type && (
              <span className="text-[10px] font-bold text-white/60 bg-white/[0.08] rounded px-1.5 py-0.5">
                {anime.media_type}
              </span>
            )}
            {anime.score > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-400/90 tabular-nums">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-[10px] h-[10px]">
                  <path d="M6 0.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L6 9.52 2.48 11.35l.67-3.93L.3 4.64l3.94-.57z" />
                </svg>
                {anime.score.toFixed(1)}
              </span>
            )}
            {anime.episode_count > 0 && (
              <span className="text-[10px] text-white/40 tabular-nums">
                {anime.episode_count} {i18n._(msg`common.ep`)}
              </span>
            )}
            {anime.genres?.slice(0, 3).map((g) => (
              <span key={g} className="text-[10px] text-white/35">
                {translateGenre(g, i18n.locale)}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </Link>
  );
}

/* ── Skeleton loading state ───────────────────────────────── */

function TrendingPageSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      <Skeleton className="w-full" style={{ height: 'clamp(180px, 22vh, 240px)' }} />

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
