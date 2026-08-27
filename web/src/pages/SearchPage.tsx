import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { PageAtmosphere } from '../components/PageAtmosphere';
import { PageTransition } from '../components/PageTransition';
import { PreviewModal } from '../components/PreviewModal';
import { TagMultiSelect } from '../components/TagMultiSelect';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Spinner } from '../components/ui/spinner';
import { useDocumentTitle } from '../hooks/use-document-title';
import {
  type AnimeSummary,
  type BrowseParams,
  discoverApi,
  discoverKeys,
} from '../lib/api/discover';
import { translateGenre } from '../lib/genre-i18n';
import { GENRES } from '../lib/genres';
import { cn } from '../lib/utils';
import { Skeleton, SkeletonText } from '../components/Skeleton';

const SORT_OPTIONS = [
  { value: 'POPULARITY_DESC', label: msg`search.sort.popularity` },
  { value: 'SCORE_DESC', label: msg`search.sort.rating` },
  { value: 'TRENDING_DESC', label: msg`search.sort.trending` },
  { value: 'START_DATE_DESC', label: msg`search.sort.newest` },
  { value: 'START_DATE', label: msg`search.sort.oldest` },
];

const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= 2000; y--) years.push(y);
  return years;
})();

const SEASON_OPTIONS = [
  { value: 'WINTER', label: msg`search.season.winter` },
  { value: 'SPRING', label: msg`search.season.spring` },
  { value: 'SUMMER', label: msg`search.season.summer` },
  { value: 'FALL', label: msg`search.season.fall` },
];

const RATING_OPTIONS = [
  { value: '70', label: msg`search.rating.7plus` },
  { value: '80', label: msg`search.rating.8plus` },
  { value: '90', label: msg`search.rating.9plus` },
];

const STATUS_OPTIONS = [
  { value: 'RELEASING', label: msg`search.status.airing` },
  { value: 'FINISHED', label: msg`search.status.finished` },
  { value: 'NOT_YET_RELEASED', label: msg`search.status.upcoming` },
];

interface SearchParams {
  q?: string;
  genre?: string;
  tag?: string;
  sort?: string;
  year?: string;
  season?: string;
  min_score?: string;
  status?: string;
  adult?: string;
}

function LoadMoreSentinel({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !loadingRef.current) {
          onVisibleRef.current();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center py-8">
      {loading && <Spinner size={24} className="text-ink/30" />}
    </div>
  );
}

export function SearchPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.search`));
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as SearchParams;
  const {
    q: urlQuery,
    genre: urlGenre,
    tag: urlTag,
    sort: urlSort,
    year: urlYear,
    season: urlSeason,
    min_score: urlMinScore,
    status: urlStatus,
    adult: urlAdult,
  } = searchParams;

  const [query, setQuery] = useState(urlQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(urlQuery ?? '');
  const [previewAnime, setPreviewAnime] = useState<AnimeSummary | null>(null);

  // Parse comma-separated genres/tags from URL
  const selectedGenres = useMemo(() => (urlGenre ? urlGenre.split(',') : []), [urlGenre]);
  const selectedTags = useMemo(() => (urlTag ? urlTag.split(',') : []), [urlTag]);

  // Check if any advanced filters are active
  const hasActiveFilters = !!(urlSort || urlYear || urlSeason || urlMinScore || urlStatus);

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

  // Build browse params from URL
  const browseParams: BrowseParams = useMemo(
    () => ({
      genre: urlGenre,
      sort: urlSort,
      year: urlYear ? Number(urlYear) : undefined,
      season: urlSeason,
      min_score: urlMinScore ? Number(urlMinScore) : undefined,
      status: urlStatus,
      adult: urlAdult === 'true' ? true : undefined,
    }),
    [urlGenre, urlSort, urlYear, urlSeason, urlMinScore, urlStatus, urlAdult]
  );

  const isTagMode = selectedTags.length > 0;
  const isBrowseMode = !!(urlGenre || hasActiveFilters);
  const isFilterActive = isBrowseMode || isTagMode;

  /** Toggle a genre in the multi-select list */
  const toggleGenre = (g: string) => {
    const next = selectedGenres.includes(g)
      ? selectedGenres.filter((x) => x !== g)
      : [...selectedGenres, g];
    navigate({
      to: '/search',
      search: {
        ...searchParams,
        genre: next.length > 0 ? next.join(',') : undefined,
      } as any,
    });
  };

  /** Add a Bangumi tag */
  const addTag = (t: string) => {
    const trimmed = t.trim();
    if (!trimmed || selectedTags.includes(trimmed)) return;
    const next = [...selectedTags, trimmed];
    navigate({
      to: '/search',
      search: { ...searchParams, tag: next.join(',') } as any,
    });
  };

  const removeTag = (t: string) => {
    const next = selectedTags.filter((x) => x !== t);
    navigate({
      to: '/search',
      search: { ...searchParams, tag: next.length > 0 ? next.join(',') : undefined } as any,
    });
  };

  // Text search (single page)
  const isAdult = urlAdult === 'true';
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: [...discoverKeys.search(debouncedQuery), isAdult],
    queryFn: () => discoverApi.search(debouncedQuery, isAdult),
    enabled: debouncedQuery.length > 0 && !isFilterActive,
  });

  // Genre browse (infinite pages) — with filters
  const {
    data: genrePages,
    isLoading: genreLoading,
    fetchNextPage: fetchNextGenrePage,
    hasNextPage: hasNextGenrePage,
    isFetchingNextPage: isFetchingNextGenrePage,
  } = useInfiniteQuery({
    queryKey: ['discover', 'browse', browseParams],
    queryFn: ({ pageParam }) => discoverApi.browse({ ...browseParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length >= 20 ? lastPageParam + 1 : undefined,
    enabled: isBrowseMode && !isTagMode,
  });

  // Tag browse (infinite pages) — Bangumi tag search
  const {
    data: tagPages,
    isLoading: tagLoading,
    fetchNextPage: fetchNextTagPage,
    hasNextPage: hasNextTagPage,
    isFetchingNextPage: isFetchingNextTagPage,
  } = useInfiniteQuery({
    queryKey: ['discover', 'tag', selectedTags, urlSort],
    queryFn: ({ pageParam }) => discoverApi.browseByTag(selectedTags, urlSort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length >= 20 ? lastPageParam + 1 : undefined,
    enabled: isTagMode,
  });

  const genreResults = genrePages?.pages.flat() ?? [];
  const tagResults = tagPages?.pages.flat() ?? [];
  const results = isTagMode ? tagResults : isBrowseMode ? genreResults : searchResults;
  const isLoading = isTagMode ? tagLoading : isBrowseMode ? genreLoading : searchLoading;
  const hasQuery = isFilterActive || debouncedQuery.length > 0;
  const fetchNextPage = isTagMode ? fetchNextTagPage : fetchNextGenrePage;
  const hasNextPage = isTagMode ? hasNextTagPage : hasNextGenrePage;
  const isFetchingNextPage = isTagMode ? isFetchingNextTagPage : isFetchingNextGenrePage;

  /** Navigate with updated search params */
  const updateFilter = (key: string, value: string | undefined) => {
    const next: Record<string, string | undefined> = { ...searchParams };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    // When applying filters, ensure we're in browse mode
    // If no genre and not setting genre, keep as is
    navigate({ to: '/search', search: next as any });
  };

  const clearAll = () => {
    navigate({ to: '/search', search: {} as any });
  };

  return (
    <PageTransition>
      <div className="relative min-h-screen px-8 pt-10 pb-16">
        <PageAtmosphere preset="search" />
        {/* Genre quick-filter chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap gap-2 mb-4"
        >
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={cn(
                'text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors',
                selectedGenres.includes(g)
                  ? 'bg-ink/[0.05] text-mm-accent'
                  : 'bg-ink/[0.05] text-ink/50 hover:bg-ink/[0.08] hover:text-ink/70'
              )}
            >
              {translateGenre(g, i18n.locale)}
            </button>
          ))}
          {selectedTags.map((t) => (
            <span
              key={`tag-${t}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-md bg-ink/[0.05] text-mm-accent"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="ml-0.5 text-ink/30 hover:text-ink/60"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} />
              </button>
            </span>
          ))}
        </motion.div>

        {/* Filter bar — always visible */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.03 }}
          className="mb-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort */}
            <Select
              value={urlSort ?? ''}
              onValueChange={(v) => updateFilter('sort', v || undefined)}
            >
              <SelectTrigger
                size="sm"
                className="min-w-[120px] bg-ink/[0.04] border-transparent text-xs text-ink/70"
              >
                <SelectValue placeholder={i18n._(msg`search.filter.sort`)} />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {i18n._(opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Year */}
            <Select
              value={urlYear ?? ''}
              onValueChange={(v) => updateFilter('year', v || undefined)}
            >
              <SelectTrigger
                size="sm"
                className="min-w-[100px] bg-ink/[0.04] border-transparent text-xs text-ink/70"
              >
                <SelectValue placeholder={i18n._(msg`search.filter.year`)} />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Season */}
            <Select
              value={urlSeason ?? ''}
              onValueChange={(v) => updateFilter('season', v || undefined)}
            >
              <SelectTrigger
                size="sm"
                className="min-w-[100px] bg-ink/[0.04] border-transparent text-xs text-ink/70"
              >
                <SelectValue placeholder={i18n._(msg`search.filter.season`)} />
              </SelectTrigger>
              <SelectContent>
                {SEASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {i18n._(opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Min rating */}
            <Select
              value={urlMinScore ?? ''}
              onValueChange={(v) => updateFilter('min_score', v || undefined)}
            >
              <SelectTrigger
                size="sm"
                className="min-w-[100px] bg-ink/[0.04] border-transparent text-xs text-ink/70"
              >
                <SelectValue placeholder={i18n._(msg`search.filter.rating`)} />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {i18n._(opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select
              value={urlStatus ?? ''}
              onValueChange={(v) => updateFilter('status', v || undefined)}
            >
              <SelectTrigger
                size="sm"
                className="min-w-[100px] bg-ink/[0.04] border-transparent text-xs text-ink/70"
              >
                <SelectValue placeholder={i18n._(msg`search.filter.status`)} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {i18n._(opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tag filter */}
            <TagMultiSelect selected={selectedTags} onAdd={addTag} onRemove={removeTag} />

            {/* NSFW toggle */}
            <button
              type="button"
              onClick={() => updateFilter('adult', urlAdult === 'true' ? undefined : 'true')}
              className={cn(
                'text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors',
                urlAdult === 'true'
                  ? 'bg-red-500/15 text-red-400'
                  : 'bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.08] hover:text-ink/60'
              )}
            >
              NSFW
            </button>

            {/* Clear filters */}
            {isFilterActive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs text-ink/40 hover:text-ink/70"
              >
                {i18n._(msg`search.filter.clear`)}
              </Button>
            )}
          </div>
        </motion.div>

        {/* Search input */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative mb-6"
        >
          <div className="relative group">
            <div className="absolute inset-0 rounded-md bg-gradient-to-r from-ink/[0.03] via-transparent to-ink/[0.02] opacity-0 group-focus-within:opacity-100 transition-opacity blur-xl" />
            <div className="relative flex items-center rounded-md bg-ink/[0.04] border border-transparent group-focus-within:border-transparent transition-colors">
              <HugeiconsIcon
                icon={Search01Icon}
                size={18}
                className="ml-4 text-ink/20 group-focus-within:text-ink/50 transition-colors shrink-0"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    e.preventDefault();
                    // Immediate text search on Enter
                    setDebouncedQuery(query.trim());
                    navigate({
                      to: '/search',
                      search: { ...searchParams, q: query.trim() } as any,
                    });
                  }
                }}
                placeholder={i18n._(msg`search.inputPlaceholder`)}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setDebouncedQuery('');
                  }}
                  className="mr-3 p-1.5 rounded-md hover:bg-ink/[0.06] text-ink/30 hover:text-ink/60 transition-colors"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Active filter summary */}
        {isFilterActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h2 className="text-lg font-semibold text-ink tracking-tight">
              {isTagMode
                ? selectedTags.join(' · ')
                : selectedGenres.length > 0
                  ? selectedGenres.map((g) => translateGenre(g, i18n.locale)).join(' · ')
                  : i18n._(msg`search.browseResults`)}
              {urlYear && <span className="text-ink/40 font-normal ml-2">· {urlYear}</span>}
              {urlSeason && (
                <span className="text-ink/40 font-normal ml-1">
                  · {i18n._(msg`search.season.${urlSeason.toLowerCase()}`)}
                </span>
              )}
            </h2>
          </motion.div>
        )}

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

        {/* Loading skeleton */}
        {isLoading && hasQuery && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-md overflow-hidden">
                <Skeleton className="aspect-[6/8] rounded-md" />
                <div className="pt-2 space-y-1.5">
                  <SkeletonText className="w-[70%]" />
                  <SkeletonText className="h-2.5 w-[40%]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results grid */}
        {!isLoading && hasQuery && results.length > 0 && (
          <>
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 600px' }}
            >
              {results.map((anime) => (
                <AnimeCard
                  key={`${anime.anilist_id}-${anime.bangumi_id}`}
                  anime={anime}
                  onPreview={(a) => setPreviewAnime(a)}
                />
              ))}
            </div>

            {/* Auto load more sentinel */}
            {isFilterActive && hasNextPage && (
              <LoadMoreSentinel loading={isFetchingNextPage} onVisible={() => fetchNextPage()} />
            )}
          </>
        )}

        {/* No results */}
        {!isLoading && hasQuery && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-mm-text-tertiary">
              {isBrowseMode
                ? `${i18n._(msg`search.noResultsFor`)} ${selectedGenres.length > 0 ? selectedGenres.map((g) => translateGenre(g, i18n.locale)).join(', ') : i18n._(msg`search.filter.applied`)}`
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
