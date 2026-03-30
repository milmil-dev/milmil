import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlayableEpisode } from '@/lib/api/anime';

interface EpisodeTitleOverlayProps {
  episode: PlayableEpisode | undefined;
}

export function EpisodeTitleOverlay({ episode }: EpisodeTitleOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [episode?.episode_id]);

  if (!episode) return null;

  const label = episode.title
    ? `第 ${episode.sort} 集 — ${episode.title}`
    : `第 ${episode.sort} 集`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-3 left-3 z-10 rounded-md bg-black/60 px-3 py-1.5 backdrop-blur-sm"
        >
          <span className="text-sm font-medium text-white">{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
