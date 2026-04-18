import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
import { AnimeDownloadCardSkeleton } from '@/components/downloads/AnimeDownloadCardSkeleton';
import { EpisodeRowComplete } from '../../components/downloads/episode-rows/EpisodeRowComplete';
import { MiscDownloadsSection } from '../../components/downloads/MiscDownloadsSection';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { downloadApi, type Download, type DownloadGroup } from '../../lib/api/downloads';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { formatRelative, toCompleteProps } from './shared/adapters';

// ── CompletedTab — renders AnimeDownloadCard per completed group ──────────

interface CompletedTabProps {
  groups: DownloadGroup[];
  miscDownloads: Download[];
  isLoading: boolean;
}

export default function CompletedTab({ groups, miscDownloads, isLoading }: CompletedTabProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const completeGroups = useMemo(
    () => groups.filter((g) => g.complete_count > 0),
    [groups],
  );

  const miscDeleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <AnimeDownloadCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (completeGroups.length === 0 && miscDownloads.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-white/20 text-sm">{i18n._(msg`downloads.noCompleted`)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {completeGroups.map((g) => (
        <CompletedCard key={g.rule_id} group={g} />
      ))}
      <MiscDownloadsSection
        downloads={miscDownloads}
        mode="complete"
        onDelete={(gid) => miscDeleteMutation.mutate(gid)}
      />
    </div>
  );
}

function CompletedCard({ group }: { group: DownloadGroup }) {
  const { i18n } = useLingui();
  const { coverUrl } = useAnimeCover(group.bangumi_id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const expanded = useDownloadsUIStore((s) => s.expandedGroupIds.has(group.rule_id));
  const toggle = useDownloadsUIStore((s) => s.toggleGroup);

  const deleteMutation = useMutation({
    mutationFn: (gid: string) => downloadApi.delete(gid),
    onSuccess: () => {
      toast.success(i18n._(msg`downloads.deleted`));
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMemo(() => {
    return group.downloads
      .filter((d) => d.status === 'complete')
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [group.downloads]);

  const totalSize = useMemo(
    () => complete.reduce((s, d) => s + d.total_bytes, 0),
    [complete],
  );

  const latestCompletedAt = complete[0]?.created_at;

  const chips = [group.subgroup_filter, group.resolution_filter].filter(
    (s): s is string => !!s && s.trim() !== '',
  );

  return (
    <AnimeDownloadCard
      coverUrl={coverUrl}
      title={group.rule_name}
      subChips={chips}
      stats={{
        mode: 'completed',
        percent: 100,
        completedCount: complete.length,
        totalBytes: totalSize,
        completedAtRelative: latestCompletedAt ? formatRelative(latestCompletedAt) : undefined,
        live: false,
      }}
      expanded={expanded}
      onToggle={() => toggle(group.rule_id)}
    >
      {complete.map((d) => (
        <EpisodeRowComplete
          key={d.gid}
          {...toCompleteProps(d)}
          onPlay={() => {
            if (group.bangumi_id) {
              navigate({ to: '/anime/$id', params: { id: String(group.bangumi_id) } });
            } else {
              toast.info(i18n._(msg`downloads.notMatched`));
            }
          }}
          onDelete={(gid) => deleteMutation.mutate(gid)}
        />
      ))}
    </AnimeDownloadCard>
  );
}
