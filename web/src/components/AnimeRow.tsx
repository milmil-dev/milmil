import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function AnimeRow({ anime, index = 0 }: { anime: AnimeSummary; index?: number }) {
  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link
        to={`/anime/${anime.bangumi_id}` as string}
        className="group flex items-center gap-3 py-2.5 px-3 rounded transition-colors hover:bg-[oklch(11%_0.01_280)]"
      >
        <div
          className="shrink-0 w-10 h-14 rounded overflow-hidden"
          style={hasCover ? undefined : { background: animeGradient(anime.title) }}
        >
          {hasCover && (
            <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white truncate">{anime.title}</p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: 'oklch(38% 0.01 280)' }}>
            {anime.title_original}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {anime.score > 0 && (
            <p className="text-[11px] font-medium" style={{ color: 'oklch(65% 0.2 35)' }}>
              {anime.score.toFixed(1)}
            </p>
          )}
          <p className="text-[10px]" style={{ color: 'oklch(32% 0.01 280)' }}>
            {anime.episode_count > 0 ? `${anime.episode_count} 集` : ''}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
