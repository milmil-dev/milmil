import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useCollectionMap } from '../hooks/use-collection-map';
import type { AnimeSummary } from '../lib/api/discover';
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

  if (hasDetailPage && !onPreview && !onClick) {
    return (
      <Link
        to={`/anime/${anime.bangumi_id}` as string}
        className="group/media-entry-card relative flex flex-col w-full"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group/media-entry-card relative flex flex-col w-full text-left cursor-pointer"
    >
      {content}
    </button>
  );
}
