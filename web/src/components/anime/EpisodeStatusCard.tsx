import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { MissingSearchModal } from '@/components/anime/MissingSearchModal';
import { ConfirmDialog } from '@/components/history/ConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { completenessApi, completenessKeys } from '@/lib/api/completeness';
import { missingSearchApi } from '@/lib/api/missing_search';

/** Past this many missing episodes the per-episode buttons collapse. */
const MISSING_PREVIEW_COUNT = 20;

interface Props {
  bangumiId: number;
}

export function EpisodeStatusCard({ bangumiId }: Props) {
  const { i18n } = useLingui();
  const { data, isLoading } = useQuery({
    queryKey: completenessKeys.anime(bangumiId),
    queryFn: () => completenessApi.anime(bangumiId),
    enabled: Number.isFinite(bangumiId) && bangumiId > 0,
  });

  const [searchEp, setSearchEp] = useState<number | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const autoRule = useMutation({
    mutationFn: () => missingSearchApi.autoRule(bangumiId, data?.missing ?? []),
    onSuccess: (res) =>
      toast.success(i18n._(msg`Auto-download rule ${res.action} (${res.episode_range})`)),
    onError: (err: unknown) => toast.error(String(err)),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.04] p-4 backdrop-blur-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
    );
  }
  if (!data) return null;
  if (data.unknown_total) return null;
  if (data.missing.length === 0 && data.airing_pending.length === 0) return null;

  const sortedMissing = [...data.missing].sort((a, b) => a - b);
  const visibleMissing = showAllMissing
    ? sortedMissing
    : sortedMissing.slice(0, MISSING_PREVIEW_COUNT);
  const hiddenMissing = sortedMissing.length - visibleMissing.length;

  return (
    <>
      <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.04] p-4 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-ink/80">{i18n._(msg`Episode status`)}</h3>
        <div className="mt-2 space-y-2 text-sm text-ink/60">
          {sortedMissing.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1">{i18n._(msg`Missing`)}:</span>
                {visibleMissing.map((n, idx) => (
                  <span key={n}>
                    <button
                      type="button"
                      onClick={() => setSearchEp(n)}
                      className="text-ink underline-offset-2 hover:underline hover:text-mm-accent"
                      title={i18n._(msg`Search for this episode`)}
                    >
                      {n}
                    </button>
                    {idx < visibleMissing.length - 1 && <span className="text-ink/40">,</span>}
                  </span>
                ))}
                {sortedMissing.length > MISSING_PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllMissing((v) => !v)}
                    aria-expanded={showAllMissing}
                    className="ml-1 text-xs text-ink/50 hover:text-mm-accent"
                  >
                    {showAllMissing ? i18n._(msg`watch.showLess`) : `+${hiddenMissing}`}
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={autoRule.isPending}
                onClick={() => setConfirmAuto(true)}
                className="mt-2 rounded bg-ink/[0.08] px-2 py-0.5 text-xs text-ink/80 hover:bg-ink/[0.14] disabled:opacity-50"
              >
                {i18n._(msg`Auto-download missing`)}
              </button>
            </div>
          )}
          {data.airing_pending.length > 0 && (
            <div>
              <span className="mr-1">{i18n._(msg`Not aired yet`)}:</span>
              <span className="text-ink">{formatRanges(data.airing_pending)}</span>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmAuto}
        onOpenChange={setConfirmAuto}
        title={i18n._(msg`Auto-download missing`)}
        description={i18n._(
          msg`Create auto-download rule for ${sortedMissing.length} missing episodes?`
        )}
        onConfirm={() => autoRule.mutate()}
      />
      {searchEp !== null && (
        <MissingSearchModal
          bangumiId={bangumiId}
          episodeNumber={searchEp}
          onClose={() => setSearchEp(null)}
        />
      )}
    </>
  );
}

/** "1, 2, 5-8, 10" for [1, 2, 5, 6, 7, 8, 10] */
function formatRanges(nums: number[]): string {
  if (nums.length === 0) return '';
  const sorted = [...nums].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]! === sorted[j]! + 1) j++;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}
