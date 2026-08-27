import { Clock01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import { stripTags } from '../lib/sanitize';

interface EpisodeListItemProps {
  sort: number;
  title: string;
  titleOriginal?: string;
  isActive: boolean;
  href?: string; // fallback link (for non-watch routes)
  bangumiId?: number; // anime bangumi ID — used for /watch/:animeId navigation
  episodeSort?: number; // episode sort number — passed as ?ep= search param
  airDate?: string;
  synopsis?: string;
  image?: string;
  duration?: number; // minutes
  progress?: number; // 0-1 fraction
  hasFile?: boolean; // default true for backward compat
  fileQuality?: string; // e.g. "1080p"
  completed?: boolean; // episode fully watched
}

function isAired(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
}

// daysUntil returns whole-day difference (target - now) ignoring time-of-day.
// Negative means in the past, 0 means today, 1 means tomorrow.
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((targetDay - today) / 86_400_000);
}

function formatMonthShort(dateStr: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(dateStr));
  } catch {
    return '';
  }
}

function formatWeekdayShort(dateStr: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(dateStr));
  } catch {
    return '';
  }
}

function dayOfMonth(dateStr: string): string {
  try {
    return String(new Date(dateStr).getDate());
  } catch {
    return '';
  }
}

export function EpisodeListItem({
  sort,
  title,
  titleOriginal,
  isActive,
  href,
  airDate,
  synopsis,
  image,
  duration,
  progress,
  hasFile = true,
  bangumiId,
  episodeSort,
  fileQuality,
  completed,
}: EpisodeListItemProps) {
  const { i18n } = useLingui();
  const aired = isAired(airDate);
  const [imgFailed, setImgFailed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const hasImage = !imgFailed && image?.startsWith('http');

  // Anime-calendar "ticket" treatment for unaired episodes. Three structural
  // pieces, each carrying its own visual personality:
  //   1. Calendar tile (left)  — month / day / weekday stacked, like a
  //      stub-tile from a real calendar; gradient ring keeps it interesting
  //      without going neon.
  //   2. Episode plate (middle) — "EP 55" in stylized mono with a thin
  //      mm-accent underline, evokes a Blu-ray promo card.
  //   3. Countdown chip (right) — pill with hourglass glyph + relative
  //      time. The closest-to-air entries get a gentle pulse.
  // Hover reveals a soft accent glow and slight lift so the row feels
  // tactile rather than dim/broken.
  const isUpcoming = !hasFile && !title && airDate && !aired;
  if (isUpcoming) {
    const diffDays = daysUntil(airDate);
    const day = dayOfMonth(airDate);
    const monthShort = formatMonthShort(airDate, i18n.locale);
    const weekdayShort = formatWeekdayShort(airDate, i18n.locale);

    let countdown = '';
    if (diffDays === 0) countdown = i18n._(msg`episode.airDate.today`);
    else if (diffDays === 1) countdown = i18n._(msg`episode.airDate.tomorrow`);
    else if (diffDays === 2) countdown = i18n._(msg`episode.airDate.dayAfterTomorrow`);
    else if (diffDays > 0 && diffDays <= 60)
      countdown = i18n._(msg`episode.airDate.inDays ${diffDays}`);

    const isImminent = diffDays >= 0 && diffDays <= 7;

    return (
      <div className="group relative flex items-stretch gap-3 rounded-lg pl-1 pr-2 py-1.5 transition-colors duration-200 hover:bg-ink/[0.02]">
        {/* Calendar tile — pure white/opacity, accent only when imminent */}
        <div
          className={cn(
            'shrink-0 w-12 flex flex-col items-center justify-center rounded-md py-1.5 text-center',
            'border border-ink/[0.06] bg-ink/[0.02]',
            'transition-colors duration-200',
            isImminent
              ? 'border-mm-accent/25 bg-mm-accent/[0.04]'
              : 'group-hover:border-ink/[0.10] group-hover:bg-ink/[0.03]'
          )}
        >
          <span className="text-[9px] uppercase tracking-[0.10em] text-ink/35 leading-none">
            {monthShort}
          </span>
          <span className="text-[17px] font-semibold tabular-nums leading-none mt-1 text-ink/80">
            {day}
          </span>
          <span className="text-[9px] text-ink/25 leading-none mt-1">{weekdayShort}</span>
        </div>

        {/* Episode plate — quiet typography, no accent decoration */}
        <div className="flex-1 flex flex-col justify-center min-w-0 gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-medium tracking-[0.12em] text-ink/35">EP</span>
            <span className="text-[17px] font-semibold tabular-nums leading-none text-ink/80 group-hover:text-ink/95 transition-colors">
              {sort}
            </span>
          </div>
          <span className="text-[10px] tracking-[0.10em] text-ink/25">
            {i18n._(msg`episode.upcoming`)}
          </span>
        </div>

        {/* Countdown chip — accent reserved for the imminent tier (≤7d) */}
        {countdown && (
          <div
            className={cn(
              'shrink-0 self-center flex items-center gap-1.5 px-2 py-1 rounded-full',
              'border transition-colors duration-200',
              isImminent
                ? 'border-mm-accent/20 bg-mm-accent/[0.06] text-mm-accent/85'
                : 'border-ink/[0.06] bg-ink/[0.02] text-ink/45 group-hover:border-ink/[0.10] group-hover:text-ink/55'
            )}
          >
            <HugeiconsIcon icon={Clock01Icon} className="size-3" aria-hidden="true" />
            <span className="text-[11px] font-medium tabular-nums whitespace-nowrap">
              {countdown}
            </span>
          </div>
        )}
      </div>
    );
  }

  const durationLabel =
    duration && duration > 0 ? `${duration}${i18n._(msg`common.minuteShort`)}` : null;

  const hasMeta = synopsis || (titleOriginal && titleOriginal !== title) || airDate;

  const innerContent = (
    <>
      {/* Thumbnail */}
      {hasImage ? (
        <div className="shrink-0 w-[200px] h-[130px] rounded-md overflow-hidden relative bg-ink/[0.03]">
          <img
            src={image}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Play overlay — only when hasFile */}
          {hasFile && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-md">
              <div className="w-6 h-6 rounded-full bg-mm-accent/90 flex items-center justify-center">
                <span className="text-white text-[8px] ml-0.5">▶</span>
              </div>
            </div>
          )}

          {/* Completed checkmark badge */}
          {completed && (
            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-500/80 flex items-center justify-center">
              <span className="text-white text-[8px]">✓</span>
            </div>
          )}

          {progress !== undefined && progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/40">
              <div
                className="h-full bg-mm-accent"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'shrink-0 w-11 h-11 my-auto rounded-md flex items-center justify-center text-[15px] font-bold tabular-nums transition-colors',
            isActive
              ? 'bg-mm-accent text-black'
              : 'bg-ink/[0.05] text-ink/40 group-hover:bg-ink/[0.08] group-hover:text-ink/60'
          )}
        >
          {sort}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[12px] font-bold tabular-nums',
              isActive ? 'text-mm-accent' : 'text-ink/50'
            )}
          >
            {i18n._(msg`episode.prefix`)}
            {sort}
            {i18n._(msg`episode.suffix`)}
          </span>
          {!hasFile && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-ink/30">
              {i18n._(msg`episode.noFile`)}
            </span>
          )}
          {durationLabel && (
            <span className="text-[12px] text-ink/30 tabular-nums">{durationLabel}</span>
          )}
          {fileQuality && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-ink/50">
              {fileQuality}
            </span>
          )}
        </div>

        {title && (
          <p
            className={cn(
              'text-[14px] font-bold leading-snug mt-0.5 transition-colors',
              hasImage ? 'line-clamp-1' : 'truncate',
              isActive ? 'text-mm-accent' : 'text-ink/90 group-hover:text-ink'
            )}
          >
            {title}
          </p>
        )}

        {synopsis ? (
          <p className="text-[12px] text-ink/35 line-clamp-2 mt-1 leading-relaxed">
            {stripTags(synopsis)}
          </p>
        ) : titleOriginal && titleOriginal !== title ? (
          <p className="text-[12px] text-ink/25 truncate mt-0.5">{titleOriginal}</p>
        ) : null}

        {!hasImage && progress !== undefined && progress > 0 && (
          <div className="w-full max-w-[120px] h-[3px] rounded-full bg-ink/[0.06] overflow-hidden mt-2">
            <div
              className="h-full bg-mm-accent rounded-full"
              style={{ width: `${Math.min(progress * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Right side — info button + date */}
      <div className="shrink-0 flex flex-col items-end justify-between py-0.5">
        {hasMeta && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowInfo((v) => !v);
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-ink/20 hover:text-ink/50 hover:bg-ink/[0.06] transition-colors"
          >
            <HugeiconsIcon icon={InformationCircleIcon} size={16} />
          </button>
        )}
        {!hasImage && airDate && (
          <span
            className={cn(
              'text-[11px] tabular-nums',
              isActive ? 'text-mm-accent/60' : 'text-ink/20'
            )}
          >
            {airDate}
          </span>
        )}
      </div>
    </>
  );

  const wrapperClassName = cn(
    'group relative flex gap-4 rounded-lg p-2 transition-all duration-200',
    !hasFile
      ? 'opacity-40 cursor-default'
      : isActive
        ? 'bg-mm-accent/8 ring-1 ring-mm-accent/25'
        : aired
          ? 'hover:bg-ink/[0.05]'
          : 'opacity-40 hover:opacity-60'
  );

  return (
    <div className="relative">
      {hasFile ? (
        bangumiId ? (
          <Link
            to="/watch/$animeId"
            params={{ animeId: String(bangumiId) }}
            search={{ ep: episodeSort }}
            className={wrapperClassName}
          >
            {innerContent}
          </Link>
        ) : href ? (
          <Link to={href} className={wrapperClassName}>
            {innerContent}
          </Link>
        ) : (
          <div className={wrapperClassName}>{innerContent}</div>
        )
      ) : (
        <div className={wrapperClassName}>{innerContent}</div>
      )}

      {/* Info popover — Seanime style */}
      <AnimatePresence>
        {showInfo && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-2 top-full mt-1 z-50 w-[320px] rounded-lg p-4 shadow-xl"
              style={{
                backgroundColor: 'var(--mm-glass)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--mm-border-subtle)',
              }}
            >
              {/* Popover header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-mm-accent tabular-nums">
                  {i18n._(msg`episode.prefix`)}
                  {sort}
                  {i18n._(msg`episode.suffix`)}
                </span>
                {durationLabel && <span className="text-[11px] text-ink/30">{durationLabel}</span>}
                {airDate && <span className="text-[11px] text-ink/25 tabular-nums">{airDate}</span>}
              </div>

              {/* Title */}
              <p className="text-[13px] font-bold text-ink">{title}</p>
              {titleOriginal && titleOriginal !== title && (
                <p className="text-[11px] text-ink/30 mt-0.5">{titleOriginal}</p>
              )}

              {/* Synopsis — full, not clamped */}
              {synopsis && (
                <p className="text-[12px] text-ink/45 mt-2 leading-relaxed max-h-[160px] overflow-y-auto">
                  {stripTags(synopsis)}
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
