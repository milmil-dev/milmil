import { FolderLibraryIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { AnimeCard } from '../components/AnimeCard';
import { AnimeRow } from '../components/AnimeRow';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import { libraryGradient } from '../lib/gradient';

export function HomePage() {
  // Queries
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

  // Today's weekday (Chinese)
  const todayCN = (() => {
    const Weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const day = new Date().getDay();
    return Weekdays[day === 0 ? 6 : day - 1];
  })();
  const todayAnime = calendar?.find((d) => d.weekday === todayCN)?.items ?? [];

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-white tracking-tight">milmil</h1>
          <p className="text-[13px] mt-1" style={{ color: 'oklch(42% 0.01 280)' }}>
            Your self-hosted anime media server
          </p>
        </motion.div>

        {/* Decorative rule */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-5 mb-8 h-px w-full origin-left"
          style={{ backgroundColor: 'oklch(14% 0.01 280)' }}
        />

        {/* Section 1: 今日新番 */}
        {todayAnime.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-10"
          >
            <div className="flex items-baseline justify-between mb-3">
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                今日新番
              </h2>
              <Link
                to="/schedule"
                className="text-[11px] font-medium transition-colors hover:text-white"
                style={{ color: 'oklch(45% 0.01 280)' }}
              >
                查看全部 →
              </Link>
            </div>
            <div>
              {todayAnime.slice(0, 6).map((anime, i) => (
                <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
              ))}
            </div>
          </motion.section>
        )}

        {/* Section 2: 熱門動畫 */}
        {trending.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-10"
          >
            <div className="flex items-baseline justify-between mb-3">
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                熱門動畫
              </h2>
              <Link
                to="/trending"
                className="text-[11px] font-medium transition-colors hover:text-white"
                style={{ color: 'oklch(45% 0.01 280)' }}
              >
                查看全部 →
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {trending.slice(0, 10).map((anime, i) => (
                <div key={anime.bangumi_id} className="shrink-0 w-[140px]">
                  <AnimeCard anime={anime} index={i} />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Section 3: 我的媒體庫 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h2
              className="text-[10px] font-bold uppercase tracking-[0.25em]"
              style={{ color: 'oklch(35% 0.01 280)' }}
            >
              我的媒體庫
            </h2>
            <Link
              to="/libraries"
              className="text-[11px] font-medium transition-colors hover:text-white"
              style={{ color: 'oklch(45% 0.01 280)' }}
            >
              查看全部 →
            </Link>
          </div>
          {libraries.length === 0 ? (
            <Link
              to="/libraries"
              className="group block rounded-sm border border-dashed py-8 px-6 text-center transition-colors hover:border-[oklch(65%_0.2_35)]/30"
              style={{ borderColor: 'oklch(18% 0.01 280)' }}
            >
              <div
                className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors group-hover:bg-[oklch(65%_0.2_35)]/10"
                style={{ backgroundColor: 'oklch(12% 0.01 280)' }}
              >
                <HugeiconsIcon
                  icon={FolderLibraryIcon}
                  size={18}
                  className="transition-colors group-hover:text-[oklch(65%_0.2_35)]"
                  style={{ color: 'oklch(32% 0.01 280)' }}
                />
              </div>
              <p className="text-sm font-medium text-white mb-1">No libraries yet</p>
              <p className="text-[12px]" style={{ color: 'oklch(38% 0.01 280)' }}>
                Add a folder to start scanning
              </p>
            </Link>
          ) : (
            <div className="grid gap-2">
              {libraries.slice(0, 4).map((lib) => (
                <Link
                  key={lib.id}
                  to="/libraries"
                  className="group block rounded-sm overflow-hidden"
                  style={{ backgroundColor: 'oklch(10% 0.01 280)' }}
                >
                  <div
                    className="h-1.5 transition-all duration-300 group-hover:h-2.5"
                    style={{ background: libraryGradient(lib.name) }}
                  />
                  <div className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-white truncate">{lib.name}</p>
                    <p
                      className="text-[11px] font-mono truncate mt-0.5"
                      style={{ color: 'oklch(38% 0.01 280)' }}
                    >
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
