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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: trimmed }),
    });
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {/* On/Off switch (leftmost) */}
      <button
        type="button"
        onClick={() => update('danmakuEnabled', !enabled)}
        className={cn(
          'shrink-0 w-8 h-[18px] rounded-full transition-colors relative',
          enabled ? 'bg-white/20' : 'bg-white/[0.08]'
        )}
      >
        <div className={cn(
          'absolute top-[3px] w-3 h-3 rounded-full transition-all',
          enabled ? 'left-[17px] bg-white' : 'left-[3px] bg-white/40'
        )} />
      </button>

      {/* Settings gear */}
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="p-1 rounded text-mm-text-secondary hover:text-mm-text transition-colors"
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
      <span className="shrink-0 text-xs text-mm-text-secondary">
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
        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-mm-text placeholder:text-mm-text-muted outline-none focus:border-white/15 transition-colors"
      />

      {/* Send button */}
      <button
        type="button"
        onClick={sendDanmaku}
        disabled={!text.trim() || !fileId}
        className="shrink-0 bg-white/[0.08] text-white/70 font-medium text-xs px-3 py-1 rounded transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {i18n._(msg`watch.danmaku.send`)}
      </button>
    </div>
  );
}
