import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { format, getDay } from 'date-fns';
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageAtmosphere } from '../components/PageAtmosphere';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { Spinner } from '../components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useDocumentTitle } from '../hooks/use-document-title';
import {
  type AnimeSummary,
  type BrowseParams,
  type CalendarDay,
  discoverApi,
  discoverKeys,
} from '../lib/api/discover';
import { cn } from '../lib/utils';
import { type ScheduleCardSize, useUIStore, type WeekStartDay } from '../store/ui-store';

/* ── Season / year helpers ────────────────────────────────── */

type SeasonKey = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
const SEASONS: SeasonKey[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const SCHEDULE_SIZE_OPTIONS = [
  { value: 'small', label: 'Small cards' },
  { value: 'medium', label: 'Medium cards' },
  { value: 'large', label: 'Large cards' },
] as const satisfies ReadonlyArray<{ value: ScheduleCardSize; label: string }>;

const TIMELINE_CARD_WIDTHS: Record<ScheduleCardSize, string> = {
  small: 'w-[calc(50%-4px)] sm:w-[148px] md:w-[168px] lg:w-[184px]',
  medium: 'w-[calc(50%-4px)] sm:w-[180px] md:w-[207px] lg:w-[229px]',
  large: 'w-full min-[430px]:w-[calc(50%-4px)] sm:w-[220px] md:w-[250px] lg:w-[276px]',
};

const SEASON_GRID_CLASSES: Record<ScheduleCardSize, string> = {
  small: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-4',
  medium: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-x-3 sm:gap-x-4 gap-y-5',
  large: 'grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6',
};

const MOBILE_SCHEDULE_GRID_CLASSES: Record<ScheduleCardSize, string> = {
  small: 'gap-x-2 gap-y-4',
  medium: 'gap-x-3 gap-y-5',
  large: 'gap-y-5',
};

const MOBILE_SCHEDULE_GRID_STYLES: Record<ScheduleCardSize, CSSProperties> = {
  small: {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  },
  medium: {
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(13rem, 100%), 1fr))',
  },
  large: {
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(21rem, 100%), 1fr))',
  },
};

const WEEKDAY_TAB_SKELETON_KEYS = Array.from({ length: 7 }, (_, i) => `weekday-tab-${i}`);
const CALENDAR_CARD_SKELETON_KEYS = Array.from({ length: 12 }, (_, i) => `calendar-card-${i}`);
const SEASON_CARD_SKELETON_KEYS = Array.from({ length: 18 }, (_, i) => `season-card-${i}`);

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

function ScheduleSizeGlyph({ size, active }: { size: ScheduleCardSize; active: boolean }) {
  const sizeClassName =
    size === 'small' ? 'h-[10px] w-2' : size === 'medium' ? 'h-[13px] w-[10px]' : 'h-4 w-[13px]';

  return (
    <span aria-hidden className="flex size-4 items-center justify-center">
      <span
        className={cn(
          'relative rounded-[3px] border transition-all duration-200',
          sizeClassName,
          active ? 'border-mm-accent/75 bg-mm-accent/15' : 'border-current/45 bg-current/[0.03]'
        )}
      >
        <span className="absolute inset-x-[2.5px] bottom-[2.5px] h-px rounded-full bg-current/55" />
      </span>
    </span>
  );
}

function ScheduleSizeControl({
  scheduleCardSize,
  setScheduleCardSize,
}: {
  scheduleCardSize: ScheduleCardSize;
  setScheduleCardSize: (size: ScheduleCardSize) => void;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <fieldset className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5 backdrop-blur-md">
        <legend className="sr-only">Anime card size</legend>
        {SCHEDULE_SIZE_OPTIONS.map((option) => {
          const isActive = scheduleCardSize === option.value;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={option.label}
                  aria-pressed={isActive}
                  onClick={() => setScheduleCardSize(option.value)}
                  className={cn(
                    'relative flex size-7 items-center justify-center rounded-md transition-all duration-200 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mm-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                    isActive
                      ? 'bg-white/[0.12] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_6px_16px_rgba(166,130,255,0.14)]'
                      : 'text-mm-text-tertiary hover:bg-white/[0.06] hover:text-mm-text-secondary'
                  )}
                >
                  <ScheduleSizeGlyph size={option.value} active={isActive} />
                  {isActive && (
                    <span className="absolute bottom-0.5 h-0.5 w-2.5 rounded-full bg-mm-accent shadow-[0_0_8px_rgba(168,132,255,0.7)]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{option.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </fieldset>
    </TooltipProvider>
  );
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

function getCompactDateForWeekday(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday);
  if (idx === -1) return '';
  const now = new Date();
  const jsDay = getDay(now);
  const currentIdx = jsDay === 0 ? 6 : jsDay - 1;
  const diff = idx - currentIdx;
  const target = new Date(now);
  target.setDate(target.getDate() + diff);
  return format(target, 'M/d');
}

/* ── Schedule card wrapper — adds EP badge overlay ────────── */

function ScheduleAnimeCard({ anime, index }: { anime: AnimeSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
      className="min-w-0"
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
  count: number,
  noSpine: boolean,
  extendLeft: number
) {
  const [path, setPath] = useState('');
  const [spineY, setSpineY] = useState<{ top: number; bottom: number } | null>(null);
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
        setSpineY(null);
        setSize({ w: rect.width, h: rect.height });
        return;
      }

      const edgeR = rect.width - 4;
      const edgeL = extendLeft > 0 ? -extendLeft : 4;

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

      // Draw each row left-to-right
      const segments: string[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri]!;
        const y = row[0]!.y;
        segments.push(`M ${edgeL} ${y} L ${edgeR} ${y}`);
      }

      // Vertical spine connecting all rows on the left (skip when parent provides one)
      if (rows.length >= 2 && !noSpine) {
        const topY = rows[0]![0]!.y;
        const botY = rows[rows.length - 1]![0]!.y;
        segments.push(`M ${edgeL} ${topY} L ${edgeL} ${botY}`);
        setSpineY({ top: topY, bottom: botY });
      } else {
        setSpineY(null);
      }

      setPath(segments.join(' '));
      setSize({ w: rect.width, h: rect.height });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, dotRefs, count, noSpine, extendLeft]);

  return { path, spineY, size };
}

function ContinuousSpine({
  containerRef,
  x = 4,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  x?: number;
}) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  // Light traverses the full container length as user scrolls
  const lightY = useTransform(scrollYProgress, [0, 1], ['-4%', '104%']);

  return (
    <>
      {/* Static spine — comet fade-in at top, solid middle, comet fade-out at bottom */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          left: x,
          top: 0,
          bottom: 0,
          width: 1.5,
          marginLeft: -0.75,
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.16) 15%, rgba(255,255,255,0.16) 85%, transparent 100%)',
        }}
      />
      {/* Accent halo running alongside */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          left: x,
          top: 0,
          bottom: 0,
          width: 8,
          marginLeft: -4,
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 11%, transparent) 15%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 11%, transparent) 85%, transparent 100%)',
          filter: 'blur(5px)',
        }}
      />

      {/* Soft halo (moving) */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: x,
          top: lightY,
          width: 16,
          height: 80,
          marginLeft: -8,
          marginTop: -40,
          background:
            'radial-gradient(ellipse at center, color-mix(in oklch, var(--mm-accent, #c8a0ff) 55%, transparent) 0%, transparent 70%)',
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Bright core (moving) */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: x,
          top: lightY,
          width: 3,
          height: 36,
          marginLeft: -1.5,
          marginTop: -18,
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 85%, white) 50%, transparent 100%)',
          filter: 'blur(1px)',
          opacity: 0.9,
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
}

function FlowingSpineLight({
  containerRef,
  topY,
  bottomY,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  topY: number;
  bottomY: number;
}) {
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  const lightY = useTransform(scrollYProgress, [0, 1], [topY - 80, bottomY + 80]);

  return (
    <>
      {/* Soft halo */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: '4px',
          top: lightY,
          width: '28px',
          height: '160px',
          marginLeft: '-14px',
          marginTop: '-80px',
          background:
            'radial-gradient(ellipse at center, color-mix(in oklch, var(--mm-accent, #c8a0ff) 55%, transparent) 0%, transparent 70%)',
          filter: 'blur(6px)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Bright core */}
      <motion.div
        className="absolute pointer-events-none z-[1]"
        style={{
          left: '4px',
          top: lightY,
          width: '5px',
          height: '70px',
          marginLeft: '-2.5px',
          marginTop: '-35px',
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklch, var(--mm-accent, #c8a0ff) 85%, white) 50%, transparent 100%)',
          filter: 'blur(1.5px)',
          opacity: 0.9,
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
}

function TimelineView({
  items,
  noSpine = false,
  extendLeft = 0,
  cardSize,
}: {
  items: AnimeSummary[];
  noSpine?: boolean;
  extendLeft?: number;
  cardSize: ScheduleCardSize;
}) {
  const { i18n } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const groups = groupByTime(items);

  dotRefs.current = [];

  const { path, spineY, size } = useTimelinePath(
    containerRef,
    dotRefs,
    groups.length,
    noSpine,
    extendLeft
  );

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[13px] text-mm-text-muted">{i18n._(msg`schedule.noShows`)}</p>
      </div>
    );
  }

  let cardIdx = 0;

  return (
    <div ref={containerRef} className="w-full relative">
      {/* SVG timeline path */}
      {path && (
        <svg
          className="absolute inset-0 pointer-events-none z-0"
          width={size.w}
          height={size.h}
          fill="none"
          overflow="visible"
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
          <path d={path} stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.12" />
        </svg>
      )}

      {/* Scroll-linked flowing light along the vertical spine */}
      {spineY && (
        <FlowingSpineLight containerRef={containerRef} topY={spineY.top} bottomY={spineY.bottom} />
      )}

      {/* Inner content — offset right to clear the vertical spine */}
      <div className="w-full flex flex-wrap gap-x-0 gap-y-5 sm:gap-y-6 items-start pl-4 sm:pl-5">
        {groups.map((group, gi) => {
          const cards = group.animes.map((anime) => {
            const idx = cardIdx++;
            return (
              <div key={anime.bangumi_id} className={TIMELINE_CARD_WIDTHS[cardSize]}>
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
                    ref={(el) => {
                      dotRefs.current[gi] = el;
                    }}
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
              <div className="flex flex-wrap gap-1.5 sm:gap-2 px-1.5 sm:px-2">{cards}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Skeleton loaders ─────────────────────────────────────── */

function CalendarSkeleton() {
  return (
    <div className="space-y-6">
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0">
        {WEEKDAY_TAB_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-9 w-16 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 lg:gap-x-4">
        {CALENDAR_CARD_SKELETON_KEYS.map((key) => (
          <div key={key} className="min-w-0 space-y-2">
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 lg:gap-x-4">
      {SEASON_CARD_SKELETON_KEYS.map((key) => (
        <div key={key} className="min-w-0 space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function MobileScheduleGrid({
  items,
  cardSize,
}: {
  items: AnimeSummary[];
  cardSize: ScheduleCardSize;
}) {
  const { i18n } = useLingui();

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.03] px-4 py-8 text-center">
        <p className="text-[13px] font-medium text-mm-text-muted">
          {i18n._(msg`schedule.noShows`)}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid w-[var(--schedule-mobile-content-width)] max-w-full justify-start overflow-hidden',
        MOBILE_SCHEDULE_GRID_CLASSES[cardSize]
      )}
      style={MOBILE_SCHEDULE_GRID_STYLES[cardSize]}
    >
      {items.map((anime, index) => (
        <div
          key={
            anime.bangumi_id > 0
              ? `mobile-bangumi-${anime.bangumi_id}`
              : `mobile-anilist-${anime.anilist_id || anime.title}`
          }
          className="min-w-0 overflow-hidden [&_.group\\/media-entry-card]:min-w-0 [&_.group\\/media-entry-card]:overflow-hidden"
        >
          <ScheduleAnimeCard anime={anime} index={index < 40 ? index : 0} />
        </div>
      ))}
    </div>
  );
}

function MobileDayHeading({ day, today }: { day: CalendarDay; today: string }) {
  const { i18n } = useLingui();
  const isToday = day.weekday === today;

  return (
    <div className="mb-4 flex w-[var(--schedule-mobile-content-width)] max-w-full flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-[24px] font-bold leading-none text-white">
            {getWeekdayJapanese(day.weekday)}
          </h2>
          {isToday && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mm-accent/12 px-2 py-0.5 text-[10px] font-bold text-mm-accent">
              <span className="size-1 rounded-full bg-mm-accent" />
              {i18n._(msg`schedule.today`)}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs font-medium text-white/38 tabular-nums">
          {getDateForWeekday(day.weekday)}
        </p>
      </div>
      <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/45 tabular-nums">
        {day.items.length} {i18n._(msg`schedule.totalShows`)}
      </span>
    </div>
  );
}

function MobileWeekdayTabs({
  sortedCalendar,
  activeDay,
  today,
  setActiveDay,
  tabsRef,
}: {
  sortedCalendar: CalendarDay[];
  activeDay: string;
  today: string;
  setActiveDay: (day: string) => void;
  tabsRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { i18n } = useLingui();
  const totalShows = sortedCalendar.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="md:hidden">
      <div
        ref={tabsRef}
        className="-mx-4 mb-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 18px, black calc(100% - 18px), transparent)',
          maskImage:
            'linear-gradient(to right, transparent, black 18px, black calc(100% - 18px), transparent)',
        }}
      >
        <div className="flex w-max min-w-full snap-x snap-mandatory items-start justify-center gap-3 px-4 pb-1">
          <button
            type="button"
            data-active={activeDay === 'all'}
            data-tab-surface="mobile"
            data-weekday="all"
            onClick={() => setActiveDay('all')}
            className={cn(
              'relative flex h-[54px] min-w-[52px] snap-start flex-col items-center justify-center rounded-full transition-all duration-200 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mm-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
              activeDay === 'all'
                ? 'bg-mm-accent text-black shadow-[0_8px_20px_rgba(168,132,255,0.22)]'
                : 'bg-white/[0.055] text-white/62 hover:bg-white/[0.085] hover:text-white'
            )}
          >
            <span className="text-[11px] font-bold leading-none">{i18n._(msg`schedule.all`)}</span>
            <span className="mt-1 text-[9px] font-semibold leading-none opacity-60 tabular-nums">
              {totalShows}
            </span>
          </button>

          {sortedCalendar.map((day) => {
            const isToday = day.weekday === today;
            const isActive = day.weekday === activeDay;
            return (
              <button
                key={day.weekday}
                type="button"
                data-active={isActive}
                data-tab-surface="mobile"
                data-weekday={day.weekday}
                onClick={() => setActiveDay(day.weekday)}
                className={cn(
                  'relative flex h-[62px] min-w-[44px] snap-start flex-col items-center gap-1 rounded-full px-1.5 py-1 transition-colors duration-200 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mm-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                  isActive ? 'text-white' : 'text-white/58 hover:text-white'
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-bold leading-none',
                    isActive ? 'text-mm-accent' : 'text-white/42'
                  )}
                >
                  {getWeekdayJapanese(day.weekday).slice(0, 1)}
                </span>
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full text-[13px] font-bold tabular-nums transition-all duration-200',
                    isActive
                      ? 'bg-white text-black shadow-[0_8px_18px_rgba(0,0,0,0.25)]'
                      : isToday
                        ? 'bg-mm-accent/12 text-mm-accent ring-1 ring-mm-accent/40'
                        : 'bg-transparent text-white/72'
                  )}
                >
                  {getCompactDateForWeekday(day.weekday).split('/')[1]}
                </span>
                <span
                  className={cn(
                    'text-[9px] font-semibold leading-none tabular-nums',
                    isActive ? 'text-white/58' : 'text-white/25'
                  )}
                >
                  {day.items.length}
                </span>
                {isToday && (
                  <span
                    className={cn(
                      'absolute -top-0.5 size-1 rounded-full',
                      isActive ? 'bg-mm-accent' : 'bg-mm-accent/80'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Calendar view (weekly schedule) ──────────────────────── */

function CalendarView() {
  const { i18n } = useLingui();
  const mobileTabsRef = useRef<HTMLDivElement>(null);
  const desktopTabsRef = useRef<HTMLDivElement>(null);
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
  const allTabRef = useRef<HTMLDivElement>(null);

  const weekStartDay = useUIStore((s) => s.weekStartDay);
  const scheduleCardSize = useUIStore((s) => s.scheduleCardSize);

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
    if (sortedCalendar.length === 0) return;
    const activeSelector = `[data-weekday="${activeDay}"]`;
    const mobileScroller = mobileTabsRef.current;
    const mobileActiveBtn = mobileScroller?.querySelector(activeSelector) as HTMLElement | null;

    if (mobileScroller && mobileActiveBtn) {
      mobileScroller.scrollTo({
        left:
          mobileActiveBtn.offsetLeft -
          mobileScroller.clientWidth / 2 +
          mobileActiveBtn.offsetWidth / 2,
        behavior: 'smooth',
      });
    }

    const desktopActiveBtn = desktopTabsRef.current?.querySelector(activeSelector);
    if (desktopActiveBtn) {
      desktopActiveBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeDay, sortedCalendar.length]);

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
      <MobileWeekdayTabs
        sortedCalendar={sortedCalendar}
        activeDay={activeDay}
        today={today}
        setActiveDay={setActiveDay}
        tabsRef={mobileTabsRef}
      />

      <div
        ref={desktopTabsRef}
        className="mb-5 hidden items-end gap-0 overflow-x-auto scrollbar-none md:flex"
      >
        <button
          type="button"
          data-active={activeDay === 'all'}
          data-tab-surface="desktop"
          data-weekday="all"
          onClick={() => setActiveDay('all')}
          className={cn(
            'relative shrink-0 px-4 pb-2.5 pt-2 text-[14px] font-bold cursor-pointer transition-colors duration-200 sm:text-[13px] sm:font-semibold',
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
              data-tab-surface="desktop"
              data-weekday={day.weekday}
              onClick={() => setActiveDay(day.weekday)}
              className={cn(
                'relative shrink-0 flex items-center gap-1.5 px-3.5 pb-2.5 pt-2 cursor-pointer transition-colors duration-200 sm:px-3',
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
                  'text-[14px] font-bold whitespace-nowrap sm:text-[13px]',
                  isActive ? 'text-mm-accent' : 'text-white/80'
                )}
              >
                {day.weekday.replace(/^星期/, '週')} ({getWeekdayJapanese(day.weekday).slice(0, 1)})
                <span className="ml-1 text-[11px] font-medium text-white/40 sm:text-[10px]">
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
      <div className="md:hidden">
        <AnimatePresence mode="wait">
          {activeDay !== 'all' ? (
            (() => {
              const activeCalendar = sortedCalendar.find((d) => d.weekday === activeDay);
              if (!activeCalendar) return null;
              return (
                <motion.div
                  key={`mobile-${activeDay}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MobileDayHeading day={activeCalendar} today={today} />
                  <MobileScheduleGrid items={activeCalendar.items} cardSize={scheduleCardSize} />
                </motion.div>
              );
            })()
          ) : (
            <motion.div
              key="mobile-all"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="space-y-8"
            >
              {sortedCalendar.map((day) => (
                <section key={day.weekday}>
                  <MobileDayHeading day={day} today={today} />
                  <MobileScheduleGrid items={day.items} cardSize={scheduleCardSize} />
                </section>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="hidden md:block">
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
                    <h2 className="text-lg font-semibold text-white">
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
                  <TimelineView items={activeCalendar.items} noSpine cardSize={scheduleCardSize} />
                </motion.div>
              );
            })()
          ) : (
            <motion.div
              key="all"
              ref={allTabRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative grid grid-cols-[112px_1fr] gap-x-6 gap-y-8"
            >
              {/* Continuous vertical spine in the rail column (x = 96 from grid start) */}
              <ContinuousSpine containerRef={allTabRef} x={96} />

              {sortedCalendar.map((day) => {
                const isToday = day.weekday === today;
                return (
                  <Fragment key={day.weekday}>
                    {/* Rail cell — weekday label + accent dot on the spine */}
                    <div className="relative z-[2] flex items-start justify-end gap-3 pr-[11px]">
                      <div className="text-right leading-tight">
                        <div
                          className={cn(
                            'text-[14px] font-semibold',
                            isToday ? 'text-mm-accent' : 'text-white/70'
                          )}
                        >
                          {getWeekdayJapanese(day.weekday)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-white/30 tabular-nums">
                          {getDateForWeekday(day.weekday)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-white/30 tabular-nums">
                          {day.items.length} {i18n._(msg`schedule.totalShows`)}
                        </div>
                      </div>
                      {/* Dot wrapper height matches TimelineView's first time-marker row (h-8),
                        so the dot center sits at the same Y as the first time-marker dot. */}
                      <div className="relative shrink-0 h-8 flex items-center">
                        <div className="relative">
                          <div className="absolute -inset-1.5 rounded-full bg-mm-accent/20 blur-sm" />
                          {isToday && (
                            <span className="absolute inset-0 rounded-full bg-mm-accent/40 animate-ping" />
                          )}
                          <div className="relative w-2.5 h-2.5 rounded-full bg-mm-accent ring-[1.5px] ring-mm-accent/30 ring-offset-1 ring-offset-mm-bg shadow-[0_0_6px_rgba(var(--mm-accent-rgb,200,160,255),0.4)]" />
                        </div>
                      </div>
                    </div>

                    {/* Content cell — TimelineView for this weekday.
                      extendLeft = 40 = grid gap (24) + (rail width 112 - SPINE_X 96), so each row's
                      horizontal line reaches all the way back to the rail spine.
                      contentVisibility intentionally omitted: it would create `contain: paint` and
                      clip the SVG lines that extend leftward past the cell. */}
                    <div className="min-w-0">
                      <TimelineView
                        items={day.items}
                        noSpine
                        extendLeft={40}
                        cardSize={scheduleCardSize}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
  const scheduleCardSize = useUIStore((s) => s.scheduleCardSize);
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
        className={cn('grid', SEASON_GRID_CLASSES[scheduleCardSize])}
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
      >
        {allItems.map((anime, i) => (
          <ScheduleAnimeCard
            key={
              anime.bangumi_id > 0
                ? `bangumi-${anime.bangumi_id}`
                : `anilist-${anime.anilist_id || anime.title}`
            }
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

function MobileScheduleHeader({
  selectedYear,
  currentYear,
  selectedSeason,
  currentSeason,
  scheduleCardSize,
  setScheduleCardSize,
  setSearch,
}: {
  selectedYear: number;
  currentYear: number;
  selectedSeason: SeasonKey;
  currentSeason: SeasonKey;
  scheduleCardSize: ScheduleCardSize;
  setScheduleCardSize: (size: ScheduleCardSize) => void;
  setSearch: (params: { year?: number; season?: string }) => void;
}) {
  const { i18n } = useLingui();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 w-[var(--schedule-mobile-content-width)] max-w-full md:hidden"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold text-mm-accent/75">
            {i18n._(msg`nav.schedule`)}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearch({ year: selectedYear - 1 })}
              className="flex size-8 items-center justify-center rounded-full text-lg text-white/35 transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white/80"
            >
              ‹
            </button>
            <span className="min-w-[76px] text-center text-[32px] font-bold leading-none text-white tabular-nums">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSearch({ year: selectedYear + 1 })}
              disabled={selectedYear >= currentYear + 1}
              className="flex size-8 items-center justify-center rounded-full text-lg text-white/35 transition-colors cursor-pointer hover:bg-white/[0.05] hover:text-white/80 disabled:cursor-default disabled:opacity-20"
            >
              ›
            </button>
          </div>
        </div>

        <div className="pt-1">
          <ScheduleSizeControl
            scheduleCardSize={scheduleCardSize}
            setScheduleCardSize={setScheduleCardSize}
          />
        </div>
      </div>

      <div className="mt-4 grid w-full grid-cols-4 gap-1 rounded-2xl bg-white/[0.035] p-1">
        {SEASONS.map((season) => {
          const isActive = selectedSeason === season;
          const isCurrent = selectedYear === currentYear && season === currentSeason;
          return (
            <button
              key={season}
              type="button"
              onClick={() => setSearch({ season })}
              className={cn(
                'relative h-9 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer',
                isActive
                  ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'text-white/42 hover:bg-white/[0.055] hover:text-white/70'
              )}
            >
              {getSeasonLabel(season, i18n)}
              {isCurrent && !isActive && (
                <span className="absolute right-2 top-2 size-1 rounded-full bg-mm-accent" />
              )}
            </button>
          );
        })}
      </div>

      {(selectedYear !== currentYear || selectedSeason !== currentSeason) && (
        <button
          type="button"
          onClick={() => setSearch({ year: currentYear, season: currentSeason })}
          className="mt-3 text-[11px] font-semibold text-mm-accent/70 transition-colors cursor-pointer hover:text-mm-accent"
        >
          ← {i18n._(msg`schedule.backToCurrent`)}
        </button>
      )}
    </motion.div>
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
  const scheduleCardSize = useUIStore((s) => s.scheduleCardSize);
  const setScheduleCardSize = useUIStore((s) => s.setScheduleCardSize);
  const [mobileContentWidth, setMobileContentWidth] = useState('calc(100vw - 2rem)');

  useEffect(() => {
    const updateMobileContentWidth = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      setMobileContentWidth(`${Math.max(0, viewportWidth - 32)}px`);
    };

    updateMobileContentWidth();
    window.addEventListener('resize', updateMobileContentWidth);
    window.visualViewport?.addEventListener('resize', updateMobileContentWidth);

    return () => {
      window.removeEventListener('resize', updateMobileContentWidth);
      window.visualViewport?.removeEventListener('resize', updateMobileContentWidth);
    };
  }, []);

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
      <div
        className="relative min-h-screen max-w-[100vw] overflow-x-hidden px-4 pt-6 pb-16 md:max-w-none md:overflow-visible md:px-6"
        style={{ '--schedule-mobile-content-width': mobileContentWidth } as CSSProperties}
      >
        <PageAtmosphere preset="schedule" />
        <MobileScheduleHeader
          selectedYear={selectedYear}
          currentYear={currentYear}
          selectedSeason={selectedSeason}
          currentSeason={currentSeason}
          scheduleCardSize={scheduleCardSize}
          setScheduleCardSize={setScheduleCardSize}
          setSearch={setSearch}
        />

        {/* Desktop header — year nav + season chips in one row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden md:mb-6 md:flex md:flex-wrap md:items-center md:gap-x-5 md:gap-y-3"
        >
          <div className="flex w-full min-w-0 items-center gap-4 md:contents">
            {/* Year selector */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearch({ year: selectedYear - 1 })}
                className="w-7 h-7 flex items-center justify-center rounded-md text-mm-text-muted hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer text-sm"
              >
                ‹
              </button>
              <span className="min-w-[64px] text-center text-2xl font-bold tabular-nums text-white md:min-w-[56px] md:text-xl">
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

            <div className="shrink-0 md:hidden">
              <ScheduleSizeControl
                scheduleCardSize={scheduleCardSize}
                setScheduleCardSize={setScheduleCardSize}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-white/[0.08] md:block" />

          {/* Season chips */}
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 scrollbar-none md:mx-0 md:px-0">
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

          {/* Divider */}
          <div className="hidden h-5 w-px bg-white/[0.08] md:block" />

          {/* Card size density */}
          <div className="hidden md:block">
            <ScheduleSizeControl
              scheduleCardSize={scheduleCardSize}
              setScheduleCardSize={setScheduleCardSize}
            />
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
