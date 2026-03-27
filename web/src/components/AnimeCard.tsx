import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function AnimeCard({ anime }: { anime: AnimeSummary; index?: number }) {
  const { i18n } = useLingui();
  const [imgFailed, setImgFailed] = useState(false);
  const hasCover = !imgFailed && anime.cover_image?.startsWith('http');

  return (
    <Link
      to={`/anime/${anime.bangumi_id}` as string}
      className="group/media-entry-card relative flex flex-col"
    >
      {/* Card body — Seanime: aspect-[6/8], hover zoom */}
      <div
        className="relative aspect-[6/8] rounded-md overflow-hidden"
        style={hasCover ? undefined : { background: animeGradient(anime.title) }}
      >
        {hasCover && (
          <img
            src={anime.cover_image}
            alt={anime.title}
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
        {/* Bottom gradient — Seanime: from-[#0c0c0c] opacity-90 */}
        <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#0c0c0c] to-transparent opacity-90" />
        {anime.score > 0 && (
          <div className="absolute bottom-2 left-2">
            <span className="text-[11px] font-bold text-mm-accent">{anime.score.toFixed(1)}</span>
          </div>
        )}
      </div>
      {/* Title — Seanime: text-sm, line-clamp-2 */}
      <div className="pt-1.5">
        <p className="text-sm font-medium text-[--foreground] line-clamp-2 leading-snug">
          {anime.title}
        </p>
        {anime.episode_count > 0 && (
          <p className="text-[11px] mt-0.5 text-[--muted]">
            {anime.episode_count} {i18n._(msg`common.ep`)}
          </p>
        )}
      </div>
    </Link>
  );
}
