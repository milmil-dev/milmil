import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { cn } from '@/lib/utils';

interface DanmakuListProps {
  comments: DanmakuComment[];
  onSeek: (time: number) => void;
}

const ITEM_HEIGHT = 32;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DanmakuList({ comments, onSeek }: DanmakuListProps) {
  const { i18n } = useLingui();
  const parentRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...comments].sort((a, b) => a.time - b.time),
    [comments]
  );

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-white/30">
        {i18n._(msg`watch.danmaku.noData`)}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-[400px] overflow-y-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const comment = sorted[virtualItem.index]!;
          return (
            <button
              key={virtualItem.index}
              type="button"
              onClick={() => onSeek(comment.time)}
              className={cn(
                'absolute left-0 w-full flex items-start gap-3 px-2 py-1.5 text-left rounded transition-colors',
                'hover:bg-white/[0.05] group'
              )}
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <span className="shrink-0 text-[12px] tabular-nums text-blue-400/70 group-hover:text-blue-400 font-mono">
                {formatTime(comment.time)}
              </span>
              <span className="text-[13px] text-white/50 group-hover:text-white/70 truncate">
                {comment.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
