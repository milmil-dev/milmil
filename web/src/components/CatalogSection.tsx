import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { AnimeCard } from './AnimeCard';
import { MediaRail } from './MediaRail';
import { Skeleton } from './Skeleton';
import { type AnimeSummary } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { cn } from '../lib/utils';

export interface CatalogSectionDef {
  titleKey: ReturnType<typeof msg>;
  /** Override title with a plain string (for dynamic genre name) */
  titleOverride?: string;
  queryKey: readonly unknown[];
  queryFn: () => Promise<AnimeSummary[]>;
  viewAllTo?: string;
  viewAllSearch?: Record<string, string>;
  /** Card width class — default w-[150px] */
  cardWidth?: string;
  testId?: string;
}

/** One horizontal poster rail used by the merged Home catalog. */
export function CatalogSection({ def, index }: { def: CatalogSectionDef; index: number }) {
  const { i18n } = useLingui();
  const { data = [], isLoading } = useQuery({
    queryKey: def.queryKey,
    queryFn: def.queryFn,
    staleTime: 10 * 60 * 1000,
  });

  const cardWidth = def.cardWidth ?? 'w-[150px]';

  if (!isLoading && data.length === 0) return null;

  const title = def.titleOverride
    ? `${i18n._(def.titleKey)} · ${translateGenre(def.titleOverride, i18n.locale)}`
    : i18n._(def.titleKey);

  return (
    <motion.section
      data-testid={def.testId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.5), duration: 0.35 }}
    >
      <div className="flex items-baseline justify-between mb-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg lg:text-xl font-bold text-ink tracking-tight">{title}</h2>
          {!isLoading && data.length > 0 && (
            <span className="text-[11px] text-ink/20 tabular-nums">{data.length}</span>
          )}
        </div>
        {def.viewAllTo && (
          <Link
            to={def.viewAllTo}
            search={def.viewAllSearch as never}
            className="text-[12px] font-medium transition-colors hover:text-ink text-ink/40 cursor-pointer"
          >
            {i18n._(msg`home.viewAll`)}
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={i} className={cn('shrink-0', cardWidth)}>
              <Skeleton className="aspect-[6/8] rounded-md" />
              <Skeleton className="h-3 w-[80%] mt-2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data.length > 0 && (
        <MediaRail>
          {data.slice(0, 15).map((anime) => (
            <div key={anime.bangumi_id} className={cn('shrink-0', cardWidth)}>
              <AnimeCard anime={anime} />
            </div>
          ))}
        </MediaRail>
      )}
    </motion.section>
  );
}
