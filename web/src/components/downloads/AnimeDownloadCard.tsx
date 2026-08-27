// web/src/components/downloads/AnimeDownloadCard.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AnimeEpisodeList } from './AnimeEpisodeList';
import { AnimeGroupHeader, type GroupStats } from './AnimeGroupHeader';

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
  onOpenAnime?: () => void;
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
  onOpenAnime,
}: Props) {
  return (
    <div
      data-testid="anime-download-card"
      className={cn(
        'relative bg-ink/[0.02] hover:bg-ink/[0.035] transition-colors',
        'border border-ink/[0.06] rounded-[14px] overflow-hidden',
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
        onOpenAnime={onOpenAnime}
      />
      <AnimeEpisodeList expanded={expanded}>{children}</AnimeEpisodeList>
    </div>
  );
}
