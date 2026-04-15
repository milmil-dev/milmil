import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { Skeleton } from '@/components/Skeleton';
import { renameApi, renameKeys, type RenamePlan } from '@/lib/api/rename';

export function RenamePreviewPage() {
  const { id: rawId } = useParams({ strict: false }) as { id?: string };
  const libraryId = rawId ?? '';
  const { i18n } = useLingui();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: renameKeys.preview(libraryId),
    queryFn: () => renameApi.preview(libraryId),
    enabled: libraryId.length > 0,
  });

  const apply = useMutation({
    mutationFn: (plans: RenamePlan[]) => renameApi.apply(libraryId, plans),
    onSuccess: (res) => {
      window.alert(
        i18n._(msg`Applied ${res.applied} files. Batch: ${res.batch_id.slice(0, 8)}`)
      );
      qc.invalidateQueries({ queryKey: renameKeys.preview(libraryId) });
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
  if (error) {
    return <div className="p-4 text-red-400">{String(error)}</div>;
  }

  const plans = data?.plans ?? [];
  const ok = plans.filter((p) => p.status === 'ok');

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/libraries/$id"
            params={{ id: libraryId }}
            className="text-xs text-white/50 hover:text-white/80"
          >
            {i18n._(msg`← Back to library`)}
          </Link>
          <h1 className="text-lg font-semibold text-white/90">
            {i18n._(msg`Rename preview`)}
          </h1>
        </div>
        <button
          type="button"
          disabled={ok.length === 0 || apply.isPending}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-red-500/30 disabled:opacity-50"
          onClick={() => {
            if (
              window.confirm(
                i18n._(
                  msg`Apply ${ok.length} renames. This will move files on disk. Continue?`
                )
              )
            ) {
              apply.mutate(ok);
            }
          }}
        >
          {i18n._(msg`Apply all OK (${ok.length})`)}
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-white/60">{i18n._(msg`No rename plans.`)}</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-white/50">
            <tr>
              <th className="py-1 text-left">{i18n._(msg`Status`)}</th>
              <th className="py-1 text-left">{i18n._(msg`Old`)}</th>
              <th className="py-1 text-left">{i18n._(msg`New`)}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.media_file_id} className="border-t border-white/10 align-top">
                <td className="py-1 pr-2 text-white/70">{p.status}</td>
                <td className="py-1 pr-2 text-white/60">{p.old_path}</td>
                <td className="py-1 text-white/90">
                  {p.new_path}
                  {p.error ? <span className="ml-2 text-red-400">{p.error}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
