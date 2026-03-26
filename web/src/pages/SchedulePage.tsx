import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { AnimeRow } from '../components/AnimeRow';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { cn } from '../lib/utils';

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const;

function todayWeekdayCN(): string {
  const day = new Date().getDay();
  // day is 0-6 from getDay(), so index is always 0-5 or 6
  return WEEKDAYS[day === 0 ? 6 : day - 1]!;
}

export function SchedulePage() {
  const [activeDay, setActiveDay] = useState(todayWeekdayCN);

  const {
    data: calendar,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  });

  const activeItems = calendar?.find((d) => d.weekday === activeDay)?.items ?? [];

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          新番日曆
        </motion.h1>

        <div className="flex gap-1 mb-6 overflow-x-auto">
          {WEEKDAYS.map((day) => (
            <button
              type="button"
              key={day}
              onClick={() => setActiveDay(day)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-medium rounded transition-colors shrink-0',
                activeDay === day
                  ? 'text-black'
                  : 'text-[oklch(50%_0.01_280)] hover:text-white hover:bg-[oklch(13%_0.01_280)]'
              )}
              style={activeDay === day ? { backgroundColor: 'oklch(65% 0.2 35)' } : undefined}
            >
              {day}
              {day === todayWeekdayCN() && activeDay !== day && (
                <span className="ml-1 text-[9px]" style={{ color: 'oklch(65% 0.2 35)' }}>
                  today
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-3 animate-pulse">
                <div
                  className="w-10 h-14 rounded"
                  style={{ backgroundColor: 'oklch(14% 0.01 280)' }}
                />
                <div className="flex-1">
                  <div
                    className="h-3 rounded mb-2"
                    style={{ backgroundColor: 'oklch(14% 0.01 280)', width: '40%' }}
                  />
                  <div
                    className="h-2 rounded"
                    style={{ backgroundColor: 'oklch(12% 0.01 280)', width: '60%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

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

        {!isLoading && !isError && activeItems.length === 0 && (
          <p className="text-sm py-8" style={{ color: 'oklch(35% 0.01 280)' }}>
            今天沒有新番放送
          </p>
        )}

        {!isLoading && !isError && activeItems.length > 0 && (
          <div>
            {activeItems.map((anime, i) => (
              <AnimeRow key={anime.bangumi_id} anime={anime} index={i} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
