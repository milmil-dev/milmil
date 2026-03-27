import { Link } from '@tanstack/react-router';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

interface ContinueWatchingCardProps {
  title: string;
  episodeLabel: string;
  progress: number;
  coverImage: string;
  href: string;
  className?: string;
}

export function ContinueWatchingCard({
  title,
  episodeLabel,
  progress,
  coverImage,
  href,
  className,
}: ContinueWatchingCardProps) {
  const hasCover = coverImage?.startsWith('http');

  return (
    <Link
      to={href}
      className={cn(
        'group block rounded-lg overflow-hidden hover:ring-1 hover:ring-white/[0.06] transition-all duration-200',
        className
      )}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video overflow-hidden"
        style={hasCover ? undefined : { background: animeGradient(title) }}
      >
        {hasCover && (
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, oklch(from var(--mm-bg) l c h / 0.8), transparent 50%)',
          }}
        />
        {/* Play icon overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="black">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
          <div
            className="h-full bg-mm-accent rounded-r-full transition-[width] duration-300"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="text-[12px] font-semibold text-white truncate">{title}</p>
        <p className="text-[10px] mt-0.5 text-mm-text-tertiary">{episodeLabel}</p>
      </div>
    </Link>
  );
}
