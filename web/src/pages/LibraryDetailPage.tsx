import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { libraryApi, libraryKeys, type MediaFileEntry } from '../lib/api/library';
import { cn } from '../lib/utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i > 2 ? 1 : 0)} ${sizes[i]}`;
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  if (!sourceType || sourceType === 'local') return null;
  const label = sourceType.toUpperCase();
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.12] text-gray-200">
      {label}
    </span>
  );
}

/* -- Skeleton loader -------------------------------------------------------- */

function LibraryDetailSkeleton() {
  return (
    <div className="min-h-screen px-4 md:px-8 pt-6 pb-16">
      {/* Back link */}
      <Skeleton className="h-4 w-24 mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-12 rounded" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/[0.03] rounded-lg p-4">
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 mb-6 border-b border-white/[0.06] pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
    </div>
  );
}

/* -- File table ------------------------------------------------------------- */

function StatusBadge({ status }: { status: MediaFileEntry['match_status'] }) {
  const styles = {
    auto: 'bg-green-400/15 text-green-400',
    manual: 'bg-blue-400/15 text-blue-400',
    unmatched: 'bg-amber-400/15 text-amber-400',
  };
  const labels = { auto: 'AUTO', manual: 'MANUAL', unmatched: 'UNMATCHED' };
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', styles[status])}>
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
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={i18n._(msg`library.detail.searchFiles`)}
          className="w-full max-w-sm bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-white placeholder:text-mm-text-muted focus:outline-none focus:ring-1 focus:ring-mm-accent/50"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-mm-text-muted border-b border-white/[0.04]">
              <th className="pb-2 pr-4 font-medium">{i18n._(msg`library.detail.col.filename`)}</th>
              <th className="pb-2 pr-4 font-medium">{i18n._(msg`library.detail.col.matchedTo`)}</th>
              <th className="pb-2 pr-4 font-medium">{i18n._(msg`library.detail.col.status`)}</th>
              <th className="pb-2 pr-4 font-medium">{i18n._(msg`library.detail.col.subs`)}</th>
              <th className="pb-2 pr-4 font-medium">{i18n._(msg`library.detail.col.size`)}</th>
              {onMatch && <th className="pb-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="bg-white/[0.03] border-b border-white/[0.04] hover:bg-white/[0.05] transition-colors">
                <td className="py-2.5 pr-4 max-w-[300px]">
                  <span className="font-mono text-xs text-white truncate block" title={file.path}>
                    {file.filename}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-[13px]">
                  {file.matched_anime_title ? (
                    <span className="text-white">
                      {file.matched_anime_title}{' '}
                      <span className="text-mm-text-muted">EP {String(file.matched_episode_sort).padStart(2, '0')}</span>
                    </span>
                  ) : (
                    <span className="text-mm-text-muted">&mdash;</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <StatusBadge status={file.match_status} />
                </td>
                <td className="py-2.5 pr-4 text-[12px] text-mm-text-secondary tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-mm-text-muted">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M7 15h4M13 15h4M7 11h10" />
                    </svg>
                    {file.subtitle_count}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-[12px] text-mm-text-secondary tabular-nums whitespace-nowrap">
                  {formatBytes(file.size_bytes)}
                </td>
                {onMatch && (
                  <td className="py-2.5">
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
          <p className="text-[12px] text-mm-text-muted animate-pulse">{i18n._(msg`common.loading`)}</p>
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
          <div key={scan.id} className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.04]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 text-[13px]">
                <span className="text-mm-text-secondary">
                  {startDate.toLocaleDateString()} {startDate.toLocaleTimeString()}
                </span>
                <span className="text-mm-text-muted">
                  {duration !== null
                    ? `${duration}s`
                    : i18n._(msg`library.detail.inProgress`)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[12px] tabular-nums">
                <span className="text-mm-text-secondary">
                  {scan.files_found} {i18n._(msg`library.detail.found`)}
                </span>
                <span className="text-green-400">
                  {scan.files_matched} {i18n._(msg`library.detail.matched`)}
                </span>
                <span className="text-amber-400">
                  {scan.files_unmatched} {i18n._(msg`library.detail.unmatchedShort`)}
                </span>
                {errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(scan.id)}
                    className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    {errors.length} {i18n._(msg`library.detail.errors`)} {isExpanded ? '▾' : '▸'}
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

/* -- Main page -------------------------------------------------------------- */

export function LibraryDetailPage() {
  const { i18n } = useLingui();
  const { id } = useParams({ from: '/libraries/$id' });
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('all');
  // Used by Task 8 match modal
  const [_matchingFile, setMatchingFile] = useState<MediaFileEntry | null>(null);

  const {
    data: library,
    isLoading,
    isError,
  } = useQuery({
    queryKey: libraryKeys.detail(id),
    queryFn: () => libraryApi.get(id),
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

  return (
    <PageTransition>
      <div className="min-h-screen px-4 md:px-8 pt-6 pb-16">
        {/* Back link */}
        <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          <Link
            to="/libraries"
            className="inline-flex items-center gap-1 text-[13px] text-mm-text-muted hover:text-mm-text-secondary transition-colors mb-6"
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
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {library.name}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[13px] font-mono text-white/40 truncate max-w-[400px]">
                {library.path}
              </span>
              <SourceBadge sourceType={library.source_type} />
              <span className="text-[12px] text-mm-text-muted">
                {lastScannedText}
              </span>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="px-4 py-2 text-sm font-bold rounded-md text-black bg-mm-accent hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {scanMutation.isPending
                ? i18n._(msg`library.scanning`)
                : i18n._(msg`library.detail.scanNow`)}
            </motion.button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-bold rounded-md bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors cursor-pointer"
            >
              {i18n._(msg`library.detail.settings`)}
            </button>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
        >
          {/* Total Files */}
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-white tabular-nums">
              {library.file_count}
            </p>
            <p className="text-[12px] text-mm-text-muted mt-1">
              {i18n._(msg`library.detail.totalFiles`)}
            </p>
          </div>

          {/* Matched */}
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-green-400 tabular-nums">
              {matchPct}%
            </p>
            <p className="text-[12px] text-mm-text-muted mt-1">
              {i18n._(msg`library.detail.matched`)}
            </p>
          </div>

          {/* Unmatched */}
          <button
            type="button"
            onClick={() => setActiveTab('unmatched')}
            className={cn(
              'bg-white/[0.03] rounded-lg p-4 text-left transition-colors cursor-pointer',
              activeTab === 'unmatched' && 'ring-1 ring-amber-400/30',
              'hover:bg-white/[0.05]',
            )}
          >
            <p className="text-2xl font-bold text-amber-400 tabular-nums">
              {library.unmatched_count}
            </p>
            <p className="text-[12px] text-mm-text-muted mt-1">
              {i18n._(msg`library.detail.unmatched`)}
            </p>
          </button>

          {/* Total Size */}
          <div className="bg-white/[0.03] rounded-lg p-4">
            <p className="text-2xl font-bold text-white tabular-nums">
              {formatBytes(library.total_size_bytes)}
            </p>
            <p className="text-[12px] text-mm-text-muted mt-1">
              {i18n._(msg`library.detail.totalSize`)}
            </p>
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
                    'relative px-4 pb-2.5 pt-2 text-[13px] font-semibold cursor-pointer transition-colors duration-200',
                    isActive
                      ? 'text-mm-accent'
                      : 'text-mm-text-tertiary hover:text-mm-text-secondary',
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
    </PageTransition>
  );
}
