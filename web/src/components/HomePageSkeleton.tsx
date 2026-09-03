import { Skeleton } from './Skeleton';

function RailSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
        <div key={i} className="shrink-0 w-[150px]">
          <Skeleton className="aspect-[6/8] rounded-md" />
          <Skeleton className="h-3 w-[80%] mt-2" />
        </div>
      ))}
    </div>
  );
}

function SectionChrome() {
  return (
    <div className="flex items-baseline justify-between mb-3.5">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Hero skeleton */}
      <div className="px-4 md:px-6 pt-3">
        <Skeleton className="w-full rounded-lg" style={{ height: 'clamp(280px, 38vh, 420px)' }} />
      </div>

      <div className="flex gap-6 px-4 md:px-6">
        <div className="flex-1 min-w-0 pb-16 mt-6 space-y-8">
          {/* Continue Watching — landscape stills */}
          <section>
            <SectionChrome />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <Skeleton
                  key={i}
                  className="shrink-0 w-[220px] md:w-[260px] aspect-video rounded-lg"
                />
              ))}
            </div>
          </section>

          {/* Today's Schedule — poster shelf, matching macOS Home */}
          <section>
            <SectionChrome />
            <RailSkeleton />
          </section>

          {/* Top of Season teaser */}
          <section>
            <SectionChrome />
            <RailSkeleton />
          </section>

          {/* Memories teaser — header + era pills + shelf */}
          <section>
            <SectionChrome />
            <Skeleton className="h-3 w-48 mb-3" />
            <div className="flex gap-1.5 mb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <Skeleton key={i} className="h-10 w-[72px] rounded-md" />
              ))}
            </div>
            <RailSkeleton />
          </section>

          {/* Trending grid */}
          <section>
            <SectionChrome />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
