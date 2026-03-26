import { Link } from '@tanstack/react-router';
import { cn } from '../lib/utils';

interface EpisodeListItemProps {
  sort: number;
  title: string;
  isActive: boolean;
  href: string;
  airDate?: string;
  progress?: number;
}

export function EpisodeListItem({
  sort,
  title,
  isActive,
  href,
  airDate,
  progress,
}: EpisodeListItemProps) {
  return (
    <Link
      to={href}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
        isActive
          ? 'bg-mm-accent/10 text-mm-accent'
          : 'text-mm-text-secondary hover:bg-white/[0.04] hover:text-mm-text-primary'
      )}
    >
      {/* Episode number */}
      <span
        className={cn(
          'shrink-0 w-7 text-center text-[13px] font-bold tabular-nums',
          isActive ? 'text-mm-accent' : 'text-mm-text-muted'
        )}
      >
        {sort}
      </span>

      {/* Title + metadata */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-[13px] font-medium truncate', isActive && 'text-mm-accent')}>
          {title}
        </p>
        {airDate && (
          <p className="text-[10px] mt-0.5 text-mm-text-muted">{airDate}</p>
        )}
      </div>

      {/* Progress indicator */}
      {progress !== undefined && progress > 0 && (
        <div className="shrink-0 w-8 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-mm-accent rounded-full"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      )}
    </Link>
  );
}
