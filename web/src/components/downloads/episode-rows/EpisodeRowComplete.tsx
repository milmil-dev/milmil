// web/src/components/downloads/episode-rows/EpisodeRowComplete.tsx

import { Delete02Icon, PlayIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

interface Props {
  gid: string;
  episodeLabel: string;
  filename: string;
  sizeBytes: number;
  completedAtRelative: string;
  onPlay: (gid: string) => void;
  onDelete: (gid: string) => void;
}

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function EpisodeRowComplete({
  gid,
  episodeLabel,
  filename,
  sizeBytes,
  completedAtRelative,
  onPlay,
  onDelete,
}: Props) {
  const { i18n } = useLingui();
  return (
    <div className="group grid grid-cols-[92px_1fr_auto_auto_auto] gap-5 items-center px-2 py-[9px] rounded-lg hover:bg-ink/[0.02] transition-colors">
      <div className="text-center text-[11px] font-semibold tabular-nums tracking-[0.04em] text-[rgba(74,222,128,0.7)]">
        {episodeLabel}
      </div>
      <div className="text-[12px] text-ink/65 truncate">{filename}</div>
      <div className="text-[11px] text-ink/45 tabular-nums">{fmt(sizeBytes)}</div>
      <div className="text-[11px] text-ink/25">{completedAtRelative}</div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label={i18n._(msg`downloads.play`)}
          onClick={() => onPlay(gid)}
          className="text-ink/35 hover:text-ink/75"
        >
          <HugeiconsIcon icon={PlayIcon} size={12} />
        </button>
        <button
          type="button"
          aria-label={i18n._(msg`downloads.delete`)}
          onClick={() => onDelete(gid)}
          className="text-ink/35 hover:text-red-400"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
      </div>
    </div>
  );
}
