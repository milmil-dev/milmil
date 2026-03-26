import { FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeRow } from '../components/AnimeRow';
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

  // Filter out completed items and limit to 6
  const continueWatching = recentProgress.filter((p) => p.completed !== 1).slice(0, 6);

  const todayCN = (() => {
    const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const day = new Date().getDay();
    return weekdays[day === 0 ? 6 : day - 1];
  })();
  const todayAnime = calendar?.find((d) => d.weekday === todayCN)?.items ?? [];

  // Hero uses first 5 trending items
  const heroItems = trending.slice(0, 5);
  // Remaining trending for the row below
  const trendingRest = trending.slice(5, 15);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* ── Hero Banner ──────────────────────────────────────── */}
        {heroItems.length > 0 && (
          <div className="px-6 pt-4">
            <HeroBanner items={heroItems} />
          </div>
        )}

        {/* ── Continue Watching ────────────────────────────────── */}
        {continueWatching.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="px-6 mt-8"
          >
            <SectionHeader title="繼續觀看" to="/" />
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {continueWatching.map((item) => {
                const pct =
                  item.duration_seconds && item.duration_seconds > 0
                    ? Math.round((item.position_seconds / item.duration_seconds) * 100)
                    : 0;
                return (
                  <Link
                    key={item.id}
                    to="/watch/$fileId"
                    params={{ fileId: item.media_file_id ?? '' }}
                    className="group shrink-0 w-[220px] rounded overflow-hidden bg-mm-surface relative"
                  >
                    {/* Gradient overlay */}
                    <div className="h-[124px] relative flex items-end">
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'linear-gradient(to top, oklch(10% 0.01 280), oklch(16% 0.01 280))',
                        }}
                      />
                      <div className="relative z-10 p-3 w-full">
                        <p className="text-[12px] font-medium text-white truncate">
                          {item.media_file_id ?? 'Unknown'}
                        </p>
                        <p className="text-[11px] mt-0.5 text-mm-accent">{pct}% watched</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 bg-mm-border-subtle">
                      <div
                        className="h-full bg-mm-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ── Today's Schedule ─────────────────────────────────── */}
        {todayAnime.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="px-6 mt-8"
          >
            <SectionHeader title="今日新番" to="/schedule" />
            <div>
              {todayAnime.slice(0, 5).map((anime, i) => (
                <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Genre Filter Strip ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="px-6 mt-8 flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {GENRES.map((genre) => (
            <Link
              key={genre}
              to="/search"
              search={{ q: genre }}
              className="shrink-0 px-3 py-1 text-[11px] font-medium rounded-full transition-colors bg-mm-border-subtle"
              style={{ color: 'oklch(52% 0.01 280)' }}
            >
              {genre}
            </Link>
          ))}
        </motion.div>

        {/* ── Trending ─────────────────────────────────────────── */}
        {trendingRest.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="px-6 mt-8"
          >
            <SectionHeader title="熱門動畫" to="/trending" />
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {trendingRest.map((anime, i) => (
                <div key={anime.bangumi_id} className="shrink-0 w-[140px]">
                  <AnimeCard anime={anime} index={i} />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Libraries ────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="px-6 mt-8 pb-16"
        >
          <SectionHeader title="我的媒體庫" to="/libraries" />
          {libraries.length === 0 ? (
            <Link
              to="/libraries"
              className="group block rounded border border-dashed py-8 px-6 text-center transition-colors hover:border-[oklch(65%_0.2_35)]/30"
              style={{ borderColor: 'oklch(18% 0.01 280)' }}
            >
              <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors group-hover:bg-[oklch(65%_0.2_35)]/10 bg-mm-border-subtle">
                <HugeiconsIcon
                  icon={FolderLibraryIcon}
                  size={18}
                  className="transition-colors group-hover:text-[oklch(65%_0.2_35)] text-mm-text-muted"
                />
              </div>
              <p className="text-sm font-medium text-white mb-1">尚未新增媒體庫</p>
              <p className="text-[12px] text-mm-text-tertiary">新增資料夾開始掃描</p>
            </Link>
          ) : (
            <div className="grid gap-2">
              {libraries.slice(0, 4).map((lib) => (
                <Link
                  key={lib.id}
                  to="/libraries"
                  className="group block rounded overflow-hidden bg-mm-surface"
                >
                  <div
                    className="h-1.5 transition-all duration-300 group-hover:h-2.5"
                    style={{ background: libraryGradient(lib.name) }}
                  />
                  <div className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-white truncate">{lib.name}</p>
                    <p className="text-[11px] font-mono truncate mt-0.5 text-mm-text-tertiary">
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

// ─── Shared section header ────────────────────────────────────────────────────
function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[15px] font-bold text-white tracking-tight">{title}</h2>
      <Link
        to={to}
        className="text-[11px] font-medium transition-colors hover:text-white text-mm-text-secondary"
      >
        查看全部 →
      </Link>
    </div>
  );
}
