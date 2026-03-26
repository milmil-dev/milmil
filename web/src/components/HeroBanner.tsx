import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AnimeSummary } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';

export function HeroBanner({ items }: { items: AnimeSummary[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const featured = items[activeIndex];

  // Auto-rotate every 8 seconds
  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!featured) return null;

  const hasCover = featured.cover_image?.startsWith('http');
  const hasNext = items.length > 1;
  const nextItem = hasNext ? items[(activeIndex + 1) % items.length] : null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg"
      style={{ height: 'clamp(280px, 38vh, 420px)' }}
    >
      {/* Background — blurred cover or gradient */}
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
              style={{
                filter: 'blur(40px) brightness(0.35) saturate(1.4)',
                transform: 'scale(1.3)',
              }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: animeGradient(featured.title) }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dark overlay gradient */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            'linear-gradient(90deg, oklch(7% 0.01 280 / 0.92) 0%, oklch(7% 0.01 280 / 0.5) 55%, transparent 100%), linear-gradient(to top, oklch(7% 0.01 280) 0%, transparent 40%)',
        }}
      />

      {/* Content */}
      <div className="relative z-[2] h-full flex">
        {/* Left: info */}
        <div className="flex-1 flex flex-col justify-end p-8 pb-7 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={featured.bangumi_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Cover + text side by side */}
              <div className="flex items-end gap-5">
                {/* Cover poster */}
                <Link
                  to={`/anime/${featured.bangumi_id}` as string}
                  className="shrink-0 w-[100px] h-[140px] rounded overflow-hidden shadow-lg block"
                  style={hasCover ? undefined : { background: animeGradient(featured.title) }}
                >
                  {hasCover && (
                    <img
                      src={featured.cover_image}
                      alt={featured.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </Link>

                <div className="min-w-0 flex-1 pb-1">
                  {/* Tags */}
                  {featured.air_date && (
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'oklch(20% 0.01 280)',
                          color: 'oklch(60% 0.01 280)',
                        }}
                      >
                        {new Date(featured.air_date).getFullYear()}
                      </span>
                    </div>
                  )}

                  {/* Title */}
                  <h2 className="text-[clamp(1.2rem,2.5vw,1.8rem)] font-bold text-white tracking-tight leading-tight line-clamp-2">
                    {featured.title}
                  </h2>

                  {featured.title_original && featured.title_original !== featured.title && (
                    <p className="text-[12px] mt-1 truncate text-mm-text-secondary">
                      {featured.title_original}
                    </p>
                  )}

                  {/* Score + episode count */}
                  <div className="flex items-center gap-3 mt-2">
                    {featured.score > 0 && (
                      <span className="text-[13px] font-bold text-mm-accent">
                        ♡ {featured.score.toFixed(1)}
                      </span>
                    )}
                    {featured.episode_count > 0 && (
                      <span className="text-[12px] text-mm-text-tertiary">
                        {featured.episode_count} 集
                      </span>
                    )}
                  </div>

                  {/* Preview button */}
                  <Link
                    to={`/anime/${featured.bangumi_id}` as string}
                    className="inline-flex items-center mt-4 px-4 py-1.5 text-[12px] font-semibold rounded transition-colors"
                    style={{ backgroundColor: 'oklch(18% 0.01 280)', color: 'oklch(75% 0.01 280)' }}
                  >
                    Preview
                  </Link>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Pagination dots */}
          {items.length > 1 && (
            <div className="flex items-center gap-1.5 mt-4">
              {items.map((item, i) => (
                <button
                  type="button"
                  key={item.bangumi_id}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300',
                    i === activeIndex ? 'bg-mm-accent' : 'bg-mm-text-muted'
                  )}
                  style={{ width: i === activeIndex ? 20 : 6 }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: next-up card (like Seanime) */}
        {nextItem && (
          <div className="hidden lg:flex items-end p-6 pb-7 shrink-0">
            <Link
              to={`/anime/${nextItem.bangumi_id}` as string}
              className="group block w-[220px] rounded overflow-hidden"
              style={{ backgroundColor: 'oklch(12% 0.01 280 / 0.8)' }}
            >
              <div className="relative h-[120px] overflow-hidden">
                {nextItem.cover_image?.startsWith('http') ? (
                  <img
                    src={nextItem.cover_image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ background: animeGradient(nextItem.title) }}
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent 60%)',
                  }}
                />
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[12px] font-semibold text-white truncate">{nextItem.title}</p>
                <p className="text-[10px] mt-0.5 text-mm-text-tertiary">
                  {nextItem.episode_count > 0 ? `${nextItem.episode_count} 集` : ''}
                  {nextItem.score > 0 ? ` · ${nextItem.score.toFixed(1)}` : ''}
                </p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
