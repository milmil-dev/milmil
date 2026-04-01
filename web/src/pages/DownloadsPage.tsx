import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Download04Icon,
  MagnetIcon,
  RssIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  type Download,
  downloadApi,
  downloadKeys,
  rssFeedApi,
  ruleApi,
  subscribeApi,
  type SubscribeInput,
} from '../lib/api/downloads';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi, torrentKeys } from '../lib/api/torrent';
import { api } from '../lib/api-client';
import { cn } from '../lib/utils';

// ── Types ───────────────────────────────────────────────────────────────────

interface Aria2Status {
  connected: boolean;
  version?: string;
  error?: string;
}

type Tab = 'search' | 'subscriptions' | 'active';

// ── Source config ───────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  all: 'All', nyaa: 'Nyaa', dmhy: 'DMHY', mikan: 'Mikan',
  'bangumi.moe': 'Bangumi.moe', 'acg.rip': 'ACG.RIP', dandanplay: 'DanDanPlay',
};

const SOURCE_COLORS: Record<string, string> = {
  nyaa: 'bg-green-500/15 text-green-400',
  dmhy: 'bg-blue-500/15 text-blue-400',
  mikan: 'bg-orange-500/15 text-orange-400',
  'bangumi.moe': 'bg-pink-500/15 text-pink-400',
  'acg.rip': 'bg-purple-500/15 text-purple-400',
  dandanplay: 'bg-cyan-500/15 text-cyan-400',
};

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[source] ?? 'bg-white/10 text-white/60'}`}>
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400',
  waiting: 'bg-yellow-500/15 text-yellow-400',
  paused: 'bg-yellow-600/15 text-yellow-500',
  complete: 'bg-blue-500/15 text-blue-400',
  error: 'bg-red-500/15 text-red-400',
  removed: 'bg-white/5 text-white/30',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

const TABS: { key: Tab; labelKey: ReturnType<typeof msg>; icon: typeof MagnetIcon }[] = [
  { key: 'search', labelKey: msg`downloads.tab.search`, icon: Search01Icon },
  { key: 'subscriptions', labelKey: msg`downloads.tab.rules`, icon: RssIcon },
  { key: 'active', labelKey: msg`downloads.tab.active`, icon: Download04Icon },
];

export function DownloadsPage() {
  const { i18n } = useLingui();
  const [tab, setTab] = useState<Tab>('search');

  // Aria2 connection status
  const { data: aria2Status } = useQuery({
    queryKey: ['system', 'aria2-status'],
    queryFn: () => api.get<Aria2Status>('/api/v1/system/aria2-status'),
    refetchInterval: 60000,
  });

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
              <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
                {i18n._(msg`nav.subscribe`)}
              </h1>
            </div>
            {/* Aria2 status badge */}
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'h-2 w-2 rounded-full',
                aria2Status?.connected ? 'bg-green-400' : 'bg-red-400/60'
              )} />
              <span className={cn(
                'text-[11px] font-medium',
                aria2Status?.connected ? 'text-green-400/80' : 'text-red-400/60'
              )}>
                {aria2Status?.connected
                  ? `Aria2 v${aria2Status.version}`
                  : i18n._(msg`settings.download.disconnected`)}
              </span>
            </div>
          </div>
        </div>

        {/* Aria2 not connected banner */}
        {aria2Status && !aria2Status.connected && (
          <div className="px-8 mb-4">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-300/80">
              {i18n._(msg`subscribe.aria2Warning`)}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-8 mb-6">
          <div className="flex gap-1 border-b border-white/[0.06] pb-px">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors relative cursor-pointer',
                  tab === t.key ? 'text-white' : 'text-white/35 hover:text-white/55'
                )}
              >
                <HugeiconsIcon icon={t.icon} size={14} />
                {i18n._(t.labelKey)}
                {tab === t.key && (
                  <motion.div
                    layoutId="subscribe-tab-indicator"
                    className="absolute bottom-0 left-2 right-2 h-[2px] bg-mm-accent rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-8 pb-16">
          {tab === 'search' && <SearchTab />}
          {tab === 'subscriptions' && <SubscriptionsTab />}
          {tab === 'active' && <ActiveTab />}
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH TAB
// ═══════════════════════════════════════════════════════════════════════════

function SearchTab() {
  const { i18n } = useLingui();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  useEffect(() => {
    if (!input.trim()) { setQuery(''); return; }
    const timer = setTimeout(() => setQuery(input.trim()), 500);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: torrentKeys.search(query, source),
    queryFn: () => torrentApi.search(query, source === 'all' ? undefined : source),
    enabled: query.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: (item: { url: string; name: string }) => torrentApi.add(item),
    onSuccess: () => toast.success(i18n._(msg`subscribe.downloadAdded`)),
    onError: (err: Error) => toast.error(err.message),
  });

  const downloadURL = (item: TorrentResult) => item.magnet || item.torrent_url;
  const sources = ['all', 'nyaa', 'dmhy', 'mikan', 'bangumi.moe', 'acg.rip', 'dandanplay'];

  return (
    <>
      {/* Quick subscribe form */}
      <QuickSubscribeForm />

      <div className="my-6 border-t border-white/[0.04]" />

      {/* Manual search */}
      <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">
        {i18n._(msg`subscribe.manualSearch`)}
      </h3>

      <Input
        placeholder={i18n._(msg`subscribe.searchPlaceholder`)}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/25 mb-4"
      />

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-none">
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer',
              source === s ? 'bg-white/[0.12] text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
            )}
          >
            {SOURCE_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {isLoading && query && <p className="text-sm text-white/40">Searching...</p>}

      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((item, i) => (
            <motion.div
              key={`${item.info_hash || item.torrent_url || item.magnet}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
              className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white break-words leading-relaxed">{item.title}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <SourceBadge source={item.source_site} />
                  {item.sub_group && <span className="text-[10px] text-white/30">{item.sub_group}</span>}
                  {item.size && <span className="text-[10px] text-white/25">{item.size}</span>}
                  {item.seeders > 0 && <span className="text-[10px] text-green-400/70">↑{item.seeders}</span>}
                  {item.leechers > 0 && <span className="text-[10px] text-red-400/50">↓{item.leechers}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={addMutation.isPending || !downloadURL(item)}
                onClick={() => addMutation.mutate({ url: downloadURL(item), name: item.title })}
                className="shrink-0 text-[11px]"
              >
                {i18n._(msg`subscribe.download`)}
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      {query && !isLoading && results.length === 0 && (
        <p className="text-sm text-white/40 text-center py-8">{i18n._(msg`subscribe.noResults`)}</p>
      )}
    </>
  );
}

// ── Quick Subscribe Form ────────────────────────────────────────────────────

function QuickSubscribeForm() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      anime_name: '',
      query: '',
      source: 'mikan' as 'mikan' | 'nyaa' | 'dmhy',
      sub_group: '',
      resolution: '1080p',
    },
    onSubmit: async ({ value }) => {
      await subscribeMutation.mutateAsync({
        anime_name: value.anime_name,
        query: value.query || value.anime_name,
        source: value.source,
        sub_group: value.sub_group,
        resolution: value.resolution,
      });
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (data: SubscribeInput) => subscribeApi.subscribe(data),
    onSuccess: () => {
      toast.success(i18n._(msg`subscribe.success`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sourceOptions = [
    { value: 'mikan', label: 'Mikan' },
    { value: 'nyaa', label: 'Nyaa' },
    { value: 'dmhy', label: 'DMHY' },
  ];

  const resolutionOptions = ['', '1080p', '720p', '4K'];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="text-sm font-bold text-white mb-1">
        {i18n._(msg`subscribe.quickTitle`)}
      </h3>
      <p className="text-[12px] text-white/30 mb-4">
        {i18n._(msg`subscribe.quickDesc`)}
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Anime name */}
          <form.Field name="anime_name">
            {(field) => (
              <Field>
                <label className="text-[11px] text-white/40 mb-1 block">{i18n._(msg`subscribe.animeName`)}</label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={i18n._(msg`subscribe.animeNameHint`)}
                  className="bg-white/[0.03] border-white/[0.06] text-white text-sm"
                />
              </Field>
            )}
          </form.Field>

          {/* Search query (optional override) */}
          <form.Field name="query">
            {(field) => (
              <Field>
                <label className="text-[11px] text-white/40 mb-1 block">{i18n._(msg`subscribe.searchQuery`)}</label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={i18n._(msg`subscribe.searchQueryHint`)}
                  className="bg-white/[0.03] border-white/[0.06] text-white text-sm"
                />
              </Field>
            )}
          </form.Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Source */}
          <form.Field name="source">
            {(field) => (
              <Field>
                <label className="text-[11px] text-white/40 mb-1 block">{i18n._(msg`subscribe.source`)}</label>
                <div className="flex gap-1">
                  {sourceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.handleChange(opt.value as 'mikan' | 'nyaa' | 'dmhy')}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        field.state.value === opt.value
                          ? 'bg-mm-accent/20 text-mm-accent'
                          : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </form.Field>

          {/* Sub group */}
          <form.Field name="sub_group">
            {(field) => (
              <Field>
                <label className="text-[11px] text-white/40 mb-1 block">{i18n._(msg`subscribe.subGroup`)}</label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={i18n._(msg`subscribe.subGroupHint`)}
                  className="bg-white/[0.03] border-white/[0.06] text-white text-sm"
                />
              </Field>
            )}
          </form.Field>

          {/* Resolution */}
          <form.Field name="resolution">
            {(field) => (
              <Field>
                <label className="text-[11px] text-white/40 mb-1 block">{i18n._(msg`subscribe.resolution`)}</label>
                <div className="flex gap-1">
                  {resolutionOptions.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => field.handleChange(r)}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                        field.state.value === r
                          ? 'bg-white/[0.12] text-white'
                          : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                      )}
                    >
                      {r || 'Any'}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(s) => [s.isSubmitting, s.values.anime_name] as const}>
          {([isSubmitting, name]) => (
            <Button
              type="submit"
              disabled={subscribeMutation.isPending || isSubmitting || !name.trim()}
              className="w-full font-semibold text-black bg-mm-accent hover:bg-mm-accent/90"
            >
              {subscribeMutation.isPending ? '...' : i18n._(msg`subscribe.button`)}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionsTab() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: feeds = [] } = useQuery({
    queryKey: downloadKeys.feeds(),
    queryFn: () => rssFeedApi.list(),
  });

  const { data: rules = [] } = useQuery({
    queryKey: downloadKeys.rules(),
    queryFn: () => ruleApi.list(),
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => rssFeedApi.refresh(id),
    onSuccess: () => {
      toast.success(i18n._(msg`subscribe.refreshed`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: async (feedId: string) => {
      // Delete associated rules first
      const feedRules = rules.filter((r) => r.rss_feed_id === feedId);
      for (const r of feedRules) await ruleApi.delete(r.id);
      await rssFeedApi.delete(feedId);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`subscribe.deleted`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
    },
  });

  const feedMap = new Map(feeds.map((f) => [f.id, f]));

  if (feeds.length === 0 && rules.length === 0) {
    return (
      <div className="text-center py-16">
        <HugeiconsIcon icon={RssIcon} size={32} className="mx-auto mb-4 text-white/10" />
        <p className="text-white/25 text-sm mb-2">{i18n._(msg`subscribe.emptyTitle`)}</p>
        <p className="text-white/15 text-xs max-w-[300px] mx-auto">
          {i18n._(msg`subscribe.emptyHint`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => {
        const feed = feedMap.get(rule.rss_feed_id);
        return (
          <motion.div
            key={rule.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    rule.enabled ? 'bg-green-400' : 'bg-white/20'
                  )} />
                  <h4 className="text-[14px] font-semibold text-white truncate">{rule.name}</h4>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {feed && <SourceBadge source={feed.type} />}
                  {rule.resolution_filter && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400/70">
                      {rule.resolution_filter}
                    </span>
                  )}
                  {rule.subgroup_filter && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70">
                      {rule.subgroup_filter}
                    </span>
                  )}
                  {feed && (
                    <span className="text-[10px] text-white/15">
                      {i18n._(msg`subscribe.every`)} {feed.fetch_interval_minutes}{i18n._(msg`subscribe.min`)}
                    </span>
                  )}
                  {rule.last_triggered_at && (
                    <span className="text-[10px] text-white/15">
                      {i18n._(msg`subscribe.lastMatch`)}: {new Date(rule.last_triggered_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {feed && (
                  <button
                    type="button"
                    onClick={() => refreshMutation.mutate(feed.id)}
                    disabled={refreshMutation.isPending}
                    className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                    title={i18n._(msg`subscribe.refresh`)}
                  >
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => feed && deleteFeedMutation.mutate(feed.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors cursor-pointer"
                  title={i18n._(msg`subscribe.delete`)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE TAB
// ═══════════════════════════════════════════════════════════════════════════

function ActiveTab() {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const { data: downloads = [], isLoading } = useQuery({
    queryKey: downloadKeys.list(),
    queryFn: () => downloadApi.list(),
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: (url: string) => downloadApi.add({ url }),
    onSuccess: () => {
      toast.success(i18n._(msg`subscribe.downloadAdded`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pauseMutation = useMutation({
    mutationFn: downloadApi.pause,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: downloadKeys.list() }),
  });
  const resumeMutation = useMutation({
    mutationFn: downloadApi.resume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: downloadKeys.list() }),
  });
  const deleteMutation = useMutation({
    mutationFn: downloadApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: downloadKeys.list() }),
  });

  const form = useForm({
    defaultValues: { url: '' },
    onSubmit: async ({ value }) => {
      if (!value.url.trim()) return;
      addMutation.mutate(value.url.trim());
      form.reset();
    },
  });

  return (
    <>
      {/* Add URL */}
      <form
        onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}
        className="flex gap-2 items-end mb-6"
      >
        <form.Field name="url">
          {(field) => (
            <Field className="flex-1">
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={i18n._(msg`subscribe.pasteUrl`)}
                className="font-mono text-sm bg-white/[0.03] border-white/[0.06] text-white"
              />
            </Field>
          )}
        </form.Field>
        <Button
          type="submit"
          disabled={addMutation.isPending}
          className="px-5 font-bold text-black bg-mm-accent shrink-0"
        >
          {i18n._(msg`subscribe.add`)}
        </Button>
      </form>

      {/* Downloads list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg p-4 animate-pulse bg-white/[0.03]">
              <div className="h-3 rounded bg-white/[0.06] w-[40%] mb-3" />
              <div className="h-1.5 rounded-full bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ) : downloads.length === 0 ? (
        <div className="text-center py-16">
          <HugeiconsIcon icon={Download04Icon} size={32} className="mx-auto mb-4 text-white/10" />
          <p className="text-white/25 text-sm">{i18n._(msg`subscribe.noDownloads`)}</p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {downloads.map((dl) => (
            <DownloadRow
              key={dl.id}
              dl={dl}
              onPause={() => pauseMutation.mutate(dl.gid)}
              onResume={() => resumeMutation.mutate(dl.gid)}
              onDelete={() => deleteMutation.mutate(dl.gid)}
            />
          ))}
        </AnimatePresence>
      )}
    </>
  );
}

function DownloadRow({ dl, onPause, onResume, onDelete }: {
  dl: Download; onPause: () => void; onResume: () => void; onDelete: () => void;
}) {
  const pct = dl.total_bytes > 0 ? Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-lg p-4 bg-white/[0.03] mb-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{dl.name || dl.url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', STATUS_COLOR[dl.status] ?? 'bg-white/5 text-white/30')}>
            {dl.status}
          </span>
          {dl.status === 'active' && (
            <button type="button" onClick={onPause} className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer">Pause</button>
          )}
          {dl.status === 'paused' && (
            <button type="button" onClick={onResume} className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer">Resume</button>
          )}
          <button type="button" onClick={onDelete} className="text-[11px] text-red-400/40 hover:text-red-400 cursor-pointer">×</button>
        </div>
      </div>
      {(dl.status === 'active' || dl.status === 'paused') && dl.total_bytes > 0 && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div className="h-full rounded-full bg-mm-accent" animate={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-white/25">
            <span>{formatBytes(dl.completed_bytes)} / {formatBytes(dl.total_bytes)}</span>
            <span>{formatSpeed(dl.speed_bytes)}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
