import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
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
  const { i18n } = useLingui();
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
          <p className="text-sm text-mm-text-tertiary">
            {isError ? i18n._(msg`common.loadFailed`) : i18n._(msg`anime.notFound`)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-1.5 rounded-md bg-white/[0.06] text-[13px] text-mm-text-secondary hover:bg-white/[0.1] transition-colors"
          >
            {i18n._(msg`common.retry`)}
          </button>
          <Link
            to="/"
            className="mt-2 text-[12px] text-mm-text-muted hover:text-mm-text-secondary transition-colors"
          >
            {i18n._(msg`common.backHome`)}
          </Link>
        </div>
      </PageTransition>
    );
  }

  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero section — same pattern as home page hero, no duplicate bg image */}
        <div className="relative w-full overflow-hidden" style={{ height: 'clamp(340px, 45vh, 28rem)' }}>
          {/* Content — poster + info, vertically centered */}
          <div className="relative z-[2] h-full flex">
            <div className="flex-1 flex flex-col justify-start p-6 md:p-8 pt-8 md:pt-12 min-w-0 max-w-[700px]">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="flex items-start gap-6">
                  {/* Poster */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="shrink-0 w-[160px] h-[225px] lg:w-[200px] lg:h-[290px] rounded-md overflow-hidden shadow-md"
                    style={hasCover ? undefined : { background: animeGradient(anime.title) }}
                  >
                    {hasCover && (
                      <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />
                    )}
                  </motion.div>

                  <div className="min-w-0 flex-1 space-y-2 pt-2">
                    {/* Title */}
                    <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-8 line-clamp-2">
                      {anime.title}
                    </h1>
                    {anime.title_original && anime.title_original !== anime.title && (
                      <p className="text-[13px] text-gray-400 truncate">{anime.title_original}</p>
                    )}

                    {/* Tags as dot-separated text */}
                    {anime.tags?.length > 0 && (
                      <p className="text-[14px] font-semibold text-gray-200">
                        {anime.tags.slice(0, 4).join(' · ')}
                      </p>
                    )}

                    {/* Score */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {anime.score > 0 && (
                        <span className="text-[16px] font-bold text-mm-accent">
                          ♡ {anime.score.toFixed(1)}
                        </span>
                      )}
                      {anime.episode_count > 0 && (
                        <span className="text-[13px] text-gray-400">
                          {anime.episode_count} {i18n._(msg`common.ep`)}
                        </span>
                      )}
                      {anime.air_date && (
                        <span className="text-[13px] text-gray-400">
                          {new Date(anime.air_date).getFullYear()}
                        </span>
                      )}
                      {anime.rating && anime.rating.total > 0 && (
                        <span className="text-[13px] text-gray-400">
                          {anime.rating.total} {i18n._(msg`anime.ratings`)}
                        </span>
                      )}
                    </div>

                    {/* Synopsis — inline like home hero */}
                    {anime.synopsis && (
                      <p className="text-[15px] text-gray-200 line-clamp-3 max-w-xl leading-relaxed">
                        {anime.synopsis}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Episodes section */}
        {episodes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="px-4 md:px-8 py-6"
          >
            <h2 className="text-lg font-bold text-white mb-4">
              {i18n._(msg`anime.episodes`)} ({episodes.length})
            </h2>
            <div className="space-y-0.5">
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
    </PageTransition>
  );
}
