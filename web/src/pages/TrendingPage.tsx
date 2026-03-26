import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';

export function TrendingPage() {
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<AnimeSummary[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: discoverKeys.trending(page),
    queryFn: () => discoverApi.trending(page),
  });

  useEffect(() => {
    if (data) {
      if (data.length === 0) {
        setHasMore(false);
      } else {
        setAllItems((prev) => (page === 1 ? data : [...prev, ...data]));
      }
    }
  }, [data, page]);

  const showSkeleton = isLoading && allItems.length === 0;

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          熱門動畫
        </motion.h1>

        {showSkeleton && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded overflow-hidden">
                <div className="aspect-[3/4] bg-mm-border" />
                <div className="p-2 bg-mm-surface">
                  <div
                    className="h-3 rounded mb-1"
                    style={{ backgroundColor: 'oklch(16% 0.01 280)', width: '70%' }}
                  />
                  <div className="h-2 rounded bg-mm-surface-hover" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && allItems.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm mb-3 text-mm-text-secondary">載入失敗</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium text-mm-accent"
            >
              重試
            </button>
          </div>
        )}

        {allItems.length > 0 && (
          <>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {allItems.map((anime, i) => (
                <AnimeCard key={`${anime.bangumi_id}-${i}`} anime={anime} index={i} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isLoading}
                  className="px-5 py-2 text-sm font-medium rounded transition-colors disabled:opacity-40 bg-mm-border"
                  style={{ color: 'oklch(65% 0.01 280)' }}
                >
                  {isLoading ? '載入中...' : '載入更多'}
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
