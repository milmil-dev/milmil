// web/src/components/downloads/AnimeDownloadCardSkeleton.tsx
export function AnimeDownloadCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading download"
      className="grid grid-cols-[92px_1fr_auto] gap-5 p-4 bg-white/[0.02] border border-white/[0.06] rounded-[14px] animate-pulse"
    >
      <div data-testid="skeleton-cover" className="w-[92px] h-[130px] rounded-lg bg-white/[0.05]" />
      <div className="flex flex-col justify-between py-0.5 gap-3">
        <div>
          <div data-testid="skeleton-title" className="h-4 w-[180px] rounded bg-white/[0.08]" />
          <div className="mt-2 h-[10px] w-[140px] rounded bg-white/[0.04]" />
        </div>
        <div className="h-3 w-[220px] rounded bg-white/[0.04]" />
        <div className="mt-2.5 h-[2px] w-full rounded-sm bg-white/[0.04]" />
      </div>
      <div className="w-12 flex flex-col items-end justify-between gap-2">
        <div className="h-5 w-10 rounded bg-white/[0.08]" />
        <div className="h-3 w-14 rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}
