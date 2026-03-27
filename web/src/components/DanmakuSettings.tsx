// web/src/components/DanmakuSettings.tsx
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/player-store';

const FONT_SIZES = [16, 20, 24] as const;

export function DanmakuSettings() {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const enabled = usePlayerStore((s) => s.danmakuEnabled);
  const opacity = usePlayerStore((s) => s.danmakuOpacity);
  const fontSize = usePlayerStore((s) => s.danmakuFontSize);
  const speed = usePlayerStore((s) => s.danmakuSpeed);
  const toggleDanmaku = usePlayerStore((s) => s.toggleDanmaku);
  const setOpacity = usePlayerStore((s) => s.setDanmakuOpacity);
  const setFontSize = usePlayerStore((s) => s.setDanmakuFontSize);
  const setSpeed = usePlayerStore((s) => s.setDanmakuSpeed);

  return (
    <div className="absolute top-3 right-3 z-20">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'px-2.5 py-1 text-[11px] font-medium rounded transition-colors',
          enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-secondary'
        )}
      >
        {i18n._(msg`watch.danmaku.short`)}
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute top-9 right-0 w-52 rounded-lg border border-mm-border bg-mm-bg p-3 space-y-3"
          >
            {/* On/Off */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-mm-text-secondary">
                {i18n._(msg`watch.danmaku`)}
              </span>
              <button
                type="button"
                onClick={toggleDanmaku}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium rounded',
                  enabled ? 'bg-mm-accent text-black' : 'bg-mm-surface text-mm-text-muted'
                )}
              >
                {enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Opacity */}
            <label className="block">
              <span className="text-[10px] text-mm-text-muted block mb-1">
                {i18n._(msg`watch.danmaku.opacity`)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1 accent-mm-accent"
              />
            </label>

            {/* Font size */}
            <div>
              <span className="text-[10px] text-mm-text-muted block mb-1">
                {i18n._(msg`watch.danmaku.fontSize`)}
              </span>
              <div className="flex gap-1">
                {FONT_SIZES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setFontSize(s)}
                    className={cn(
                      'flex-1 py-0.5 text-[10px] rounded transition-colors',
                      fontSize === s
                        ? 'bg-mm-accent text-black'
                        : 'bg-mm-surface text-mm-text-secondary'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Speed */}
            <div>
              <span className="text-[10px] text-mm-text-muted block mb-1">
                {i18n._(msg`watch.danmaku.speed`)}
              </span>
              <div className="flex gap-1">
                {[
                  { label: i18n._(msg`watch.danmaku.slow`), value: 100 },
                  { label: i18n._(msg`watch.danmaku.normal`), value: 144 },
                  { label: i18n._(msg`watch.danmaku.fast`), value: 200 },
                ].map((s) => (
                  <button
                    type="button"
                    key={s.value}
                    onClick={() => setSpeed(s.value)}
                    className={cn(
                      'flex-1 py-0.5 text-[10px] rounded transition-colors',
                      speed === s.value
                        ? 'bg-mm-accent text-black'
                        : 'bg-mm-surface text-mm-text-secondary'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
