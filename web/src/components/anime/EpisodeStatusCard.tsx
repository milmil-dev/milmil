import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/components/Skeleton';
import { completenessApi, completenessKeys } from '@/lib/api/completeness';

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

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-white/80">
        {i18n._(msg`Episode status`)}
      </h3>
      <div className="mt-2 space-y-1 text-sm text-white/60">
        {data.missing.length > 0 && (
          <div>
            <span className="mr-1">{i18n._(msg`Missing`)}:</span>
            <span className="text-white">{formatRanges(data.missing)}</span>
          </div>
        )}
        {data.airing_pending.length > 0 && (
          <div>
            <span className="mr-1">{i18n._(msg`Not aired yet`)}:</span>
            <span className="text-white">{formatRanges(data.airing_pending)}</span>
          </div>
        )}
      </div>
    </div>
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
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}
