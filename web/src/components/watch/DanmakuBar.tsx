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
      {/* Danmaku on/off — iconic button */}
      <button
        type="button"
        onClick={() => update('danmakuEnabled', !enabled)}
        title={enabled ? i18n._(msg`watch.danmaku.clickToDisable`) : i18n._(msg`watch.danmaku.clickToEnable`)}
        className={cn(
          'shrink-0 flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full transition-all',
          enabled
            ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
            : 'bg-white/[0.04] text-white/25 hover:bg-white/[0.08] hover:text-white/40'
        )}
      >
        {/* Danmaku icon — three horizontal flying lines */}
        <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
          <rect x="1" y="4" width="12" height="2.5" rx="1.25" fill="currentColor" opacity={enabled ? 1 : 0.5} />
          <rect x="5" y="9" width="14" height="2.5" rx="1.25" fill="currentColor" opacity={enabled ? 0.7 : 0.35} />
          <rect x="2" y="14" width="10" height="2.5" rx="1.25" fill="currentColor" opacity={enabled ? 0.5 : 0.25} />
        </svg>
        <span className="text-[11px] font-medium">
          {enabled ? 'ON' : 'OFF'}
        </span>
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
