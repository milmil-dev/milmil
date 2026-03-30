import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PlayableEpisode } from '@/lib/api/anime';
import type { DanmakuComment } from '@/lib/api/stream';
import { EpisodeGrid } from './EpisodeGrid';
import { DanmakuList } from './DanmakuList';

type Tab = 'episodes' | 'danmaku';

interface EpisodeSidebarProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
  danmakuComments: DanmakuComment[];
  onSeekDanmaku: (time: number) => void;
}

export function EpisodeSidebar({
  episodes,
  currentSort,
  onSelectEpisode,
  danmakuComments,
  onSeekDanmaku,
}: EpisodeSidebarProps) {
  const { i18n } = useLingui();
  const [activeTab, setActiveTab] = useState<Tab>('episodes');

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'episodes', label: i18n._(msg`watch.episodes`) },
    {
      id: 'danmaku',
      label: i18n._(msg`watch.danmaku`),
      badge: danmakuComments.length > 0 ? `(${danmakuComments.length})` : undefined,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'text-blue-400' : 'text-white/40 hover:text-white/60',
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badge && (
                <span className="text-[11px] text-white/30">{tab.badge}</span>
              )}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === 'episodes' ? (
          <EpisodeGrid
            episodes={episodes}
            currentSort={currentSort}
            onSelectEpisode={onSelectEpisode}
          />
        ) : (
          <DanmakuList comments={danmakuComments} onSeek={onSeekDanmaku} />
        )}
      </div>
    </div>
  );
}
