import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import type { PlayableEpisode } from '@/lib/api/anime';
import type { DanmakuComment } from '@/lib/api/stream';
import { cn } from '@/lib/utils';
import { DanmakuList } from './DanmakuList';
import { DanmakuSourceTab } from './DanmakuSourceTab';
import { EpisodeGrid } from './EpisodeGrid';

type Tab = 'episodes' | 'danmaku' | 'sources';

interface EpisodeSidebarProps {
  episodes: PlayableEpisode[];
  currentSort: number | undefined;
  onSelectEpisode: (sort: number) => void;
  danmakuComments: DanmakuComment[];
  onSeekDanmaku: (time: number) => void;
  episodeId: string | null;
  animeName: string;
  episodeNumber: number | undefined;
  onExternalDanmakuImported: () => void;
}

export function EpisodeSidebar({
  episodes,
  currentSort,
  onSelectEpisode,
  danmakuComments,
  onSeekDanmaku,
  episodeId,
  animeName,
  episodeNumber,
  onExternalDanmakuImported,
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
    { id: 'sources', label: i18n._(msg`watch.danmaku.externalSources`) },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Tab bar */}
      <div className="flex border-b border-ink/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id ? 'text-blue-400' : 'text-ink/40 hover:text-ink/60'
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badge && <span className="text-[11px] text-ink/30">{tab.badge}</span>}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3 flex-1 overflow-y-auto">
        {activeTab === 'episodes' && (
          <EpisodeGrid
            episodes={episodes}
            currentSort={currentSort}
            onSelectEpisode={onSelectEpisode}
          />
        )}
        {activeTab === 'danmaku' && (
          <DanmakuList comments={danmakuComments} onSeek={onSeekDanmaku} />
        )}
        {activeTab === 'sources' && (
          <DanmakuSourceTab
            episodeId={episodeId}
            animeName={animeName}
            episodeNumber={episodeNumber}
            onImported={onExternalDanmakuImported}
          />
        )}
      </div>
    </div>
  );
}
