import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { PageTransition } from '../components/PageTransition';
import { type CalendarDay, discoverApi, discoverKeys } from '../lib/api/discover';
import { cn } from '../lib/utils';

const WEEKDAY_SHORT: Record<string, string> = {
  星期一: '週一 (月)',
  星期二: '週二 (火)',
  星期三: '週三 (水)',
  星期四: '週四 (木)',
  星期五: '週五 (金)',
  星期六: '週六 (土)',
  星期日: '週日 (日)',
};

function todayWeekdayCN(): string {
  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const;
  const day = new Date().getDay();
  return weekdays[day === 0 ? 6 : day - 1] as string;
}

function WeekdayColumn({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
  const label = WEEKDAY_SHORT[day.weekday] ?? day.weekday;

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="pb-3 mb-1 border-b" style={{ borderColor: 'oklch(14% 0.01 280)' }}>
        <h3
          className={cn('text-[13px] font-semibold', isToday ? 'text-white' : '')}
          style={isToday ? { color: 'oklch(65% 0.2 35)' } : { color: 'oklch(50% 0.01 280)' }}
        >
          {label}
        </h3>
      </div>

      {/* Anime list — text-only like ebb.io */}
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
              className={cn(
                'block py-2.5 text-[13px] leading-snug transition-colors border-b',
                anime.score >= 8 ? 'text-white font-medium' : 'font-normal'
              )}
              style={{
                color: anime.score >= 8 ? undefined : 'oklch(52% 0.01 280)',
                borderColor: 'oklch(12% 0.01 280)',
              }}
            >
              {anime.title}
            </Link>
          </motion.div>
        ))}

        {day.items.length === 0 && (
          <p className="py-4 text-[12px]" style={{ color: 'oklch(28% 0.01 280)' }}>
            —
          </p>
        )}
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

  // Sort days starting from today
  const sortedCalendar = (() => {
    if (!calendar) return [];
    const weekdayOrder = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const todayIdx = weekdayOrder.indexOf(today);
    const reordered = [...weekdayOrder.slice(todayIdx), ...weekdayOrder.slice(0, todayIdx)];
    return reordered
      .map((wd) => calendar.find((d) => d.weekday === wd))
      .filter((d): d is CalendarDay => d !== undefined);
  })();

  return (
    <PageTransition>
      <div className="min-h-screen px-6 pt-8 pb-16">
        {/* Season header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-baseline gap-3">
            <div
              className="w-1 h-5 rounded-full"
              style={{ backgroundColor: 'oklch(65% 0.2 35)' }}
            />
            <h1 className="text-xl font-bold text-white tracking-tight">
              {new Date().getFullYear()} {getCurrentSeason()}
            </h1>
          </div>
        </motion.div>

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3 animate-pulse">
                <div
                  className="h-4 rounded"
                  style={{ backgroundColor: 'oklch(14% 0.01 280)', width: '50%' }}
                />
                <div
                  className="h-3 rounded"
                  style={{ backgroundColor: 'oklch(12% 0.01 280)', width: '80%' }}
                />
                <div
                  className="h-3 rounded"
                  style={{ backgroundColor: 'oklch(11% 0.01 280)', width: '65%' }}
                />
                <div
                  className="h-3 rounded"
                  style={{ backgroundColor: 'oklch(11% 0.01 280)', width: '75%' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-16">
            <p className="text-sm mb-3" style={{ color: 'oklch(45% 0.01 280)' }}>
              載入日曆失敗
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium"
              style={{ color: 'oklch(65% 0.2 35)' }}
            >
              重試
            </button>
          </div>
        )}

        {/* Multi-column weekday grid — ebb.io style */}
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
                    ? { borderRight: '1px solid oklch(12% 0.01 280)' }
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

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month <= 3) return '一月冬番';
  if (month <= 6) return '四月春番';
  if (month <= 9) return '七月夏番';
  return '十月秋番';
}
