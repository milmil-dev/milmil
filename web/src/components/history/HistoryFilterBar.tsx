import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { HistoryFilter } from '@/lib/api/history';

interface HistoryFilterBarProps {
  filter: HistoryFilter;
  onFilterChange: (f: HistoryFilter) => void;
  q: string;
  onQChange: (q: string) => void;
  onClearAll: () => void;
  batchMode: boolean;
  onToggleBatch: () => void;
}

export function HistoryFilterBar({
  filter,
  onFilterChange,
  q,
  onQChange,
  onClearAll,
  batchMode,
  onToggleBatch,
}: HistoryFilterBarProps) {
  const { i18n } = useLingui();
  const [local, setLocal] = useState(q);

  // Debounce q → parent by 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== q) onQChange(local);
    }, 300);
    return () => clearTimeout(t);
  }, [local, q, onQChange]);

  useEffect(() => {
    // Keep local in sync when parent (URL) changes externally.
    setLocal(q);
  }, [q]);

  const tabs: { key: HistoryFilter; label: string }[] = [
    { key: 'all', label: i18n._(msg`history.tab.all`) },
    { key: 'in_progress', label: i18n._(msg`history.tab.inProgress`) },
    { key: 'completed', label: i18n._(msg`history.tab.completed`) },
  ];

  return (
    <div className="mb-7 flex items-center gap-4">
      <div className="flex gap-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onFilterChange(t.key)}
            className={cn(
              'relative cursor-pointer pb-3 pt-2 text-[14px] font-semibold transition-colors',
              filter === t.key ? 'text-white' : 'text-white/40 hover:text-white/60'
            )}
          >
            {t.label}
            {filter === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-sm bg-mm-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={i18n._(msg`history.searchPlaceholder`)}
          className="w-48 bg-transparent text-[13px] text-white placeholder:text-white/30 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className="cursor-pointer rounded-md bg-white/[0.03] px-3 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        {i18n._(msg`history.clearAll`)}
      </button>
      <button
        type="button"
        onClick={onToggleBatch}
        className={cn(
          'cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
          batchMode
            ? 'bg-white/[0.1] text-white'
            : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white'
        )}
      >
        {i18n._(msg`history.batch`)}
      </button>
    </div>
  );
}
