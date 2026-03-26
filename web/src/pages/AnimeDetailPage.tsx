import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { EpisodeListItem } from '../components/EpisodeListItem';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { useBgStore } from '../store/bg-store';

export function AnimeDetailPage() {
  const { id } = useParams({ strict: false });
  const numericId = Number(id);
  const setImage = useBgStore((s) => s.setImage);

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

  // Set full-screen background image (behind sidebar) — Seanime style
  useEffect(() => {
    const img = anime?.banner_image || anime?.cover_image;
    if (img?.startsWith('http')) {
      setImage(img);
    }
    return () => setImage(null);
  }, [anime?.banner_image, anime?.cover_image, setImage]);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="h-[340px] animate-pulse bg-white/[0.04]" />
          <div className="px-4 md:px-8 py-6 space-y-4">
            <div className="h-6 rounded bg-white/[0.06]" style={{ width: '30%' }} />
            <div className="h-4 rounded bg-white/[0.04]" style={{ width: '60%' }} />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (isError || !anime) {
    return (
      <PageTransition>
        <div className="min-h-screen flex flex-col items-center justify-center">
          <p className="text-sm text-mm-text-tertiary">{isError ? '載入失敗' : '找不到此動畫'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-1.5 rounded-md bg-white/[0.06] text-[13px] text-mm-text-secondary hover:bg-white/[0.1] transition-colors"
          >
            重試
          </button>
          <Link
            to="/"
            className="mt-2 text-[12px] text-mm-text-muted hover:text-mm-text-secondary transition-colors"
          >
            返回首頁
          </Link>
        </div>
      </PageTransition>
    );
  }

  const hasBanner = anime.banner_image?.startsWith('http');
  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Cinematic header */}
        <div className="relative overflow-hidden" style={{ height: 'clamp(300px, 40vh, 420px)' }}>
          {/* Background art */}
          {hasBanner ? (
            <img
              src={anime.banner_image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.5) saturate(1.2)' }}
            />
          ) : (
            <div className="absolute inset-0" style={{ background: animeGradient(anime.title) }} />
          )}

          {/* Multi-layer scrim */}
          <div
            className="absolute inset-0"
            style={{
              background: [
                'linear-gradient(to top, var(--mm-bg) 0%, transparent 50%)',
                'linear-gradient(90deg, oklch(from var(--mm-bg) l c h / 0.7) 0%, transparent 70%)',
              ].join(', '),
            }}
          />

          {/* Content anchored to bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-4 md:px-8 pb-6 flex items-end gap-5">
            {/* Poster */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="shrink-0 w-[110px] md:w-[130px] aspect-[3/4] rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10"
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

            {/* Title block */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="min-w-0 flex-1 pb-1"
            >
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight line-clamp-2">
                {anime.title}
              </h1>
              {anime.title_original && anime.title_original !== anime.title && (
                <p className="text-[13px] mt-1 truncate text-mm-text-tertiary">
                  {anime.title_original}
                </p>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                {anime.score > 0 && (
                  <span className="text-[13px] font-bold text-mm-accent">
                    {anime.score.toFixed(1)} 分
                  </span>
                )}
                {anime.rating?.total > 0 && (
                  <span className="text-[11px] text-mm-text-muted">
                    {anime.rating.total} 人評價
                  </span>
                )}
                {anime.episode_count > 0 && (
                  <span className="text-[11px] text-mm-text-muted">{anime.episode_count} 集</span>
                )}
                {anime.air_date && (
                  <span className="text-[11px] text-mm-text-muted">
                    {new Date(anime.air_date).getFullYear()}
                  </span>
                )}
              </div>

              {/* Tags inline */}
              {anime.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {anime.tags.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded bg-white/[0.06] text-mm-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Body — synopsis + episodes in two-column on lg */}
        <div className="px-4 md:px-8 py-6 flex flex-col lg:flex-row gap-8">
          {/* Synopsis column */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="lg:w-[360px] lg:shrink-0"
          >
            {anime.synopsis && (
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2 text-mm-text-muted">
                  簡介
                </h2>
                <p className="text-[13px] leading-relaxed text-mm-text-secondary">
                  {anime.synopsis}
                </p>
              </div>
            )}
          </motion.div>

          {/* Episodes column — watch queue style */}
          {episodes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="flex-1 min-w-0"
            >
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3 text-mm-text-muted">
                劇集 ({episodes.length})
              </h2>
              <div className="space-y-0.5 rounded-lg bg-white/[0.03] p-1">
                {episodes.map((ep) => (
                  <EpisodeListItem
                    key={ep.bangumi_episode_id}
                    sort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                    title={ep.title}
                    isActive={false}
                    href={`/anime/${numericId}`}
                    airDate={ep.air_date}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
