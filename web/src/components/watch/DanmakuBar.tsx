import { Setting07Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { DanmakuSettingsControls } from '@/components/DanmakuSettings';

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendDanmaku();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {/* Label */}
      <span className="shrink-0 text-xs text-mm-text-secondary">
        {i18n._(msg`watch.danmaku`)} ({danmakuCount})
      </span>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={i18n._(msg`watch.danmaku.placeholder`)}
        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2.5 py-1 text-xs text-mm-text placeholder:text-mm-text-muted outline-none focus:border-mm-accent/40 transition-colors"
      />

      {/* Send button */}
      <button
        type="button"
        onClick={sendDanmaku}
        disabled={!text.trim() || !fileId}
        className="shrink-0 bg-mm-accent/80 text-black font-medium text-xs px-3 py-1 rounded transition-colors hover:bg-mm-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {i18n._(msg`watch.danmaku.send`)}
      </button>

      {/* Settings gear */}
      <div className="relative">
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
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full right-0 mb-2 w-52 rounded-lg border border-mm-border bg-mm-bg p-3"
            >
              <DanmakuSettingsControls />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
