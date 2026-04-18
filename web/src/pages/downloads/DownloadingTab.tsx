import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { AnimeDownloadCardSkeleton } from '@/components/downloads/AnimeDownloadCardSkeleton';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { downloadApi, type Download, type DownloadGroup } from '../../lib/api/downloads';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { aggregateActiveStats, toActiveProps } from './shared/adapters';

// ── DownloadingTab — renders AnimeDownloadCard per active group ───────────

export default function DownloadingTab({
  groups,
  miscDownloads,
  isLoading,
}: {
  groups: DownloadGroup[];
  miscDownloads: Download[];
  isLoading: boolean;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const activeGroups = useMemo(
    () => groups.filter((g) => g.active_count > 0),
    [groups],
  );
  const expandAll = useDownloadsUIStore((s) => s.expandAll);

  const miscDeleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-expand all active groups whenever the set changes (by rule_id fingerprint)
  const fingerprint = activeGroups.map((g) => g.rule_id).join(',');
  useEffect(() => {
    expandAll(activeGroups.map((g) => g.rule_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, expandAll]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <AnimeDownloadCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (activeGroups.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="text-center py-12">
        <HugeiconsIcon icon={ArrowDown01Icon} size={32} className="mx-auto mb-3 text-white/10" />
        <p className="text-white/25 text-sm">{i18n._(msg`downloads.noActive`)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {activeGroups.map((g) => (
        <DownloadingCard key={g.rule_id} group={g} />
      ))}
      <MiscDownloadsSection
        downloads={miscDownloads}
        onDelete={(gid) => miscDeleteMutation.mutate(gid)}
      />
    </div>
  );
}

function DownloadingCard({ group }: { group: DownloadGroup }) {
  const { i18n } = useLingui();
  const { coverUrl } = useAnimeCover(group.bangumi_id);
  const queryClient = useQueryClient();
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(group.rule_id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const pauseMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.pause(gid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.resume(gid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = useMemo(
    () =>
      group.downloads.filter(
        (d) => d.status === 'active' || d.status === 'paused' || d.status === 'waiting',
      ),
    [group.downloads],
  );
  const stats = useMemo(() => aggregateActiveStats(active), [active]);

  const chips = [group.subgroup_filter, group.resolution_filter].filter(
    (s): s is string => !!s && s.trim() !== '',
  );

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={group.rule_name}
      subChips={chips}
      stats={{
        mode: 'downloading',
        percent: stats.percent,
        speedBytes: stats.speed,
        downloadedBytes: stats.downloaded,
        totalBytes: stats.total,
        etaSeconds: stats.etaSeconds,
        activeCount: active.length,
        live: stats.speed > 0,
      }}
      expanded={expanded}
      onToggle={() => toggle(group.rule_id)}
    >
      {active.map((d) => (
        <EpisodeRowActive
          key={d.gid}
          {...toActiveProps(d)}
          onPause={(gid) => pauseMutation.mutate(gid)}
          onResume={(gid) => resumeMutation.mutate(gid)}
          onDelete={(gid) => deleteMutation.mutate(gid)}
        />
      ))}
    </AnimeDownloadCard>
  );
}
