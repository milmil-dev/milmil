import { Skeleton, SkeletonText } from '../Skeleton';

export function HistorySkeleton() {
  return (
    <div className="grid gap-x-5 gap-y-6 grid-cols-2 min-[768px]:grid-cols-3 min-[1320px]:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-video rounded-lg" />
          <SkeletonText className="mt-2.5 w-3/4" />
          <SkeletonText className="mt-1.5 h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
