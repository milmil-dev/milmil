import { RssIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import {
  type DownloadGroup,
  type DownloadRule,
  type RSSFeed,
  downloadKeys,
  rssFeedApi,
} from '../../lib/api/downloads';
import { cn } from '../../lib/utils';
import { SourceBadge } from '../DownloadsPage';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { AnimeDownloadCardSkeleton } from '@/components/downloads/AnimeDownloadCardSkeleton';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { EpisodeRowComplete } from '../../components/downloads/episode-rows/EpisodeRowComplete';
import { EpisodeRowPending } from '../../components/downloads/episode-rows/EpisodeRowPending';
import {
  deriveGroupPercent,
  deriveNextFetch,
  ruleSubChips,
  toActiveProps,
  toCompleteProps,
} from './shared/adapters';

export default function SubscribedTab({
  rules,
  feeds,
  groups,
  isLoading,
  onSwitchToSearch,
}: {
  rules: DownloadRule[];
  feeds: RSSFeed[];
  groups: DownloadGroup[];
  isLoading: boolean;
  onSwitchToSearch: () => void;
}) {
  const { i18n } = useLingui();
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const groupMap = new Map(groups.map((g) => [g.rule_id, g]));

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <AnimeDownloadCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (rules.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.02] p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-white/[0.04]">
            <HugeiconsIcon icon={RssIcon} size={24} className="text-white/15" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white/50 mb-1">
              {i18n._(msg`autoDownload.noSubscriptions`)}
            </p>
            <p className="text-[12px] text-white/25">
              {i18n._(msg`autoDownload.noSubscriptionsHint`)}
            </p>
          </div>
          <Button onClick={onSwitchToSearch} variant="ghost" className="shrink-0 text-[12px]">
            {i18n._(msg`autoDownload.goToSearch`)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rules.map((rule) => (
        <SubscribedCard
          key={rule.id}
          rule={rule}
          feed={feedMap.get(rule.rss_feed_id)}
          group={groupMap.get(rule.id)}
        />
      ))}
    </div>
  );
}

function SubscribedCard({
  rule,
  feed,
  group,
}: {
  rule: DownloadRule;
  feed?: RSSFeed;
  group?: DownloadGroup;
}) {
  const { i18n } = useLingui();
  const { coverUrl } = useAnimeCover(rule.bangumi_id);
  const queryClient = useQueryClient();
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(rule.id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const recent = (group?.downloads ?? []).slice(0, 10);

  const refreshMutation = useMutation({
    mutationFn: () => (feed ? rssFeedApi.refresh(feed.id) : Promise.resolve()),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={rule.name}
      subChips={ruleSubChips(rule)}
      stats={{
        mode: 'subscribed',
        percent: deriveGroupPercent(group),
        activeCount: group?.total_count ?? 0,
        nextFetchRelative: deriveNextFetch(feed),
        live: rule.enabled === 1,
      }}
      expanded={expanded}
      onToggle={() => toggle(rule.id)}
    >
      {recent.length === 0 ? (
        <EpisodeRowPending
          nextFetchRelative={deriveNextFetch(feed) ?? '—'}
          onRefresh={() => refreshMutation.mutate()}
        />
      ) : (
        recent.map((d) =>
          d.status === 'complete' ? (
            <EpisodeRowComplete
              key={d.gid}
              {...toCompleteProps(d)}
              onPlay={() => {/* TODO wire in PR 4 */}}
              onDelete={() => {/* TODO wire in PR 4 */}}
            />
          ) : (
            <EpisodeRowActive
              key={d.gid}
              {...toActiveProps(d)}
              onPause={() => {/* TODO wire in PR 4 */}}
              onResume={() => {/* TODO wire in PR 4 */}}
              onDelete={() => {/* TODO wire in PR 4 */}}
            />
          )
        )
      )}
    </AnimeDownloadCard>
  );
}
