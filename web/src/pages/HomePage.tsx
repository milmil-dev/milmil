import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { type CatalogSectionDef, CatalogSection } from '../components/CatalogSection';
import { ContinueWatchingCard } from '../components/ContinueWatchingCard';
import { HeroBanner } from '../components/HeroBanner';
import { HomePageSkeleton } from '../components/HomePageSkeleton';
import { HotTagsSection } from '../components/HotTagsSection';
import { MediaRail } from '../components/MediaRail';
import { MemoriesSection } from '../components/MemoriesSection';
import { PageTransition } from '../components/PageTransition';
import { useDocumentTitle } from '../hooks/use-document-title';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { libraryApi, libraryKeys } from '../lib/api/library';
import { progressApi, progressKeys } from '../lib/api/progress';
import { SPOTLIGHT_GENRES } from '../lib/genres';
import { getCurrentSeason, getPreviousSeason } from '../lib/season';
import { todayWeekdayEN, weekdayFullName } from '../lib/weekday';
import { useBgStore } from '../store/bg-store';

function useRandomGenre(): string {
  return useMemo(
    () => SPOTLIGHT_GENRES[Math.floor(Math.random() * SPOTLIGHT_GENRES.length)] ?? 'Action',
    []
  );
}

/** Catalog rails formerly on Discover — personal rails sit above these. */
function useCatalogSections(): CatalogSectionDef[] {
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
      testId: 'home-trending',
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
      viewAllSearch: {
        season: current.season,
        year: String(current.year),
        sort: 'SCORE_DESC',
      },
      testId: 'home-top-season',
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
      viewAllSearch: {
        season: prev.season,
        year: String(prev.year),
        sort: 'SCORE_DESC',
      },
      testId: 'home-last-season',
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
      testId: 'home-aired-recently',
    },
    {
      titleKey: msg`discover.trendingMovies`,
      queryKey: ['discover', 'trendingMovies'],
      queryFn: () => discoverApi.browse({ sort: 'TRENDING_DESC', format: 'MOVIE' }),
      viewAllTo: '/search',
      viewAllSearch: { sort: 'TRENDING_DESC' },
      cardWidth: 'w-[170px]',
      testId: 'home-movies',
    },
    {
      titleKey: msg`discover.genreSpotlight`,
      titleOverride: randomGenre,
      queryKey: ['discover', 'genreSpotlight', randomGenre],
      queryFn: () => discoverApi.browse({ genre: randomGenre, sort: 'SCORE_DESC' }),
      viewAllTo: '/search',
      viewAllSearch: { genre: randomGenre },
      testId: 'home-genre-spotlight',
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
      testId: 'home-coming-soon',
    },
  ];
}

export function HomePage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.home`));
  const catalog = useCatalogSections();

  const { data: calendar } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });
  const { data: trending = [] } = useQuery({
    queryKey: discoverKeys.trending(1),
    queryFn: () => discoverApi.trending(1),
  });
  useQuery({
    queryKey: libraryKeys.list(),
    queryFn: libraryApi.list,
  });
  const { data: recentProgress = [] } = useQuery({
    queryKey: progressKeys.recent(),
    queryFn: progressApi.recent,
  });

  const continueWatching = recentProgress.filter((p) => p.completed !== 1).slice(0, 6);

  const todayKey = todayWeekdayEN();
  const todayDay = calendar?.find((d) => d.weekday_en === todayKey);
  const todayAnime = todayDay?.items ?? [];
  const todayWeekday = todayDay
    ? weekdayFullName(todayDay.weekday_en, i18n)
    : weekdayFullName(todayKey, i18n);

  const isLoading = !calendar && !trending.length;
  const heroItems = trending.slice(0, 7);

  const setImage = useBgStore((s) => s.setImage);
  useEffect(() => () => setImage(null), [setImage]);
  const handleHeroChange = (item: AnimeSummary) => {
    const img = item.banner_image || item.cover_image;
    if (img?.startsWith('http')) setImage(img);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <HomePageSkeleton />
      </PageTransition>
    );
  }

  // Personal → early catalog → memories → the rest (mirrors old Discover order).
  const earlyCatalog = catalog.slice(0, 3);
  const lateCatalog = catalog.slice(3);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {heroItems.length > 0 && (
          <HeroBanner
            items={heroItems}
            onActiveChange={handleHeroChange}
            watchHistory={recentProgress}
          />
        )}

        <div className="px-4 md:px-6 mt-4">
          <HotTagsSection />
        </div>

        <div className="px-4 md:px-6 pt-6 pb-16 space-y-8">
          {continueWatching.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <PersonalHeader title={i18n._(msg`home.continueWatching`)} to="/history" />
              <MediaRail>
                {continueWatching.map((item) => {
                  const progress =
                    item.duration_seconds && item.duration_seconds > 0
                      ? item.position_seconds / item.duration_seconds
                      : 0;
                  const title =
                    (i18n.locale.startsWith('zh')
                      ? item.anime_title_zh || item.anime_title
                      : item.anime_title) || 'Unknown';
                  const epNum = Number.isInteger(item.episode_number)
                    ? item.episode_number
                    : item.episode_number.toFixed(1);
                  return (
                    <div key={item.id} className="shrink-0 w-[220px] md:w-[260px]">
                      <ContinueWatchingCard
                        title={title}
                        episodeLabel={`EP ${epNum} · ${Math.round(progress * 100)}%`}
                        progress={progress}
                        coverImage={item.anime_cover_image ?? ''}
                        href={`/watch/${item.anime_bangumi_id ?? item.anime_id}?ep=${item.episode_number}`}
                      />
                    </div>
                  );
                })}
              </MediaRail>
            </motion.section>
          )}

          {todayAnime.length > 0 && (
            <motion.section
              data-testid="home-today"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
            >
              <PersonalHeader
                title={i18n._(msg`home.todaySchedule`)}
                count={todayWeekday}
                to="/schedule"
                moreLabel={i18n._(msg`nav.schedule`)}
                chevron
              />
              <MediaRail>
                {todayAnime.map((anime) => (
                  <div key={anime.bangumi_id} className="shrink-0 w-[150px]">
                    <AnimeCard
                      anime={anime}
                      badge={anime.next_episode ? `EP ${anime.next_episode}` : undefined}
                    />
                  </div>
                ))}
              </MediaRail>
            </motion.section>
          )}

          {earlyCatalog.map((section, i) => (
            <CatalogSection key={section.queryKey.join('-')} def={section} index={i} />
          ))}

          <MemoriesSection delay={0.28} testId="home-memories" />

          {lateCatalog.map((section, i) => (
            <CatalogSection
              key={section.queryKey.join('-')}
              def={section}
              index={i + earlyCatalog.length + 1}
            />
          ))}
        </div>
      </div>
    </PageTransition>
  );
}

function PersonalHeader({
  title,
  count,
  to,
  moreLabel,
  chevron = false,
}: {
  title: string;
  count?: string;
  to: string;
  moreLabel?: string;
  chevron?: boolean;
}) {
  const { i18n } = useLingui();
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-lg lg:text-xl font-bold text-ink tracking-tight">{title}</h2>
        {count && <span className="text-[13px] font-medium text-ink/40 shrink-0">{count}</span>}
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-0.5 text-[12px] font-medium transition-colors hover:text-ink text-ink/40 cursor-pointer shrink-0"
      >
        {moreLabel ?? i18n._(msg`home.viewAll`)}
        {chevron && (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={10}
            strokeWidth={2.5}
            className="opacity-80"
          />
        )}
      </Link>
    </div>
  );
}
