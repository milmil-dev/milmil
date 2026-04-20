import { Setting07Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DanmakuSettingsControls } from '@/components/DanmakuSettings';
import { usePreferencesStore } from '@/store/preferences-store';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

interface DanmakuBarProps {
  fileId: string | null;
  danmakuCount: number;
}

export function DanmakuBar({ fileId, danmakuCount }: DanmakuBarProps) {
  const { i18n } = useLingui();
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const enabled = usePreferencesStore((s) => s.danmakuEnabled);
  const update = usePreferencesStore((s) => s.updatePreference);

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const sendDanmaku = async () => {
    const trimmed = text.trim();
    if (!trimmed || !fileId) return;
    const token = localStorage.getItem('milmil-token') ?? '';
    await fetch(`${API_URL}/api/v1/danmaku/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: trimmed }),
    });
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      {/* Danmaku on/off — animated icon button */}
      <button
        type="button"
        onClick={() => update('danmakuEnabled', !enabled)}
        title={enabled ? i18n._(msg`watch.danmaku.clickToDisable`) : i18n._(msg`watch.danmaku.clickToEnable`)}
        className={cn(
          'shrink-0 flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-full transition-all duration-300',
          enabled
            ? 'bg-white/[0.12] text-white hover:bg-white/[0.18]'
            : 'bg-white/[0.04] text-white/25 hover:bg-white/[0.08] hover:text-white/40'
        )}
      >
        <svg viewBox="0 0 22 18" className="w-[18px] h-[15px] overflow-visible">
          {/* Three flying danmaku lines */}
          <motion.rect
            x="1" y="1" height="2" rx="1" fill="currentColor"
            animate={{ width: enabled ? 13 : 6, opacity: enabled ? 1 : 0.3, x: enabled ? 1 : 3 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
          <motion.rect
            x="4" y="8" height="2" rx="1" fill="currentColor"
            animate={{ width: enabled ? 16 : 8, opacity: enabled ? 0.75 : 0.2, x: enabled ? 4 : 5 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.04 }}
          />
          <motion.rect
            x="2" y="15" height="2" rx="1" fill="currentColor"
            animate={{ width: enabled ? 11 : 5, opacity: enabled ? 0.55 : 0.15, x: enabled ? 2 : 4 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.08 }}
          />
          {/* Strikethrough line when OFF */}
          <motion.line
            x1="0" y1="17" x2="22" y2="1"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            animate={{ opacity: enabled ? 0 : 0.5, pathLength: enabled ? 0 : 1 }}
            transition={{ duration: 0.25 }}
          />
        </svg>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={enabled ? 'on' : 'off'}
            initial={{ y: enabled ? 8 : -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: enabled ? -8 : 8, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="text-[11px] font-medium leading-none"
          >
            {enabled ? i18n._(msg`watch.danmaku.on`) : i18n._(msg`watch.danmaku.off`)}
          </motion.span>
        </AnimatePresence>
      </button>

      {/* Settings gear */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="p-1.5 rounded text-white/30 hover:text-white/60 transition-colors"
        >
          <HugeiconsIcon icon={Setting07Icon} size={16} strokeWidth={1.5} />
        </button>

        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full left-0 mb-2 rounded-lg border border-white/[0.06] bg-[#1a1a1a] overflow-hidden shadow-xl shadow-black/40"
            >
              <DanmakuSettingsControls />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <span className="shrink-0 text-[11px] text-white/30">
        {i18n._(msg`watch.danmaku.loaded`, { count: danmakuCount })}
      </span>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendDanmaku()}
        placeholder={i18n._(msg`watch.danmaku.placeholder`)}
        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/15 transition-colors"
      />

      {/* Send */}
      <button
        type="button"
        onClick={sendDanmaku}
        disabled={!text.trim() || !fileId}
        className="shrink-0 bg-white/[0.08] text-white/60 font-medium text-xs px-3 py-1.5 rounded transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {i18n._(msg`watch.danmaku.send`)}
      </button>
    </div>
  );
}
