import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { cn } from '@/lib/utils';
import type { DanmakuComment } from '@/lib/api/stream';

interface DanmakuListProps {
  comments: DanmakuComment[];
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DanmakuList({ comments, onSeek }: DanmakuListProps) {
  const { i18n } = useLingui();

  const sorted = [...comments].sort((a, b) => a.time - b.time);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-white/30">
        {i18n._(msg`watch.danmaku.noData`)}
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <div className="flex flex-col">
        {sorted.map((comment, idx) => (
          <button
            key={`${comment.time}-${idx}`}
            type="button"
            onClick={() => onSeek(comment.time)}
            className={cn(
              'flex items-start gap-3 px-2 py-1.5 text-left rounded transition-colors',
              'hover:bg-white/[0.05] group',
            )}
          >
            <span className="shrink-0 text-[12px] tabular-nums text-blue-400/70 group-hover:text-blue-400 font-mono">
              {formatTime(comment.time)}
            </span>
            <span className="text-[13px] text-white/50 group-hover:text-white/70 truncate">
              {comment.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
