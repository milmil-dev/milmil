import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo, useState } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Block keywords button → opens modal */}
      <BlockKeywordsModal />

      {/* Danmaku list */}
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">
          {i18n._(msg`watch.danmaku.noData`)}
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
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
      )}
    </div>
  );
}

/* ── Block Keywords Modal ── */

function BlockKeywordsModal() {
  const { i18n } = useLingui();
  const [newKeyword, setNewKeyword] = useState('');
  const blockKeywords = usePreferencesStore((s) => s.danmakuBlockKeywords);
  const update = usePreferencesStore((s) => s.updatePreference);

  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !blockKeywords.includes(kw)) {
      update('danmakuBlockKeywords', [...blockKeywords, kw]);
    }
    setNewKeyword('');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] transition-all',
            blockKeywords.length > 0
              ? 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
              : 'text-white/25 hover:bg-white/[0.04] hover:text-white/40'
          )}
        >
          {/* Shield icon */}
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
            <path
              d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
            />
            {blockKeywords.length > 0 && (
              <path d="M5.5 8L7 9.5 10.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <span>{i18n._(msg`watch.danmaku.blockKeywords`)}</span>
          {blockKeywords.length > 0 && (
            <span className="text-[9px] bg-white/[0.08] text-white/40 rounded-full px-1.5 py-0.5 leading-none tabular-nums">
              {blockKeywords.length}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-[#1c1c1c] border-white/[0.06]" data-settings-panel>
        <DialogHeader>
          <DialogTitle className="text-white/80">
            {i18n._(msg`watch.danmaku.blockKeywords`)}
          </DialogTitle>
        </DialogHeader>

        {/* Add keyword input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            placeholder={i18n._(msg`watch.danmaku.blockPlaceholder`)}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/15"
          />
          <button
            type="button"
            onClick={addKeyword}
            disabled={!newKeyword.trim()}
            className="shrink-0 text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-30 transition-colors"
          >
            {i18n._(msg`watch.danmaku.addBlock`)}
          </button>
        </div>

        {/* Keywords list */}
        {blockKeywords.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/20">
            {i18n._(msg`watch.danmaku.noBlockKeywords`)}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto py-1">
              {blockKeywords.map((kw, idx) => (
                <span
                  key={`${kw}-${idx}`}
                  className="inline-flex items-center gap-1.5 bg-white/[0.06] text-sm text-white/60 rounded-lg px-3 py-1.5 group"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => update('danmakuBlockKeywords', blockKeywords.filter((_, i) => i !== idx))}
                    className="text-white/20 group-hover:text-white/50 hover:!text-red-400/70 transition-colors"
                  >
                    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => update('danmakuBlockKeywords', [])}
                className="text-[12px] text-red-400/50 hover:text-red-400/80 transition-colors"
              >
                {i18n._(msg`watch.danmaku.clearAllBlock`)}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
