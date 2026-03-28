import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoginModal } from '../components/LoginModal';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../hooks/use-auth';
import { discoverApi, discoverKeys, type AnimeSummary, type Episode } from '../lib/api/discover';
import { libraryApi, libraryKeys, type MediaFileEntry } from '../lib/api/library';
import { cn } from '../lib/utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 2 ? 1 : 0)} ${sizes[i]}`;
}

/* -- Skeleton loader -------------------------------------------------------- */

function LibraryDetailSkeleton() {
  return (
    <div className="min-h-screen px-4 md:px-8 pt-6 pb-16">
      {/* Back link */}
      <Skeleton className="h-4 w-24 mb-8" />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      {/* Stats strip */}
      <Skeleton className="h-5 w-96 mb-8" />

      {/* Tab bar */}
      <div className="flex gap-6 mb-6 border-b border-white/[0.06] pb-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
    </div>
  );
}

/* -- File table ------------------------------------------------------------- */

function StatusBadge({ status }: { status: MediaFileEntry['match_status'] }) {
  const styles = {
    auto: 'bg-green-400/10 text-green-400/80',
    manual: 'bg-blue-400/10 text-blue-400/80',
    unmatched: 'bg-amber-400/10 text-amber-400/80',
  };
  const labels = { auto: 'AUTO', manual: 'MANUAL', unmatched: 'UNMATCHED' };
  return (
    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', styles[status])}>
      {labels[status]}
    </span>
  );
}

function FileTable({
  libraryId,
  status,
  onMatch,
}: {
  libraryId: string;
  status: 'all' | 'unmatched';
  onMatch?: (file: MediaFileEntry) => void;
}) {
  const { i18n } = useLingui();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<MediaFileEntry[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
      setAccumulated([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: libraryKeys.mediaFiles(libraryId, { status, q: debouncedSearch || undefined, page }),
    queryFn: () => libraryApi.mediaFiles(libraryId, { status, q: debouncedSearch || undefined, page }),
  });

  // Accumulate pages for "Load More"
  useEffect(() => {
    if (data?.items) {
      if (page === 1) {
        setAccumulated(data.items);
      } else {
        setAccumulated((prev) => [...prev, ...data.items]);
      }
    }
  }, [data, page]);

  const hasMore = data ? page * data.per_page < data.total : false;

  const files = accumulated;

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
    if (status === 'unmatched') {
      return (
        <div className="py-16 text-center">
          <span className="text-green-400 text-2xl mb-2 block">&#10003;</span>
          <p className="text-[13px] text-green-400/70">{i18n._(msg`library.detail.allMatched`)}</p>
        </div>
      );
    }
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-mm-text-muted">{i18n._(msg`library.detail.noFiles`)}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={i18n._(msg`library.detail.searchFiles`)}
          className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/[0.15]"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-white/30">
              <th className="pb-3 pr-4 font-medium">{i18n._(msg`library.detail.col.filename`)}</th>
              <th className="pb-3 pr-4 font-medium">{i18n._(msg`library.detail.col.matchedTo`)}</th>
              <th className="pb-3 pr-4 font-medium">{i18n._(msg`library.detail.col.status`)}</th>
              <th className="pb-3 pr-4 font-medium">{i18n._(msg`library.detail.col.subs`)}</th>
              <th className="pb-3 pr-4 font-medium">{i18n._(msg`library.detail.col.size`)}</th>
              {onMatch && <th className="pb-3 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="py-3 pr-4 max-w-[300px]">
                  <span className="font-mono text-sm text-white/80 truncate block" title={file.path}>
                    {file.filename}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[13px]">
                  {file.matched_anime_title ? (
                    <span className="text-white/70">
                      {file.matched_anime_title}{' '}
                      <span className="text-white/30">EP {String(file.matched_episode_sort).padStart(2, '0')}</span>
                    </span>
                  ) : (
                    <span className="text-white/20">&mdash;</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={file.match_status} />
                </td>
                <td className="py-3 pr-4 text-[12px] text-white/30 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M7 15h4M13 15h4M7 11h10" />
                    </svg>
                    {file.subtitle_count}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[12px] text-white/30 tabular-nums whitespace-nowrap">
                  {formatBytes(file.size_bytes)}
                </td>
                {onMatch && (
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => onMatch(file)}
                      className="text-[11px] font-bold text-mm-accent hover:text-mm-accent/80 transition-colors px-2 py-1 rounded bg-mm-accent/10 hover:bg-mm-accent/20 cursor-pointer"
                    >
                      {i18n._(msg`library.detail.match`)}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="py-6 text-center">
          <p className="text-[12px] text-white/25 animate-pulse">{i18n._(msg`common.loading`)}</p>
        </div>
      )}

      {!isLoading && files.length === 0 && debouncedSearch && (
        <div className="py-12 text-center">
          <p className="text-[13px] text-mm-text-muted">{i18n._(msg`library.detail.noFiles`)}</p>
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="text-[13px] font-semibold text-mm-accent hover:text-mm-accent/80 transition-colors px-4 py-2 rounded-md bg-mm-accent/10 hover:bg-mm-accent/15 cursor-pointer"
          >
            {i18n._(msg`library.detail.loadMore`)}
          </button>
        </div>
      )}
    </div>
  );
}

/* -- Scan history ----------------------------------------------------------- */

function ScanHistoryList({ libraryId }: { libraryId: string }) {
  const { i18n } = useLingui();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: summaries, isLoading } = useQuery({
    queryKey: libraryKeys.summaries(libraryId),
    queryFn: () => libraryApi.scanSummaries(libraryId),
  });

  const toggleExpand = (scanId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId);
      else next.add(scanId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const sorted = [...(summaries || [])].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-mm-text-muted">{i18n._(msg`library.detail.noScans`)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((scan) => {
        const startDate = new Date(scan.started_at);
        const duration = scan.completed_at
          ? Math.round((new Date(scan.completed_at).getTime() - startDate.getTime()) / 1000)
          : null;

        let errors: string[] = [];
        if (scan.errors) {
          try {
            errors = JSON.parse(scan.errors);
          } catch {
            errors = scan.errors ? [scan.errors] : [];
          }
        }

        const isExpanded = expandedIds.has(scan.id);

        return (
          <div key={scan.id} className="rounded-lg p-4 border border-white/[0.04]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 text-[13px]">
                <span className="text-white/40">
                  {startDate.toLocaleDateString()} {startDate.toLocaleTimeString()}
                </span>
                <span className="text-white/25">
                  {duration !== null
                    ? `${duration}s`
                    : i18n._(msg`library.detail.inProgress`)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[12px] tabular-nums">
                <span className="text-white/40">
                  {scan.files_found} {i18n._(msg`library.detail.found`)}
                </span>
                <span className="text-green-400/80">
                  {scan.files_matched} {i18n._(msg`library.detail.matched`)}
                </span>
                <span className="text-amber-400/80">
                  {scan.files_unmatched} {i18n._(msg`library.detail.unmatchedShort`)}
                </span>
                {errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(scan.id)}
                    className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    {errors.length} {i18n._(msg`library.detail.errors`)} {isExpanded ? '\u25BE' : '\u25B8'}
                  </button>
                )}
              </div>
            </div>
            {isExpanded && errors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">
                {errors.map((err, idx) => (
                  <p key={idx} className="text-[11px] font-mono text-red-400/80">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -- Match modal ------------------------------------------------------------ */

function MatchModal({
  file,
  onClose,
  libraryId,
}: {
  file: MediaFileEntry | null;
  onClose: () => void;
  libraryId: string;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // Reset state when file changes (modal opens/closes)
  useEffect(() => {
    if (file) {
      setStep(1);
      setSearchInput('');
      setDebouncedSearch('');
      setSelectedAnime(null);
      setSelectedEpisode(null);
    }
  }, [file]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Search anime query
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: discoverKeys.search(debouncedSearch),
    queryFn: () => discoverApi.search(debouncedSearch),
    enabled: debouncedSearch.length > 0,
  });

  // Episodes query
  const { data: episodes, isLoading: isLoadingEpisodes } = useQuery({
    queryKey: discoverKeys.episodes(selectedAnime?.bangumi_id ?? 0),
    queryFn: () => discoverApi.episodes(selectedAnime!.bangumi_id),
    enabled: !!selectedAnime && step === 2,
  });

  // Match mutation
  const matchMutation = useMutation({
    mutationFn: () => {
      if (!file || !selectedAnime || !selectedEpisode) throw new Error('Missing data');
      return libraryApi.matchFile(file.id, {
        bangumi_id: selectedAnime.bangumi_id,
        episode_id: selectedEpisode.bangumi_episode_id,
      });
    },
    onSuccess: () => {
      toast.success(i18n._(msg`library.detail.matchModal.matched`));
      queryClient.invalidateQueries({ queryKey: libraryKeys.mediaFiles(libraryId) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(libraryId) });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSelectAnime = (anime: AnimeSummary) => {
    setSelectedAnime(anime);
    setSelectedEpisode(null);
    setStep(2);
  };

  const handleGoBackToSearch = () => {
    setStep(1);
    setSelectedAnime(null);
    setSelectedEpisode(null);
  };

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title={i18n._(msg`library.detail.matchModal.title`)}
      size="lg"
    >
      {/* Filename banner */}
      {file && (
        <div className="mb-4 rounded-md bg-white/[0.04] px-3 py-2">
          <p className="font-mono text-xs text-mm-text-muted truncate" title={file.filename}>
            {file.filename}
          </p>
        </div>
      )}

      {step === 1 && (
        <div>
          {/* Search input */}
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={i18n._(msg`library.detail.matchModal.searchPlaceholder`)}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-white placeholder:text-mm-text-muted focus:outline-none focus:ring-1 focus:ring-mm-accent/50 mb-4"
            autoFocus
          />

          {/* Results */}
          {!debouncedSearch && (
            <p className="text-center text-[13px] text-mm-text-muted py-8">
              {i18n._(msg`library.detail.matchModal.searchHint`)}
            </p>
          )}

          {isSearching && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          )}

          {debouncedSearch && !isSearching && searchResults && searchResults.length === 0 && (
            <p className="text-center text-[13px] text-mm-text-muted py-8">
              {i18n._(msg`library.detail.matchModal.noResults`)}
            </p>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-1 max-h-[45vh] overflow-y-auto">
              {searchResults.map((anime) => (
                <button
                  key={anime.bangumi_id}
                  type="button"
                  onClick={() => handleSelectAnime(anime)}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                >
                  <img
                    src={anime.cover_image}
                    alt={anime.title}
                    className="w-10 h-14 object-cover rounded flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{anime.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-mm-text-muted mt-0.5">
                      <span>{anime.episode_count} eps</span>
                      {anime.score > 0 && (
                        <span className="text-amber-400">{anime.score.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedAnime && (
        <div>
          {/* Selected anime header */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.06]">
            <img
              src={selectedAnime.cover_image}
              alt={selectedAnime.title}
              className="w-10 h-14 object-cover rounded flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{selectedAnime.title}</p>
              <button
                type="button"
                onClick={handleGoBackToSearch}
                className="text-[11px] text-mm-accent hover:text-mm-accent/80 transition-colors cursor-pointer"
              >
                {i18n._(msg`library.detail.matchModal.change`)}
              </button>
            </div>
          </div>

          {/* Episode list */}
          {isLoadingEpisodes && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          )}

          {episodes && episodes.length > 0 && (
            <div className="space-y-1 max-h-[35vh] overflow-y-auto mb-4">
              {episodes.map((ep) => {
                const isSelected = selectedEpisode?.bangumi_episode_id === ep.bangumi_episode_id;
                return (
                  <button
                    key={ep.bangumi_episode_id}
                    type="button"
                    onClick={() => setSelectedEpisode(ep)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer text-left',
                      isSelected
                        ? 'bg-mm-accent/15 border border-mm-accent/40'
                        : 'hover:bg-white/[0.06] border border-transparent',
                    )}
                  >
                    <span className="text-[12px] font-bold text-mm-text-secondary tabular-nums whitespace-nowrap">
                      EP {String(ep.sort).padStart(2, '0')}
                    </span>
                    <span className="text-sm text-white truncate flex-1">
                      {ep.title || ep.title_original}
                    </span>
                    {ep.air_date && (
                      <span className="text-[11px] text-mm-text-muted whitespace-nowrap">
                        {ep.air_date}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {episodes && episodes.length === 0 && !isLoadingEpisodes && (
            <p className="text-center text-[13px] text-mm-text-muted py-8">
              {i18n._(msg`library.detail.matchModal.noEpisodes`)}
            </p>
          )}

          {/* Confirm button */}
          <button
            type="button"
            onClick={() => matchMutation.mutate()}
            disabled={!selectedEpisode || matchMutation.isPending}
            className="w-full py-2.5 text-sm font-bold rounded-md text-black bg-mm-accent hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {matchMutation.isPending
              ? i18n._(msg`common.loading`)
              : i18n._(msg`library.detail.matchModal.confirm`)}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* -- Main page -------------------------------------------------------------- */

export function LibraryDetailPage() {
  const { i18n } = useLingui();
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(!isAuthenticated);
  const { id } = useParams({ from: '/libraries/$id' });
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [matchingFile, setMatchingFile] = useState<MediaFileEntry | null>(null);

  useEffect(() => {
    if (isAuthenticated) setShowLogin(false);
    else setShowLogin(true);
  }, [isAuthenticated]);

  const {
    data: library,
    isLoading,
    isError,
  } = useQuery({
    queryKey: libraryKeys.detail(id),
    queryFn: () => libraryApi.get(id),
    enabled: isAuthenticated,
  });

  const scanMutation = useMutation({
    mutationFn: () => libraryApi.scan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      toast.success(i18n._(msg`library.toast.scanComplete`));
    },
    onError: (err: Error) => {
      toast.error(`${i18n._(msg`library.toast.scanFailed`)}: ${err.message}`);
    },
  });

  const tabs = [
    { key: 'all', label: i18n._(msg`library.detail.tab.allFiles`) },
    { key: 'unmatched', label: i18n._(msg`library.detail.tab.unmatched`) },
    { key: 'history', label: i18n._(msg`library.detail.tab.scanHistory`) },
  ];

  if (!isAuthenticated) {
    return (
      <PageTransition>
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <div className="mb-8">
            <svg viewBox="0 0 80 80" fill="none" className="w-20 h-20 text-white/[0.07]">
              <path
                d="M40 10a14 14 0 0 1 14 14v6H26v-6A14 14 0 0 1 40 10z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect x="16" y="30" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="1.5" fill="currentColor" />
              <circle cx="40" cy="46" r="4" fill="oklch(12% 0.01 260)" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white/70 mb-2">
            {i18n._(msg`auth.libraries.signInTitle`)}
          </h2>
          <p className="text-sm text-white/30 mb-8 text-center max-w-xs">
            {i18n._(msg`auth.libraries.signInSubtitle`)}
          </p>
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="px-5 py-2.5 text-sm font-bold rounded-md text-black bg-mm-accent hover:opacity-90 transition-opacity cursor-pointer"
          >
            {i18n._(msg`auth.login.submit`)}
          </button>
          <LoginModal
            open={showLogin}
            onClose={() => setShowLogin(false)}
          />
        </div>
      </PageTransition>
    );
  }

  if (isLoading) {
    return (
      <PageTransition>
        <LibraryDetailSkeleton />
      </PageTransition>
    );
  }

  if (isError || !library) {
    return (
      <PageTransition>
        <div className="min-h-screen flex flex-col items-center justify-center">
          <p className="text-sm text-mm-text-tertiary mb-3">
            {isError ? i18n._(msg`common.loadFailed`) : i18n._(msg`library.detail.notFound`)}
          </p>
          <Link
            to="/libraries"
            className="text-[13px] text-mm-accent hover:text-mm-accent/80 transition-colors"
          >
            {i18n._(msg`library.detail.backToLibraries`)}
          </Link>
        </div>
      </PageTransition>
    );
  }

  const matchPct = library.file_count > 0
    ? Math.round((library.matched_count / library.file_count) * 100)
    : 0;

  const lastScannedText = library.last_scanned_at
    ? formatDistanceToNow(new Date(library.last_scanned_at), { addSuffix: true })
    : i18n._(msg`library.neverScanned`);

  const sourceLabel = library.source_type && library.source_type !== 'local'
    ? library.source_type.toUpperCase()
    : null;

  return (
    <PageTransition>
      <div className="min-h-screen px-4 md:px-8 pt-6 pb-16">
        {/* Back link */}
        <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          <Link
            to="/libraries"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/50 transition-colors mb-8"
          >
            <span>&larr;</span> {i18n._(msg`library.detail.backToLibraries`)}
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-3"
        >
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {library.name}
            </h1>
            <p className="text-sm text-white/40 mt-1.5 truncate">
              <span className="font-mono">{library.path}</span>
              {sourceLabel && (
                <> <span className="text-white/15">&middot;</span> {sourceLabel}</>
              )}
              <> <span className="text-white/15">&middot;</span> {lastScannedText}</>
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="px-4 py-2 text-sm font-medium rounded-md border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {scanMutation.isPending
                ? i18n._(msg`library.scanning`)
                : i18n._(msg`library.detail.scanNow`)}
            </motion.button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium rounded-md border border-white/[0.12] text-white/70 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              {i18n._(msg`library.detail.settings`)}
            </button>
          </div>
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-8 text-sm text-white/40 tabular-nums"
        >
          <span className="text-white/60">{library.file_count}</span> files
          <span className="text-white/15 mx-2">&middot;</span>
          <span className="text-green-400/80">{matchPct}%</span> matched
          <span className="text-white/15 mx-2">&middot;</span>
          <span className="text-amber-400/80">{library.unmatched_count}</span> unmatched
          <span className="text-white/15 mx-2">&middot;</span>
          <span className="text-white/60">{formatBytes(library.total_size_bytes)}</span>
        </motion.div>

        {/* Tab bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-end gap-0 border-b border-white/[0.06] mb-6">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative px-4 pb-3 pt-2 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors duration-200',
                    isActive
                      ? 'text-white'
                      : 'text-white/25 hover:text-white/40',
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="library-tab-underline"
                      className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {activeTab === 'all' && (
              <motion.div
                key="all"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <FileTable libraryId={id} status="all" />
              </motion.div>
            )}
            {activeTab === 'unmatched' && (
              <motion.div
                key="unmatched"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <FileTable libraryId={id} status="unmatched" onMatch={setMatchingFile} />
              </motion.div>
            )}
            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <ScanHistoryList libraryId={id} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <MatchModal
        file={matchingFile}
        onClose={() => setMatchingFile(null)}
        libraryId={id}
      />
    </PageTransition>
  );
}
