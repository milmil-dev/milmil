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
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { useDocumentTitle } from '../hooks/use-document-title';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import { progressApi, progressKeys } from '../lib/api/progress';
import { translateGenre } from '../lib/genre-i18n';
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
  useDocumentTitle(i18n._(msg`nav.home`));
  const { data: calendar } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });
  const { data: trending = [] } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
  });
  useQuery({
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

  const heroItems = trending.slice(0, 7);
  // Deduplicate: exclude hero items from trending grid by bangumi_id
  const heroIds = new Set(heroItems.map((h) => h.bangumi_id));
  const trendingRest = trending.filter((t) => !heroIds.has(t.bangumi_id)).slice(0, 7);

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
        {heroItems.length > 0 && (
          <HeroBanner
            items={heroItems}
            onActiveChange={handleHeroChange}
            watchHistory={recentProgress}
          />
        )}

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
                <SectionHeader title={i18n._(msg`home.continueWatching`)} to="/history" />
                <MediaRail>
                  {continueWatching.map((item) => {
                    const progress =
                      item.duration_seconds && item.duration_seconds > 0
                        ? item.position_seconds / item.duration_seconds
                        : 0;
                    const title =
                      (i18n.locale.startsWith('zh')
                        ? item.anime_title_zh || item.anime_title
                        : item.anime_title) || 'Unknown';
                    const epNum = Number.isInteger(item.episode_number)
                      ? item.episode_number
                      : item.episode_number.toFixed(1);
                    return (
                      <div key={item.id} className="shrink-0 w-[220px] md:w-[260px]">
                        <ContinueWatchingCard
                          title={title}
                          episodeLabel={`EP ${epNum} · ${Math.round(progress * 100)}%`}
                          progress={progress}
                          coverImage={item.anime_cover_image ?? ''}
                          href={`/watch/${item.anime_bangumi_id ?? item.anime_id}?ep=${item.episode_number}`}
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
                    search={{ genre }}
                    className="shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors bg-transparent hover:bg-ink/[0.06] text-ink/40 hover:text-ink/70 cursor-pointer"
                  >
                    {translateGenre(genre, i18n.locale)}
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
                <SectionHeader title={i18n._(msg`home.trending`)} to="/discover" />
                <div className="grid grid-cols-3 min-[768px]:grid-cols-4 min-[1080px]:grid-cols-5 min-[1320px]:grid-cols-6 min-[1750px]:grid-cols-7 min-[2000px]:grid-cols-8 gap-3">
                  {trendingRest.map((anime, i) => (
                    <AnimeCard key={anime.bangumi_id} anime={anime} index={i} />
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  const { i18n } = useLingui();
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-lg lg:text-xl font-semibold text-ink tracking-tight">{title}</h2>
      <Link
        to={to}
        className="text-[12px] font-medium transition-colors hover:text-ink text-ink/40 cursor-pointer"
      >
        {i18n._(msg`home.viewAll`)}
      </Link>
    </div>
  );
}
