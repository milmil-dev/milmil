import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Copy01Icon,
  Folder01Icon,
  GridViewIcon,
  InformationCircleIcon,
  LinkSquare01Icon,
  MoreHorizontalIcon,
  PlayIcon,
  ScanIcon,
  Settings01Icon,
  ShuffleIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataPagination } from '../components/DataPagination';
import { LoginModal } from '../components/LoginModal';
import { Modal } from '../components/Modal';
import { MotionTable } from '../components/MotionTable';
import { PageAtmosphere } from '../components/PageAtmosphere';
import { PageTransition } from '../components/PageTransition';
import { ScanIntervalSelect } from '../components/ScanIntervalSelect';
import { Skeleton } from '../components/Skeleton';
import { Button } from '../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useAuth } from '../hooks/use-auth';
import { useDocumentTitle } from '../hooks/use-document-title';
import { type AnimeSummary, discoverApi, discoverKeys, type Episode } from '../lib/api/discover';
import {
  type FileTreeNode,
  libraryApi,
  libraryKeys,
  type MediaFileEntry,
  type MediaFilesResponse,
} from '../lib/api/library';
import { cn } from '../lib/utils';
import { useScanStore } from '../store/scan-store';

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
  if (
    sourceType === 'webdav' ||
    sourceType === 's3' ||
    sourceType === 'gdrive' ||
    sourceType === 'onedrive' ||
    sourceType === 'dropbox'
  ) {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <path
          d="M14 34a8 8 0 0 1-.5-16 11 11 0 0 1 21 0A8 8 0 0 1 34 34H14z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
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

/* -- File action menu ------------------------------------------------------- */

function FileActionMenu({
  file,
  onMatch,
}: {
  file: MediaFileEntry;
  onMatch: (file: MediaFileEntry) => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const isMatched = file.match_status !== 'unmatched';

  const unmatchMutation = useMutation({
    mutationFn: () => libraryApi.unmatchFile(file.id),
    onSuccess: () => {
      toast.success(i18n._(msg`library.detail.unmatched`));
      queryClient.invalidateQueries({ queryKey: ['media-files', file.library_id] });
      queryClient.invalidateQueries({ queryKey: libraryKeys.detail(file.library_id) });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyPath = () => {
    navigator.clipboard.writeText(file.path);
    toast.success(i18n._(msg`library.detail.pathCopied`));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-white/25 hover:text-white/60"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-44 p-1 bg-mm-surface rounded-lg shadow-xl"
      >
        {isMatched && (
          <button
            type="button"
            onClick={() => onMatch(file)}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={ShuffleIcon} size={13} />
            {i18n._(msg`library.detail.editMatch`)}
          </button>
        )}
        {isMatched && (
          <button
            type="button"
            onClick={() => unmatchMutation.mutate()}
            disabled={unmatchMutation.isPending}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-white/60 hover:text-red-400 hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer disabled:opacity-40"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} />
            {i18n._(msg`library.detail.unmatch`)}
          </button>
        )}
        <button
          type="button"
          onClick={copyPath}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
        >
          <HugeiconsIcon icon={Copy01Icon} size={13} />
          {i18n._(msg`library.detail.copyPath`)}
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] rounded-md transition-colors cursor-pointer"
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={13} />
          {i18n._(msg`library.detail.fileInfo`)}
        </button>
      </PopoverContent>
    </Popover>
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
  const [perPage, setPerPage] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset pagination when filter changes
  const handleFilterChange = (f: 'all' | 'matched' | 'unmatched') => {
    setStatusFilter(f);
    setPage(1);
  };

  const { data, isLoading, isFetching } = useQuery<MediaFilesResponse, Error>({
    queryKey: ['media-files', libraryId, page, perPage, statusFilter, debouncedSearch],
    queryFn: () =>
      libraryApi.mediaFiles(libraryId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        q: debouncedSearch || undefined,
        page,
        per_page: perPage,
      }),
    enabled: !!libraryId,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const files = data?.items ?? [];
  const total = data?.total ?? 0;

  // Only show skeleton on true initial load (no data at all).
  // For subsequent fetches, show stale data with a subtle fade overlay
  // that appears after 300ms via CSS transition (no UI freeze).
  const showSkeleton = isLoading && files.length === 0;
  const showOverlay = isFetching && files.length > 0;
  const columns = React.useMemo<ColumnDef<MediaFileEntry>[]>(
    () => [
      {
        accessorKey: 'filename',
        header: () => i18n._(msg`library.detail.col.filename`),
        meta: { width: 650 },
        cell: ({ row }) => (
          <div className="w-full min-w-0 overflow-hidden">
            <span
              className="font-mono text-xs text-white/80 truncate block"
              title={row.original.path}
            >
              {row.original.filename}
            </span>
          </div>
        ),
      },
      {
        id: 'matched',
        header: () => i18n._(msg`library.detail.col.matchedAnime`),
        meta: { width: 300 },
        cell: ({ row }) => {
          const file = row.original;
          if (file.matched_anime_title && file.matched_episode_sort > 0) {
            const hasBangumiLink = file.matched_bangumi_id > 0;
            const content = (
              <div
                className={cn(
                  'inline-flex items-center gap-2 min-w-0 px-2 py-1 rounded-md transition-colors',
                  hasBangumiLink && 'hover:bg-white/[0.06] group cursor-pointer'
                )}
              >
                <span
                  className={cn(
                    'text-sm truncate',
                    hasBangumiLink
                      ? 'text-white/70 group-hover:text-mm-accent transition-colors'
                      : 'text-white/60'
                  )}
                >
                  {file.matched_anime_title}
                </span>
                <span className="text-[10px] font-medium text-white/25 shrink-0 tabular-nums px-1 py-px rounded bg-white/[0.04]">
                  EP{String(file.matched_episode_sort).padStart(2, '0')}
                </span>
                {hasBangumiLink && (
                  <svg
                    className="w-3 h-3 shrink-0 text-white/15 group-hover:text-mm-accent/60 transition-colors"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </div>
            );
            if (hasBangumiLink) {
              return (
                <Link
                  to="/anime/$id"
                  params={{ id: String(file.matched_bangumi_id) }}
                  title={file.matched_anime_title}
                >
                  {content}
                </Link>
              );
            }
            return content;
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
              meta: { width: 140 },
              cell: ({ row }: { row: { original: MediaFileEntry } }) => {
                const file = row.original;
                const isMatched = file.match_status !== 'unmatched';
                return (
                  <div className="flex items-center gap-1 justify-end">
                    {/* Primary action */}
                    {isMatched && file.matched_bangumi_id > 0 ? (
                      <Button
                        size="icon-xs"
                        variant="secondary"
                        asChild
                        title={i18n._(msg`library.detail.play`)}
                      >
                        <Link
                          to="/watch/$animeId"
                          params={{ animeId: String(file.matched_bangumi_id) }}
                          search={{ ep: file.matched_episode_sort }}
                        >
                          <HugeiconsIcon icon={PlayIcon} size={13} />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        onClick={() => onMatch(file)}
                        className="gap-1.5"
                      >
                        <HugeiconsIcon icon={LinkSquare01Icon} size={13} />
                        {i18n._(msg`library.detail.match`)}
                      </Button>
                    )}

                    {/* More actions menu */}
                    <FileActionMenu file={file} onMatch={onMatch} />
                  </div>
                );
              },
            } satisfies ColumnDef<MediaFileEntry>,
          ]
        : []),
    ],
    [i18n, onMatch]
  );

  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Only show full-page empty state when no filters/search applied and truly no files
  if (!isLoading && files.length === 0 && !debouncedSearch && statusFilter === 'all') {
    return (
      <div className="py-20 flex flex-col items-center text-center">
        <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 text-white/[0.08] mb-4">
          <path
            d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <h3 className="text-sm font-semibold text-white/50 mb-1">
          {i18n._(msg`library.detail.noFiles`)}
        </h3>
        <p className="text-xs text-white/25 mb-5 max-w-[260px]">
          {i18n._(msg`library.detail.noFilesHint`)}
        </p>
      </div>
    );
  }

  const showEmptyFiltered = !isLoading && files.length === 0;

  return (
    <div>
      {/* Search + filter bar */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none"
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
            className="w-full h-9 bg-white/[0.05] rounded-lg pl-10 pr-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/[0.08] transition-colors"
          />
        </div>
        <div className="flex h-9 rounded-lg bg-white/[0.05] p-0.5">
          {[
            { key: 'all' as const, label: i18n._(msg`schedule.all`) },
            {
              key: 'matched' as const,
              label: i18n._(msg`library.detail.matched`),
            },
            {
              key: 'unmatched' as const,
              label: i18n._(msg`library.detail.unmatchedShort`),
            },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => handleFilterChange(f.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all rounded-md cursor-pointer',
                statusFilter === f.key
                  ? 'bg-white/[0.10] text-white shadow-sm'
                  : 'text-white/35 hover:text-white/55'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table or empty state — min-height keeps layout stable */}
      <div style={{ minHeight: `${perPage * 45 + 40}px` }}>
        {showSkeleton ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {Array.from({ length: perPage }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </motion.div>
        ) : showEmptyFiltered ? (
          <div className="flex items-center justify-center h-40">
            {statusFilter === 'unmatched' ? (
              <div className="text-center">
                <span className="text-green-400 text-2xl mb-2 block">&#10003;</span>
                <p className="text-[13px] text-green-400/70">
                  {i18n._(msg`library.detail.allMatched`)}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-mm-text-muted">
                {i18n._(msg`library.detail.noFiles`)}
              </p>
            )}
          </div>
        ) : (
          <div className="relative">
            <MotionTable table={table} tableClassName="table-fixed" />
            <div
              className={cn(
                'absolute inset-0 z-20 pointer-events-none flex items-center justify-center transition-opacity duration-200',
                showOverlay ? 'opacity-100 delay-300' : 'opacity-0'
              )}
            >
              <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <DataPagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
      />
    </div>
  );
}

/* -- File tree view --------------------------------------------------------- */

function FileTreeView({
  libraryId,
  onMatch,
}: {
  libraryId: string;
  onMatch?: (file: MediaFileEntry) => void;
}) {
  const { i18n } = useLingui();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const { data: tree, isLoading } = useQuery({
    queryKey: libraryKeys.fileTree(libraryId),
    queryFn: () => libraryApi.fileTree(libraryId),
    enabled: !!libraryId,
  });

  const toggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-1.5 py-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="py-16 text-center text-sm text-white/25">
        {i18n._(msg`library.detail.noFiles`)}
      </div>
    );
  }

  const renderNode = (node: FileTreeNode, depth: number) => {
    const isExpanded = expandedPaths.has(node.path);
    const hasChildren =
      (node.children && node.children.length > 0) || (node.files && node.files.length > 0);
    const matchedCount = countMatched(node);
    const matchPct = node.file_count > 0 ? Math.round((matchedCount / node.file_count) * 100) : 0;
    const indent = depth * 20 + 12;

    return (
      <div key={node.path}>
        {/* Folder row */}
        <button
          type="button"
          onClick={() => toggleFolder(node.path)}
          className={cn(
            'w-full flex items-center gap-2 py-1.5 rounded-md text-left transition-colors cursor-pointer group',
            'hover:bg-white/[0.04]',
            isExpanded && 'bg-white/[0.02]'
          )}
          style={{ paddingLeft: `${indent}px`, paddingRight: 8 }}
        >
          <svg
            className={cn(
              'w-3.5 h-3.5 shrink-0 text-white/20 transition-transform duration-150',
              isExpanded && 'rotate-90',
              !hasChildren && 'invisible'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <HugeiconsIcon
            icon={Folder01Icon}
            size={15}
            className={cn(
              'shrink-0 transition-colors',
              isExpanded ? 'text-white/50' : 'text-white/20 group-hover:text-white/35'
            )}
          />
          <span className="text-[13px] font-medium text-white/65 group-hover:text-white/90 truncate flex-1">
            {node.name}
          </span>
          <span className="text-[10px] tabular-nums text-white/15 shrink-0 mr-2">
            {node.file_count}
          </span>
          <span
            className="text-[10px] tabular-nums shrink-0 w-8 text-right"
            style={{
              color:
                matchPct === 100
                  ? 'rgb(74 222 128 / 0.5)'
                  : matchPct > 0
                    ? 'rgb(251 191 36 / 0.4)'
                    : 'rgb(255 255 255 / 0.10)',
            }}
          >
            {matchPct}%
          </span>
          <span className="text-[10px] tabular-nums text-white/15 shrink-0 w-16 text-right">
            {formatBytes(node.size_bytes)}
          </span>
        </button>

        {/* Children with indent guide */}
        {isExpanded && hasChildren && (
          <div className="relative">
            {/* Vertical guide line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-white/[0.04]"
              style={{ left: `${indent + 7}px` }}
            />
            {node.children?.map((child) => renderNode(child, depth + 1))}
            {node.files?.map((file) => {
              const fileIndent = (depth + 1) * 20 + 12 + 20;
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2 py-1 rounded-md hover:bg-white/[0.03] group/file"
                  style={{ paddingLeft: `${fileIndent}px`, paddingRight: 8 }}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0 text-white/10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-[12px] font-mono text-white/40 group-hover/file:text-white/65 truncate flex-1">
                    {file.filename}
                  </span>
                  <StatusBadge status={file.match_status} />
                  <span className="text-[10px] tabular-nums text-white/15 shrink-0 w-16 text-right">
                    {formatBytes(file.size_bytes)}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity shrink-0">
                    {file.match_status !== 'unmatched' && file.matched_bangumi_id > 0 && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-white/25 hover:text-white/60"
                        asChild
                      >
                        <Link
                          to="/watch/$animeId"
                          params={{ animeId: String(file.matched_bangumi_id) }}
                          search={{ ep: file.matched_episode_sort }}
                        >
                          <HugeiconsIcon icon={PlayIcon} size={12} />
                        </Link>
                      </Button>
                    )}
                    {onMatch && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="text-white/25 hover:text-white/60"
                        onClick={() =>
                          onMatch({
                            id: file.id,
                            library_id: libraryId,
                            path: '',
                            filename: file.filename,
                            size_bytes: file.size_bytes,
                            match_status: file.match_status,
                            dandanplay_anime_id: null,
                            dandanplay_episode_id: null,
                            subtitle_count: file.subtitle_count,
                            matched_anime_title: file.matched_anime_title,
                            matched_episode_sort: file.matched_episode_sort,
                            matched_bangumi_id: file.matched_bangumi_id,
                            created_at: '',
                          })
                        }
                      >
                        <HugeiconsIcon
                          icon={file.match_status === 'unmatched' ? LinkSquare01Icon : ShuffleIcon}
                          size={12}
                        />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-1">
      {tree.children && tree.children.length > 0 ? (
        tree.children.map((child) => renderNode(child, 0))
      ) : tree.files && tree.files.length > 0 ? (
        renderNode(tree, 0)
      ) : (
        <div className="py-12 text-center text-sm text-white/25">
          {i18n._(msg`library.detail.noFiles`)}
        </div>
      )}
    </div>
  );
}

function countMatched(node: FileTreeNode): number {
  let count = 0;
  if (node.files) {
    count += node.files.filter((f) => f.match_status !== 'unmatched').length;
  }
  if (node.children) {
    for (const child of node.children) {
      count += countMatched(child);
    }
  }
  return count;
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

  const sorted = [...(summaries || [])].sort((a, b) => {
    const aStart = new Date(a.started_at);
    const bStart = new Date(b.started_at);
    const aTime = Number.isNaN(aStart.getTime()) ? 0 : aStart.getTime();
    const bTime = Number.isNaN(bStart.getTime()) ? 0 : bStart.getTime();
    return bTime - aTime;
  });

  if (sorted.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center text-center">
        <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14 text-white/[0.08] mb-4">
          <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" />
          <polyline
            points="24,14 24,24 32,28"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h3 className="text-sm font-semibold text-white/50 mb-1">
          {i18n._(msg`library.detail.noScans`)}
        </h3>
        <p className="text-xs text-white/25 mb-5 max-w-[260px]">
          {i18n._(msg`library.detail.noScansHint`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((scan) => {
        const startDate = scan.started_at ? new Date(scan.started_at) : null;
        const startedAtValid = startDate && !Number.isNaN(startDate.getTime());

        const completedDate = scan.completed_at ? new Date(scan.completed_at) : null;
        const completedAtValid = completedDate && !Number.isNaN(completedDate.getTime());

        const duration =
          startedAtValid && completedAtValid
            ? Math.round((completedDate!.getTime() - startDate!.getTime()) / 1000)
            : null;

        const startDateLabel = startedAtValid
          ? `${startDate!.toLocaleDateString()} ${startDate!.toLocaleTimeString()}`
          : '-';

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
          <div key={scan.id} className="rounded-lg p-4 bg-white/[0.03]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 text-[13px]">
                <span className="text-white/40">{startDateLabel}</span>
                <span className="text-white/25">
                  {duration !== null ? `${duration}s` : i18n._(msg`library.detail.inProgress`)}
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
                    {errors.length} {i18n._(msg`library.detail.errors`)}{' '}
                    {isExpanded ? '\u25BE' : '\u25B8'}
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
      queryClient.invalidateQueries({
        queryKey: libraryKeys.mediaFiles(libraryId),
      });
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
                      <span>
                        {anime.episode_count} {i18n._(msg`common.ep`)}
                      </span>
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
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={handleGoBackToSearch}
                className="text-mm-accent hover:text-mm-accent/80 px-0"
              >
                {i18n._(msg`library.detail.matchModal.change`)}
              </Button>
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
                        : 'hover:bg-white/[0.06] border border-transparent'
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
          <Button
            type="button"
            onClick={() => matchMutation.mutate()}
            disabled={!selectedEpisode || matchMutation.isPending}
            className="w-full"
          >
            {matchMutation.isPending
              ? i18n._(msg`common.loading`)
              : i18n._(msg`library.detail.matchModal.confirm`)}
          </Button>
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
  library: {
    name: string;
    path: string;
    enabled: number;
    scan_interval_minutes: number;
    source_type: string;
    source_config?: Record<string, unknown>;
  };
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
          <ScanIntervalSelect
            value={scanInterval}
            onChange={setScanInterval}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-3 py-2 text-sm text-white"
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
              enabled ? 'bg-mm-accent' : 'bg-white/[0.12]'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Save */}
        <Button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !name.trim()}
          className="w-full"
        >
          {updateMutation.isPending
            ? i18n._(msg`library.saving`)
            : i18n._(msg`library.saveChanges`)}
        </Button>
      </div>
    </Modal>
  );
}

/* -- Main page -------------------------------------------------------------- */

export function LibraryDetailPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`nav.libraries`));
  const { isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(!isAuthenticated);
  const { id: rawId } = useParams({ strict: false }) as { id?: string };
  const id = rawId ?? '';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('files');
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
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
      queryClient.invalidateQueries({ queryKey: ['media-files', id] });
    }
  }, [scanProgress?.phase, id, queryClient]);

  const {
    data: library,
    isLoading,
    isError,
  } = useQuery({
    queryKey: libraryKeys.detail(id),
    queryFn: () => libraryApi.get(id),
    enabled: isAuthenticated && !!id,
  });

  const scanMutation = useMutation({
    mutationFn: () => libraryApi.scan(id),
    onSuccess: () => {
      toast.success(i18n._(msg`library.toast.scanStarted`));
    },
    onError: (err: Error) => {
      toast.error(`${i18n._(msg`library.toast.scanFailed`)}: ${err.message}`);
    },
  });

  const matchMutation = useMutation({
    mutationFn: () => libraryApi.matchLibrary(id),
    onSuccess: () => {
      toast.success(i18n._(msg`library.toast.matchStarted`));
    },
    onError: (err: Error) => {
      toast.error(`${i18n._(msg`library.toast.matchFailed`)}: ${err.message}`);
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
              <rect
                x="16"
                y="30"
                width="48"
                height="36"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="currentColor"
              />
              <circle cx="40" cy="46" r="4" fill="oklch(12% 0.01 260)" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white/70 mb-2">
            {i18n._(msg`auth.libraries.signInTitle`)}
          </h2>
          <p className="text-sm text-white/30 mb-8 text-center max-w-xs">
            {i18n._(msg`auth.libraries.signInSubtitle`)}
          </p>
          <Button type="button" onClick={() => setShowLogin(true)}>
            {i18n._(msg`auth.login.submit`)}
          </Button>
          <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
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

  const matchPct =
    library.file_count > 0 ? Math.round((library.matched_count / library.file_count) * 100) : 0;

  const lastScannedDate = library.last_scanned_at ? new Date(library.last_scanned_at) : null;
  const lastScannedText =
    lastScannedDate && !Number.isNaN(lastScannedDate.getTime())
      ? formatDistanceToNow(lastScannedDate, { addSuffix: true })
      : i18n._(msg`library.neverScanned`);

  const sourceLabel =
    library.source_type && library.source_type !== 'local'
      ? library.source_type.toUpperCase()
      : null;

  return (
    <PageTransition>
      <div className="relative min-h-screen px-4 md:px-8 pt-6 pb-16">
        <PageAtmosphere preset="detail" />
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
            <div className="shrink-0 w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center">
              <SourceIcon
                sourceType={library.source_type ?? 'local'}
                className="w-6 h-6 text-white/30"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-white tracking-tight">{library.name}</h1>
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

          <TooltipProvider delayDuration={300}>
            <div className="flex gap-2 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => matchMutation.mutate()}
                    disabled={isScanning || matchMutation.isPending}
                    className="gap-2"
                  >
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={15} />
                    {isScanning && scanProgress?.phase === 'matching'
                      ? i18n._(msg`library.matching`)
                      : i18n._(msg`library.detail.autoMatch`)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n._(msg`library.detail.autoMatchTooltip`)}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => scanMutation.mutate()}
                    disabled={isScanning || scanMutation.isPending}
                    className="gap-2"
                  >
                    <HugeiconsIcon icon={ScanIcon} size={15} />
                    {isScanning
                      ? i18n._(msg`library.scanning`)
                      : i18n._(msg`library.detail.scanNow`)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n._(msg`library.detail.scanNowTooltip`)}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className="gap-2"
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={15} />
                    {i18n._(msg`library.detail.settings`)}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {i18n._(msg`library.detail.settingsTooltip`)}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </motion.div>

        {/* Scan progress banner */}
        <AnimatePresence>
          {isScanning &&
            scanProgress &&
            (() => {
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
                      <span className="text-sm font-medium text-white/80">{phaseLabel}</span>
                    </div>
                    <span className="text-xs text-white/40 font-mono">
                      {scanProgress.filesFound > 0 && `${scanProgress.filesFound} files`}
                      {scanProgress.filesMatched > 0 &&
                        ` · ${scanProgress.filesMatched}/${scanProgress.filesTotal} matched`}
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
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p className="text-2xl font-bold text-white tabular-nums">{library.file_count}</p>
            <p className="text-[11px] text-white/35 mt-1 font-medium tracking-wide uppercase">
              {i18n._(msg`library.detail.stats.files`)}
            </p>
          </div>
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                matchPct === 100
                  ? 'text-green-400'
                  : matchPct >= 50
                    ? 'text-green-400/80'
                    : 'text-amber-400/80'
              )}
            >
              {matchPct}%
            </p>
            <p className="text-[11px] text-white/35 mt-1 font-medium tracking-wide uppercase">
              {i18n._(msg`library.detail.stats.matched`)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className="bg-white/[0.04] rounded-xl p-4 text-left hover:bg-white/[0.07] transition-all cursor-pointer"
          >
            <p className="text-2xl font-bold text-amber-400 tabular-nums">
              {library.unmatched_count}
            </p>
            <p className="text-[11px] text-white/35 mt-1 font-medium tracking-wide uppercase">
              {i18n._(msg`library.detail.stats.unmatched`)}
            </p>
          </button>
          <div className="bg-white/[0.04] rounded-xl p-4">
            <p className="text-2xl font-bold text-white tabular-nums">
              {formatBytes(library.total_size_bytes)}
            </p>
            <p className="text-[11px] text-white/35 mt-1 font-medium tracking-wide uppercase">
              {i18n._(msg`library.detail.stats.size`)}
            </p>
          </div>
        </motion.div>

        {/* Tab bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-end justify-between border-b border-white/[0.04] mb-6">
            <div className="flex items-end gap-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'relative px-4 pb-3 pt-2 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors duration-200',
                      isActive ? 'text-white' : 'text-white/25 hover:text-white/40'
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="library-tab-underline"
                        className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 38,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* View mode toggle — only show on files tab */}
            {activeTab === 'files' && (
              <TooltipProvider delayDuration={300}>
                <div className="flex items-center gap-0.5 pb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={cn(
                          'p-1.5 rounded-md transition-colors cursor-pointer',
                          viewMode === 'table'
                            ? 'text-white bg-white/[0.08]'
                            : 'text-white/25 hover:text-white/50'
                        )}
                      >
                        <HugeiconsIcon icon={GridViewIcon} size={15} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {i18n._(msg`library.detail.viewTable`)}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewMode('tree')}
                        className={cn(
                          'p-1.5 rounded-md transition-colors cursor-pointer',
                          viewMode === 'tree'
                            ? 'text-white bg-white/[0.08]'
                            : 'text-white/25 hover:text-white/50'
                        )}
                      >
                        <HugeiconsIcon icon={ViewIcon} size={15} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {i18n._(msg`library.detail.viewTree`)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {activeTab === 'files' && (
              <motion.div
                key={`files-${viewMode}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {viewMode === 'table' ? (
                  <FileTable libraryId={id} onMatch={setMatchingFile} />
                ) : (
                  <FileTreeView libraryId={id} onMatch={setMatchingFile} />
                )}
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

      <MatchModal file={matchingFile} onClose={() => setMatchingFile(null)} libraryId={id} />

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        library={library}
        libraryId={id}
      />
    </PageTransition>
  );
}
