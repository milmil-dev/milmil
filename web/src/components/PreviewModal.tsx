import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
import { EpisodeListItem } from './EpisodeListItem';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';

interface PreviewModalProps {
  anime: AnimeSummary | null;
  open: boolean;
  onClose: () => void;
}

export function PreviewModal({ anime, open, onClose }: PreviewModalProps) {
  const { i18n } = useLingui();

  // Keep last anime data alive during close animation
  const [stableAnime, setStableAnime] = useState<AnimeSummary | null>(null);
  useEffect(() => {
    if (anime) setStableAnime(anime);
  }, [anime]);

  const displayAnime = anime ?? stableAnime;
  const directBangumiId = displayAnime?.bangumi_id ?? 0;
  const anilistId = displayAnime?.anilist_id ?? 0;

  // Resolve anilist_id → bangumi_id when we only have an AniList source
  const { data: resolved } = useQuery({
    queryKey: ['discover', 'resolve', anilistId],
    queryFn: () => discoverApi.resolve(anilistId),
    enabled: open && directBangumiId === 0 && anilistId > 0,
    retry: false,
  });

  const bangumiId = directBangumiId > 0 ? directBangumiId : (resolved?.bangumi_id ?? 0);
  const hasBangumiId = bangumiId > 0;

  // Fetch full detail + episodes when we have a bangumi_id (direct or resolved)
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: discoverKeys.detail(bangumiId),
    queryFn: () => discoverApi.detail(bangumiId),
    enabled: open && hasBangumiId,
  });

  const { data: episodes = [], isLoading: episodesLoading } = useQuery({
    queryKey: discoverKeys.episodes(bangumiId),
    queryFn: () => discoverApi.episodes(bangumiId),
    enabled: open && hasBangumiId,
  });

  const dimRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!dimRef.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    // Dim from 0 to 0.85 over 300px of scroll
    const opacity = Math.min(scrollTop / 300, 0.85);
    dimRef.current.style.opacity = String(opacity);
  }, []);

  if (!displayAnime) return null;

  const info = detail || displayAnime;
  const hasBanner = (detail?.banner_image || displayAnime.banner_image)?.startsWith('http');
  const bannerSrc = detail?.banner_image || displayAnime.banner_image || displayAnime.cover_image;
  const hasCover = displayAnime.cover_image?.startsWith('http');
  const synopsis = detail?.synopsis || displayAnime.description;
  const tags = detail?.tags || [];
  const genres = displayAnime.genres || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      onScroll={handleScroll}
      fixedBg={
        /* Full-bleed background — stays fixed, dims on scroll */
        <div className="absolute inset-0 overflow-hidden">
          {bannerSrc?.startsWith('http') ? (
            <img
              src={bannerSrc}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center brightness-[0.6]"
              style={
                !hasBanner
                  ? { filter: 'blur(24px) saturate(1.2) brightness(0.6)', transform: 'scale(1.3)' }
                  : undefined
              }
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: animeGradient(displayAnime.title) }}
            />
          )}
          {/* Gradient fade */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--mm-bg-elevated) 30%, transparent) 50%, color-mix(in srgb, var(--mm-bg-elevated) 70%, transparent) 100%)',
            }}
          />
          {/* Scroll-driven dim overlay */}
          <div ref={dimRef} className="absolute inset-0 bg-mm-bg-elevated" style={{ opacity: 0 }} />
        </div>
      }
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-[10] w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-colors text-white/70 hover:text-white cursor-pointer"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Hero section — matches AnimeDetailPage hero exactly */}
      <div className="relative -mx-5 -mt-5 w-auto">
        <div className="relative z-[2] flex-1 flex flex-col justify-start p-6 md:p-8 pt-8 md:pt-10 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex items-start gap-6">
              {/* Poster — same size as detail page */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="shrink-0 w-[140px] h-[200px] lg:w-[160px] lg:h-[225px] rounded-md overflow-hidden shadow-md"
                style={hasCover ? undefined : { background: animeGradient(displayAnime.title) }}
              >
                {hasCover && (
                  <img
                    src={displayAnime.cover_image}
                    alt={displayAnime.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </motion.div>

              <div className="min-w-0 flex-1 space-y-2 pt-2">
                {/* Title */}
                <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-8 line-clamp-2">
                  {info.title}
                </h2>
                {info.title_original && info.title_original !== info.title && (
                  <p className="text-[13px] text-gray-400 truncate">{info.title_original}</p>
                )}

                {/* Tags — same style as detail page */}
                {detailLoading ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-6 rounded-md"
                        style={{ width: `${52 + (i % 3) * 16}px` }}
                      />
                    ))}
                  </div>
                ) : genres.length > 0 || tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {genres.map((g) => (
                      <span
                        key={g}
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-white/[0.06] text-white/70"
                      >
                        {translateGenre(g, i18n.locale)}
                      </span>
                    ))}
                    {tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-white/[0.06] text-white/70"
                      >
                        {translateGenre(t, i18n.locale)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Score — same as detail page */}
                {detailLoading ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    {info.score > 0 && (
                      <span className="text-[16px] font-bold text-mm-accent">
                        ♡ {info.score.toFixed(1)}
                      </span>
                    )}
                    {info.episode_count > 0 && (
                      <span className="text-[13px] text-gray-400">
                        {info.episode_count} {i18n._(msg`common.ep`)}
                      </span>
                    )}
                    {detail?.rating && detail.rating.total > 0 && (
                      <span className="text-[13px] text-gray-400">
                        {detail.rating.total} {i18n._(msg`anime.ratings`)}
                      </span>
                    )}
                  </div>
                )}

                {/* Synopsis — same as detail page */}
                {detailLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[90%]" />
                    <Skeleton className="h-3.5 w-[70%]" />
                  </div>
                ) : synopsis ? (
                  <p className="text-[15px] text-gray-200 line-clamp-3 max-w-xl leading-relaxed">
                    {synopsis.replace(/<[^>]+>/g, '')}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>

          {/* Actions — below the hero content */}
          <div className="flex items-center gap-2.5 mt-4">
            {hasBangumiId ? (
              <Link
                to={`/anime/${bangumiId}` as string}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold rounded-md bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
              >
                {i18n._(msg`hero.details`)}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-semibold rounded-md bg-white/20 text-white/40 cursor-default">
                {i18n._(msg`hero.details`)}
              </span>
            )}
            {anilistId > 0 && (
              <a
                href={`https://anilist.co/anime/${anilistId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 text-[12px] rounded-md bg-white/[0.08] text-white/60 hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                AniList ↗
              </a>
            )}
            {hasBangumiId && (
              <a
                href={`https://bgm.tv/subject/${bangumiId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-3 py-2 text-[12px] rounded-md bg-white/[0.08] text-white/60 hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                Bangumi ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Trailer — compact, max 320px wide */}
      {detail?.trailer_url && (
        <div className="relative pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-ink/30 mb-2">
            {i18n._(msg`anime.trailer`)}
          </h3>
          <div className="max-w-[320px]">
            <div
              className="relative rounded-lg overflow-hidden border border-ink/[0.06]"
              style={{ aspectRatio: '16/9' }}
            >
              <iframe
                src={detail.trailer_url}
                title={`${info.title} trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Episodes section — scrolls over the fixed background */}
      <div className="relative pt-4 space-y-4">
        {episodesLoading && (
          <div>
            <Skeleton className="h-3 w-24 mb-3" />
            <div className="space-y-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-4 w-6 shrink-0" />
                  <Skeleton className="h-3.5 flex-1" style={{ width: `${55 + (i % 3) * 15}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {!episodesLoading && episodes.length > 0 && (
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.15em] text-ink/30 mb-2">
              {i18n._(msg`anime.episodes`)} ({episodes.length})
            </h3>
            <div className="space-y-0.5">
              {episodes.slice(0, 20).map((ep) => (
                <EpisodeListItem
                  key={ep.bangumi_episode_id}
                  sort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                  title={ep.title}
                  titleOriginal={ep.title_original}
                  synopsis={ep.synopsis}
                  image={ep.image}
                  duration={ep.duration}
                  isActive={false}
                  href={hasBangumiId ? `/anime/${bangumiId}` : '#'}
                  airDate={ep.air_date}
                />
              ))}
            </div>
            {episodes.length > 20 && hasBangumiId && (
              <Link
                to={`/anime/${bangumiId}` as string}
                onClick={onClose}
                className="flex items-center justify-center gap-2 mt-4 py-2.5 rounded-lg bg-ink/[0.06] text-[12px] font-semibold text-ink/50 hover:bg-ink/[0.1] hover:text-ink/80 transition-colors"
              >
                <span>{i18n._(msg`search.loadMore`)}</span>
                <span className="text-[11px] text-ink/30">
                  +{episodes.length - 20} {i18n._(msg`common.ep`)}
                </span>
                <span>→</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
