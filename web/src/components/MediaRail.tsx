import { ArrowLeft02Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface MediaRailProps {
  children: ReactNode;
  className?: string;
}

export function MediaRail({ children, className }: MediaRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className={cn('group/rail relative', className)}>
      {/* Scroll container */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>

      {/* Left arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-2 w-10 flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity duration-200 z-10"
          style={{ background: 'linear-gradient(to right, var(--mm-bg), transparent)' }}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={20} className="text-ink" />
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-2 w-10 flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-opacity duration-200 z-10"
          style={{ background: 'linear-gradient(to left, var(--mm-bg), transparent)' }}
        >
          <HugeiconsIcon icon={ArrowRight02Icon} size={20} className="text-ink" />
        </button>
      )}

      {/* Right edge fade (always visible as scroll hint) */}
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-2 w-12 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--mm-bg), transparent)' }}
        />
      )}
    </div>
  );
}
