import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Skeleton } from '../components/Skeleton';
import { libraryApi, libraryKeys } from '../lib/api/library';
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

/* -- Main page -------------------------------------------------------------- */

export function LibraryDetailPage() {
  const { i18n } = useLingui();
  const { id } = useParams({ from: '/libraries/$id' });
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>('all');

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

          {/* Tab content placeholder */}
          <div className="py-12 text-center">
            <p className="text-[13px] text-mm-text-muted">
              {activeTab}
            </p>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
