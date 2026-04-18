// web/src/components/downloads/AnimeEpisodeList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'motion/react';
import { Children, type ReactNode, useRef } from 'react';

const VIRTUAL_THRESHOLD = 30;
const EPISODE_ROW_ESTIMATE_PX = 46;
const VIRTUAL_VIEWPORT_MAX_PX = 480;

interface Props {
  expanded: boolean;
  children: ReactNode;
}

export function AnimeEpisodeList({ expanded, children }: Props) {
  const items = Children.toArray(children);
  const shouldVirtualize = items.length > VIRTUAL_THRESHOLD;

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
            {shouldVirtualize ? <VirtualList items={items} /> : items}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function VirtualList({ items }: { items: ReactNode[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => EPISODE_ROW_ESTIMATE_PX,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      data-testid="episode-virtual-list"
      className="overflow-auto"
      style={{ maxHeight: VIRTUAL_VIEWPORT_MAX_PX }}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virt) => (
          <div
            key={virt.key}
            data-index={virt.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virt.start}px)`,
            }}
          >
            {items[virt.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
