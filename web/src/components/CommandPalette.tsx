import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { useCommandPaletteStore } from '../store/command-palette-store';

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, toggle, close]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: discoverKeys.search(debouncedQuery),
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  const visibleResults = results.slice(0, 6);

  const handleSelect = (bangumiId: number) => {
    close();
    navigate({ to: `/anime/${bangumiId}` as string });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && visibleResults[selectedIndex]) {
      handleSelect(visibleResults[selectedIndex].bangumi_id);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 top-[20%] left-1/2 -translate-x-1/2 w-full max-w-[500px] rounded-lg border overflow-hidden bg-mm-surface"
            style={{
              borderColor: 'oklch(18% 0.01 280)',
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: 'oklch(15% 0.01 280)' }}
            >
              <HugeiconsIcon icon={Search01Icon} size={16} className="text-mm-text-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="搜索動畫..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-mm-text-muted outline-none"
              />
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded text-mm-text-tertiary"
                style={{
                  backgroundColor: 'oklch(15% 0.01 280)',
                }}
              >
                ESC
              </kbd>
            </div>

            {visibleResults.length > 0 && (
              <div className="max-h-[50vh] overflow-y-auto py-1">
                {visibleResults.map((anime, i) => {
                  const hasCover = anime.cover_image?.startsWith('http');
                  return (
                    <button
                      type="button"
                      key={anime.bangumi_id}
                      onClick={() => handleSelect(anime.bangumi_id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        backgroundColor:
                          i === selectedIndex ? 'oklch(14% 0.01 280)' : 'transparent',
                      }}
                    >
                      <div
                        className="shrink-0 w-8 h-11 rounded overflow-hidden"
                        style={hasCover ? undefined : { background: animeGradient(anime.title) }}
                      >
                        {hasCover && (
                          <img
                            src={anime.cover_image}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate">{anime.title}</p>
                        <p className="text-[11px] truncate text-mm-text-tertiary">
                          {anime.title_original}
                        </p>
                      </div>
                      {anime.score > 0 && (
                        <span className="text-[11px] font-medium shrink-0 text-mm-accent">
                          {anime.score.toFixed(1)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {debouncedQuery && visibleResults.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-mm-text-tertiary">找不到結果</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
