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
import { type LibraryWithStats, libraryApi, libraryKeys } from '../lib/api/library';
import { progressApi, progressKeys } from '../lib/api/progress';
import { translateGenre } from '../lib/genre-i18n';
import { cn } from '../lib/utils';
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
            hasWatchRecord={continueWatching.length > 0}
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
                <SectionHeader title={i18n._(msg`home.continueWatching`)} to="/" />
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
                          href={`/watch/${item.anime_id}?ep=${item.episode_number}`}
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
                    className="shrink-0 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors bg-transparent hover:bg-white/[0.06] text-white/40 hover:text-white/70 cursor-pointer"
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
                  <HomeLibraryCard key={lib.id} lib={lib} />
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
                <HomeLibraryCard key={lib.id} lib={lib} />
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

// ─── Compact source icon for homepage cards ──────────────────────────────────
function SourceIconSmall({ sourceType }: { sourceType: string }) {
  const cls = 'w-3.5 h-3.5 text-white/50';
  const isNetwork = sourceType === 'smb' || sourceType === 'sftp' || sourceType === 'ftp';
  const isCloud =
    sourceType === 'webdav' ||
    sourceType === 's3' ||
    sourceType === 'gdrive' ||
    sourceType === 'onedrive' ||
    sourceType === 'dropbox';

  if (isNetwork) {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <rect x="2" y="3" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <rect x="2" y="9" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="5" cy="5" r="0.8" fill="currentColor" />
        <circle cx="5" cy="11" r="0.8" fill="currentColor" />
      </svg>
    );
  }
  if (isCloud) {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <path
          d="M4.5 12a3 3 0 0 1-.2-6 4.2 4.2 0 0 1 7.9 0A3 3 0 0 1 11.5 12h-7z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (sourceType === 'http') {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={cls}>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="8" cy="8" rx="2.8" ry="5.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  // Local folder
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cls}>
      <path
        d="M2 5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function formatBytesShort(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 2 ? 1 : 0)} ${sizes[i]}`;
}

// ─── Enriched library card for homepage ──────────────────────────────────────
function HomeLibraryCard({ lib }: { lib: LibraryWithStats }) {
  const isRemote = lib.source_type !== 'local' && lib.source_type !== '';

  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: libraryKeys.connectionStatus(lib.id),
    queryFn: () => libraryApi.getConnectionStatus(lib.id),
    enabled: isRemote,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const matchPct = lib.file_count > 0 ? (lib.matched_count / lib.file_count) * 100 : 0;
  const isOnline = !isCheckingConnection && connectionStatus?.online;
  const isOffline = !isCheckingConnection && connectionStatus && !connectionStatus.online;

  return (
    <Link
      to="/libraries"
      className="group block rounded-lg overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200"
    >

      <div className="px-3 py-2.5 space-y-1.5">
        {/* Row 1: icon + name + connection + source badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <SourceIconSmall sourceType={lib.source_type} />
          <p className="text-[12px] font-semibold text-white truncate flex-1">{lib.name}</p>

          {isRemote && (
            <div className="shrink-0 flex items-center gap-1" title={connectionStatus?.error || ''}>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isCheckingConnection && 'bg-amber-300/70 animate-pulse',
                  isOnline && 'bg-emerald-400',
                  isOffline && 'bg-red-400'
                )}
              />
              <span className="text-[9px] font-bold px-1 py-px rounded bg-white/[0.06] text-white/35">
                {lib.source_type.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Row 2: path */}
        <p className="text-[10px] font-mono truncate text-mm-text-tertiary">{lib.path}</p>

        {/* Row 3: match bar + stats */}
        {lib.file_count > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${matchPct}%`,
                  backgroundColor: 'oklch(70% 0.05 330)',
                }}
              />
            </div>
            <span className="text-[9px] text-white/25 tabular-nums shrink-0">
              {lib.file_count} · {formatBytesShort(lib.total_size_bytes)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
