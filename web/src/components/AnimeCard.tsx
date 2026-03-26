import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';

export function AnimeCard({ anime, index = 0 }: { anime: AnimeSummary; index?: number }) {
  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ scale: 1.04 }}
    >
      <Link
        to={`/anime/${anime.bangumi_id}` as string}
        className="block rounded overflow-hidden group"
      >
        <div
          className="relative aspect-[3/4] overflow-hidden"
          style={hasCover ? undefined : { background: animeGradient(anime.title) }}
        >
          {hasCover && (
            <img
              src={anime.cover_image}
              alt={anime.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          <div
            className="absolute bottom-0 left-0 right-0 p-2"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}
          >
            {anime.score > 0 && (
              <span className="text-[10px] font-bold" style={{ color: 'oklch(65% 0.2 35)' }}>
                {anime.score.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <div className="p-2" style={{ backgroundColor: 'oklch(10% 0.01 280)' }}>
          <p className="text-[12px] font-semibold text-white truncate leading-snug">
            {anime.title}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'oklch(38% 0.01 280)' }}>
            {anime.episode_count > 0 ? `${anime.episode_count} 集` : ''}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
