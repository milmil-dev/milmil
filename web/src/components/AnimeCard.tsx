import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useCollectionMap } from '../hooks/use-collection-map';
import type { AnimeSummary } from '../lib/api/discover';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

const STATUS_COLORS: Record<string, string> = {
  watching: 'bg-blue-500/80',
  planning: 'bg-amber-500/80',
  completed: 'bg-green-500/80',
  paused: 'bg-zinc-500/80',
  dropped: 'bg-red-500/80',
};

const STATUS_LABELS: Record<string, ReturnType<typeof msg>> = {
  watching: msg`collection.watching`,
  planning: msg`collection.planning`,
  completed: msg`collection.completed`,
  paused: msg`collection.paused`,
  dropped: msg`collection.dropped`,
};

function formatSeason(airDate: string | undefined, i18n: ReturnType<typeof useLingui>['i18n']): string | null {
  if (!airDate) return null;
  const d = new Date(airDate);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  let season: string;
  if (month <= 3) season = i18n._(msg`schedule.season.winter`);
  else if (month <= 6) season = i18n._(msg`schedule.season.spring`);
  else if (month <= 9) season = i18n._(msg`schedule.season.summer`);
  else season = i18n._(msg`schedule.season.fall`);
  return `${season} ${year}`;
}

interface AnimeCardProps {
  anime: AnimeSummary;
  index?: number;
  onPreview?: (anime: AnimeSummary) => void;
  /** Optional overlay content rendered inside the poster area (absolute positioned) */
  children?: ReactNode;
  /** Override click behavior — when provided, navigation is skipped */
  onClick?: (e: React.MouseEvent) => void;
}

export function AnimeCard({ anime, onPreview, children, onClick }: AnimeCardProps) {
  const { i18n } = useLingui();
  const [imgFailed, setImgFailed] = useState(false);
  const hasCover = !imgFailed && anime.cover_image?.startsWith('http');
  const hasDetailPage = anime.bangumi_id > 0;
  const collectionMap = useCollectionMap();
  const watchStatus = collectionMap.get(anime.bangumi_id);

  // Hover card state
  const [showCard, setShowCard] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [cardSide, setCardSide] = useState<'right' | 'left'>('right');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const { data: detail } = useQuery({
    queryKey: discoverKeys.detail(anime.bangumi_id),
    queryFn: () => discoverApi.detail(anime.bangumi_id),
    enabled: hovered && anime.bangumi_id > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleEnter = useCallback(() => {
    setHovered(true);
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      setCardSide(spaceRight >= 550 ? 'right' : 'left');
    }
    timerRef.current = setTimeout(() => setShowCard(true), 400);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowCard(false);
    setHovered(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    } else if (onPreview) {
      e.preventDefault();
      onPreview(anime);
    } else if (!hasDetailPage) {
      e.preventDefault();
    }
  };

  const content = (
    <>
      {/* Card body */}
      <div
        className="relative aspect-[6/8] rounded-md overflow-hidden"
        style={hasCover ? undefined : { background: animeGradient(anime.title) }}
      >
        {hasCover && (
          <img
            src={anime.cover_image}
            alt={anime.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover/media-entry-card:scale-110"
            onError={() => setImgFailed(true)}
          />
        )}
        {!hasCover && (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <span className="text-[11px] font-medium text-white/50 text-center line-clamp-3">
              {anime.title}
            </span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#0c0c0c] to-transparent opacity-90" />
        {anime.score > 0 && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-white tabular-nums bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 leading-none">
            <svg viewBox="0 0 12 12" fill="currentColor" className="w-[10px] h-[10px] text-amber-400">
              <path d="M6 0.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L6 9.52 2.48 11.35l.67-3.93L.3 4.64l3.94-.57z" />
            </svg>
            {anime.score.toFixed(1)}
          </span>
        )}
        {/* Watch status badge */}
        {watchStatus && watchStatus !== 'watching' && !children && (
          <span
            className={cn(
              'absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded text-white backdrop-blur-md',
              STATUS_COLORS[watchStatus] ?? 'bg-zinc-500/80'
            )}
          >
            {STATUS_LABELS[watchStatus] ? i18n._(STATUS_LABELS[watchStatus]!) : watchStatus}
          </span>
        )}
        {anime.episode_count > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] font-medium text-white/70 bg-black/60 backdrop-blur-sm rounded px-1 py-0.5 leading-none">
            {anime.episode_count} {i18n._(msg`common.ep`)}
          </span>
        )}
        {children}
      </div>
      {/* Title */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="text-sm font-medium text-[--foreground] line-clamp-2 leading-snug">
          {anime.title}
        </p>
      </div>
    </>
  );

  const cardWrapper = (inner: ReactNode) => (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {inner}
      {/* Hover detail card — desktop only */}
      <AnimatePresence>
        {showCard && (
          <HoverDetailCard
            anime={anime}
            detail={detail ?? null}
            watchStatus={watchStatus ?? null}
            cardSide={cardSide}
            locale={i18n.locale}
            i18n={i18n}
          />
        )}
      </AnimatePresence>
    </div>
  );

  if (hasDetailPage && !onPreview && !onClick) {
    return cardWrapper(
      <Link
        to={`/anime/${anime.bangumi_id}` as string}
        className="group/media-entry-card relative flex flex-col w-full"
      >
        {content}
      </Link>
    );
  }

  return cardWrapper(
    <button
      type="button"
      onClick={handleClick}
      className="group/media-entry-card relative flex flex-col w-full text-left cursor-pointer"
    >
      {content}
    </button>
  );
}

/* ── Hover detail card ─────────────────────────────────────── */

function HoverDetailCard({
  anime,
  detail,
  watchStatus,
  cardSide,
  locale,
  i18n,
}: {
  anime: AnimeSummary;
  detail: Awaited<ReturnType<typeof discoverApi.detail>> | null;
  watchStatus: string | null;
  cardSide: 'right' | 'left';
  locale: string;
  i18n: ReturnType<typeof useLingui>['i18n'];
}) {
  const info = detail || anime;
  const bannerSrc = detail?.banner_image || anime.banner_image || anime.cover_image;
  const hasBanner = !!(detail?.banner_image || anime.banner_image);
  const hasCover = anime.cover_image?.startsWith('http');
  const tags = detail?.tags || [];
  const genres = anime.genres || [];
  const displayTags = tags.length > 0 ? tags : genres;
  const synopsis = detail?.synopsis || anime.description;
  const seasonLabel = formatSeason(info.air_date, i18n);
  const mediaType = info.media_type || null;

  return (
    <div
      className={cn(
        'absolute top-1/2 -translate-y-1/2 z-50 w-[530px] pointer-events-none hidden lg:block',
        cardSide === 'right' ? 'left-full ml-3' : 'right-full mr-3'
      )}
    >
      <motion.div
        initial={{ opacity: 0, x: cardSide === 'right' ? -8 : 8, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: cardSide === 'right' ? -4 : 4, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative rounded-lg overflow-hidden border border-white/[0.06] shadow-2xl"
      >
        {/* Background */}
        <div className="absolute inset-0">
          {bannerSrc?.startsWith('http') ? (
            <img
              src={bannerSrc}
              alt=""
              className="w-full h-full object-cover"
              style={
                !hasBanner
                  ? { filter: 'blur(24px) saturate(1.2) brightness(0.35)', transform: 'scale(1.4)' }
                  : { filter: 'blur(2px) brightness(0.35)' }
              }
            />
          ) : (
            <div className="w-full h-full" style={{ background: animeGradient(anime.title) }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/80" />
        </div>

        {/* Content */}
        <div className="relative z-[1] flex items-start gap-3.5 p-3.5">
          {/* Cover thumbnail */}
          <div
            className="relative shrink-0 w-[138px] h-[193px] rounded overflow-hidden shadow-lg ring-1 ring-white/10"
            style={hasCover ? undefined : { background: animeGradient(anime.title) }}
          >
            {hasCover && (
              <img src={anime.cover_image} alt="" className="w-full h-full object-cover" />
            )}
            {watchStatus && (
              <span
                className={cn(
                  'absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded text-white backdrop-blur-md',
                  STATUS_COLORS[watchStatus] ?? 'bg-zinc-500/80'
                )}
              >
                {STATUS_LABELS[watchStatus] ? i18n._(STATUS_LABELS[watchStatus]!) : watchStatus}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <div>
              <p className="text-[14px] font-bold text-white leading-snug line-clamp-2">
                {info.title}
              </p>
              {info.title_original && info.title_original !== info.title && (
                <p className="text-[10px] text-white/35 truncate mt-0.5">{info.title_original}</p>
              )}
            </div>

            {/* Meta row — type, season, episodes, score */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {mediaType && (
                <span className="text-[10px] font-bold text-white/70 bg-white/[0.08] rounded px-1.5 py-0.5">
                  {mediaType}
                </span>
              )}
              {seasonLabel && (
                <span className="text-[10px] font-medium text-white/50 bg-white/[0.06] rounded px-1.5 py-0.5">
                  {seasonLabel}
                </span>
              )}
              {info.episode_count > 0 && (
                <span className="text-[10px] font-medium text-white/50 bg-white/[0.06] rounded px-1.5 py-0.5 tabular-nums">
                  {info.episode_count} {i18n._(msg`common.ep`)}
                </span>
              )}
              {info.score > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400/90 bg-white/[0.06] rounded px-1.5 py-0.5 tabular-nums">
                  <svg viewBox="0 0 12 12" fill="currentColor" className="w-[9px] h-[9px]">
                    <path d="M6 0.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L6 9.52 2.48 11.35l.67-3.93L.3 4.64l3.94-.57z" />
                  </svg>
                  {info.score.toFixed(1)}
                </span>
              )}
              {detail?.rating && detail.rating.total > 0 && (
                <span className="text-[10px] text-white/30 tabular-nums">
                  ({detail.rating.total})
                </span>
              )}
            </div>

            {/* Next episode */}
            {anime.next_episode && anime.next_episode > 0 && (
              <span className="text-[10px] text-white/40 tabular-nums">
                {i18n._(msg`card.nextEp`)} {anime.next_episode}
              </span>
            )}

            {/* Tags */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {displayTags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50"
                  >
                    {translateGenre(t, locale)}
                  </span>
                ))}
                {displayTags.length > 4 && (
                  <span className="text-[9px] text-white/25 px-0.5 py-0.5">
                    +{displayTags.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Synopsis */}
            {synopsis && (
              <p className="text-[10px] text-white/40 leading-relaxed line-clamp-3">
                {synopsis.replace(/<[^>]+>/g, '')}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
