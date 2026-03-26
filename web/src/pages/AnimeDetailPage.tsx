import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function AnimeDetailPage() {
  const { id } = useParams({ strict: false });
  const numericId = Number(id);

  const {
    data: anime,
    isLoading,
    isError,
  } = useQuery({
    queryKey: discoverKeys.detail(numericId),
    queryFn: () => discoverApi.detail(numericId),
    enabled: !Number.isNaN(numericId),
  });

  const { data: episodes = [] } = useQuery({
    queryKey: discoverKeys.episodes(numericId),
    queryFn: () => discoverApi.episodes(numericId),
    enabled: !Number.isNaN(numericId),
  });

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="h-[280px] animate-pulse bg-mm-border-subtle" />
          <div className="px-8 py-6 space-y-4">
            <div className="h-6 rounded bg-mm-border" style={{ width: '30%' }} />
            <div className="h-4 rounded bg-mm-border-subtle" style={{ width: '60%' }} />
            <div className="h-4 rounded bg-mm-surface" style={{ width: '80%' }} />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (isError || !anime) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm" style={{ color: 'oklch(45% 0.01 280)' }}>
            {isError ? '載入失敗' : '找不到此動畫'}
          </p>
        </div>
      </PageTransition>
    );
  }

  const hasBanner = anime.banner_image?.startsWith('http');
  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero banner */}
        <div className="relative h-[280px] overflow-hidden">
          {hasBanner ? (
            <img
              src={anime.banner_image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: animeGradient(anime.title) }} />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to top, oklch(7% 0.01 280) 0%, transparent 60%)',
            }}
          />

          {/* Cover + info */}
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-6 flex items-end gap-5">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="shrink-0 w-[120px] h-[170px] rounded overflow-hidden shadow-lg"
              style={hasCover ? undefined : { background: animeGradient(anime.title) }}
            >
              {hasCover && (
                <img
                  src={anime.cover_image}
                  alt={anime.title}
                  className="w-full h-full object-cover"
                />
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="min-w-0 flex-1 pb-1"
            >
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">
                {anime.title}
              </h1>
              {anime.title_original && anime.title_original !== anime.title && (
                <p className="text-[13px] mt-1 truncate" style={{ color: 'oklch(50% 0.01 280)' }}>
                  {anime.title_original}
                </p>
              )}
              {anime.title_en && (
                <p className="text-[12px] mt-0.5 truncate" style={{ color: 'oklch(40% 0.01 280)' }}>
                  {anime.title_en}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {anime.score > 0 && (
                  <span className="text-[13px] font-bold text-mm-accent">
                    {anime.score.toFixed(1)} 分
                  </span>
                )}
                {anime.episode_count > 0 && (
                  <span className="text-[12px]" style={{ color: 'oklch(45% 0.01 280)' }}>
                    {anime.episode_count} 集
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {anime.tags?.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap gap-1.5 mb-5"
            >
              {anime.tags.slice(0, 10).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'oklch(14% 0.01 280)', color: 'oklch(55% 0.01 280)' }}
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          )}

          {anime.synopsis && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="mb-8"
            >
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                簡介
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: 'oklch(55% 0.01 280)' }}>
                {anime.synopsis}
              </p>
            </motion.div>
          )}

          {episodes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
            >
              <h2
                className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
                style={{ color: 'oklch(35% 0.01 280)' }}
              >
                劇集 ({episodes.length})
              </h2>
              <div className="space-y-0.5">
                {episodes.map((ep, i) => (
                  <motion.div
                    key={ep.bangumi_episode_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.02 }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded transition-colors hover:bg-[oklch(11%_0.01_280)]"
                  >
                    <span
                      className="shrink-0 w-7 text-[12px] font-mono text-right"
                      style={{ color: 'oklch(35% 0.01 280)' }}
                    >
                      {ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white truncate">{ep.title}</p>
                    </div>
                    {ep.air_date && (
                      <span
                        className="shrink-0 text-[10px]"
                        style={{ color: 'oklch(30% 0.01 280)' }}
                      >
                        {ep.air_date}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
