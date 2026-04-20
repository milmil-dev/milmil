export function HistorySkeleton() {
  return (
    <div className="grid gap-x-5 gap-y-6 grid-cols-2 min-[768px]:grid-cols-3 min-[1320px]:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video rounded-lg bg-white/[0.04]" />
          <div className="mt-2.5 h-3 w-3/4 rounded bg-white/[0.04]" />
          <div className="mt-1.5 h-2.5 w-1/2 rounded bg-white/[0.03]" />
        </div>
      ))}
    </div>
  );
}
