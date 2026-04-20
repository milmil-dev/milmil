import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useMemo, useState } from 'react';
import type { DanmakuComment } from '@/lib/api/stream';
import { cn } from '@/lib/utils';
import { usePreferencesStore } from '@/store/preferences-store';

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
  const [showBlock, setShowBlock] = useState(false);
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
    <div className="flex flex-col gap-2">
      {/* Block keywords toggle + panel */}
      <div>
        <button
          type="button"
          onClick={() => setShowBlock((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/50 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="w-3.5 h-3.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M4.5 11.5l7-7" />
          </svg>
          {i18n._(msg`watch.danmaku.blockKeywords`)}
          {blockKeywords.length > 0 && (
            <span className="text-[10px] text-white/20">({blockKeywords.length})</span>
          )}
          <svg viewBox="0 0 12 12" fill="currentColor" className={cn('w-2.5 h-2.5 text-white/20 transition-transform', showBlock && 'rotate-180')}>
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        <AnimatePresence>
          {showBlock && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-2">
                {/* Input */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                    placeholder={i18n._(msg`watch.danmaku.blockPlaceholder`)}
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white placeholder:text-white/15 outline-none focus:border-white/15"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    disabled={!newKeyword.trim()}
                    className="shrink-0 text-[11px] text-white/40 hover:text-white/70 px-1.5 rounded bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Keywords */}
                {blockKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {blockKeywords.map((kw, idx) => (
                      <span
                        key={`${kw}-${idx}`}
                        className="inline-flex items-center gap-1 bg-white/[0.06] text-[10px] text-white/50 rounded px-1.5 py-0.5"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => update('danmakuBlockKeywords', blockKeywords.filter((_, i) => i !== idx))}
                          className="text-white/20 hover:text-white/50 transition-colors"
                        >
                          <svg viewBox="0 0 8 8" className="w-2 h-2">
                            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                          </svg>
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => update('danmakuBlockKeywords', [])}
                      className="text-[10px] text-red-400/40 hover:text-red-400/70 px-1 transition-colors"
                    >
                      {i18n._(msg`watch.danmaku.clearAllBlock`)}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Danmaku list */}
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-white/30">
          {i18n._(msg`watch.danmaku.noData`)}
        </div>
      ) : (
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
      )}
    </div>
  );
}
