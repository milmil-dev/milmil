import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format, getDay } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { type CalendarDay, discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

const BANGUMI_WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function todayWeekdayCN(): string {
  const jsDay = getDay(new Date()); // 0=Sun
  return BANGUMI_WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1] as string;
}

function getWeekdayLabel(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday);
  if (idx === -1) return bangumiWeekday;
  // Create a date for that weekday this week and format with date-fns
  const now = new Date();
  const jsDay = getDay(now); // 0=Sun
  const currentIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon
  const diff = idx - currentIdx;
  const target = new Date(now);
  target.setDate(target.getDate() + diff);
  return format(target, 'EEEE', { locale: zhTW });
}

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month <= 3) return `${year} 一月冬番`;
  if (month <= 6) return `${year} 四月春番`;
  if (month <= 9) return `${year} 七月夏番`;
  return `${year} 十月秋番`;
}

function WeekdayColumn({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
  const label = getWeekdayLabel(day.weekday);

  return (
    <div className="min-w-0">
      <div className="pb-3 mb-1 border-b border-mm-border">
        <h3
          className={cn(
            'text-[13px] font-semibold',
            isToday ? 'text-mm-accent' : 'text-mm-text-secondary'
          )}
        >
          {label}
        </h3>
      </div>

      <div className="space-y-0">
        {day.items.map((anime, i) => (
          <motion.div
            key={anime.bangumi_id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
          >
            <Link
              to={`/anime/${anime.bangumi_id}` as string}
              className="group flex items-center gap-2.5 py-2 transition-colors border-b border-mm-border-subtle"
            >
              {/* Small cover thumbnail */}
              <div
                className="shrink-0 w-8 h-11 rounded overflow-hidden"
                style={
                  anime.cover_image?.startsWith('http')
                    ? undefined
                    : { background: animeGradient(anime.title) }
                }
              >
                {anime.cover_image?.startsWith('http') && (
                  <img src={anime.cover_image} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              {/* Title + score */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[12px] leading-snug truncate transition-colors group-hover:text-white',
                    anime.score >= 8 ? 'text-mm-text-primary font-medium' : 'text-mm-text-secondary'
                  )}
                >
                  {anime.title}
                </p>
                {anime.score > 0 && (
                  <p className="text-[10px] mt-0.5 text-mm-accent">{anime.score.toFixed(1)}</p>
                )}
              </div>
            </Link>
          </motion.div>
        ))}

        {day.items.length === 0 && <p className="py-4 text-[12px] text-mm-text-muted">—</p>}
      </div>
    </div>
  );
}

export function SchedulePage() {
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

  const sortedCalendar = (() => {
    if (!calendar) return [];
    const todayIdx = BANGUMI_WEEKDAYS.indexOf(today);
    const reordered = [...BANGUMI_WEEKDAYS.slice(todayIdx), ...BANGUMI_WEEKDAYS.slice(0, todayIdx)];
    return reordered
      .map((wd) => calendar.find((d) => d.weekday === wd))
      .filter((d): d is CalendarDay => d !== undefined);
  })();

  return (
    <PageTransition>
      <div className="min-h-screen px-6 pt-8 pb-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-baseline gap-3">
            <div className="w-1 h-5 rounded-full bg-mm-accent" />
            <h1 className="text-xl font-bold text-white tracking-tight">{getCurrentSeason()}</h1>
          </div>
        </motion.div>

        {isLoading && (
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3 animate-pulse">
                <div className="h-4 rounded bg-mm-border" style={{ width: '50%' }} />
                <div className="h-3 rounded bg-mm-border-subtle" style={{ width: '80%' }} />
                <div className="h-3 rounded bg-mm-border-subtle" style={{ width: '65%' }} />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-16">
            <p className="text-sm mb-3 text-mm-text-secondary">載入日曆失敗</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium text-mm-accent"
            >
              重試
            </button>
          </div>
        )}

        {!isLoading && !isError && sortedCalendar.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${Math.min(sortedCalendar.length, 7)}, minmax(0, 1fr))`,
            }}
          >
            {sortedCalendar.map((day, i) => (
              <div
                key={day.weekday}
                className="px-3 first:pl-0 last:pr-0"
                style={
                  i < sortedCalendar.length - 1
                    ? { borderRight: '1px solid var(--mm-border-subtle)' }
                    : undefined
                }
              >
                <WeekdayColumn day={day} isToday={day.weekday === today} />
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
