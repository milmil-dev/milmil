import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

interface RailEntry {
  key: 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'earlier';
  visible: boolean;
}

interface HistoryTimelineRailProps {
  visibleBuckets: RailEntry[];
}

export function HistoryTimelineRail({ visibleBuckets }: HistoryTimelineRailProps) {
  const { i18n } = useLingui();
  const labels: Record<RailEntry['key'], string> = {
    today: i18n._(msg`history.group.today`),
    yesterday: i18n._(msg`history.group.yesterday`),
    thisWeek: i18n._(msg`history.group.thisWeek`),
    lastWeek: i18n._(msg`history.group.lastWeek`),
    earlier: i18n._(msg`history.group.earlier`),
  };
  return (
    <aside
      className="relative hidden w-20 shrink-0 md:block"
      aria-hidden="true"
    >
      <div className="absolute left-[31px] top-0 bottom-0 w-px bg-white/[0.06]" />
      <div className="flex flex-col gap-6 pt-28">
        {visibleBuckets.filter((b) => b.visible).map((b, i) => (
          <div key={b.key} className="relative pl-5 text-[13px] font-semibold text-white/60">
            <span
              className={`absolute left-[calc(11px-0.5px)] top-1 h-[11px] w-[11px] rounded-full border-[1.5px] ${
                i === 0 ? 'border-mm-accent bg-mm-accent' : 'border-white/30 bg-mm-bg'
              }`}
            />
            {labels[b.key]}
          </div>
        ))}
      </div>
    </aside>
  );
}
