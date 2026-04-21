import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import type { WatchProgress } from '@/lib/api/progress';
import { animeGradient } from '@/lib/gradient';
import { cn } from '@/lib/utils';

interface HistoryCardProps {
  item: WatchProgress;
  onDelete: (id: string) => void;
  onSelectToggle?: (id: string) => void;
  selected?: boolean;
  batchMode?: boolean;
  className?: string;
}

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatEpisodeNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function cardHref(item: WatchProgress): string {
  const ep = formatEpisodeNumber(item.episode_number);
  if (item.anime_bangumi_id != null) {
    return `/watch/${item.anime_bangumi_id}?ep=${ep}`;
  }
  return `/anime/${item.anime_id}?ep=${ep}`;
}

export function HistoryCard({
  item,
  onDelete,
  onSelectToggle,
  selected,
  batchMode,
  className,
}: HistoryCardProps) {
  const { i18n } = useLingui();
  const hasCover = item.anime_cover_image?.startsWith('http');
  const title =
    (i18n.locale.startsWith('zh') ? item.anime_title_zh || item.anime_title : item.anime_title) ||
    'Unknown';
  const isCompleted = item.completed === 1;
  const progress =
    item.duration_seconds && item.duration_seconds > 0
      ? item.position_seconds / item.duration_seconds
      : 0;

  const timeLabel = isCompleted
    ? i18n._('history.finished')
    : item.duration_seconds && item.duration_seconds > 0
      ? `${formatSecs(item.position_seconds)} / ${formatSecs(item.duration_seconds)}`
      : formatSecs(item.position_seconds);

  const handleCardClick = (e: React.MouseEvent) => {
    if (batchMode && onSelectToggle) {
      e.preventDefault();
      onSelectToggle(item.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(item.id);
  };

  return (
    <Link
      to={cardHref(item)}
      onClick={handleCardClick}
      className={cn('group relative block', className)}
    >
      <div
        className={cn(
          'relative aspect-video overflow-hidden rounded-lg transition-all duration-200',
          selected && 'ring-2 ring-mm-accent'
        )}
        style={hasCover ? undefined : { background: animeGradient(title) }}
      >
        {hasCover && (
          <img
            src={item.anime_cover_image ?? ''}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent 50%)' }}
        />

        {/* EP badge */}
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-[3px] text-[11px] font-bold backdrop-blur">
          EP {formatEpisodeNumber(item.episode_number)}
        </div>

        {/* Time badge */}
        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-[2px] text-[11px] font-semibold tabular-nums backdrop-blur">
          {timeLabel}
        </div>

        {/* Delete button (shown on hover; hidden in batch mode since whole card is toggle-clickable) */}
        {!batchMode && (
          <button
            type="button"
            aria-label="delete"
            onClick={handleDelete}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/80 opacity-0 backdrop-blur transition-opacity duration-200 hover:bg-black/80 hover:text-white group-hover:opacity-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}

        {/* Batch checkbox */}
        {batchMode && (
          <div
            className={cn(
              'absolute left-2 bottom-2 flex h-5 w-5 items-center justify-center rounded-sm border transition-colors',
              selected ? 'border-mm-accent bg-mm-accent' : 'border-white/40 bg-black/40'
            )}
          >
            {selected && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
              >
                <path d="m5 13 4 4 10-10" />
              </svg>
            )}
          </div>
        )}

        {/* Progress bar */}
        {item.duration_seconds && item.duration_seconds > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
            <div
              className="h-full rounded-r-full bg-mm-accent transition-[width] duration-300"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-0.5 pt-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">{title}</p>
        <div className="mt-1 flex items-center justify-between text-[11px] text-mm-text-tertiary">
          <span>EP {formatEpisodeNumber(item.episode_number)}</span>
          <span>{new Date(item.last_watched_at).toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}
