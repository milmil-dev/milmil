import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

export function HeroBanner({ items }: { items: AnimeSummary[] }) {
  const { i18n } = useLingui();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const featured = items[activeIndex];

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
  const hasNext = items.length > 1;
  const nextItem = hasNext ? items[(activeIndex + 1) % items.length] : null;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 'clamp(360px, 50vh, 520px)' }}
      tabIndex={0}
      role="region"
      aria-label="Featured anime"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background — FULL banner image, NO blur (like Seanime) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={featured.bangumi_id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
        >
          {hasCover ? (
            <img
              src={featured.cover_image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.55) saturate(1.2)' }}
            />
          ) : (
            <div className="absolute inset-0" style={{ background: animeGradient(featured.title) }} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays — left fade for text readability + bottom fade */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background: [
            'linear-gradient(90deg, var(--mm-bg) 0%, oklch(from var(--mm-bg) l c h / 0.7) 35%, transparent 65%)',
            'linear-gradient(to top, var(--mm-bg) 0%, transparent 50%)',
          ].join(', '),
        }}
      />

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
                  className="shrink-0 w-[110px] h-[155px] rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 block"
                  style={hasCover ? undefined : { background: animeGradient(featured.title) }}
                >
                  {hasCover && (
                    <img src={featured.cover_image} alt={featured.title} className="w-full h-full object-cover" />
                  )}
                </Link>

                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="text-[clamp(1.4rem,3vw,2rem)] font-bold text-white tracking-tight leading-tight line-clamp-2">
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
            <div className="flex items-center gap-1.5 mt-5">
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.bangumi_id}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'h-[3px] rounded-full transition-all duration-300',
                    i === activeIndex ? 'bg-white w-5' : 'bg-white/30 w-1.5'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: next-up card */}
        {nextItem && (
          <div className="hidden lg:flex items-end p-6 pb-8 shrink-0">
            <Link
              to={`/anime/${nextItem.bangumi_id}` as string}
              className="group block w-[240px] rounded-lg overflow-hidden"
              style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            >
              <div className="relative h-[135px] overflow-hidden">
                {nextItem.cover_image?.startsWith('http') ? (
                  <img
                    src={nextItem.cover_image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: animeGradient(nextItem.title) }} />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent 60%)' }}
                />
                {/* Episode info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[12px] font-semibold text-white truncate">{nextItem.title}</p>
                  <p className="text-[10px] mt-0.5 text-white/50">
                    {nextItem.episode_count > 0 ? `${nextItem.episode_count} ${i18n._(msg`common.ep`)}` : ''}
                    {nextItem.score > 0 ? ` · ${nextItem.score.toFixed(1)}` : ''}
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
