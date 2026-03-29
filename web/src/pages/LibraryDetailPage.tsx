import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useScanStore } from '../store/scan-store';
import { Link, useParams } from '@tanstack/react-router';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoginModal } from '../components/LoginModal';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

/* -- Source icon (inline) --------------------------------------------------- */

function SourceIcon({ sourceType, className }: { sourceType: string; className?: string }) {
  if (sourceType === 'smb' || sourceType === 'sftp' || sourceType === 'ftp') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <rect x="8" y="10" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8" y="28" width="32" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="15" r="1.5" fill="currentColor" />
        <circle cx="14" cy="33" r="1.5" fill="currentColor" />
        <line x1="24" y1="20" x2="24" y2="28" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (sourceType === 'webdav' || sourceType === 's3' || sourceType === 'gdrive' || sourceType === 'onedrive' || sourceType === 'dropbox') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <path d="M14 34a8 8 0 0 1-.5-16 11 11 0 0 1 21 0A8 8 0 0 1 34 34H14z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (sourceType === 'http') {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="24" cy="24" rx="8" ry="16" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className}>
      <path
        d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/* -- Skeleton loader -------------------------------------------------------- */

function LibraryDetailSkeleton() {
  return (
    <div className="min-h-screen px-4 md:px-8 pt-6 pb-16">
      {/* Back link */}
      <Skeleton className="h-4 w-24 mb-8" />

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-6 mb-6 border-b border-white/[0.06] pb-3">
        {Array.from({ length: 2 }).map((_, i) => (
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
  onMatch,
}: {
  libraryId: string;
  onMatch?: (file: MediaFileEntry) => void;
}) {
  const { i18n } = useLingui();
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<MediaFileEntry[]>([]);
  const isFirstRender = useState(true);

  useEffect(() => {
    // Skip the initial mount — don't reset accumulated on first render
    if (isFirstRender[0]) {
      isFirstRender[0] = false;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
      setAccumulated([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset pagination when filter changes
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
  }, [statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: libraryKeys.mediaFiles(libraryId, { status: statusFilter, q: debouncedSearch || undefined, page }),
    queryFn: () => libraryApi.mediaFiles(libraryId, { status: statusFilter, q: debouncedSearch || undefined, page }),
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

  const columns: ColumnDef<MediaFileEntry>[] = [
    {
      accessorKey: 'filename',
      header: () => i18n._(msg`library.detail.col.filename`),
      cell: ({ row }) => (
        <div className="max-w-[300px]">
          <span className="font-mono text-xs text-white/80 truncate block" title={row.original.path}>
            {row.original.filename}
          </span>
        </div>
      ),
    },
    {
      id: 'matched',
      header: () => i18n._(msg`library.detail.col.matchedTo`),
      cell: ({ row }) => {
        const file = row.original;
        if (file.matched_anime_title && file.matched_episode_sort > 0) {
          return (
            <span className="text-sm text-white/60">
              {file.matched_anime_title} EP{String(file.matched_episode_sort).padStart(2, '0')}
            </span>
          );
        }
        return <span className="text-white/20">&mdash;</span>;
      },
    },
    {
      accessorKey: 'match_status',
      header: () => i18n._(msg`library.detail.col.status`),
      cell: ({ row }) => <StatusBadge status={row.original.match_status} />,
    },
    {
      accessorKey: 'subtitle_count',
      header: () => i18n._(msg`library.detail.col.subs`),
      cell: ({ row }) => (
        <span className="text-xs text-white/40">{row.original.subtitle_count}</span>
      ),
    },
    {
      accessorKey: 'size_bytes',
      header: () => i18n._(msg`library.detail.col.size`),
      cell: ({ row }) => (
        <span className="text-xs text-white/50">{formatBytes(row.original.size_bytes)}</span>
      ),
    },
    ...(onMatch
      ? [
          {
            id: 'actions',
            cell: ({ row }: { row: { original: MediaFileEntry } }) => {
              if (row.original.match_status === 'unmatched') {
                return (
                  <button
                    type="button"
                    onClick={() => onMatch(row.original)}
                    className="text-[11px] font-bold text-mm-accent hover:text-mm-accent/80 transition-colors px-2 py-1 rounded bg-mm-accent/10 hover:bg-mm-accent/20 cursor-pointer"
                  >
                    {i18n._(msg`library.detail.match`)}
                  </button>
                );
              }
              return null;
            },
          } satisfies ColumnDef<MediaFileEntry>,
        ]
      : []),
  ];

  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!isLoading && files.length === 0 && !debouncedSearch) {
    // Empty state
    if (statusFilter === 'unmatched') {
      return (
        <div className="py-16 text-center">
          <span className="text-green-400 text-2xl mb-2 block">&#10003;</span>
          <p className="text-[13px] text-green-400/70">{i18n._(msg`library.detail.allMatched`)}</p>
        </div>
      );
    }
    return (
      <div className="py-20 flex flex-col items-center text-center">
        <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 text-white/[0.08] mb-4">
          <path
            d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <h3 className="text-sm font-semibold text-white/50 mb-1">{i18n._(msg`library.detail.noFiles`)}</h3>
        <p className="text-xs text-white/25 mb-5 max-w-[260px]">{i18n._(msg`library.detail.noFilesHint`)}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search + filter */}
      <div className="mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={i18n._(msg`library.detail.searchFiles`)}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/[0.15]"
          />
        </div>
        <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
          {([
            { key: 'all' as const, label: i18n._(msg`schedule.all`) },
            { key: 'matched' as const, label: i18n._(msg`library.detail.matched`) },
            { key: 'unmatched' as const, label: i18n._(msg`library.detail.unmatchedShort`) },
          ]).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
                statusFilter === f.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/40 hover:text-white/60',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-white/[0.04] hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-[10px] uppercase tracking-wider text-white/30 font-medium h-auto pb-3">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="border-white/[0.04] hover:bg-white/[0.02]">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
      <div className="py-20 flex flex-col items-center text-center">
        <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 text-white/[0.08] mb-4">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="24,14 24,24 32,28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="text-sm font-semibold text-white/50 mb-1">{i18n._(msg`library.detail.noScans`)}</h3>
        <p className="text-xs text-white/25 mb-5 max-w-[260px]">{i18n._(msg`library.detail.noScansHint`)}</p>
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
                      <span>{anime.episode_count} {i18n._(msg`common.ep`)}</span>
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

/* -- Settings modal --------------------------------------------------------- */

function SettingsModal({
  open,
  onClose,
  library,
  libraryId,
}: {
  open: boolean;
  onClose: () => void;
  library: { name: string; path: string; enabled: number; scan_interval_minutes: number; source_type: string; source_config?: Record<string, unknown> };
  libraryId: string;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [name, setName] = useState(library.name);
  const [scanInterval, setScanInterval] = useState(library.scan_interval_minutes);
  const [enabled, setEnabled] = useState(!!library.enabled);

  useEffect(() => {
    if (open) {
      setName(library.name);
      setScanInterval(library.scan_interval_minutes);
      setEnabled(!!library.enabled);
    }
  }, [open, library]);

  const updateMutation = useMutation({
    mutationFn: () =>
      libraryApi.update(libraryId, {
        name,
        path: library.path,
        enabled: enabled,
        scan_interval_minutes: scanInterval,
        source_type: library.source_type,
        source_config: library.source_config,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(libraryId) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.list() });
      toast.success(i18n._(msg`library.toast.updated`));
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={i18n._(msg`library.detail.settings`)}>
      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">
            {i18n._(msg`library.name`)}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/[0.15]"
          />
        </div>

        {/* Scan interval */}
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1.5">
            {i18n._(msg`library.scanInterval`)}
          </label>
          <input
            type="number"
            min={0}
            value={scanInterval}
            onChange={(e) => setScanInterval(Number(e.target.value))}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/[0.15]"
          />
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/50">
            {i18n._(msg`library.enabled`)}
          </label>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer',
              enabled ? 'bg-mm-accent' : 'bg-white/[0.12]',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !name.trim()}
          className="w-full py-2.5 text-sm font-bold rounded-md text-black bg-mm-accent hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
        >
          {updateMutation.isPending
            ? i18n._(msg`library.saving`)
            : i18n._(msg`library.saveChanges`)}
        </button>
      </div>
    </Modal>
  );
}

/* -- Main page -------------------------------------------------------------- */

export function LibraryDetailPage() {
  const { i18n } = useLingui();
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(!isAuthenticated);
  const { id } = useParams({ from: '/libraries_/$id' });
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('files');
  const [matchingFile, setMatchingFile] = useState<MediaFileEntry | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const scanProgress = useScanStore((s) => s.getProgress(id));
  const isScanning = useScanStore((s) => s.isScanning(id));

  useEffect(() => {
    if (isAuthenticated) setShowLogin(false);
    else setShowLogin(true);
  }, [isAuthenticated]);

  // Auto-refresh data when scan completes
  useEffect(() => {
    if (scanProgress?.phase === 'completed') {
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: libraryKeys.mediaFiles(id) });
    }
  }, [scanProgress?.phase, id, queryClient]);

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
    onError: (err: Error) => {
      toast.error(`${i18n._(msg`library.toast.scanFailed`)}: ${err.message}`);
    },
  });

  const tabs = [
    { key: 'files', label: i18n._(msg`library.detail.tab.files`) },
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

  const lastScannedDate = library.last_scanned_at ? new Date(library.last_scanned_at) : null;
  const lastScannedText = lastScannedDate && !Number.isNaN(lastScannedDate.getTime())
    ? formatDistanceToNow(lastScannedDate, { addSuffix: true })
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
          className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6"
        >
          <div className="flex items-start gap-4 min-w-0">
            {/* Library icon badge */}
            <div className="shrink-0 w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <SourceIcon sourceType={library.source_type ?? 'local'} className="w-6 h-6 text-white/30" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {library.name}
              </h1>
              <p className="font-mono text-xs text-white/30 mt-1 truncate">{library.path}</p>
              <div className="flex items-center gap-2 mt-2">
                {sourceLabel && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40">
                    {sourceLabel}
                  </span>
                )}
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-white/30">
                  {lastScannedText}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => scanMutation.mutate()}
              disabled={isScanning || scanMutation.isPending}
              className="px-5 py-2.5 text-sm font-bold rounded-lg text-black bg-mm-accent hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {isScanning
                ? i18n._(msg`library.scanning`)
                : i18n._(msg`library.detail.scanNow`)}
            </motion.button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-white/[0.12] text-white/60 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              {i18n._(msg`library.detail.settings`)}
            </button>
          </div>
        </motion.div>

        {/* Scan progress banner */}
        <AnimatePresence>
          {isScanning && scanProgress && (() => {
            const phaseLabel =
              scanProgress.phase === 'scanning'
                ? i18n._(msg`scan.phase.scanning`)
                : scanProgress.phase === 'hashing'
                  ? i18n._(msg`scan.phase.hashing`)
                  : i18n._(msg`scan.phase.matching`);

            const isIndeterminate = scanProgress.phase === 'scanning';
            const percentage =
              scanProgress.phase === 'hashing' && scanProgress.filesTotal > 0
                ? (scanProgress.filesHashed / scanProgress.filesTotal) * 100
                : scanProgress.phase === 'matching' && scanProgress.filesTotal > 0
                  ? (scanProgress.filesMatched / scanProgress.filesTotal) * 100
                  : 0;

            return (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg border border-mm-accent/20 bg-mm-accent/[0.04] p-4 mb-6"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-mm-accent animate-pulse" />
                    <span className="text-sm font-medium text-white/80">
                      {phaseLabel}
                    </span>
                  </div>
                  <span className="text-xs text-white/40 font-mono">
                    {scanProgress.filesFound > 0 && `${scanProgress.filesFound} files`}
                    {scanProgress.filesMatched > 0 && ` · ${scanProgress.filesMatched}/${scanProgress.filesTotal} matched`}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-2">
                  {isIndeterminate ? (
                    <div className="h-full w-1/3 rounded-full bg-mm-accent animate-pulse" />
                  ) : (
                    <motion.div
                      className="h-full rounded-full bg-mm-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </div>
                {scanProgress.currentFile && (
                  <p className="text-xs text-white/30 truncate font-mono">
                    {scanProgress.currentFile}
                  </p>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        >
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-white tabular-nums">{library.file_count}</p>
            <p className="text-xs text-white/40 mt-0.5">{i18n._(msg`library.detail.stats.files`)}</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-green-400 tabular-nums">{matchPct}%</p>
            <p className="text-xs text-white/40 mt-0.5">{i18n._(msg`library.detail.stats.matched`)}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className="bg-white/[0.03] rounded-lg p-4 text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <p className="text-2xl font-bold text-amber-400 tabular-nums">{library.unmatched_count}</p>
            <p className="text-xs text-white/40 mt-0.5">{i18n._(msg`library.detail.stats.unmatched`)}</p>
          </button>
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-white tabular-nums">{formatBytes(library.total_size_bytes)}</p>
            <p className="text-xs text-white/40 mt-0.5">{i18n._(msg`library.detail.stats.size`)}</p>
          </div>
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
            {activeTab === 'files' && (
              <motion.div
                key="files"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <FileTable libraryId={id} onMatch={setMatchingFile} />
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

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        library={library}
        libraryId={id}
      />
    </PageTransition>
  );
}
