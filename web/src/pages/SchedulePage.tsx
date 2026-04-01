import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { format, getDay } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Spinner } from '../components/ui/spinner';
import {
  type AnimeSummary,
  type BrowseParams,
  type CalendarDay,
  discoverApi,
  discoverKeys,
} from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

/* ── Season / year helpers ────────────────────────────────── */

type SeasonKey = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
const SEASONS: SeasonKey[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

function getCurrentSeason(): SeasonKey {
  const month = new Date().getMonth() + 1;
  if (month <= 3) return 'WINTER';
  if (month <= 6) return 'SPRING';
  if (month <= 9) return 'SUMMER';
  return 'FALL';
}

function getSeasonLabel(season: SeasonKey, i18n: ReturnType<typeof useLingui>['i18n']): string {
  switch (season) {
    case 'WINTER':
      return i18n._(msg`schedule.season.winter`);
    case 'SPRING':
      return i18n._(msg`schedule.season.spring`);
    case 'SUMMER':
      return i18n._(msg`schedule.season.summer`);
    case 'FALL':
      return i18n._(msg`schedule.season.fall`);
  }
}

/* ── Bangumi weekday helpers (for calendar view) ──────────── */

const BANGUMI_WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const BANGUMI_WEEKDAYS_JP = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

function todayWeekdayCN(): string {
  const jsDay = getDay(new Date()); // 0=Sun
  return BANGUMI_WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1] as string;
}

function getWeekdayJapanese(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday);
  if (idx === -1) return '';
  return BANGUMI_WEEKDAYS_JP[idx] ?? '';
}


function getDateForWeekday(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday);
  if (idx === -1) return '';
  const now = new Date();
  const jsDay = getDay(now);
  const currentIdx = jsDay === 0 ? 6 : jsDay - 1;
  const diff = idx - currentIdx;
  const target = new Date(now);
  target.setDate(target.getDate() + diff);
  return format(target, 'M月d日');
}

/* ── Anime item with hover card ───────────────────────────── */

function ScheduleAnimeItem({
  anime,
  index,
  locale,
  variant = 'card',
}: {
  anime: AnimeSummary;
  index: number;
  locale: string;
  variant?: 'row' | 'card';
}) {
  const hasCover = anime.cover_image?.startsWith('http');
  const [showCard, setShowCard] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [cardSide, setCardSide] = useState<'right' | 'left'>('right');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const { data: detail } = useQuery({
    queryKey: discoverKeys.detail(anime.bangumi_id),
    queryFn: () => discoverApi.detail(anime.bangumi_id),
    enabled: hovered && anime.bangumi_id > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleEnter = useCallback(() => {
    setHovered(true);
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      setCardSide(spaceRight >= 530 ? 'right' : 'left');
    }
    timerRef.current = setTimeout(() => setShowCard(true), 400);
  }, []);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowCard(false);
    setHovered(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <motion.div
      ref={itemRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {variant === 'card' ? (
        <AnimeCard anime={anime}>
          {anime.next_episode && anime.next_episode > 0 && (
            <span
              className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-mm-accent tabular-nums backdrop-blur-md"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              EP {anime.next_episode}
            </span>
          )}
        </AnimeCard>
      ) : (
        <Link
          to={`/anime/${anime.bangumi_id}` as string}
          className="group flex items-center gap-3.5 py-3 px-2.5 -mx-2.5 rounded-lg transition-colors hover:bg-white/[0.04]"
        >
          <div
            className="relative rounded overflow-hidden shrink-0 w-[80px] h-[112px]"
            style={hasCover ? undefined : { background: animeGradient(anime.title) }}
          >
            {hasCover && (
              <img
                src={anime.cover_image}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            )}
            {anime.next_episode && anime.next_episode > 0 && (
              <span
                className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-mm-accent tabular-nums backdrop-blur-md"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                EP {anime.next_episode}
              </span>
            )}
            {anime.score > 0 && (
              <span
                className="absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white tabular-nums backdrop-blur-md"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                ♡ {anime.score.toFixed(1)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="leading-snug text-mm-text-primary font-medium group-hover:text-white transition-colors text-[13px] truncate">
              {anime.title}
            </p>
            {anime.title_original && anime.title_original !== anime.title && (
              <p className="text-[11px] text-mm-text-muted truncate mt-0.5">
                {anime.title_original}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {anime.score > 0 && (
                <span className="text-[11px] font-semibold text-mm-accent tabular-nums">
                  {anime.score.toFixed(1)}
                </span>
              )}
              {anime.episode_count > 0 && (
                <span className="text-[10px] text-mm-text-muted">{anime.episode_count} ep</span>
              )}
            </div>
          </div>
          <span className="text-mm-text-muted text-[11px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            →
          </span>
        </Link>
      )}

      {/* Hover card */}
      {showCard &&
        (() => {
          const info = detail || anime;
          const bannerSrc = detail?.banner_image || anime.banner_image || anime.cover_image;
          const hasBanner = !!(detail?.banner_image || anime.banner_image);
          const tags = detail?.tags || [];
          const genres = anime.genres || [];
          const displayTags = tags.length > 0 ? tags : genres;
          const synopsis = detail?.synopsis || anime.description;

          return (
            <div
              className={cn(
                'absolute top-1/2 -translate-y-1/2 z-50 w-[506px] pointer-events-none hidden lg:block',
                cardSide === 'right' ? 'left-full ml-4' : 'right-full mr-4'
              )}
            >
              <motion.div
                initial={{
                  opacity: 0,
                  x: cardSide === 'right' ? -10 : 10,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative rounded-lg overflow-hidden border border-white/[0.08] shadow-2xl"
              >
                <div className="absolute inset-0">
                  {bannerSrc?.startsWith('http') ? (
                    <img
                      src={bannerSrc}
                      alt=""
                      className="w-full h-full object-cover"
                      style={
                        !hasBanner
                          ? {
                              filter: 'blur(20px) saturate(1.2) brightness(0.5)',
                              transform: 'scale(1.4)',
                            }
                          : { filter: 'blur(2px) brightness(0.45)' }
                      }
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: animeGradient(anime.title) }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40" />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.8) 100%)',
                    }}
                  />
                </div>
                <div className="relative z-[1] flex items-start gap-4 p-4">
                  <div
                    className="shrink-0 w-[150px] h-[210px] rounded overflow-hidden shadow-lg ring-1 ring-white/10"
                    style={hasCover ? undefined : { background: animeGradient(anime.title) }}
                  >
                    {hasCover && (
                      <img src={anime.cover_image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5 space-y-1.5">
                    <p className="text-[15px] font-bold text-white leading-snug line-clamp-2">
                      {info.title}
                    </p>
                    {info.title_original && info.title_original !== info.title && (
                      <p className="text-[11px] text-white/40 truncate">{info.title_original}</p>
                    )}
                    {displayTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {displayTags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-mm-accent/10 text-mm-accent/80"
                          >
                            {translateGenre(t, locale)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {info.score > 0 && (
                        <span className="text-[13px] font-bold text-mm-accent">
                          ♡ {info.score.toFixed(1)}
                        </span>
                      )}
                      {info.episode_count > 0 && (
                        <span className="text-[11px] text-white/50">{info.episode_count} ep</span>
                      )}
                      {info.air_date && (
                        <span className="text-[11px] text-white/40">
                          {new Date(info.air_date).getFullYear()}
                        </span>
                      )}
                      {detail?.rating && detail.rating.total > 0 && (
                        <span className="text-[11px] text-white/40">
                          {detail.rating.total} ratings
                        </span>
                      )}
                    </div>
                    {synopsis && (
                      <p className="text-[11px] text-white/50 leading-relaxed line-clamp-4">
                        {synopsis.replace(/<[^>]+>/g, '')}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
    </motion.div>
  );
}

/* ── Skeleton loaders ─────────────────────────────────────── */

function CalendarSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SeasonGridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/* ── Calendar view (weekly schedule) ──────────────────────── */

function CalendarView({ locale }: { locale: string }) {
  const { i18n } = useLingui();
  const tabsRef = useRef<HTMLDivElement>(null);
  const {
    data: calendar,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });

  const today = todayWeekdayCN();
  const [activeDay, setActiveDay] = useState<string | 'all'>(today);

  const sortedCalendar = useMemo(() => {
    if (!calendar) return [];
    const todayIdx = BANGUMI_WEEKDAYS.indexOf(today);
    const reordered = [...BANGUMI_WEEKDAYS.slice(todayIdx), ...BANGUMI_WEEKDAYS.slice(0, todayIdx)];
    return reordered
      .map((wd) => calendar.find((d) => d.weekday === wd))
      .filter((d): d is CalendarDay => d !== undefined);
  }, [calendar, today]);

  useEffect(() => {
    if (!tabsRef.current) return;
    const activeBtn = tabsRef.current.querySelector('[data-active="true"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [sortedCalendar.length]);

  if (isLoading) return <CalendarSkeleton />;

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-3 text-mm-text-secondary">
          {i18n._(msg`schedule.loadFailed`)}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-mm-accent cursor-pointer"
        >
          {i18n._(msg`common.retry`)}
        </button>
      </div>
    );
  }

  if (sortedCalendar.length === 0) return null;

  return (
    <div>
      {/* Weekday tabs */}
      <div
        ref={tabsRef}
        className="flex items-end gap-0 overflow-x-auto scrollbar-none border-b border-white/[0.06] mb-5"
      >
        <button
          type="button"
          data-active={activeDay === 'all'}
          onClick={() => setActiveDay('all')}
          className={cn(
            'relative shrink-0 px-4 pb-2.5 pt-2 text-[13px] font-semibold cursor-pointer transition-colors duration-200',
            activeDay === 'all'
              ? 'text-mm-accent'
              : 'text-mm-text-tertiary hover:text-mm-text-secondary'
          )}
        >
          {i18n._(msg`schedule.all`)}
          {activeDay === 'all' && (
            <motion.div
              layoutId="weekday-underline"
              className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
        </button>
        <div className="w-px h-4 bg-white/[0.06] mx-0.5 mb-2 shrink-0" />
        {sortedCalendar.map((day) => {
          const isToday = day.weekday === today;
          const isActive = day.weekday === activeDay;
          return (
            <button
              key={day.weekday}
              type="button"
              data-active={isActive}
              onClick={() => setActiveDay(day.weekday)}
              className={cn(
                'relative shrink-0 flex items-center gap-1.5 px-3 pb-2.5 pt-2 cursor-pointer transition-colors duration-200',
                isActive ? 'text-mm-accent' : 'text-white/90 hover:text-white'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="weekday-underline"
                  className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span
                className={cn(
                  'text-[13px] font-bold whitespace-nowrap',
                  isActive ? 'text-mm-accent' : 'text-white/80'
                )}
              >
                {day.weekday.replace(/^星期/, '週')} ({getWeekdayJapanese(day.weekday).slice(0, 1)})
                <span className="ml-1 text-[10px] font-medium text-white/40">
                  {getDateForWeekday(day.weekday)}
                </span>
              </span>
              {isToday && !isActive && (
                <div className="w-1 h-1 rounded-full bg-mm-accent shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeDay !== 'all' ? (
          (() => {
            const activeCalendar = sortedCalendar.find((d) => d.weekday === activeDay);
            if (!activeCalendar) return null;
            return (
              <motion.div
                key={activeDay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <h2 className="text-lg font-bold text-white">
                    {getWeekdayJapanese(activeCalendar.weekday)}
                  </h2>
                  <span className="text-[12px] font-medium text-mm-text-muted tabular-nums">
                    {activeCalendar.items.length} {i18n._(msg`schedule.totalShows`)}
                  </span>
                  {activeCalendar.weekday === today && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-mm-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-mm-accent animate-pulse" />
                      {i18n._(msg`schedule.today`)}
                    </span>
                  )}
                </div>
                {activeCalendar.items.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
                    {activeCalendar.items.map((anime, i) => (
                      <ScheduleAnimeItem
                        key={anime.bangumi_id}
                        anime={anime}
                        index={i}
                        locale={locale}
                        variant="card"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-[13px] text-mm-text-muted">
                      {i18n._(msg`schedule.noShows`)}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })()
        ) : (
          <motion.div
            key="all"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-8"
          >
            {sortedCalendar.map((day) => (
              <div key={day.weekday} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <h2 className="text-lg font-bold text-white">
                    {getWeekdayJapanese(day.weekday)}
                  </h2>
                  <span className="text-[12px] font-medium text-mm-text-muted tabular-nums">
                    {day.items.length} {i18n._(msg`schedule.totalShows`)}
                  </span>
                  {day.weekday === today && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-mm-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-mm-accent animate-pulse" />
                      {i18n._(msg`schedule.today`)}
                    </span>
                  )}
                </div>
                {day.items.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
                    {day.items.map((anime, i) => (
                      <ScheduleAnimeItem
                        key={anime.bangumi_id}
                        anime={anime}
                        index={i}
                        locale={locale}
                        variant="card"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-mm-text-muted py-4">—</p>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Infinite scroll sentinel ─────────────────────────────── */

function LoadMoreSentinel({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loadingRef.current) {
          onVisibleRef.current();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center py-8">
      {loading && <Spinner size={24} className="text-white/30" />}
    </div>
  );
}

/* ── Season browse view (AniList grid) ────────────────────── */

function SeasonBrowseView({
  year,
  season,
  locale,
}: {
  year: number;
  season: SeasonKey;
  locale: string;
}) {
  const { i18n } = useLingui();
  const [allItems, setAllItems] = useState<AnimeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const prevKeyRef = useRef(`${year}-${season}`);

  // Reset page when season/year changes
  const key = `${year}-${season}`;
  if (prevKeyRef.current !== key) {
    prevKeyRef.current = key;
    setAllItems([]);
    setPage(1);
    setHasMore(true);
  }

  const params: BrowseParams = useMemo(
    () => ({ year, season, sort: 'POPULARITY_DESC', page }),
    [year, season, page]
  );

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: discoverKeys.browseParams(params),
    queryFn: () => discoverApi.browse(params),
    staleTime: 10 * 60 * 1000,
  });

  // Accumulate results as pages load
  useEffect(() => {
    if (!data) return;
    if (page === 1) {
      setAllItems(data);
    } else {
      setAllItems((prev) => [...prev, ...data]);
    }
    setHasMore(data.length >= 50);
  }, [data, page]);

  if (isLoading && allItems.length === 0) return <SeasonGridSkeleton />;

  if (isError && allItems.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-3 text-mm-text-secondary">
          {i18n._(msg`schedule.loadFailed`)}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-mm-accent cursor-pointer"
        >
          {i18n._(msg`common.retry`)}
        </button>
      </div>
    );
  }

  if (!isLoading && allItems.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-mm-text-muted">{i18n._(msg`schedule.noShows`)}</p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
      >
        {allItems.map((anime, i) => (
          <ScheduleAnimeItem
            key={`${anime.bangumi_id || anime.anilist_id || i}-${i}`}
            anime={anime}
            index={i < 50 ? i : 0}
            locale={locale}
            variant="card"
          />
        ))}
      </div>

      {/* Auto load more — sentinel triggers next page when scrolled into view */}
      {hasMore && (
        <LoadMoreSentinel loading={isFetching} onVisible={() => setPage((p) => p + 1)} />
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */

export function SchedulePage() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { year?: number; season?: string };
  const currentYear = new Date().getFullYear();
  const currentSeason = getCurrentSeason();

  const selectedYear = search.year || currentYear;
  const selectedSeason = (SEASONS.includes(search.season as SeasonKey) ? search.season : currentSeason) as SeasonKey;
  const isCurrentSeason = selectedYear === currentYear && selectedSeason === currentSeason;

  const setSearch = (params: { year?: number; season?: string }) => {
    const next = { year: params.year ?? selectedYear, season: params.season ?? selectedSeason };
    // Omit defaults so URL stays clean for current season
    const isDefault = next.year === currentYear && next.season === currentSeason;
    navigate({
      to: '/schedule',
      search: isDefault ? {} : next,
      replace: true,
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen px-4 md:px-6 pt-6 pb-16">
        {/* Header — year nav + season chips in one row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-6"
        >
          {/* Year selector */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearch({ year: selectedYear - 1 })}
              className="w-7 h-7 flex items-center justify-center rounded-md text-mm-text-muted hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-sm"
            >
              ‹
            </button>
            <span className="text-xl font-bold text-white tabular-nums min-w-[56px] text-center">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSearch({ year: selectedYear + 1 })}
              disabled={selectedYear >= currentYear + 1}
              className="w-7 h-7 flex items-center justify-center rounded-md text-mm-text-muted hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-sm disabled:opacity-20 disabled:cursor-default"
            >
              ›
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-white/[0.08]" />

          {/* Season chips */}
          <div className="flex items-center gap-1.5">
            {SEASONS.map((season) => {
              const isActive = selectedSeason === season;
              const isCurrent = selectedYear === currentYear && season === currentSeason;
              return (
                <button
                  key={season}
                  type="button"
                  onClick={() => setSearch({ season })}
                  className={cn(
                    'relative px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all duration-200',
                    isActive
                      ? 'bg-mm-accent/15 text-mm-accent'
                      : 'text-mm-text-tertiary hover:text-mm-text-secondary hover:bg-white/[0.04]'
                  )}
                >
                  {getSeasonLabel(season, i18n)}
                  {isCurrent && !isActive && (
                    <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-mm-accent" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Back to current — only when off-season */}
          {(selectedYear !== currentYear || selectedSeason !== currentSeason) && (
            <button
              type="button"
              onClick={() => setSearch({ year: currentYear, season: currentSeason })}
              className="text-[11px] font-medium text-mm-accent/60 hover:text-mm-accent cursor-pointer transition-colors"
            >
              ← {i18n._(msg`schedule.backToCurrent`)}
            </button>
          )}
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedYear}-${selectedSeason}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {isCurrentSeason ? (
              <CalendarView locale={i18n.locale} />
            ) : (
              <SeasonBrowseView
                year={selectedYear}
                season={selectedSeason}
                locale={i18n.locale}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
