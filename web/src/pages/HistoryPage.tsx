import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/history/ConfirmDialog';
import { HistoryBatchBar } from '@/components/history/HistoryBatchBar';
import { HistoryEmptyState } from '@/components/history/HistoryEmptyState';
import { HistoryFilterBar } from '@/components/history/HistoryFilterBar';
import { HistoryGrid } from '@/components/history/HistoryGrid';
import { HistorySkeleton } from '@/components/history/HistorySkeleton';
import { HistoryTimelineRail } from '@/components/history/HistoryTimelineRail';
import { PageHeader } from '@/components/PageHeader';
import { PageTransition } from '@/components/PageTransition';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { type HistoryFilter, historyApi, historyKeys } from '@/lib/api/history';
import { progressKeys } from '@/lib/api/progress';
import { bucketByDate } from '@/lib/history-date-buckets';

export function HistoryPage() {
  const { i18n } = useLingui();
  useDocumentTitle(i18n._(msg`history.title`));

  const search = useSearch({ from: '/history' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const filter: HistoryFilter = search.filter ?? 'all';
  const q = search.q ?? '';

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'single'; id: string } | { kind: 'batch' } | { kind: 'clear' } | null
  >(null);

  const updateSearch = (next: Partial<{ filter: HistoryFilter; q: string }>) => {
    navigate({
      to: '/history',
      search: (prev) => ({
        ...prev,
        ...next,
      }),
      replace: true,
    });
  };

  const query = useInfiniteQuery({
    queryKey: historyKeys.list(filter, q),
    initialPageParam: '' as string,
    queryFn: ({ pageParam }) => historyApi.list({ before: pageParam, filter, q, limit: 40 }),
    getNextPageParam: (last) => last.next_before ?? undefined,
  });

  const allItems = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: historyKeys.all });
    queryClient.invalidateQueries({ queryKey: progressKeys.recent() });
  };

  const deleteOne = useMutation({
    mutationFn: (id: string) => historyApi.delete(id),
    onSettled: invalidateAll,
    onError: () => toast.error(i18n._(msg`history.loadFailed`)),
  });

  const batchDelete = useMutation({
    mutationFn: (ids: string[]) => historyApi.batchDelete(ids),
    onSettled: invalidateAll,
    onError: () => toast.error(i18n._(msg`history.loadFailed`)),
  });

  const clearAll = useMutation({
    mutationFn: () => historyApi.clearAll(),
    onSettled: invalidateAll,
    onError: () => toast.error(i18n._(msg`history.loadFailed`)),
  });

  const onSelectToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const performBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    for (const chunk of chunks) {
      await batchDelete.mutateAsync(chunk);
    }
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  const buckets = useMemo(() => bucketByDate(allItems, new Date()), [allItems]);

  if (query.isLoading) {
    return (
      <PageTransition>
        <div className="flex min-h-screen gap-6 px-4 md:px-8 pt-8 md:pt-10">
          <HistoryTimelineRail visibleBuckets={[]} />
          <div className="flex-1 min-w-0">
            <HistorySkeleton />
          </div>
        </div>
      </PageTransition>
    );
  }

  const isEmpty = allItems.length === 0;

  return (
    <PageTransition>
      <div className="flex min-h-screen gap-6 px-4 md:px-8 pt-8 md:pt-10 pb-24">
        <HistoryTimelineRail
          visibleBuckets={[
            { key: 'today', visible: buckets.today.length > 0 },
            { key: 'yesterday', visible: buckets.yesterday.length > 0 },
            { key: 'thisWeek', visible: buckets.thisWeek.length > 0 },
            { key: 'lastWeek', visible: buckets.lastWeek.length > 0 },
            { key: 'earlier', visible: buckets.earlier.length > 0 },
          ]}
        />

        <div className="flex-1 min-w-0">
          <PageHeader title={i18n._(msg`history.title`)} />

          <HistoryFilterBar
            filter={filter}
            onFilterChange={(f) => updateSearch({ filter: f })}
            q={q}
            onQChange={(v) => updateSearch({ q: v })}
            onClearAll={() => setConfirmDelete({ kind: 'clear' })}
            batchMode={batchMode}
            onToggleBatch={() => {
              setBatchMode((b) => !b);
              setSelectedIds(new Set());
            }}
          />

          {isEmpty ? (
            <HistoryEmptyState />
          ) : (
            <HistoryGrid
              items={allItems}
              batchMode={batchMode}
              selectedIds={selectedIds}
              onSelectToggle={onSelectToggle}
              onDelete={(id) => setConfirmDelete({ kind: 'single', id })}
              onLoadMore={() => {
                if (!query.isFetchingNextPage) query.fetchNextPage();
              }}
              hasNextPage={!!query.hasNextPage}
              isFetchingNextPage={query.isFetchingNextPage}
            />
          )}
        </div>
      </div>

      {batchMode && (
        <HistoryBatchBar
          selectedCount={selectedIds.size}
          onCancel={() => {
            setBatchMode(false);
            setSelectedIds(new Set());
          }}
          onDeleteSelected={() => {
            if (selectedIds.size > 0) setConfirmDelete({ kind: 'batch' });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={
          confirmDelete?.kind === 'clear'
            ? i18n._(msg`history.clearAll.confirm`)
            : i18n._(msg`history.delete.confirm`)
        }
        description={
          confirmDelete?.kind === 'clear'
            ? i18n._(msg`history.clearAll.description`)
            : i18n._(msg`history.delete.description`)
        }
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          if (confirmDelete.kind === 'single') {
            await deleteOne.mutateAsync(confirmDelete.id);
          } else if (confirmDelete.kind === 'batch') {
            await performBatchDelete();
          } else {
            await clearAll.mutateAsync();
          }
          setConfirmDelete(null);
        }}
      />
    </PageTransition>
  );
}
