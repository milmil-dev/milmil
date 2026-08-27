import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlayableEpisode } from '@/lib/api/anime';
import { cn } from '@/lib/utils';

interface EpisodeGridProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
}

const PAGE_SIZE = 24;

export function EpisodeGrid({ episodes, currentSort, onSelectEpisode }: EpisodeGridProps) {
  const { i18n } = useLingui();
  const totalPages = Math.ceil(episodes.length / PAGE_SIZE);
  const [page, setPage] = useState(() => {
    if (currentSort === undefined) return 0;
    const idx = episodes.findIndex((ep) => ep.sort === currentSort);
    return idx >= 0 ? Math.floor(idx / PAGE_SIZE) : 0;
  });

  const start = page * PAGE_SIZE;
  const pageEpisodes = episodes.slice(start, start + PAGE_SIZE);

  function getButtonClass(ep: PlayableEpisode) {
    const isCurrent = ep.sort === currentSort;
    const hasFile = ep.media_file !== null;
    const completed = ep.progress?.completed === true;
    const inProgress =
      ep.progress !== null &&
      ep.progress !== undefined &&
      ep.progress.position_seconds > 0 &&
      !ep.progress.completed;

    if (!hasFile) return 'opacity-25 cursor-not-allowed';
    if (isCurrent) return 'bg-blue-500/20 border border-blue-400/50 text-blue-300 font-bold';
    if (completed) return 'bg-green-500/[0.12] text-ink/50';
    if (inProgress) return 'bg-amber-500/[0.12] text-ink/50';
    return 'bg-ink/[0.05] text-ink/40 hover:bg-ink/[0.08]';
  }

  // Build page range labels like "1-24", "25-48"
  const pageRanges = Array.from({ length: totalPages }, (_, i) => {
    const rangeStart = i * PAGE_SIZE + 1;
    const rangeEnd = Math.min((i + 1) * PAGE_SIZE, episodes.length);
    return { value: String(i), label: `${rangeStart}-${rangeEnd}` };
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Pagination dropdown */}
      {totalPages > 1 && (
        <Select value={String(page)} onValueChange={(v) => setPage(Number(v))}>
          <SelectTrigger size="sm" className="w-auto self-start text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageRanges.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Episode grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {pageEpisodes.map((ep) => {
          const hasFile = ep.media_file !== null;
          return (
            <button
              key={ep.episode_id}
              type="button"
              disabled={!hasFile}
              onClick={() => hasFile && onSelectEpisode(ep.sort)}
              className={cn(
                'rounded-md py-1.5 text-center text-sm tabular-nums transition-colors',
                getButtonClass(ep)
              )}
            >
              {ep.sort}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/30">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/20 border border-blue-400/50" />
          {i18n._(msg`watch.playing`)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/[0.12]" />
          {i18n._(msg`watch.completed`)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/[0.12]" />
          {i18n._(msg`watch.inProgress`)}
        </span>
      </div>
    </div>
  );
}
