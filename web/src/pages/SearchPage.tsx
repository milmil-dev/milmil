import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: discoverKeys.search(debouncedQuery),
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-white tracking-tight mb-6"
        >
          搜索
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative mb-8"
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'oklch(35% 0.01 280)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索你喜歡的動畫..."
            className="w-full pl-10 pr-4 py-3 rounded-lg text-sm text-white bg-transparent border outline-none transition-colors focus:border-[oklch(65%_0.2_35)] placeholder:text-[oklch(30%_0.01_280)]"
            style={{ borderColor: 'oklch(18% 0.01 280)', backgroundColor: 'oklch(9% 0.01 280)' }}
          />
        </motion.div>

        {!debouncedQuery && (
          <div className="text-center py-20">
            <HugeiconsIcon
              icon={Search01Icon}
              size={32}
              style={{ color: 'oklch(22% 0.01 280)' }}
              className="mx-auto mb-4"
            />
            <p className="text-sm" style={{ color: 'oklch(32% 0.01 280)' }}>
              搜索你喜歡的動畫
            </p>
          </div>
        )}

        {isLoading && debouncedQuery && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded overflow-hidden">
                <div className="aspect-[3/4]" style={{ backgroundColor: 'oklch(14% 0.01 280)' }} />
                <div className="p-2" style={{ backgroundColor: 'oklch(10% 0.01 280)' }}>
                  <div
                    className="h-3 rounded"
                    style={{ backgroundColor: 'oklch(16% 0.01 280)', width: '60%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && debouncedQuery && results.length > 0 && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
          >
            {results.map((anime, i) => (
              <AnimeCard key={anime.bangumi_id} anime={anime} index={i} />
            ))}
          </div>
        )}

        {!isLoading && debouncedQuery && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'oklch(38% 0.01 280)' }}>
              找不到「{debouncedQuery}」的結果
            </p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
