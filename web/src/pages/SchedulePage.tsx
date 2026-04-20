import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { format, getDay } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageAtmosphere } from '../components/PageAtmosphere';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Spinner } from '../components/ui/spinner';
import { useDocumentTitle } from '../hooks/use-document-title';
import {
  type AnimeSummary,
  type BrowseParams,
  type CalendarDay,
  discoverApi,
  discoverKeys,
} from '../lib/api/discover';
import { useUIStore, type WeekStartDay } from '../store/ui-store';
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

/* ── Schedule card wrapper — adds EP badge overlay ────────── */

function ScheduleAnimeCard({ anime, index }: { anime: AnimeSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
    >
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
    </motion.div>
  );
}

/* ── Build grouped timeline: group anime by air_time ────────── */

function groupByTime(items: AnimeSummary[]): { time: string; animes: AnimeSummary[] }[] {
  const sorted = [...items].sort((a, b) => {
    const ta = a.air_time || '00:00';
    const tb = b.air_time || '00:00';
    return ta.localeCompare(tb);
  });

  const groups: { time: string; animes: AnimeSummary[] }[] = [];
  for (const anime of sorted) {
    const time = anime.air_time || '00:00';
    const last = groups[groups.length - 1];
    if (last && last.time === time) {
      last.animes.push(anime);
    } else {
      groups.push({ time, animes: [anime] });
    }
  }
  return groups;
}

function useTimelinePath(
  containerRef: React.RefObject<HTMLDivElement | null>,
  dotRefs: React.MutableRefObject<(HTMLDivElement | null)[]>,
  count: number
) {
  const [path, setPath] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) return;

    const compute = () => {
      const rect = container.getBoundingClientRect();
      const points: { x: number; y: number }[] = [];
      for (const dot of dotRefs.current) {
        if (!dot) continue;
        const dr = dot.getBoundingClientRect();
        points.push({
          x: dr.left - rect.left + dr.width / 2,
          y: dr.top - rect.top + dr.height / 2,
        });
      }
      if (points.length < 2) {
        setPath('');
        setSize({ w: rect.width, h: rect.height });
        return;
      }

      const edgeR = rect.width - 4;
      const edgeL = 4;

      // Group points by row (same Y ± threshold)
      const rows: { x: number; y: number }[][] = [];
      for (const pt of points) {
        const lastRow = rows[rows.length - 1];
        if (lastRow && Math.abs(lastRow[0]!.y - pt.y) < 20) {
          lastRow.push(pt);
        } else {
          rows.push([pt]);
        }
      }

      // Draw each row left-to-right, with vertical drop between rows
      const segments: string[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri]!;
        const y = row[0]!.y;
        const firstX = row[0]!.x;
        const lastX = row[row.length - 1]!.x;

        // Row line: left edge → through all dots → right edge
        segments.push(`M ${edgeL} ${y} L ${edgeR} ${y}`);

      }

      setPath(segments.join(' '));
      setSize({ w: rect.width, h: rect.height });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, dotRefs, count]);

  return { path, size };
}

function TimelineView({ items }: { items: AnimeSummary[] }) {
  const { i18n } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[13px] text-mm-text-muted">{i18n._(msg`schedule.noShows`)}</p>
      </div>
    );
  }

  const groups = groupByTime(items);
  let cardIdx = 0;
  dotRefs.current = [];

  const { path, size } = useTimelinePath(containerRef, dotRefs, groups.length);

  return (
    <div ref={containerRef} className="w-full flex flex-wrap gap-x-0 gap-y-5 sm:gap-y-6 items-start relative">
      {/* SVG timeline path */}
      {path && (
        <svg
          className="absolute inset-0 pointer-events-none z-0"
          width={size.w}
          height={size.h}
          fill="none"
        >
          {/* Glow layer */}
          <path
            d={path}
            stroke="var(--mm-accent, #c8a0ff)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.1"
            filter="blur(4px)"
          />
          {/* Main line */}
          <path
            d={path}
            stroke="white"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.12"
          />
        </svg>
      )}

      {groups.map((group, gi) => {
        const cards = group.animes.map((anime) => {
          const idx = cardIdx++;
          return (
            <div key={anime.bangumi_id} className="w-[calc(50%-4px)] sm:w-[180px] md:w-[207px] lg:w-[229px]">
              <ScheduleAnimeCard anime={anime} index={idx} />
            </div>
          );
        });

        return (
          <div key={group.time || `g-${gi}`} className="flex flex-col items-start">
            {/* ── Time marker ── */}
            <div className="relative flex items-center w-full h-7 sm:h-8 mb-1.5 sm:mb-2">
              <div className="relative z-10 flex items-center gap-1.5 sm:gap-2 mx-1.5 sm:mx-2">
                {/* Dot — measured by SVG hook */}
                <div
                  ref={(el) => { dotRefs.current[gi] = el; }}
                  className="relative shrink-0"
                >
                  <div className="absolute -inset-1.5 rounded-full bg-mm-accent/20 blur-sm" />
                  <div className="relative w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-mm-accent ring-[1.5px] ring-mm-accent/30 ring-offset-1 ring-offset-mm-bg shadow-[0_0_6px_rgba(var(--mm-accent-rgb,200,160,255),0.4)]" />
                </div>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] text-mm-accent text-[10px] sm:text-[11px] font-bold tabular-nums whitespace-nowrap shadow-sm">
                  {group.time || '—'}
                </span>
              </div>
            </div>
            {/* ── Cards ── */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 px-1.5 sm:px-2">
              {cards}
            </div>
          </div>
        );
      })}
    </div>
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
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-x-4 gap-y-5">
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
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-x-4 gap-y-5">
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

function CalendarView() {
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

  const weekStartDay = useUIStore((s) => s.weekStartDay);

  const sortedCalendar = useMemo(() => {
    if (!calendar) return [];
    const startIdx: Record<WeekStartDay, number> = { monday: 0, sunday: 6, saturday: 5 };
    const idx = startIdx[weekStartDay];
    const ordered = [...BANGUMI_WEEKDAYS.slice(idx), ...BANGUMI_WEEKDAYS.slice(0, idx)];
    return ordered
      .map((wd) => calendar.find((d) => d.weekday === wd))
      .filter((d): d is CalendarDay => d !== undefined);
  }, [calendar, weekStartDay]);

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
        <p className="text-sm mb-3 text-mm-text-secondary">{i18n._(msg`schedule.loadFailed`)}</p>
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
                <TimelineView items={activeCalendar.items} />
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
              <div
                key={day.weekday}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
              >
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
                <TimelineView items={day.items} />
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

function SeasonBrowseView({ year, season }: { year: number; season: SeasonKey }) {
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
        <p className="text-sm mb-3 text-mm-text-secondary">{i18n._(msg`schedule.loadFailed`)}</p>
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
        className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-x-4 gap-y-5"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
      >
        {allItems.map((anime, i) => (
          <ScheduleAnimeCard
            key={`${anime.bangumi_id || anime.anilist_id || i}-${i}`}
            anime={anime}
            index={i < 50 ? i : 0}
          />
        ))}
      </div>

      {/* Auto load more — sentinel triggers next page when scrolled into view */}
      {hasMore && <LoadMoreSentinel loading={isFetching} onVisible={() => setPage((p) => p + 1)} />}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */

export function SchedulePage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.schedule`));
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { year?: number; season?: string };
  const currentYear = new Date().getFullYear();
  const currentSeason = getCurrentSeason();

  const selectedYear = search.year || currentYear;
  const selectedSeason = (
    SEASONS.includes(search.season as SeasonKey) ? search.season : currentSeason
  ) as SeasonKey;
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
      <div className="relative min-h-screen px-4 md:px-6 pt-6 pb-16">
        <PageAtmosphere preset="schedule" />
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
              <CalendarView />
            ) : (
              <SeasonBrowseView year={selectedYear} season={selectedSeason} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
