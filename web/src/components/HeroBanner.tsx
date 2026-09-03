import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import type { WatchProgress } from '../lib/api/progress';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
import { formatSeason } from '../lib/season';
import { cn } from '../lib/utils';
import { PreviewModal } from './PreviewModal';
import { Skeleton } from './Skeleton';
import { stripTags } from '../lib/sanitize';

const SLIDE_DURATION = 8000;

// Fade the scrim out before the hero's bottom edge, or it ends in a hard seam
// against the (taller) banner image it does not cover.
const SCRIM_FADE: React.CSSProperties = {
  maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
};

export function HeroBanner({
  items,
  onActiveChange,
  watchHistory,
}: {
  items: AnimeSummary[];
  onActiveChange?: (item: AnimeSummary) => void;
  watchHistory?: WatchProgress[];
}) {
  const { i18n } = useLingui();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Clamp: `items` can shrink under a stale index while a query refetches
  const featured = items[Math.min(activeIndex, items.length - 1)];

  const step = (delta: number) => setActiveIndex((i) => (i + delta + items.length) % items.length);

  // Notify parent when active item changes
  useEffect(() => {
    if (featured) onActiveChange?.(featured);
  }, [featured, onActiveChange]);

  // Auto-advance
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setTimeout(() => setActiveIndex((i) => (i + 1) % items.length), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [items.length, isPaused, activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    }
  };

  if (!featured) return null;

  // Find watch progress matching the currently featured anime
  const matchedWatch =
    watchHistory?.find((w) => w.anime_bangumi_id === featured.bangumi_id && w.completed !== 1) ??
    null;

  const hasCover = featured.cover_image?.startsWith('http');
  const seasonLabel = formatSeason(featured.air_date, i18n);
  const synopsis = featured.description ? stripTags(featured.description) : '';

  return (
    <div
      className="relative w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
      style={{ height: 'clamp(400px, 56vh, 520px)' }}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured anime"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* Scrim — darken under the copy for contrast, but keep the left edge
          (sidebar seam + poster) open so Home doesn't grow a hard
          vertical shadow against the rail. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]" style={SCRIM_FADE}>
        {/* Below md the copy spans the full width, so darken all of it; wider
            than that the artwork stays on show around the poster. */}
        <div className="absolute inset-0 bg-black/50 md:hidden" />
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            background:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.28) 14%, rgba(0,0,0,0.55) 36%, rgba(0,0,0,0.28) 58%, transparent 78%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-[2] h-full flex items-center">
        <div className="min-w-0 w-full px-6 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={featured.bangumi_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex items-center gap-6"
            >
              {/* Poster — floats with shadow depth */}
              <Link
                to={`/anime/${featured.bangumi_id}` as string}
                className="shrink-0 hidden md:block"
              >
                <PosterCard
                  src={hasCover ? featured.cover_image : undefined}
                  title={featured.title}
                />
              </Link>

              {/* Text content */}
              <div className="min-w-0 flex-1 space-y-3 max-w-[640px]">
                {/* Title */}
                <Link
                  to={`/anime/${featured.bangumi_id}` as string}
                  className="block cursor-pointer group"
                >
                  <h2
                    className="text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight line-clamp-2 group-hover:text-white/80 transition-colors"
                    style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}
                  >
                    {featured.title}
                  </h2>
                  {featured.title_original && featured.title_original !== featured.title && (
                    <p className="mt-1.5 text-[13px] text-white/45 truncate">
                      {featured.title_original}
                    </p>
                  )}
                </Link>

                {/* Meta row — score, season, episodes, type */}
                <div className="flex items-center gap-2.5 flex-wrap text-[13px]">
                  {featured.score > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-400 tabular-nums">
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                        <path d="M6 0.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L6 9.52 2.48 11.35l.67-3.93L.3 4.64l3.94-.57z" />
                      </svg>
                      {featured.score.toFixed(1)}
                    </span>
                  )}
                  {featured.media_type && (
                    <MetaItem showDivider={featured.score > 0}>{featured.media_type}</MetaItem>
                  )}
                  {seasonLabel && (
                    <MetaItem showDivider={featured.score > 0 || !!featured.media_type}>
                      {seasonLabel}
                    </MetaItem>
                  )}
                  {featured.episode_count > 0 && (
                    <MetaItem showDivider>
                      <span className="tabular-nums">
                        {featured.episode_count} {i18n._(msg`common.ep`)}
                      </span>
                    </MetaItem>
                  )}
                </div>

                {/* Genres */}
                {featured.genres && featured.genres.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {featured.genres.slice(0, 4).map((g) => (
                      <Link
                        key={g}
                        to="/search"
                        search={{ genre: g }}
                        className="text-[12px] font-medium px-2.5 py-1 rounded-full bg-white/[0.08] text-white/70 hover:bg-mm-accent/15 hover:text-mm-accent transition-colors"
                      >
                        {translateGenre(g, i18n.locale)}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Description */}
                {synopsis && (
                  <p
                    className="text-[14px] text-white/70 max-w-[600px] leading-relaxed line-clamp-3"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                  >
                    {synopsis}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2.5 pt-1">
                  <Link
                    to={`/anime/${featured.bangumi_id}` as string}
                    className="inline-flex items-center px-5 py-2 text-[13px] font-semibold rounded-md bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
                  >
                    {i18n._(msg`hero.details`)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center px-4 py-2 text-[13px] font-medium rounded-md bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition-colors cursor-pointer"
                  >
                    {i18n._(msg`hero.preview`)}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Slide indicators */}
          {items.length > 1 && (
            <div className="flex items-center gap-2 mt-6">
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.bangumi_id}
                  aria-label={item.title}
                  aria-current={i === activeIndex}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full cursor-pointer transition-all duration-200',
                    i === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Resume watching card — only when featured anime has watch progress */}
        <AnimatePresence>
          {matchedWatch && (
            <ResumeCard
              key={matchedWatch.id}
              item={matchedWatch}
              locale={i18n.locale}
              remainingLabel={i18n._(msg`player.remaining`)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Preview modal */}
      <PreviewModal anime={featured} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

/** One dot-separated entry in the hero meta row */
function MetaItem({ children, showDivider }: { children: React.ReactNode; showDivider?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-white/55 font-medium">
      {showDivider && <span aria-hidden className="w-1 h-1 rounded-full bg-white/25" />}
      {children}
    </span>
  );
}

/** Poster with layered shadow for depth */
function PosterCard({ src, title }: { src?: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const handleLoad = useCallback(() => setLoaded(true), []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-[180px] h-[258px] lg:w-[210px] lg:h-[300px] rounded-lg overflow-hidden"
      style={{
        boxShadow: [
          '0 8px 30px rgba(0,0,0,0.5)',
          '0 2px 8px rgba(0,0,0,0.3)',
          `0 0 0 1px rgba(255,255,255,0.06)`,
        ].join(', '),
        background: src ? undefined : animeGradient(title),
      }}
    >
      {src && (
        <>
          {!loaded && <Skeleton className="w-full h-full rounded-none bg-white/[0.06]" />}
          <img
            src={src}
            alt={title}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={handleLoad}
          />
        </>
      )}
    </motion.div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ResumeCard({
  item,
  locale,
  remainingLabel,
}: {
  item: WatchProgress;
  locale: string;
  remainingLabel: string;
}) {
  const title =
    (locale.startsWith('zh') ? item.anime_title_zh || item.anime_title : item.anime_title) ||
    'Unknown';

  const progress =
    item.duration_seconds && item.duration_seconds > 0
      ? item.position_seconds / item.duration_seconds
      : 0;

  const epNum = Number.isInteger(item.episode_number)
    ? item.episode_number
    : item.episode_number.toFixed(1);

  const hasCover = item.anime_cover_image?.startsWith('http');
  const timeLeft = item.duration_seconds ? item.duration_seconds - item.position_seconds : 0;

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="absolute right-6 bottom-10 z-[3] hidden lg:block"
    >
      <Link
        to="/watch/$animeId"
        params={{ animeId: String(item.anime_bangumi_id ?? item.anime_id) }}
        search={{ ep: item.episode_number }}
        className="group flex items-center gap-5 rounded-xl overflow-hidden cursor-pointer border border-white/[0.08] pl-2 pr-6 py-2 transition-all duration-300 hover:border-white/[0.15] hover:scale-[1.02]"
        style={{
          backgroundColor: 'rgba(7,7,7,0.65)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <div className="relative shrink-0 w-[86px] h-[115px] rounded-lg overflow-hidden">
          <div
            className="w-full h-full"
            style={hasCover ? undefined : { background: animeGradient(title) }}
          >
            {hasCover && (
              <img
                src={item.anime_cover_image!}
                alt={title}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-colors">
            <div className="relative w-[76px] h-[76px] flex items-center justify-center">
              <svg
                className="absolute inset-0 -rotate-90"
                width="76"
                height="76"
                viewBox="0 0 76 76"
              >
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  fill="none"
                  stroke="var(--mm-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(232,143,170,0.4))' }}
                />
              </svg>
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="black">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 py-0.5">
          <p className="text-[15px] font-semibold text-white truncate max-w-[210px]">{title}</p>
          <p className="text-[13px] text-white/45 mt-1.5 font-medium">
            EP {epNum} · {formatTime(item.position_seconds)}
            {item.duration_seconds ? ` / ${formatTime(item.duration_seconds)}` : ''}
          </p>
          {timeLeft > 0 && (
            <p className="text-[11px] text-white/30 mt-2 font-medium tracking-wide">
              {formatTime(timeLeft)} {remainingLabel}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
