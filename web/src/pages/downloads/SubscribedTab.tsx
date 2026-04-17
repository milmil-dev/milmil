import { Delete02Icon, Refresh03Icon, RssIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AnimeCard } from '../../components/AnimeCard';
import { RuleEditorModal } from '../../components/RuleEditorModal';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/button';
import { Drawer, DrawerContent } from '../../components/ui/drawer';
import { useIsMobile } from '../../hooks/use-mobile';
import type { AnimeSummary } from '../../lib/api/discover';
import {
  type DownloadGroup,
  type DownloadRule,
  type RSSFeed,
  downloadApi,
  downloadKeys,
  rssFeedApi,
  ruleApi,
} from '../../lib/api/downloads';
import { animeGradient } from '../../lib/gradient';
import { cn } from '../../lib/utils';
import { DownloadCard, SourceBadge, useAnimeDetail } from '../DownloadsPage';
import { useAnimeCover } from '../../hooks/use-anime-cover';
import { useDownloadsUIStore } from '../../store/downloads-ui-store';
import { AnimeDownloadCard } from '../../components/downloads/AnimeDownloadCard';
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

// ── Subscriptions Sub-tab ────────────────────────────────────────────────

/** Wrapper card for subscriptions — fetches anime detail and renders AnimeCard or gradient fallback. */
function SubscriptionAnimeCard({
  rule,
  feed,
  group,
  index,
  onClick,
}: {
  rule: import('../../lib/api/downloads').DownloadRule;
  feed?: import('../../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  index: number;
  onClick: () => void;
}) {
  const bangumiId = group?.bangumi_id ?? rule.bangumi_id ?? undefined;
  const { data: animeDetail } = useAnimeDetail(bangumiId);

  // Build AnimeSummary from detail response or fallback to placeholder
  if (animeDetail && bangumiId) {
    const summary: AnimeSummary = {
      bangumi_id: bangumiId,
      title: animeDetail.title || rule.name,
      title_original: animeDetail.title_original || '',
      cover_image: animeDetail.cover_image || '',
      episode_count: animeDetail.episode_count || 0,
      score: animeDetail.score || 0,
      genres: animeDetail.genres,
      air_date: animeDetail.air_date,
      media_type: animeDetail.media_type,
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.025, duration: 0.3 }}
      >
        <AnimeCard anime={summary} onClick={onClick}>
          {/* Status dot + source badge overlay */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                rule.enabled ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-white/30'
              )}
            />
            {feed && <SourceBadge source={feed.type} />}
          </div>
          {/* Episode progress */}
          {group && group.complete_count > 0 && (
            <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-mm-accent tabular-nums backdrop-blur-md">
              {group.complete_count} / {animeDetail.episode_count || group.total_count}
            </span>
          )}
        </AnimeCard>
      </motion.div>
    );
  }

  // Fallback card for rules without bangumi_id or while loading
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
    >
      <button
        type="button"
        onClick={onClick}
        className="group/media-entry-card relative flex flex-col w-full text-left cursor-pointer"
      >
        <div
          className="relative aspect-[6/8] rounded-md overflow-hidden"
          style={{ background: animeGradient(rule.name) }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <span className="text-[11px] font-medium text-white/50 text-center line-clamp-3">
              {rule.name}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[50%] bg-gradient-to-t from-[#0c0c0c] to-transparent opacity-90" />
          {/* Status dot + source */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                rule.enabled ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-white/30'
              )}
            />
            {feed && <SourceBadge source={feed.type} />}
          </div>
        </div>
        <div className="mt-1.5 px-0.5 text-center">
          <p className="text-sm font-medium text-[--foreground] line-clamp-2 leading-snug">
            {rule.name}
          </p>
        </div>
      </button>
    </motion.div>
  );
}

/** Shared content for subscription detail — used by both Sheet (desktop) and Modal (mobile). */
function SubscriptionDetailContent({
  rule,
  feed,
  group,
  onClose,
}: {
  rule: import('../../lib/api/downloads').DownloadRule;
  feed?: import('../../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  onClose: () => void;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const bangumiId = group?.bangumi_id ?? rule.bangumi_id ?? undefined;
  const { data: animeDetail } = useAnimeDetail(bangumiId);

  const refreshMutation = useMutation({
    mutationFn: (id: string) => rssFeedApi.refresh(id),
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: async (feedId: string) => {
      const allRules =
        queryClient.getQueryData<import('../../lib/api/downloads').DownloadRule[]>(
          downloadKeys.rules()
        ) ?? [];
      const feedRules = allRules.filter((r) => r.rss_feed_id === feedId);
      for (const r of feedRules) await ruleApi.delete(r.id);
      await rssFeedApi.delete(feedId);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`autoDownload.deleted`));
      onClose();
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: downloadApi.pause,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const resumeMutation = useMutation({
    mutationFn: downloadApi.resume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });
  const deleteDlMutation = useMutation({
    mutationFn: downloadApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  const hasCover = animeDetail?.cover_image?.startsWith('http');
  const totalEps = animeDetail?.episode_count || group?.total_count || 0;
  const completedEps = group?.complete_count ?? 0;
  const progressPct = totalEps > 0 ? Math.round((completedEps / totalEps) * 100) : 0;

  return (
    <div className="space-y-0">
      {/* ── Cover hero ── */}
      <motion.div
        className="relative -mx-6 -mt-6 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Blurred background */}
        <div className="absolute inset-0">
          {hasCover ? (
            <img
              src={animeDetail!.cover_image}
              alt=""
              className="w-full h-full object-cover"
              style={{
                filter: 'blur(32px) saturate(1.3) brightness(0.35)',
                transform: 'scale(1.4)',
              }}
            />
          ) : (
            <div className="w-full h-full" style={{ background: animeGradient(rule.name) }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--mm-bg)]/60 to-[var(--mm-bg)]" />
        </div>

        {/* Content over blur */}
        <div className="relative z-[1] px-6 pt-10 pb-5">
          <div className="flex items-end gap-4">
            {/* Poster */}
            <motion.div
              className="shrink-0 w-[90px] h-[126px] rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.08]"
              style={hasCover ? undefined : { background: animeGradient(rule.name) }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {hasCover ? (
                <img src={animeDetail!.cover_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <span className="text-[10px] text-white/40 text-center line-clamp-3">
                    {rule.name}
                  </span>
                </div>
              )}
            </motion.div>

            <motion.div
              className="min-w-0 flex-1 pb-0.5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <h2 className="text-[17px] font-bold text-white leading-snug line-clamp-2">
                {animeDetail?.title || rule.name}
              </h2>
              {animeDetail?.title_original && animeDetail.title_original !== animeDetail.title && (
                <p className="text-[11px] text-white/30 truncate mt-0.5">
                  {animeDetail.title_original}
                </p>
              )}
              {/* Inline meta */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {animeDetail && animeDetail.score > 0 && (
                  <span className="text-[13px] font-bold text-mm-accent tabular-nums">
                    ♡ {animeDetail.score.toFixed(1)}
                  </span>
                )}
                {totalEps > 0 && (
                  <span className="text-[11px] text-white/35 tabular-nums">
                    {totalEps} {i18n._(msg`common.ep`)}
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* ── Status + badges row ── */}
      <motion.div
        className="flex items-center gap-1.5 flex-wrap pt-4 pb-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md',
            rule.enabled ? 'bg-green-500/10 text-green-400/90' : 'bg-white/[0.06] text-white/35'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              rule.enabled ? 'bg-green-400' : 'bg-white/25'
            )}
          />
          {rule.enabled ? i18n._(msg`autoDownload.active`) : i18n._(msg`autoDownload.paused`)}
        </span>
        {feed && <SourceBadge source={feed.type} />}
        {rule.resolution_filter && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70 font-medium">
            {rule.resolution_filter}
          </span>
        )}
        {rule.subgroup_filter && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70 font-medium">
            {rule.subgroup_filter}
          </span>
        )}
      </motion.div>

      {/* ── Episode progress bar ── */}
      {totalEps > 0 && (
        <motion.div
          className="pb-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px] text-white/40">{i18n._(msg`autoDownload.episodes`)}</span>
            <span className="text-[12px] text-white/60 font-medium tabular-nums">
              {completedEps}
              <span className="text-white/20"> / </span>
              {totalEps}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-mm-accent/80"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ delay: 0.4, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          </div>
        </motion.div>
      )}

      {/* ── Stats row ── */}
      <motion.div
        className="flex items-center gap-4 text-[11px] pb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div>
          <span className="text-white/25">{i18n._(msg`autoDownload.interval`)}</span>
          <span className="text-white/60 font-medium ml-1.5">
            {feed?.fetch_interval_minutes ?? 30}m
          </span>
        </div>
        {rule.last_triggered_at && (
          <>
            <span className="text-white/10">·</span>
            <div>
              <span className="text-white/25">{i18n._(msg`autoDownload.lastTriggered`)}</span>
              <span className="text-white/60 font-medium ml-1.5">
                {new Date(rule.last_triggered_at).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
        <span className="text-white/10">·</span>
        <span className="text-white/60 font-medium capitalize">{feed?.type ?? '—'}</span>
      </motion.div>

      {/* ── Actions ── */}
      <motion.div
        className="flex items-center gap-2 pb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {bangumiId && (
          <Link
            to="/anime/$id"
            params={{ id: String(bangumiId) }}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
          >
            {i18n._(msg`autoDownload.viewAnime`)}
          </Link>
        )}
        {feed && (
          <button
            type="button"
            onClick={() => refreshMutation.mutate(feed.id)}
            disabled={refreshMutation.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors cursor-pointer',
              'bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70'
            )}
          >
            <HugeiconsIcon
              icon={Refresh03Icon}
              size={13}
              className={refreshMutation.isPending ? 'animate-spin' : ''}
            />
            {i18n._(msg`autoDownload.refresh`)}
          </button>
        )}
        <button
          type="button"
          onClick={() => feed && deleteFeedMutation.mutate(feed.id)}
          disabled={deleteFeedMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg bg-white/[0.04] text-white/30 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer ml-auto"
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
        </button>
      </motion.div>

      {/* ── Downloads ── */}
      <motion.div
        className="pt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25">
            {i18n._(msg`autoDownload.subtab.downloads`)}
          </h3>
          {group && group.downloads.length > 0 && (
            <span className="text-[10px] text-white/20 tabular-nums">{group.downloads.length}</span>
          )}
        </div>
        {group && group.downloads.length > 0 ? (
          <div className="space-y-1">
            {group.downloads.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.45 + i * 0.04,
                  duration: 0.3,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              >
                <DownloadCard
                  dl={dl}
                  onPause={() => pauseMutation.mutate(dl.gid)}
                  onResume={() => resumeMutation.mutate(dl.gid)}
                  onDelete={() => deleteDlMutation.mutate(dl.gid)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <HugeiconsIcon icon={RssIcon} size={24} className="mx-auto mb-2 text-white/[0.08]" />
            <p className="text-[12px] text-white/20">{i18n._(msg`autoDownload.noDownloadsYet`)}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Responsive subscription detail — bottom drawer on mobile, right drawer on desktop.
 * Kept for potential future use; currently replaced by RuleEditorModal. */
// @ts-expect-error TS6133 — retained for future use
function SubscriptionDetailModal({
  rule,
  feed,
  group,
  open,
  onClose,
}: {
  rule: import('../../lib/api/downloads').DownloadRule;
  feed?: import('../../lib/api/downloads').RSSFeed;
  group?: DownloadGroup;
  open: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      direction={isMobile ? 'bottom' : 'right'}
    >
      <DrawerContent className="overflow-y-auto p-6">
        <SubscriptionDetailContent rule={rule} feed={feed} group={group} onClose={onClose} />
      </DrawerContent>
    </Drawer>
  );
}

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
          <div
            key={i}
            className="h-[160px] rounded-[14px] bg-white/[0.02] border border-white/[0.06] animate-pulse"
          />
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
