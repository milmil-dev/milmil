// web/src/components/downloads/episode-rows/EpisodeRowActive.tsx

import { Delete02Icon, PauseIcon, PlayIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { cn } from '@/lib/utils';

export type ActiveStatus = 'active' | 'paused' | 'waiting';

interface Props {
  gid: string;
  episodeLabel: string;
  downloadedBytes: number;
  totalBytes: number;
  speedBytes: number;
  etaSeconds: number;
  percent: number;
  status: ActiveStatus;
  onPause: (gid: string) => void;
  onResume: (gid: string) => void;
  onDelete: (gid: string) => void;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}
function fmtEta(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function EpisodeRowActive({
  gid,
  episodeLabel,
  downloadedBytes,
  totalBytes,
  speedBytes,
  etaSeconds,
  percent,
  status,
  onPause,
  onResume,
  onDelete,
}: Props) {
  const { i18n } = useLingui();
  const isActive = status === 'active';
  const isPaused = status === 'paused';
  return (
    <div className="group grid grid-cols-[92px_1fr_80px_70px_50px] gap-5 items-center px-2 py-[9px] rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className="text-center text-[11px] font-semibold tabular-nums tracking-[0.04em] text-[#4ade80]">
        {episodeLabel}
      </div>
      <div className="text-[12px] text-white/65 tabular-nums truncate">
        <span className="text-white/90 font-medium mr-1">
          {fmt(downloadedBytes)} / {fmt(totalBytes)}
        </span>
        <span className="text-white/25 mx-1.5">·</span>
        <span>{fmt(speedBytes)}/s</span>
      </div>
      <div className="h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
        <div
          data-testid="ep-bar-fill"
          className={cn(
            'h-full bg-[rgba(74,222,128,0.85)] rounded-sm',
            isActive && 'animate-[pulse_2.2s_ease-in-out_infinite]'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] text-white/25 tabular-nums text-right">
        {etaSeconds > 0 ? fmtEta(etaSeconds) : ''}
      </div>
      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        {isActive && (
          <button
            type="button"
            aria-label={i18n._(msg`downloads.pause`)}
            onClick={() => onPause(gid)}
            className="text-white/35 hover:text-white/75"
          >
            <HugeiconsIcon icon={PauseIcon} size={12} />
          </button>
        )}
        {isPaused && (
          <button
            type="button"
            aria-label={i18n._(msg`downloads.resume`)}
            onClick={() => onResume(gid)}
            className="text-white/35 hover:text-white/75"
          >
            <HugeiconsIcon icon={PlayIcon} size={12} />
          </button>
        )}
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-white/35 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
      <div className="col-start-5 text-[11px] text-white/65 tabular-nums text-right font-medium">
        {percent}%
      </div>
    </div>
  );
}
