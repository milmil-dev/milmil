import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

export function HeroBanner({ items, onActiveChange }: { items: AnimeSummary[]; onActiveChange?: (item: AnimeSummary) => void }) {
  const { i18n } = useLingui();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
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
              {/* Poster + info */}
              <div className="flex items-end gap-5">
                <Link
                  to={`/anime/${featured.bangumi_id}` as string}
                  className="shrink-0 w-[140px] h-[200px] lg:w-[180px] lg:h-[260px] rounded-md overflow-hidden block"
                  style={hasCover ? undefined : { background: animeGradient(featured.title) }}
                >
                  {hasCover && (
                    <img src={featured.cover_image} alt={featured.title} className="w-full h-full object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-tight line-clamp-2">
                    {featured.title}
                  </h2>

                  {featured.title_original && featured.title_original !== featured.title && (
                    <p className="text-[12px] mt-1 truncate text-white/50">
                      {featured.title_original}
                    </p>
                  )}

                  {/* Score + episodes */}
                  <div className="flex items-center gap-3 mt-2.5">
                    {featured.score > 0 && (
                      <span className="text-[14px] font-bold text-mm-accent">
                        ♡ {featured.score.toFixed(1)}
                      </span>
                    )}
                    {featured.episode_count > 0 && (
                      <span className="text-[12px] text-white/40">
                        {featured.episode_count} {i18n._(msg`common.ep`)}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="flex items-center gap-2.5 mt-4">
                    <Link
                      to={`/anime/${featured.bangumi_id}` as string}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-bold rounded-md bg-white text-black hover:bg-white/90 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      {i18n._(msg`hero.details`)}
                    </Link>
                  </div>
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

        {/* Episode card — Seanime EpisodeCardSidebar: shows current anime's episode info */}
        {featured && (
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
                  <p className="text-[11px] text-white/50 truncate">{featured.title}</p>
                  <p className="text-[13px] font-semibold text-white mt-0.5">
                    Episode 1 / {featured.episode_count || '?'}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
