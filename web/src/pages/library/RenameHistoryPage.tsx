import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { Skeleton } from '@/components/Skeleton';
import { renameApi, renameKeys } from '@/lib/api/rename';

export function RenameHistoryPage() {
  const { id: rawId } = useParams({ strict: false }) as { id?: string };
  const libraryId = rawId ?? '';
  const { i18n } = useLingui();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: renameKeys.history(libraryId),
    queryFn: () => renameApi.history(libraryId),
    enabled: libraryId.length > 0,
  });

  const undo = useMutation({
    mutationFn: (batchId: string) => renameApi.undo(libraryId, batchId),
    onSuccess: (res) => {
      window.alert(i18n._(msg`Reverted ${res.reverted} files, skipped ${res.skipped}`));
      qc.invalidateQueries({ queryKey: renameKeys.history(libraryId) });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-32" />
      </div>
    );
  }

  const batches = data ?? [];

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/libraries/$id"
          params={{ id: libraryId }}
          className="text-xs text-ink/50 hover:text-ink/80"
        >
          {i18n._(msg`← Back to library`)}
        </Link>
        <h1 className="text-lg font-semibold text-ink/90">{i18n._(msg`Rename history`)}</h1>
      </div>
      {batches.length === 0 ? (
        <div className="text-ink/60">{i18n._(msg`No rename batches yet.`)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-ink/50">
            <tr>
              <th className="py-1 text-left">{i18n._(msg`Batch`)}</th>
              <th className="py-1 text-left">{i18n._(msg`Date`)}</th>
              <th className="py-1 text-right">{i18n._(msg`Files`)}</th>
              <th className="py-1 text-right">{i18n._(msg`Reverted`)}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const fullyReverted = b.reverted_count >= b.row_count;
              return (
                <tr key={b.batch_id} className="border-t border-ink/10">
                  <td className="py-1 font-mono text-xs text-ink/60">{b.batch_id.slice(0, 8)}</td>
                  <td className="py-1 text-ink/60">{String(b.applied_at)}</td>
                  <td className="py-1 text-right text-ink/60">{b.row_count}</td>
                  <td className="py-1 text-right text-ink/60">{b.reverted_count}</td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      disabled={fullyReverted || undo.isPending}
                      className="rounded bg-ink/10 px-2 py-0.5 text-xs text-ink/70 hover:bg-red-500/30 disabled:opacity-50"
                      onClick={() => {
                        if (window.confirm(i18n._(msg`Undo batch ${b.batch_id.slice(0, 8)}?`))) {
                          undo.mutate(b.batch_id);
                        }
                      }}
                    >
                      {i18n._(msg`Undo`)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
