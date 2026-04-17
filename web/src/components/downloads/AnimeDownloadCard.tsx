// web/src/components/downloads/AnimeDownloadCard.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AnimeGroupHeader, type GroupStats } from './AnimeGroupHeader';
import { AnimeEpisodeList } from './AnimeEpisodeList';

interface Props {
  coverUrl?: string;
  title: string;
  subChips: string[];
  stats: GroupStats;
  expanded: boolean;
  onToggle: () => void;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function AnimeDownloadCard({
  coverUrl,
  title,
  subChips,
  stats,
  expanded,
  onToggle,
  headerActions,
  children,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'relative bg-white/[0.02] hover:bg-white/[0.035] transition-colors',
        'border border-white/[0.06] rounded-[14px] overflow-hidden',
        className
      )}
    >
      <AnimeGroupHeader
        coverUrl={coverUrl}
        title={title}
        subChips={subChips}
        stats={stats}
        expanded={expanded}
        onToggle={onToggle}
        headerActions={headerActions}
      />
      <AnimeEpisodeList expanded={expanded}>{children}</AnimeEpisodeList>
    </div>
  );
}
