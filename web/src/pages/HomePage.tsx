import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeRow } from '../components/AnimeRow';
import { ContinueWatchingCard } from '../components/ContinueWatchingCard';
import { HeroBanner } from '../components/HeroBanner';
import { HomePageSkeleton } from '../components/HomePageSkeleton';
import { LibraryEmptyState } from '../components/LibraryEmptyState';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import { progressApi, progressKeys } from '../lib/api/progress';
import { libraryGradient } from '../lib/gradient';
import { useBgStore } from '../store/bg-store';

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Psychological',
  'Romance',
  'Slice of Life',
  'Supernatural',
];

export function HomePage() {
  const { i18n } = useLingui();
  const { data: calendar } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });
  const { data: trending = [] } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
  });
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: libraryApi.list,
  });
  const { data: recentProgress = [] } = useQuery({
    queryKey: progressKeys.recent(),
    queryFn: progressApi.recent,
  });

  const continueWatching = recentProgress.filter((p) => p.completed !== 1).slice(0, 6);

  const todayCN = (() => {
    const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const day = new Date().getDay();
    return weekdays[day === 0 ? 6 : day - 1];
  })();
  const todayAnime = calendar?.find((d) => d.weekday === todayCN)?.items ?? [];

  const isLoading = !calendar && !trending.length;

  const heroItems = trending.slice(0, 5);
  const trendingRest = trending.slice(5, 15);

  const setImage = useBgStore((s) => s.setImage);
  // Clear bg on unmount
  useEffect(() => () => setImage(null), [setImage]);
  // Update bg when hero carousel rotates
  const handleHeroChange = (item: AnimeSummary) => {
    const img = item.banner_image || item.cover_image;
    if (img?.startsWith('http')) setImage(img);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <HomePageSkeleton />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero — full width, no padding, edge-to-edge like Seanime */}
        {heroItems.length > 0 && <HeroBanner items={heroItems} onActiveChange={handleHeroChange} />}

        {/* Main content grid */}
        <div className="flex gap-6 px-4 md:px-6">
          <div className="flex-1 min-w-0">
            {/* Continue Watching */}
            {continueWatching.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-6"
              >
                <SectionHeader title={i18n._(msg`home.continueWatching`)} to="/" />
                <MediaRail>
                  {continueWatching.map((item) => {
                    const progress =
                      item.duration_seconds && item.duration_seconds > 0
                        ? item.position_seconds / item.duration_seconds
                        : 0;
                    return (
                      <div key={item.id} className="shrink-0 w-[220px] md:w-[260px]">
                        <ContinueWatchingCard
                          title={item.media_file_id ?? 'Unknown'}
                          episodeLabel={`${Math.round(progress * 100)}%`}
                          progress={progress}
                          coverImage=""
                          href={`/watch/${item.media_file_id ?? ''}`}
                        />
                      </div>
                    );
                  })}
                </MediaRail>
              </motion.section>
            )}

            {/* Today's Schedule */}
            {todayAnime.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6"
              >
                <SectionHeader title={i18n._(msg`home.todaySchedule`)} to="/schedule" />
                <div>
                  {todayAnime.slice(0, 5).map((anime, i) => (
                    <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Genre chips with edge fade */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-6 relative"
            >
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {GENRES.map((genre) => (
                  <Link
                    key={genre}
                    to="/search"
                    search={{ q: genre }}
                    className="shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors bg-transparent hover:bg-white/[0.06] text-white/40 hover:text-white/70 cursor-pointer"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
              {/* Right edge fade for scroll hint */}
              <div
                className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none"
                style={{ background: 'linear-gradient(to left, var(--mm-bg), transparent)' }}
              />
            </motion.div>

            {/* Trending — Seanime-style responsive grid */}
            {trendingRest.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-6"
              >
                <SectionHeader title={i18n._(msg`home.trending`)} to="/trending" />
                <div className="grid grid-cols-2 min-[768px]:grid-cols-3 min-[1080px]:grid-cols-4 min-[1320px]:grid-cols-5 min-[1750px]:grid-cols-6 min-[2000px]:grid-cols-8 gap-4">
                  {trendingRest.map((anime, i) => (
                    <AnimeCard key={anime.bangumi_id} anime={anime} index={i} />
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          {/* Side panel — libraries on xl */}
          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
            className="hidden xl:block w-[260px] shrink-0 mt-6"
          >
            <SectionHeader title={i18n._(msg`home.myLibraries`)} to="/libraries" />
            {libraries.length === 0 ? (
              <LibraryEmptyState />
            ) : (
              <div className="space-y-2">
                {libraries.slice(0, 4).map((lib) => (
                  <Link
                    key={lib.id}
                    to="/libraries"
                    className="group block rounded-lg overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200"
                  >
                    <div
                      className="h-1 transition-all duration-300 group-hover:h-1.5"
                      style={{ background: libraryGradient(lib.name) }}
                    />
                    <div className="px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-white truncate">{lib.name}</p>
                      <p className="text-[10px] font-mono truncate mt-0.5 text-mm-text-tertiary">
                        {lib.path}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </motion.aside>
        </div>

        {/* Libraries for non-xl screens */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="xl:hidden px-4 md:px-6 mt-6 pb-8"
        >
          <SectionHeader title={i18n._(msg`home.myLibraries`)} to="/libraries" />
          {libraries.length === 0 ? (
            <LibraryEmptyState />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {libraries.slice(0, 4).map((lib) => (
                <Link
                  key={lib.id}
                  to="/libraries"
                  className="group block rounded-lg overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200"
                >
                  <div
                    className="h-1 transition-all duration-300 group-hover:h-1.5"
                    style={{ background: libraryGradient(lib.name) }}
                  />
                  <div className="px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-white truncate">{lib.name}</p>
                    <p className="text-[10px] font-mono truncate mt-0.5 text-mm-text-tertiary">
                      {lib.path}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </PageTransition>
  );
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  const { i18n } = useLingui();
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight">{title}</h2>
      <Link
        to={to}
        className="text-[12px] font-medium transition-colors hover:text-white text-white/40 cursor-pointer"
      >
        {i18n._(msg`home.viewAll`)}
      </Link>
    </div>
  );
}
