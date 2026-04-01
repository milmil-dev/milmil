import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { HeroBanner } from '../components/HeroBanner';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { cn } from '../lib/utils';
import { useBgStore } from '../store/bg-store';

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Thriller',
  'Horror',
  'Sports',
  'Music',
];

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
  /** Override title with a plain string (for dynamic genre name) */
  titleOverride?: string;
  queryKey: readonly unknown[];
  queryFn: () => Promise<AnimeSummary[]>;
  viewAllTo?: string;
  viewAllSearch?: Record<string, string>;
  /** Card width class — default w-[150px] */
  cardWidth?: string;
}

function useRandomGenre(): string {
  return useMemo(() => GENRES[Math.floor(Math.random() * GENRES.length)] ?? 'Action', []);
}

function useSections(): SectionDef[] {
  const current = getCurrentSeason();
  const prev = getPreviousSeason();
  const randomGenre = useRandomGenre();

  return [
    {
      titleKey: msg`discover.trendingNow`,
      queryKey: discoverKeys.trending(1),
      queryFn: () => discoverApi.trending(1),
      viewAllTo: '/search',
      viewAllSearch: { sort: 'TRENDING_DESC' },
      cardWidth: 'w-[170px]',
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
      viewAllTo: '/search',
      viewAllSearch: { season: current.season, year: String(current.year), sort: 'SCORE_DESC' },
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
      viewAllTo: '/search',
      viewAllSearch: { season: prev.season, year: String(prev.year), sort: 'SCORE_DESC' },
    },
    {
      titleKey: msg`discover.airedRecently`,
      queryKey: ['discover', 'airedRecently'],
      queryFn: () =>
        discoverApi.browse({
          sort: 'START_DATE_DESC',
          year: current.year,
        }),
      viewAllTo: '/search',
      viewAllSearch: { sort: 'START_DATE_DESC', year: String(current.year) },
    },
    {
      titleKey: msg`discover.trendingMovies`,
      queryKey: ['discover', 'trendingMovies'],
      queryFn: () => discoverApi.browse({ sort: 'TRENDING_DESC', format: 'MOVIE' }),
      viewAllTo: '/search',
      viewAllSearch: { sort: 'TRENDING_DESC' },
      cardWidth: 'w-[170px]',
    },
    {
      titleKey: msg`discover.genreSpotlight`,
      titleOverride: randomGenre,
      queryKey: ['discover', 'genreSpotlight', randomGenre],
      queryFn: () => discoverApi.browse({ genre: randomGenre, sort: 'SCORE_DESC' }),
      viewAllTo: '/search',
      viewAllSearch: { genre: randomGenre },
    },
    {
      titleKey: msg`discover.comingSoon`,
      queryKey: ['discover', 'comingSoon'],
      queryFn: () =>
        discoverApi.browse({
          status: 'NOT_YET_RELEASED',
          sort: 'POPULARITY_DESC',
        }),
      viewAllTo: '/search',
      viewAllSearch: { sort: 'POPULARITY_DESC' },
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

          {/* Hot Tags */}
          <HotTagsSection />
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

  const cardWidth = def.cardWidth ?? 'w-[150px]';

  // Don't render empty sections after loading
  if (!isLoading && data.length === 0) return null;

  // Build the display title
  const title = def.titleOverride
    ? `${i18n._(def.titleKey)} · ${translateGenre(def.titleOverride, i18n.locale)}`
    : i18n._(def.titleKey);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
    >
      {/* Section header */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight">{title}</h2>
          {!isLoading && data.length > 0 && (
            <span className="text-[11px] text-white/20 tabular-nums">{data.length}</span>
          )}
        </div>
        {def.viewAllTo && (
          <Link
            to={def.viewAllTo}
            search={def.viewAllSearch as any}
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
            <div key={i} className={cn('shrink-0', cardWidth)}>
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
            <div key={anime.bangumi_id} className={cn('shrink-0', cardWidth)}>
              <AnimeCard anime={anime} />
            </div>
          ))}
        </MediaRail>
      )}
    </motion.section>
  );
}

/* ── Hot Tags ─────────────────────────────────────────────── */

function HotTagsSection() {
  const { i18n } = useLingui();
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['discover', 'hotTags'],
    queryFn: () => discoverApi.hotTags(),
    staleTime: 30 * 60 * 1000,
  });

  if (!isLoading && tags.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.35 }}
    >
      <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight mb-4">
        {i18n._(msg`discover.hotTags`)}
      </h2>

      {isLoading && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={`tag-skel-${i}`}
              className="h-7 rounded-md"
              style={{ width: 60 + Math.random() * 40 }}
            />
          ))}
        </div>
      )}

      {!isLoading && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 30).map((tag) => (
            <Link
              key={tag.id}
              to="/search"
              search={{ tag: tag.name } as any}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-colors cursor-pointer"
            >
              {tag.name}
              <span className="text-[10px] text-white/20 tabular-nums">{tag.count}</span>
            </Link>
          ))}
        </div>
      )}
    </motion.section>
  );
}
