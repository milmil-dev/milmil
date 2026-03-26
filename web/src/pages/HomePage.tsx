import { FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeRow } from '../components/AnimeRow';
import { ContinueWatchingCard } from '../components/ContinueWatchingCard';
import { HeroBanner } from '../components/HeroBanner';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import { progressApi, progressKeys } from '../lib/api/progress';
import { libraryGradient } from '../lib/gradient';

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

  const heroItems = trending.slice(0, 5);
  const trendingRest = trending.slice(5, 15);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero */}
        {heroItems.length > 0 && (
          <div className="px-4 md:px-6 pt-3">
            <HeroBanner items={heroItems} />
          </div>
        )}

        {/* Main content grid — content + optional side panel on xl */}
        <div className="flex gap-6 px-4 md:px-6">
          {/* Primary column */}
          <div className="flex-1 min-w-0">
            {/* Continue Watching */}
            {continueWatching.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-6"
              >
                <SectionHeader title="繼續觀看" to="/" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {continueWatching.map((item) => {
                    const progress =
                      item.duration_seconds && item.duration_seconds > 0
                        ? item.position_seconds / item.duration_seconds
                        : 0;
                    return (
                      <ContinueWatchingCard
                        key={item.id}
                        title={item.media_file_id ?? 'Unknown'}
                        episodeLabel={`${Math.round(progress * 100)}% watched`}
                        progress={progress}
                        coverImage=""
                        href={`/watch/${item.media_file_id ?? ''}`}
                      />
                    );
                  })}
                </div>
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
                <SectionHeader title="今日新番" to="/schedule" />
                <div className="rounded-lg bg-mm-surface/50 divide-y divide-mm-border/30">
                  {todayAnime.slice(0, 5).map((anime, i) => (
                    <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Genre chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-6 flex gap-2 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {GENRES.map((genre) => (
                <Link
                  key={genre}
                  to="/search"
                  search={{ q: genre }}
                  className="shrink-0 px-3 py-1 text-[11px] font-medium rounded-full transition-colors bg-mm-surface hover:bg-mm-surface-hover text-mm-text-secondary"
                >
                  {genre}
                </Link>
              ))}
            </motion.div>

            {/* Trending */}
            {trendingRest.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-6"
              >
                <SectionHeader title="熱門動畫" to="/trending" />
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {trendingRest.map((anime, i) => (
                    <AnimeCard key={anime.bangumi_id} anime={anime} index={i} />
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          {/* Side panel — libraries + queue status on xl screens */}
          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
            className="hidden xl:block w-[260px] shrink-0 mt-6"
          >
            <SectionHeader title="我的媒體庫" to="/libraries" />
            {libraries.length === 0 ? (
              <Link
                to="/libraries"
                className="group block rounded-lg border border-dashed py-6 px-4 text-center transition-colors hover:border-mm-accent/30 border-mm-border/40"
              >
                <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-mm-surface group-hover:bg-mm-accent/10 transition-colors">
                  <HugeiconsIcon
                    icon={FolderLibraryIcon}
                    size={18}
                    className="text-mm-text-muted group-hover:text-mm-accent transition-colors"
                  />
                </div>
                <p className="text-sm font-medium text-white mb-1">尚未新增媒體庫</p>
                <p className="text-[12px] text-mm-text-tertiary">新增資料夾開始掃描</p>
              </Link>
            ) : (
              <div className="space-y-2">
                {libraries.slice(0, 4).map((lib) => (
                  <Link
                    key={lib.id}
                    to="/libraries"
                    className="group block rounded-lg overflow-hidden bg-mm-surface hover:bg-mm-surface-hover transition-colors"
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
          <SectionHeader title="我的媒體庫" to="/libraries" />
          {libraries.length === 0 ? (
            <Link
              to="/libraries"
              className="group block rounded-lg border border-dashed py-6 px-4 text-center transition-colors hover:border-mm-accent/30 border-mm-border/40"
            >
              <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-mm-surface group-hover:bg-mm-accent/10 transition-colors">
                <HugeiconsIcon
                  icon={FolderLibraryIcon}
                  size={18}
                  className="text-mm-text-muted group-hover:text-mm-accent transition-colors"
                />
              </div>
              <p className="text-sm font-medium text-white mb-1">尚未新增媒體庫</p>
              <p className="text-[12px] text-mm-text-tertiary">新增資料夾開始掃描</p>
            </Link>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {libraries.slice(0, 4).map((lib) => (
                <Link
                  key={lib.id}
                  to="/libraries"
                  className="group block rounded-lg overflow-hidden bg-mm-surface hover:bg-mm-surface-hover transition-colors"
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
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[14px] font-bold text-white tracking-tight">{title}</h2>
      <Link
        to={to}
        className="text-[11px] font-medium transition-colors hover:text-white text-mm-text-tertiary"
      >
        查看全部 →
      </Link>
    </div>
  );
}
