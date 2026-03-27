import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
import { PreviewModal } from './PreviewModal';

export function HeroBanner({ items, onActiveChange, hasWatchRecord }: { items: AnimeSummary[]; onActiveChange?: (item: AnimeSummary) => void; hasWatchRecord?: boolean }) {
  const { i18n } = useLingui();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const featured = items[activeIndex];

  // Notify parent when active item changes
  useEffect(() => {
    if (featured) onActiveChange?.(featured);
  }, [activeIndex, featured, onActiveChange]);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [items.length, isPaused]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActiveIndex((i) => (i - 1 + items.length) % items.length);
      if (e.key === 'ArrowRight') setActiveIndex((i) => (i + 1) % items.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length]);

  if (!featured) return null;

  const hasCover = featured.cover_image?.startsWith('http');

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 'clamp(400px, 55vh, 32rem)' }}
      tabIndex={0}
      role="region"
      aria-label="Featured anime"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* No gradient overlay — root layout bg already handles fading */}

      {/* Content — anchored bottom-left */}
      <div className="relative z-[2] h-full flex">
        <div className="flex-1 flex flex-col justify-end p-6 md:p-8 pb-6 min-w-0 max-w-[600px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={featured.bangumi_id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Poster + info — Seanime MediaMetadata layout */}
              <div className="flex items-end gap-6">
                <Link
                  to={`/anime/${featured.bangumi_id}` as string}
                  className="shrink-0 w-[140px] h-[200px] lg:w-[180px] lg:h-[260px] rounded-md overflow-hidden block cursor-pointer shadow-md"
                  style={hasCover ? undefined : { background: animeGradient(featured.title) }}
                >
                  {hasCover && (
                    <img src={featured.cover_image} alt={featured.title} className="w-full h-full object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1 pb-1 space-y-2">
                  {/* Title — clickable, animated text reveal like Seanime TextGenerateEffect */}
                  <Link to={`/anime/${featured.bangumi_id}` as string} className="block cursor-pointer">
                    <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-tight line-clamp-2 hover:text-white/80 transition-colors">
                      {featured.title.split('').map((char, ci) => (
                        <motion.span
                          key={`${featured.bangumi_id}-${ci}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: ci * 0.02, duration: 0.3 }}
                        >
                          {char}
                        </motion.span>
                      ))}
                    </h2>
                  </Link>

                  {/* Genres — Seanime shows up to 3 */}
                  {featured.genres && featured.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {featured.genres.slice(0, 3).map((genre) => (
                        <span key={genre} className="text-sm font-semibold text-gray-300 px-1">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Score */}
                  {featured.score > 0 && (
                    <span className="text-[14px] font-bold text-mm-accent inline-block">
                      ♡ {featured.score.toFixed(1)}
                    </span>
                  )}

                  {/* Description — Seanime shows in a scroll area, max ~3 lines */}
                  {featured.description && (
                    <p className="text-sm text-white/60 line-clamp-3 max-w-lg leading-relaxed">
                      {featured.description.replace(/<[^>]+>/g, '')}
                    </p>
                  )}

                  {/* Preview button — opens preview modal (Seanime pattern) */}
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center px-4 py-1.5 text-sm font-medium rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition-colors cursor-pointer mt-1"
                  >
                    Preview
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Pagination dots */}
          {items.length > 1 && (
            <div className="flex items-center gap-2 mt-5">
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.bangumi_id}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'h-1.5 rounded-sm transition-all duration-300 cursor-pointer hover:bg-white/60',
                    i === activeIndex ? 'bg-white/80 w-6' : 'bg-white/20 w-3'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Episode card — only show if user has watch records */}
        {featured && hasWatchRecord && (
          <div className="absolute right-6 bottom-8 z-[3] hidden lg:block">
            <Link
              to={`/anime/${featured.bangumi_id}` as string}
              className="group block 2xl:w-[420px] xl:w-[340px] lg:w-[260px] rounded-xl overflow-hidden cursor-pointer"
              style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                {hasCover ? (
                  <img
                    src={featured.banner_image || featured.cover_image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: animeGradient(featured.title) }} />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent 50%)' }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-3.5">
                  <p className="text-[11px] text-white/50 truncate">{featured.title_original || featured.title}</p>
                  <p className="text-[13px] font-semibold text-white mt-0.5 truncate">{featured.title}</p>
                  {featured.episode_count > 0 && (
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {featured.episode_count} {i18n._(msg`common.ep`)}
                      {featured.score > 0 ? ` · ${featured.score.toFixed(1)}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Preview modal */}
      <PreviewModal anime={featured} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}
