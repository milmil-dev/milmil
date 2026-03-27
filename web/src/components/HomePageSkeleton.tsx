import { Skeleton } from './Skeleton';

export function HomePageSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      <div className="px-4 md:px-6 pt-3">
        <Skeleton className="w-full rounded-lg" style={{ height: 'clamp(280px, 38vh, 420px)' }} />
      </div>

      <div className="flex gap-6 px-4 md:px-6">
        <div className="flex-1 min-w-0">
          {/* Continue Watching skeleton */}
          <section className="mt-6">
            <div className="flex items-baseline justify-between mb-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          </section>

          {/* Today's Schedule skeleton */}
          <section className="mt-6">
            <div className="flex items-baseline justify-between mb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="rounded-lg bg-white/[0.03] overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-none" />
              ))}
            </div>
          </section>

          {/* Trending skeleton */}
          <section className="mt-6">
            <div className="flex items-baseline justify-between mb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
