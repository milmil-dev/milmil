// web/src/pages/downloads/LibraryTab.tsx
import { useState, useMemo } from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { RssIcon, Search01Icon, ArrowUpDownIcon, Edit02Icon } from '@hugeicons/core-free-icons';
import {
  type Download, type DownloadGroup, type DownloadRule, type RSSFeed,
  downloadApi, downloadKeys, rssFeedApi, ruleApi,
} from '../../lib/api/downloads';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { AnimeDownloadCardSkeleton } from '../../components/downloads/AnimeDownloadCardSkeleton';
import { CardMenu } from '../../components/downloads/CardMenu';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { EpisodeRowComplete } from '../../components/downloads/episode-rows/EpisodeRowComplete';
import { EpisodeRowPending } from '../../components/downloads/episode-rows/EpisodeRowPending';
import { RuleEditorModal } from '../../components/RuleEditorModal';
import {
  deriveCardMode, deriveEpsForExpand, deriveGroupPercent, deriveNextFetch,
  formatRelative, ruleSubChips, sortRulesBy, type CardMode, type LibraryItem, type SortKey,
  toActiveProps, toCompleteProps,
} from './shared/adapters';

interface Props {
  rules: DownloadRule[];
  feeds: RSSFeed[];
  groups: DownloadGroup[];
  miscDownloads: Download[];
  isLoading: boolean;
  onSwitchToSearch: () => void;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export default function LibraryTab({
  rules, feeds, groups, miscDownloads, isLoading, onSwitchToSearch,
}: Props) {
  const { i18n } = useLingui();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('activity');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.rule_id, g])), [groups]);

  const items: LibraryItem[] = useMemo(
    () => rules.map((rule) => ({
      rule,
      group: groupMap.get(rule.id),
      feed: feedMap.get(rule.rss_feed_id),
    })),
    [rules, feedMap, groupMap],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (it.rule.name.toLowerCase().includes(q)) return true;
      if (it.rule.subgroup_filter?.toLowerCase().includes(q)) return true;
      return (it.group?.downloads ?? []).some((d) => d.name.toLowerCase().includes(q));
    });
  }, [items, query]);

  const sorted = useMemo(() => sortRulesBy(filtered, sort), [filtered, sort]);

  const stats = useMemo(() => {
    let downloadingCount = 0;
    let speed = 0;
    let storedBytes = 0;
    for (const g of groups) {
      for (const d of g.downloads) {
        if (d.status === 'active' || d.status === 'paused' || d.status === 'waiting') {
          downloadingCount += 1;
          speed += d.speed_bytes;
        }
        if (d.status === 'complete') storedBytes += d.total_bytes;
      }
    }
    return { downloadingCount, speed, storedBytes };
  }, [groups]);

  const selectedRule = selectedRuleId ? rules.find((r) => r.id === selectedRuleId) ?? null : null;
  const selectedFeed = selectedRule ? feedMap.get(selectedRule.rss_feed_id) : undefined;

  const queryClient = useQueryClient();
  const miscDeleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => <AnimeDownloadCardSkeleton key={i} />)}
      </div>
    );
  }

  if (rules.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.02] p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-white/[0.04]">
            <HugeiconsIcon icon={RssIcon} size={24} className="text-white/15" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white/50 mb-1">
              {i18n._(msg`downloads.noRulesHint`)}
            </p>
          </div>
          <Button onClick={onSwitchToSearch} variant="ghost" className="shrink-0 text-[12px]">
            {i18n._(msg`autoDownload.goToSearch`)}
          </Button>
        </div>
      </div>
    );
  }

  const sortLabels: Record<SortKey, string> = {
    activity: i18n._(msg`downloads.sort.activity`),
    name: i18n._(msg`downloads.sort.name`),
    progress: i18n._(msg`downloads.sort.progress`),
    created: i18n._(msg`downloads.sort.created`),
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[280px]">
          <HugeiconsIcon icon={Search01Icon} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={i18n._(msg`autoDownload.searchDownloads`)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white/[0.03] text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:bg-white/[0.05] transition-colors"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.03] text-[11px] font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <HugeiconsIcon icon={ArrowUpDownIcon} size={12} />
            {sortLabels[sort]}
          </button>
          {sortMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg bg-[#1a1a1e] py-1 shadow-xl">
                {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setSort(key); setSortMenuOpen(false); }}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer',
                      sort === key ? 'text-[#e88faa] bg-white/[0.04]' : 'text-white/50 hover:text-white/70 hover:bg-white/[0.03]',
                    )}
                  >
                    {sortLabels[key]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {(rules.length > 0 || miscDownloads.length > 0) && (
        <div className="flex items-center gap-3 mb-3 text-[11px] text-white/20 flex-wrap">
          <span><b className="text-white/40 font-medium">{rules.length}</b> {i18n._(msg`downloads.summary.subscribed`)}</span>
          <span className="text-white/10">·</span>
          <span>
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-[#4ade80] mr-1.5 align-middle" />
            <b className="text-white/40 font-medium">{stats.downloadingCount}</b> {i18n._(msg`downloads.summary.downloading`)}
          </span>
          {stats.speed > 0 && (
            <>
              <span className="text-white/10">·</span>
              <span className="tabular-nums"><b className="text-white/40 font-medium">{formatBytes(stats.speed)}/s</b></span>
            </>
          )}
          <span className="text-white/10">·</span>
          <span className="tabular-nums"><b className="text-white/40 font-medium">{formatBytes(stats.storedBytes)}</b> {i18n._(msg`downloads.summary.stored`)}</span>
        </div>
      )}

      {query.trim() && sorted.length === 0 && (
        <p className="text-[12px] text-white/30 mb-3">{i18n._(msg`downloads.searchEmpty`).replace('{query}', query)}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {sorted.map((item) => (
          <LibraryCard
            key={item.rule.id}
            item={item}
            onEdit={() => setSelectedRuleId(item.rule.id)}
          />
        ))}
        <MiscDownloadsSection
          downloads={miscDownloads}
          onDelete={(gid) => miscDeleteMutation.mutate(gid)}
        />
      </div>

      {selectedRule && (
        <RuleEditorModal
          rule={selectedRule}
          feed={selectedFeed}
          open={!!selectedRuleId}
          onClose={() => setSelectedRuleId(null)}
        />
      )}
    </>
  );
}

function LibraryCard({ item, onEdit }: { item: LibraryItem; onEdit: () => void }) {
  const { i18n } = useLingui();
  const { rule, group, feed } = item;
  const { coverUrl } = useAnimeCover(rule.bangumi_id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(rule.id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const mode: CardMode = deriveCardMode(group, rule);
  const eps = deriveEpsForExpand(group, mode);

  const refreshMutation = useMutation({
    mutationFn: () => (feed ? rssFeedApi.refresh(feed.id) : Promise.resolve()),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: () => ruleApi.update(rule.id, { enabled: rule.enabled === 1 ? 0 : 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async () => {
      await ruleApi.delete(rule.id);
      if (feed) await rssFeedApi.delete(feed.id).catch(() => {});
    },
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.pause(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const resumeMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.resume(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteDownloadMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const percent = deriveGroupPercent(group);
  const speed = group?.downloads.reduce((s, d) => s + d.speed_bytes, 0) ?? 0;
  const downloaded = group?.downloads.reduce((s, d) => s + d.completed_bytes, 0) ?? 0;
  const total = group?.downloads.reduce((s, d) => s + d.total_bytes, 0) ?? 0;
  const remaining = Math.max(0, total - downloaded);
  const etaSeconds = speed > 0 ? Math.round(remaining / speed) : 0;
  const activeCount = (group?.downloads ?? []).filter(
    (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
  ).length;

  const headerActions = (
    <>
      <button
        type="button"
        onClick={onEdit}
        aria-label={i18n._(msg`ruleEditor.openEditor`)}
        className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-white/20 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <HugeiconsIcon icon={Edit02Icon} size={12} />
      </button>
      <CardMenu
        enabled={rule.enabled === 1}
        bangumiId={rule.bangumi_id}
        feedUrl={feed?.url ?? ''}
        onToggleEnabled={() => toggleEnabledMutation.mutate()}
        onRefresh={() => refreshMutation.mutate()}
        onOpenAnime={() => {
          if (rule.bangumi_id) navigate({ to: '/anime/$id', params: { id: String(rule.bangumi_id) } });
        }}
        onCopyRssUrl={() => toast.success(i18n._(msg`downloads.menu.copied`))}
        onDelete={() => {
          if (window.confirm(i18n._(msg`downloads.confirm.delete`))) deleteRuleMutation.mutate();
        }}
      />
    </>
  );

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={rule.name}
      subChips={ruleSubChips(rule)}
      onOpenAnime={rule.bangumi_id ? () => navigate({ to: '/anime/$id', params: { id: String(rule.bangumi_id) } }) : undefined}
      stats={{
        mode,
        percent,
        speedBytes: mode === 'downloading' ? speed : undefined,
        downloadedBytes: mode === 'downloading' ? downloaded : undefined,
        totalBytes: mode !== 'subscribed' ? total : undefined,
        etaSeconds: mode === 'downloading' ? etaSeconds : undefined,
        activeCount: mode === 'downloading' ? activeCount : undefined,
        completedCount: mode === 'completed' ? (group?.complete_count ?? 0) : undefined,
        completedAtRelative: mode === 'completed' && eps[0]?.created_at
          ? formatRelative(eps[0].created_at)
          : undefined,
        nextFetchRelative: mode === 'subscribed' ? deriveNextFetch(feed) : undefined,
        live: mode === 'downloading' || (mode === 'subscribed' && rule.enabled === 1),
      }}
      expanded={expanded}
      onToggle={() => toggle(rule.id)}
      headerActions={headerActions}
    >
      {mode === 'subscribed' && (
        <EpisodeRowPending
          nextFetchRelative={deriveNextFetch(feed) ?? '—'}
          onRefresh={() => refreshMutation.mutate()}
        />
      )}
      {mode === 'downloading' && eps.map((d) => (
        <EpisodeRowActive
          key={d.gid}
          {...toActiveProps(d)}
          onPause={(gid) => pauseMutation.mutate(gid)}
          onResume={(gid) => resumeMutation.mutate(gid)}
          onDelete={(gid) => deleteDownloadMutation.mutate(gid)}
        />
      ))}
      {mode === 'completed' && eps.map((d) => (
        <EpisodeRowComplete
          key={d.gid}
          {...toCompleteProps(d)}
          onPlay={() => {
            if (rule.bangumi_id) navigate({ to: '/anime/$id', params: { id: String(rule.bangumi_id) } });
          }}
          onDelete={(gid) => deleteDownloadMutation.mutate(gid)}
        />
      ))}
    </AnimeDownloadCard>
  );
}
