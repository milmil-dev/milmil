import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageTransition } from '../components/PageTransition';
import { PreviewModal } from '../components/PreviewModal';
import { Button } from '../components/ui/button';
import { type AnimeSummary, discoverApi, discoverKeys } from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { cn } from '../lib/utils';

const POPULAR_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Mystery',
  'Psychological',
  'Horror',
  'Sports',
  'Music',
  'Mecha',
];

export function SearchPage() {
  const { i18n } = useLingui();
  const { q: urlQuery, genre: urlGenre } = useSearch({ strict: false }) as {
    q?: string;
    genre?: string;
  };
  const [query, setQuery] = useState(urlQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(urlQuery ?? '');
  const [previewAnime, setPreviewAnime] = useState<AnimeSummary | null>(null);

  // Sync from URL when navigating via tag clicks
  useEffect(() => {
    if (urlQuery && urlQuery !== query) {
      setQuery(urlQuery);
      setDebouncedQuery(urlQuery);
    }
  }, [urlQuery]);

  // Clear text search when genre mode activates
  useEffect(() => {
    if (urlGenre) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [urlGenre]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Text search (single page)
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: discoverKeys.search(debouncedQuery),
    queryFn: () => discoverApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0 && !urlGenre,
  });

  // Genre browse (infinite pages)
  const {
    data: genrePages,
    isLoading: genreLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['discover', 'browse', urlGenre],
    queryFn: ({ pageParam }) => discoverApi.browse(urlGenre!, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length >= 20 ? lastPageParam + 1 : undefined,
    enabled: !!urlGenre,
  });

  const isGenreMode = !!urlGenre;
  const genreResults = genrePages?.pages.flat() ?? [];
  const results = isGenreMode ? genreResults : searchResults;
  const isLoading = isGenreMode ? genreLoading : searchLoading;
  const hasQuery = isGenreMode || debouncedQuery.length > 0;

  return (
    <PageTransition>
      <div className="min-h-screen px-8 pt-10 pb-16">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          {isGenreMode ? (
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {translateGenre(urlGenre!, i18n.locale)}
            </h1>
          ) : (
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {i18n._(msg`search.title`)}
            </h1>
          )}
        </motion.div>

        {/* Search input */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative mb-6"
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mm-text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={i18n._(msg`search.inputPlaceholder`)}
            className="w-full pl-10 pr-4 py-3 rounded-lg text-sm text-white bg-mm-sidebar border outline-none transition-colors focus:border-[oklch(65%_0.2_35)] placeholder:text-mm-text-muted"
            style={{ borderColor: 'oklch(18% 0.01 280)' }}
          />
        </motion.div>

        {/* Genre quick-filter chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2 mb-8"
        >
          {POPULAR_GENRES.map((g) => (
            <Link
              key={g}
              to="/search"
              search={{ genre: g }}
              className={cn(
                'text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors',
                urlGenre === g
                  ? 'bg-mm-accent text-black'
                  : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08] hover:text-white/70'
              )}
            >
              {translateGenre(g, i18n.locale)}
            </Link>
          ))}
        </motion.div>

        {/* Empty state */}
        {!hasQuery && (
          <div className="text-center py-12">
            <HugeiconsIcon
              icon={Search01Icon}
              size={32}
              style={{ color: 'oklch(22% 0.01 280)' }}
              className="mx-auto mb-4"
            />
            <p className="text-sm text-mm-text-muted">{i18n._(msg`search.emptyHint`)}</p>
          </div>
        )}

        {/* Loading skeleton — max 6 per row */}
        {isLoading && hasQuery && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-md overflow-hidden">
                <div className="aspect-[6/8] bg-white/[0.04]" />
                <div className="pt-2 space-y-1.5">
                  <div className="h-3 rounded bg-white/[0.06]" style={{ width: '70%' }} />
                  <div className="h-2.5 rounded bg-white/[0.03]" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grid — max 6 per row */}
        {!isLoading && hasQuery && results.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.map((anime) => (
                <AnimeCard
                  key={`${anime.anilist_id}-${anime.bangumi_id}`}
                  anime={anime}
                  onPreview={(a) => setPreviewAnime(a)}
                />
              ))}
            </div>

            {/* Load more — genre browse only */}
            {isGenreMode && hasNextPage && (
              <div className="flex justify-center mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? i18n._(msg`search.loadingMore`)
                    : i18n._(msg`search.loadMore`)}
                </Button>
              </div>
            )}
          </>
        )}

        {/* No results */}
        {!isLoading && hasQuery && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-mm-text-tertiary">
              {isGenreMode
                ? `${i18n._(msg`search.noResultsFor`)} ${translateGenre(urlGenre!, i18n.locale)}`
                : `${i18n._(msg`search.noResultsFor`)} 「${debouncedQuery}」`}
            </p>
          </div>
        )}
      </div>

      {/* Preview modal */}
      <PreviewModal
        anime={previewAnime}
        open={!!previewAnime}
        onClose={() => setPreviewAnime(null)}
      />
    </PageTransition>
  );
}
