import { InformationCircleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '../lib/utils';

interface EpisodeListItemProps {
  sort: number;
  title: string;
  titleOriginal?: string;
  isActive: boolean;
  href: string;
  airDate?: string;
  synopsis?: string;
  image?: string;
  duration?: number; // minutes
  progress?: number;
}

function isAired(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
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
}: EpisodeListItemProps) {
  const { i18n } = useLingui();
  const aired = isAired(airDate);
  const [imgFailed, setImgFailed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const hasImage = !imgFailed && image?.startsWith('http');

  const durationLabel =
    duration && duration > 0 ? `${duration}${i18n._(msg`common.minuteShort`)}` : null;

  const hasMeta = synopsis || (titleOriginal && titleOriginal !== title) || airDate;

  return (
    <div className="relative">
      <Link
        to={href}
        className={cn(
          'group relative flex gap-4 rounded-lg p-2 transition-all duration-200',
          isActive
            ? 'bg-mm-accent/8 ring-1 ring-mm-accent/25'
            : aired
              ? 'hover:bg-white/[0.05]'
              : 'opacity-40 hover:opacity-60'
        )}
      >
        {/* Thumbnail */}
        {hasImage ? (
          <div className="shrink-0 w-[200px] h-[130px] rounded-md overflow-hidden relative bg-white/[0.03]">
            <img
              src={image}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgFailed(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
                : 'bg-white/[0.05] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white/60'
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
                isActive ? 'text-mm-accent' : 'text-white/50'
              )}
            >
              {i18n._(msg`episode.prefix`)}
              {sort}
              {i18n._(msg`episode.suffix`)}
            </span>
            {durationLabel && (
              <span className="text-[12px] text-white/30 tabular-nums">{durationLabel}</span>
            )}
          </div>

          <p
            className={cn(
              'text-[14px] font-bold leading-snug mt-0.5 transition-colors',
              hasImage ? 'line-clamp-1' : 'truncate',
              isActive ? 'text-mm-accent' : 'text-white/90 group-hover:text-white'
            )}
          >
            {title}
          </p>

          {synopsis ? (
            <p className="text-[12px] text-white/35 line-clamp-2 mt-1 leading-relaxed">
              {synopsis.replace(/<[^>]+>/g, '')}
            </p>
          ) : titleOriginal && titleOriginal !== title ? (
            <p className="text-[12px] text-white/25 truncate mt-0.5">{titleOriginal}</p>
          ) : null}

          {!hasImage && progress !== undefined && progress > 0 && (
            <div className="w-full max-w-[120px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-2">
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
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
            >
              <HugeiconsIcon icon={InformationCircleIcon} size={16} />
            </button>
          )}
          {!hasImage && airDate && (
            <span
              className={cn(
                'text-[11px] tabular-nums',
                isActive ? 'text-mm-accent/60' : 'text-white/20'
              )}
            >
              {airDate}
            </span>
          )}
        </div>
      </Link>

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
                backgroundColor: 'oklch(14% 0.01 260 / 0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* Popover header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-mm-accent tabular-nums">
                  {i18n._(msg`episode.prefix`)}
                  {sort}
                  {i18n._(msg`episode.suffix`)}
                </span>
                {durationLabel && (
                  <span className="text-[11px] text-white/30">{durationLabel}</span>
                )}
                {airDate && (
                  <span className="text-[11px] text-white/25 tabular-nums">{airDate}</span>
                )}
              </div>

              {/* Title */}
              <p className="text-[13px] font-bold text-white">{title}</p>
              {titleOriginal && titleOriginal !== title && (
                <p className="text-[11px] text-white/30 mt-0.5">{titleOriginal}</p>
              )}

              {/* Synopsis — full, not clamped */}
              {synopsis && (
                <p className="text-[12px] text-white/45 mt-2 leading-relaxed max-h-[160px] overflow-y-auto">
                  {synopsis.replace(/<[^>]+>/g, '')}
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
