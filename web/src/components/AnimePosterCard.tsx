import type { ReactNode } from 'react';
import { animeGradient } from '../lib/gradient';

interface AnimePosterCardProps {
  title: string;
  coverUrl?: string | null;
  /** Overlay badges/buttons rendered inside the poster area */
  children?: ReactNode;
  className?: string;
}

/**
 * Shared poster card used by Collection, Schedule, and other grid views.
 * Renders cover image (or gradient fallback), title below (centered),
 * and accepts children for overlay badges positioned absolutely.
 */
export function AnimePosterCard({ title, coverUrl, children, className }: AnimePosterCardProps) {
  const hasCover = coverUrl?.startsWith('http');

  return (
    <div className={className}>
      {/* Poster */}
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden">
        {hasCover ? (
          <img
            src={coverUrl!}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full" style={{ background: animeGradient(title) }} />
        )}
        {children}
      </div>

      {/* Title */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="text-sm text-white/80 line-clamp-2 leading-snug">{title}</p>
      </div>
    </div>
  );
}
