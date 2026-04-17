// web/src/components/downloads/AnimeEpisodeList.tsx
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

interface Props {
  expanded: boolean;
  children: ReactNode;
}

export function AnimeEpisodeList({ expanded, children }: Props) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div
            data-testid="card-divider"
            className="mx-4 h-px bg-white/[0.035]"
          />
          <div className="px-2 pt-1.5 pb-2.5 flex flex-col">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
