import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/history/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { type DupSet, duplicatesApi, duplicatesKeys } from '@/lib/api/duplicates';
import { formatBytes } from '@/lib/format';

interface Props {
  bangumiId: number;
}

export function DuplicatesPanel({ bangumiId }: Props) {
  const { i18n } = useLingui();
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: duplicatesKeys.anime(bangumiId),
    queryFn: () => duplicatesApi.anime(bangumiId),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
  });

  const setPreferred = useMutation({
    mutationFn: ({ episodeId, fileId }: { episodeId: string; fileId: string }) =>
      duplicatesApi.setPreferred(episodeId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: duplicatesKeys.anime(bangumiId) }),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => duplicatesApi.deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: duplicatesKeys.anime(bangumiId) }),
  });

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }
  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.04] p-4 backdrop-blur-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink/80">{i18n._(msg`Duplicate files`)}</h3>
      <div className="space-y-3">
        {data.map((s) => (
          <DupRow
            key={s.episode_id}
            set={s}
            onSetPreferred={(fileId) => setPreferred.mutate({ episodeId: s.episode_id, fileId })}
            onDeleteFile={setPendingDelete}
          />
        ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={i18n._(msg`Delete this file permanently?`)}
        description={
          data.flatMap((set) => set.files).find((f) => f.id === pendingDelete)?.filename ?? ''
        }
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteFile.mutate(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function DupRow({
  set,
  onSetPreferred,
  onDeleteFile,
}: {
  set: DupSet;
  onSetPreferred: (fileId: string) => void;
  onDeleteFile: (id: string) => void;
}) {
  const { i18n } = useLingui();
  return (
    <div className="rounded border border-ink/[0.08] p-3">
      <div className="mb-2 text-sm text-ink/80">
        {i18n._(msg`Episode ${set.episode_number}`)} — {set.files.length} {i18n._(msg`files`)}
      </div>
      <ul className="space-y-1 text-xs">
        {set.files.map((f) => {
          const isPreferred = f.id === set.preferred_id;
          const resolutionLabel = f.resolution > 0 ? `${f.resolution}p` : '?';
          return (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className={isPreferred ? 'text-ink' : 'text-ink/60'}>
                {isPreferred && '★ '}
                {f.filename} ({resolutionLabel} · {formatBytes(f.size_bytes)})
              </span>
              <div className="flex gap-2">
                {!isPreferred && (
                  <button
                    type="button"
                    className="rounded bg-ink/[0.08] px-2 py-0.5 text-ink/80 hover:bg-ink/[0.14]"
                    onClick={() => onSetPreferred(f.id)}
                  >
                    {i18n._(msg`Set preferred`)}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded bg-ink/[0.08] px-2 py-0.5 text-ink/60 hover:bg-red-500/30"
                  onClick={() => onDeleteFile(f.id)}
                >
                  {i18n._(msg`Delete`)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
