// web/src/components/downloads/AnimeDownloadCardSkeleton.tsx
import { Skeleton, SkeletonText } from '../Skeleton';

export function AnimeDownloadCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading download"
      className="grid grid-cols-[92px_1fr_auto] gap-5 p-4 bg-ink/[0.02] border border-ink/[0.06] rounded-[14px]"
    >
      <Skeleton
        data-testid="skeleton-cover"
        className="w-[92px] h-[130px] rounded-lg bg-ink/[0.05]"
      />
      <div className="flex flex-col justify-between py-0.5 gap-3">
        <div>
          <SkeletonText data-testid="skeleton-title" className="h-4 w-[180px]" />
          <SkeletonText className="mt-2 h-[10px] w-[140px]" />
        </div>
        <SkeletonText className="w-[220px]" />
        <Skeleton className="mt-2.5 h-[2px] w-full rounded-sm bg-ink/[0.04]" />
      </div>
      <div className="w-12 flex flex-col items-end justify-between gap-2">
        <SkeletonText className="h-5 w-10" />
        <SkeletonText className="w-14" />
      </div>
    </div>
  );
}
