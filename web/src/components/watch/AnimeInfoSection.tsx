import type { AnimeDetail } from '@/lib/api/discover';
import { stripTags } from '../../lib/sanitize';

interface AnimeInfoSectionProps {
  anime: AnimeDetail;
}

export function AnimeInfoSection({ anime }: AnimeInfoSectionProps) {
  return (
    <div className="mt-4 p-3 bg-ink/[0.03] rounded-lg">
      <div className="flex gap-3">
        {anime.cover_image && (
          <img src={anime.cover_image} alt="" className="w-14 h-20 rounded object-cover shrink-0" />
        )}
        <div className="min-w-0">
          {anime.synopsis && (
            <p className="text-xs text-mm-text-secondary line-clamp-4 leading-relaxed">
              {stripTags(anime.synopsis)}
            </p>
          )}
          {anime.genres && anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-ink/[0.06] text-mm-text-tertiary"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
