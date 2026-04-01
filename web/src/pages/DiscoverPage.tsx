import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { HeroBanner } from '../components/HeroBanner';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { useBgStore } from '../store/bg-store';

/* ── Season helpers ───────────────────────────────────────── */

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;

function getCurrentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 3) return { season: 'WINTER', year };
  if (month <= 6) return { season: 'SPRING', year };
  if (month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

function getPreviousSeason(): { season: string; year: number } {
  const { season, year } = getCurrentSeason();
  const idx = SEASONS.indexOf(season as (typeof SEASONS)[number]);
  if (idx <= 0) return { season: 'FALL', year: year - 1 };
  return { season: SEASONS[idx - 1] ?? 'FALL', year };
}

/* ── Section config ───────────────────────────────────────── */

interface SectionDef {
  titleKey: ReturnType<typeof msg>;
  queryKey: readonly unknown[];
  queryFn: () => Promise<AnimeSummary[]>;
  viewAllTo?: string;
}

function useSections(): SectionDef[] {
  const current = getCurrentSeason();
  const prev = getPreviousSeason();

  return [
    {
      titleKey: msg`discover.trendingNow`,
      queryKey: discoverKeys.trending(1),
      queryFn: () => discoverApi.trending(1),
      viewAllTo: '/search',
    },
    {
      titleKey: msg`discover.topOfSeason`,
      queryKey: ['discover', 'topSeason', current.season, current.year],
      queryFn: () =>
        discoverApi.browse({
          season: current.season,
          year: current.year,
          sort: 'SCORE_DESC',
        }),
    },
    {
      titleKey: msg`discover.bestLastSeason`,
      queryKey: ['discover', 'bestLastSeason', prev.season, prev.year],
      queryFn: () =>
        discoverApi.browse({
          season: prev.season,
          year: prev.year,
          sort: 'SCORE_DESC',
        }),
    },
    {
      titleKey: msg`discover.airedRecently`,
      queryKey: ['discover', 'airedRecently'],
      queryFn: () =>
        discoverApi.browse({
          sort: 'START_DATE_DESC',
          year: current.year,
        }),
    },
    {
      titleKey: msg`discover.trendingMovies`,
      queryKey: ['discover', 'trendingMovies'],
      queryFn: () => discoverApi.browse({ sort: 'TRENDING_DESC', format: 'MOVIE' }),
    },
    {
      titleKey: msg`discover.comingSoon`,
      queryKey: ['discover', 'comingSoon'],
      queryFn: () =>
        discoverApi.browse({
          status: 'NOT_YET_RELEASED',
          sort: 'POPULARITY_DESC',
        }),
    },
  ];
}

/* ── Main page ────────────────────────────────────────────── */

export function DiscoverPage() {
  const sections = useSections();

  // Fetch current season anime for hero banner
  const current = getCurrentSeason();
  const { data: seasonAnime = [] } = useQuery({
    queryKey: ['discover', 'heroSeason', current.season, current.year],
    queryFn: () =>
      discoverApi.browse({
        season: current.season,
        year: current.year,
        sort: 'POPULARITY_DESC',
      }),
    staleTime: 10 * 60 * 1000,
  });

  const heroItems = seasonAnime.slice(0, 7);

  // Atmospheric background from hero carousel
  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => () => setImage(null), [setImage]);

  const handleHeroChange = (item: AnimeSummary) => {
    const img = item.banner_image || item.cover_image;
    if (img?.startsWith('http')) setImage(img);
  };

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero banner carousel */}
        {heroItems.length > 0 && <HeroBanner items={heroItems} onActiveChange={handleHeroChange} />}

        {/* Sections */}
        <div className="px-4 md:px-6 pt-6 pb-16 space-y-8">
          {sections.map((section, i) => (
            <DiscoverSection key={section.queryKey.join('-')} def={section} index={i} />
          ))}
        </div>
      </div>
    </PageTransition>
  );
}

/* ── Individual section ───────────────────────────────────── */

function DiscoverSection({ def, index }: { def: SectionDef; index: number }) {
  const { i18n } = useLingui();
  const { data = [], isLoading } = useQuery({
    queryKey: def.queryKey,
    queryFn: def.queryFn,
    staleTime: 10 * 60 * 1000,
  });

  // Don't render empty sections after loading
  if (!isLoading && data.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
    >
      {/* Section header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight">
          {i18n._(def.titleKey)}
        </h2>
        {def.viewAllTo && (
          <Link
            to={def.viewAllTo}
            className="text-[12px] font-medium transition-colors hover:text-white text-white/40 cursor-pointer"
          >
            {i18n._(msg`home.viewAll`)}
          </Link>
        )}
      </div>

      {/* Loading skeleton */}
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

      {/* Cards rail */}
      {!isLoading && data.length > 0 && (
        <MediaRail>
          {data.slice(0, 15).map((anime) => (
            <div key={anime.bangumi_id} className="shrink-0 w-[150px]">
              <AnimeCard anime={anime} />
            </div>
          ))}
        </MediaRail>
      )}
    </motion.section>
  );
}
