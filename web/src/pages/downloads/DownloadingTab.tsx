import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useMemo } from 'react';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { EpisodeRowActive } from '../../components/downloads/episode-rows/EpisodeRowActive';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import type { Download, DownloadGroup } from '../../lib/api/downloads';
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
  const activeGroups = useMemo(
    () => groups.filter((g) => g.active_count > 0),
    [groups],
  );
  const expandAll = useDownloadsUIStore((s) => s.expandAll);

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
          <div
            key={i}
            className="h-[160px] rounded-[14px] bg-white/[0.02] border border-white/[0.06] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (activeGroups.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="text-center py-12">
        <HugeiconsIcon icon={ArrowDown01Icon} size={32} className="mx-auto mb-3 text-white/10" />
        <p className="text-white/25 text-sm">No active downloads</p>
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
        mode="active"
        onDelete={(_gid) => {/* TODO wire PR 4 */}}
      />
    </div>
  );
}

function DownloadingCard({ group }: { group: DownloadGroup }) {
  const { coverUrl } = useAnimeCover(group.bangumi_id);
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(group.rule_id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

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
          onPause={() => {/* TODO wire PR 4 */}}
          onResume={() => {/* TODO wire PR 4 */}}
          onDelete={() => {/* TODO wire PR 4 */}}
        />
      ))}
    </AnimeDownloadCard>
  );
}
