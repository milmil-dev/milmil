import {
  Download04Icon,
  MagnetIcon,
  RssIcon,
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
} from '../lib/api/downloads';
import type { TorrentResult } from '../lib/api/torrent';
import { torrentApi, torrentKeys } from '../lib/api/torrent';
import { cn } from '../lib/utils';

// ── Tab definitions ─────────────────────────────────────────────────────────

type Tab = 'search' | 'rules' | 'active';

const TABS: { key: Tab; labelKey: ReturnType<typeof msg>; icon: typeof MagnetIcon }[] = [
  { key: 'search', labelKey: msg`downloads.tab.search`, icon: MagnetIcon },
  { key: 'rules', labelKey: msg`downloads.tab.rules`, icon: RssIcon },
  { key: 'active', labelKey: msg`downloads.tab.active`, icon: Download04Icon },
];

// ── Source badges & labels ──────────────────────────────────────────────────

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

function progressPercent(dl: Download): number {
  if (dl.total_bytes === 0) return 0;
  return Math.min(100, (dl.completed_bytes / dl.total_bytes) * 100);
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

export function DownloadsPage() {
  const { i18n } = useLingui();
  const [tab, setTab] = useState<Tab>('search');

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
          <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
            {i18n._(msg`nav.downloads`)}
          </h1>
        </div>

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
                    layoutId="downloads-tab-indicator"
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
          {tab === 'rules' && <RulesTab />}
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
    onSuccess: () => toast.success('Download added'),
    onError: (err: Error) => toast.error(err.message),
  });

  const downloadURL = (item: TorrentResult) => item.magnet || item.torrent_url;
  const sources = ['all', 'nyaa', 'dmhy', 'mikan', 'bangumi.moe', 'acg.rip', 'dandanplay'];

  return (
    <>
      <Input
        placeholder="Search across all sources..."
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
              source === s
                ? 'bg-white/[0.12] text-white'
                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
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
                <p className="text-[13px] font-medium text-white break-words leading-relaxed">
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <SourceBadge source={item.source_site} />
                  {item.sub_group && <span className="text-[10px] text-white/30">{item.sub_group}</span>}
                  {item.size && <span className="text-[10px] text-white/25">{item.size}</span>}
                  {item.seeders > 0 && <span className="text-[10px] text-green-400/70">↑{item.seeders}</span>}
                  {item.leechers > 0 && <span className="text-[10px] text-red-400/50">↓{item.leechers}</span>}
                  {item.publish_date && (
                    <span className="text-[10px] text-white/20">
                      {new Date(item.publish_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={addMutation.isPending || !downloadURL(item)}
                onClick={() => addMutation.mutate({ url: downloadURL(item), name: item.title })}
                className="shrink-0 text-[11px]"
              >
                Download
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      {query && !isLoading && results.length === 0 && (
        <p className="text-sm text-white/40 text-center py-8">No results found.</p>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RULES TAB (RSS Feeds + Download Rules)
// ═══════════════════════════════════════════════════════════════════════════

function RulesTab() {
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
      toast.success('Feed refreshed');
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => rssFeedApi.delete(id),
    onSuccess: () => {
      toast.success('Feed deleted');
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => ruleApi.delete(id),
    onSuccess: () => {
      toast.success('Rule deleted');
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
    },
  });

  const feedMap = new Map(feeds.map((f) => [f.id, f]));

  return (
    <div className="space-y-6">
      {/* Feeds summary */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">
          {i18n._(msg`downloads.feeds`)} ({feeds.length})
        </h3>
        {feeds.length === 0 ? (
          <p className="text-sm text-white/25 py-4">
            {i18n._(msg`downloads.noFeeds`)}
          </p>
        ) : (
          <div className="space-y-1.5">
            {feeds.map((feed) => (
              <div key={feed.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03]">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">{feed.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SourceBadge source={feed.type} />
                    <span className="text-[10px] text-white/20">
                      {feed.last_fetched_at
                        ? `Last: ${new Date(feed.last_fetched_at).toLocaleString()}`
                        : 'Never fetched'}
                    </span>
                    <span className="text-[10px] text-white/15">
                      Every {feed.fetch_interval_minutes}min
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshMutation.mutate(feed.id)}
                    disabled={refreshMutation.isPending}
                    className="text-[10px]"
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteFeedMutation.mutate(feed.id)}
                    className="text-[10px] text-red-400/60 hover:text-red-400"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">
          {i18n._(msg`downloads.rules`)} ({rules.length})
        </h3>
        {rules.length === 0 ? (
          <p className="text-sm text-white/25 py-4">
            {i18n._(msg`downloads.noRules`)}
          </p>
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule) => {
              const feed = feedMap.get(rule.rss_feed_id);
              return (
                <div key={rule.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03]">
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    rule.enabled ? 'bg-green-400' : 'bg-white/20'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{rule.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-white/25 truncate max-w-[200px]">
                        {rule.filter_regex}
                      </span>
                      {rule.resolution_filter && (
                        <span className="text-[10px] text-cyan-400/60">{rule.resolution_filter}</span>
                      )}
                      {rule.subgroup_filter && (
                        <span className="text-[10px] text-orange-400/60">{rule.subgroup_filter}</span>
                      )}
                      {feed && (
                        <span className="text-[10px] text-white/15">→ {feed.name}</span>
                      )}
                      {rule.last_triggered_at && (
                        <span className="text-[10px] text-white/15">
                          Last: {new Date(rule.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    className="text-[10px] text-red-400/60 hover:text-red-400"
                  >
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE TAB (Downloads + Add URL)
// ═══════════════════════════════════════════════════════════════════════════

function ActiveTab() {
  const queryClient = useQueryClient();

  const { data: downloads = [], isLoading } = useQuery({
    queryKey: downloadKeys.list(),
    queryFn: () => downloadApi.list(),
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: (url: string) => downloadApi.add({ url }),
    onSuccess: () => {
      toast.success('Download added');
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
    onSuccess: () => {
      toast.success('Download removed');
      queryClient.invalidateQueries({ queryKey: downloadKeys.list() });
    },
  });

  const form = useForm({
    defaultValues: { url: '' },
    onSubmit: async ({ value }) => {
      const url = value.url.trim();
      if (!url) return;
      addMutation.mutate(url);
      form.reset();
    },
  });

  return (
    <>
      {/* Add download */}
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
                placeholder="Paste magnet link or torrent URL..."
                className="font-mono text-sm bg-white/[0.03] border-white/[0.06] text-white"
              />
            </Field>
          )}
        </form.Field>
        <form.Subscribe selector={(s) => [s.isSubmitting, s.values.url] as const}>
          {([isSubmitting, url]) => (
            <Button
              type="submit"
              disabled={addMutation.isPending || isSubmitting || !url.trim()}
              className="px-5 font-bold text-black bg-mm-accent shrink-0"
            >
              Add
            </Button>
          )}
        </form.Subscribe>
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
          <p className="text-white/25 text-sm">No downloads yet.</p>
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

function DownloadRow({
  dl, onPause, onResume, onDelete,
}: {
  dl: Download; onPause: () => void; onResume: () => void; onDelete: () => void;
}) {
  const pct = progressPercent(dl);
  const canPause = dl.status === 'active';
  const canResume = dl.status === 'paused';

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
          <p className="text-[11px] font-mono text-white/20 truncate mt-0.5">{dl.url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', STATUS_COLOR[dl.status] ?? 'bg-white/5 text-white/30')}>
            {dl.status}
          </span>
          {canPause && (
            <button type="button" onClick={onPause} className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer">
              Pause
            </button>
          )}
          {canResume && (
            <button type="button" onClick={onResume} className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer">
              Resume
            </button>
          )}
          <button type="button" onClick={onDelete} className="text-[11px] text-red-400/40 hover:text-red-400 cursor-pointer">
            Remove
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {(dl.status === 'active' || dl.status === 'paused') && dl.total_bytes > 0 && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-mm-accent"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'easeOut' }}
            />
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
