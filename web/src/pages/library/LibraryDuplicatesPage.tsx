import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { Skeleton } from '@/components/Skeleton';
import { duplicatesApi, duplicatesKeys } from '@/lib/api/duplicates';
import { formatBytes } from '@/lib/format';

export function LibraryDuplicatesPage() {
  const { id: rawId } = useParams({ strict: false }) as { id?: string };
  const libraryId = rawId ?? '';
  const { i18n } = useLingui();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: duplicatesKeys.library(libraryId),
    queryFn: () => duplicatesApi.library(libraryId),
    enabled: libraryId.length > 0,
  });

  const cleanup = useMutation({
    mutationFn: () => duplicatesApi.cleanupLibrary(libraryId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: duplicatesKeys.library(libraryId) });
      window.alert(
        i18n._(
          msg`Cleaned up ${res.deleted} files (${formatBytes(res.reclaimed_bytes)})`
        )
      );
    },
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-32" />
      </div>
    );
  }

  const sets = data ?? [];
  const totalWaste = sets.reduce((a, s) => a + s.wasted_bytes, 0);
  const totalRemovable = sets.reduce((a, s) => a + Math.max(s.files.length - 1, 0), 0);

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
            {i18n._(msg`Duplicate files`)}
          </h1>
        </div>
        <button
          type="button"
          disabled={sets.length === 0 || cleanup.isPending}
          className="rounded bg-white/10 px-3 py-1 text-sm text-white hover:bg-red-500/30 disabled:opacity-50"
          onClick={() => {
            if (
              window.confirm(
                i18n._(
                  msg`This will permanently delete ${totalRemovable} non-preferred files across this library. Continue?`
                )
              )
            ) {
              cleanup.mutate();
            }
          }}
        >
          {i18n._(msg`Clean non-preferred (${formatBytes(totalWaste)})`)}
        </button>
      </div>

      {sets.length === 0 ? (
        <div className="text-white/60">{i18n._(msg`No duplicates.`)}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-white/50">
            <tr>
              <th className="py-1 text-left">{i18n._(msg`Anime`)}</th>
              <th className="py-1 text-left">{i18n._(msg`Episode`)}</th>
              <th className="py-1 text-right">{i18n._(msg`Files`)}</th>
              <th className="py-1 text-right">{i18n._(msg`Wasted`)}</th>
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.episode_id} className="border-t border-white/10">
                <td className="py-1 text-white/80">{s.anime_title}</td>
                <td className="py-1 text-white/60">#{s.episode_number}</td>
                <td className="py-1 text-right text-white/60">{s.files.length}</td>
                <td className="py-1 text-right text-white/60">
                  {formatBytes(s.wasted_bytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
