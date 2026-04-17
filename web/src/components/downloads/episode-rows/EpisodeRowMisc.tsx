// web/src/components/downloads/episode-rows/EpisodeRowMisc.tsx

import { Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

interface Props {
  gid: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  status: 'active' | 'complete';
  onDelete: (gid: string) => void;
}
function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function EpisodeRowMisc({
  gid,
  filename,
  downloadedBytes,
  totalBytes,
  percent,
  status,
  onDelete,
}: Props) {
  const { i18n } = useLingui();
  return (
    <div className="group grid grid-cols-[1fr_80px_auto_auto] gap-4 items-center px-3 py-2 rounded-md hover:bg-white/[0.02]">
      <div className="text-[12px] text-white/65 truncate">{filename}</div>
      <div className="h-[2px] bg-[rgba(74,222,128,0.06)] rounded-sm overflow-hidden">
        <div
          className="h-full bg-[rgba(74,222,128,0.85)] rounded-sm"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] text-white/45 tabular-nums min-w-[110px] text-right">
        {status === 'complete' ? fmt(totalBytes) : `${fmt(downloadedBytes)} / ${fmt(totalBytes)}`}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/65 tabular-nums w-[34px] text-right font-medium">
          {percent}%
        </span>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-white/25 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
    </div>
  );
}
