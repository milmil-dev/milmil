import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { MissingSearchModal } from '@/components/anime/MissingSearchModal';
import { Skeleton } from '@/components/Skeleton';
import { completenessApi, completenessKeys } from '@/lib/api/completeness';
import { missingSearchApi } from '@/lib/api/missing_search';

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
  const autoRule = useMutation({
    mutationFn: () => missingSearchApi.autoRule(bangumiId, data?.missing ?? []),
    onSuccess: (res) =>
      toast.success(
        i18n._(msg`Auto-download rule ${res.action} (${res.episode_range})`),
      ),
    onError: (err: unknown) => toast.error(String(err)),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
    );
  }
  if (!data) return null;
  if (data.unknown_total) return null;
  if (data.missing.length === 0 && data.airing_pending.length === 0) return null;

  const sortedMissing = [...data.missing].sort((a, b) => a - b);

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-white/80">
          {i18n._(msg`Episode status`)}
        </h3>
        <div className="mt-2 space-y-2 text-sm text-white/60">
          {sortedMissing.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1">{i18n._(msg`Missing`)}:</span>
                {sortedMissing.map((n, idx) => (
                  <span key={n}>
                    <button
                      type="button"
                      onClick={() => setSearchEp(n)}
                      className="text-white underline-offset-2 hover:underline"
                      title={i18n._(msg`Search for this episode`)}
                    >
                      {n}
                    </button>
                    {idx < sortedMissing.length - 1 && (
                      <span className="text-white/40">,</span>
                    )}
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={autoRule.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      i18n._(
                        msg`Create auto-download rule for ${sortedMissing.length} missing episodes?`,
                      ),
                    )
                  ) {
                    autoRule.mutate();
                  }
                }}
                className="mt-2 rounded bg-white/10 px-2 py-0.5 text-xs text-white/80 hover:bg-white/20 disabled:opacity-50"
              >
                {i18n._(msg`Auto-download missing`)}
              </button>
            </div>
          )}
          {data.airing_pending.length > 0 && (
            <div>
              <span className="mr-1">{i18n._(msg`Not aired yet`)}:</span>
              <span className="text-white">
                {formatRanges(data.airing_pending)}
              </span>
            </div>
          )}
        </div>
      </div>
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
