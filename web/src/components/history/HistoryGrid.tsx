import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useEffect, useMemo, useRef } from 'react';
import type { WatchProgress } from '@/lib/api/progress';
import { bucketByDate } from '@/lib/history-date-buckets';
import { HistoryCard } from './HistoryCard';

interface HistoryGridProps {
  items: WatchProgress[];
  batchMode: boolean;
  selectedIds: Set<string>;
  onSelectToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

const GROUP_ORDER = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'earlier'] as const;

export function HistoryGrid({
  items,
  batchMode,
  selectedIds,
  onSelectToggle,
  onDelete,
  onLoadMore,
  hasNextPage,
  isFetchingNextPage,
}: HistoryGridProps) {
  const { i18n } = useLingui();
  const buckets = useMemo(() => bucketByDate(items, new Date()), [items]);

  const labels: Record<(typeof GROUP_ORDER)[number], string> = {
    today: i18n._(msg`history.group.today`),
    yesterday: i18n._(msg`history.group.yesterday`),
    thisWeek: i18n._(msg`history.group.thisWeek`),
    lastWeek: i18n._(msg`history.group.lastWeek`),
    earlier: i18n._(msg`history.group.earlier`),
  };

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore]);

  return (
    <div>
      {GROUP_ORDER.map((key) => {
        const groupItems = buckets[key];
        if (groupItems.length === 0) return null;
        return (
          <section key={key} className="mb-8">
            <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-ink/30 md:hidden">
              {labels[key]}
            </h3>
            <div className="grid gap-x-5 gap-y-6 grid-cols-2 min-[768px]:grid-cols-3 min-[1320px]:grid-cols-4">
              {groupItems.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  batchMode={batchMode}
                  selected={selectedIds.has(item.id)}
                  onSelectToggle={onSelectToggle}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </section>
        );
      })}
      {hasNextPage && (
        <div ref={sentinelRef} className="h-10" aria-hidden="true">
          {isFetchingNextPage && <p className="text-center text-[12px] text-ink/30">Loading…</p>}
        </div>
      )}
    </div>
  );
}
