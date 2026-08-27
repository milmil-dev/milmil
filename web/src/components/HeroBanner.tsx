import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import type { WatchProgress } from '../lib/api/progress';
import { translateGenre } from '../lib/genre-i18n';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
import { PreviewModal } from './PreviewModal';
import { Skeleton } from './Skeleton';

const SLIDE_DURATION = 8000;

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
  const [, setProgress] = useState(0);
  const featured = items[activeIndex];

  // Notify parent when active item changes
  useEffect(() => {
    if (featured) onActiveChange?.(featured);
  }, [activeIndex, featured, onActiveChange]);

  // Auto-advance with progress tracking
  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    setProgress(0);
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / SLIDE_DURATION, 1);
      setProgress(pct);
      if (pct < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        setActiveIndex((i) => (i + 1) % items.length);
      }
    };
    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [items.length, isPaused, activeIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActiveIndex((i) => (i - 1 + items.length) % items.length);
      if (e.key === 'ArrowRight') setActiveIndex((i) => (i + 1) % items.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length]);

  if (!featured) return null;

  // Find watch progress matching the currently featured anime
  const matchedWatch =
    watchHistory?.find((w) => w.anime_bangumi_id === featured.bangumi_id && w.completed !== 1) ??
    null;

  const hasCover = featured.cover_image?.startsWith('http');

  return (
    <div
      className="relative w-full"
      style={{ height: 'clamp(400px, 56vh, 520px)' }}
      tabIndex={0}
      role="region"
      aria-label="Featured anime"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
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
                </Link>

                {/* Meta row — genres + score inline */}
                <div className="flex items-center gap-3 flex-wrap">
                  {featured.score > 0 && (
                    <span className="text-mm-accent font-bold text-[15px] flex items-center gap-1">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="opacity-80"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      {featured.score.toFixed(1)}
                    </span>
                  )}
                  {featured.genres && featured.genres.length > 0 && (
                    <>
                      {featured.score > 0 && <span className="w-px h-3.5 bg-white/15" />}
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
                    </>
                  )}
                </div>

                {/* Description */}
                {featured.description && (
                  <p
                    className="text-[14px] font-bold text-white/65 max-w-[560px] leading-relaxed line-clamp-3"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
                  >
                    {featured.description.replace(/<[^>]+>/g, '')}
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
            <div className="flex items-center gap-2.5 mt-6">
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.bangumi_id}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'size-2 rounded-full cursor-pointer transition-all duration-200',
                    i === activeIndex ? 'h-[6px] w-5 bg-white' : 'bg-white/50 hover:bg-white/70'
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
