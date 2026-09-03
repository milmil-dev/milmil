import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { discoverApi } from '../lib/api/discover';
import { MEMORY_OFFSETS, type MemoryOffset, seasonName, seasonYearsAgo } from '../lib/season';
import { cn } from '../lib/utils';
import { AnimeCard } from './AnimeCard';
import { MediaRail } from './MediaRail';
import { Skeleton } from './Skeleton';

const MEMORY_EASE = [0.22, 1, 0.36, 1] as const; // ease-out-quint
const DEFAULT_MEMORY_OFFSET: MemoryOffset = 10;

interface MemoriesSectionProps {
  /** Delay the entrance so Home/Discover can stagger rails. */
  delay?: number;
  testId?: string;
}

export function MemoriesSection({
  delay = 0.24,
  testId = 'discover-memories',
}: MemoriesSectionProps) {
  const { i18n } = useLingui();
  const prefersReducedMotion = useReducedMotion();
  const [selectedYears, setSelectedYears] = useState<MemoryOffset>(DEFAULT_MEMORY_OFFSET);
  const target = seasonYearsAgo(selectedYears);

  const { data = [], isLoading } = useQuery({
    queryKey: ['discover', 'memories', target.season, target.year],
    queryFn: () =>
      discoverApi.browse({
        season: target.season,
        year: target.year,
        sort: 'POPULARITY_DESC',
      }),
    staleTime: 10 * 60 * 1000,
  });

  if (!isLoading && data.length === 0) return null;

  const seasonLabel = seasonName(target.season, i18n);

  return (
    <motion.section
      data-testid={testId}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <h2 className="text-lg lg:text-xl font-semibold text-ink tracking-tight">
          {i18n._(msg`discover.memories`)}
        </h2>
        <Link
          to="/search"
          search={
            {
              season: target.season,
              year: String(target.year),
              sort: 'POPULARITY_DESC',
            } as Record<string, string>
          }
          className="text-[12px] font-medium transition-colors hover:text-ink text-ink/40 cursor-pointer"
        >
          {i18n._(msg`home.viewAll`)}
        </Link>
      </div>

      <p className="text-[12px] text-ink/40 mb-3">
        <span className="tabular-nums">
          {seasonLabel} {target.year}
        </span>
        <span className="text-ink/25"> · </span>
        {i18n._(msg`discover.memories.watching`)}
      </p>

      <div
        role="tablist"
        aria-label={i18n._(msg`discover.memories`)}
        className="flex gap-1.5 overflow-x-auto pb-1 mb-4"
        style={{ scrollbarWidth: 'none' }}
      >
        {MEMORY_OFFSETS.map((years) => {
          const era = seasonYearsAgo(years);
          const active = years === selectedYears;
          const yearsAgoLabel = i18n._(msg`discover.memories.yearsAgo ${years}`);
          return (
            <button
              key={years}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={yearsAgoLabel}
              data-testid={`memories-era-${years}`}
              onClick={() => setSelectedYears(years)}
              className={cn(
                'shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md cursor-pointer whitespace-nowrap',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mm-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-bg)]',
                active
                  ? 'bg-mm-accent/12 text-mm-accent'
                  : 'bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.08] hover:text-ink/70'
              )}
            >
              <span className="text-[12px] font-semibold leading-none">{yearsAgoLabel}</span>
              <span className="text-[10px] font-medium leading-none tabular-nums opacity-80">
                {era.year}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
            <div key={i} className="shrink-0 w-[150px]">
              <Skeleton className="aspect-[6/8] rounded-md" />
              <Skeleton className="h-3 w-[80%] mt-2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data.length > 0 && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${target.season}-${target.year}`}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: MEMORY_EASE }}
          >
            <MediaRail>
              {data.slice(0, 15).map((anime) => (
                <div key={anime.bangumi_id} className="shrink-0 w-[150px]">
                  <AnimeCard anime={anime} />
                </div>
              ))}
            </MediaRail>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.section>
  );
}
