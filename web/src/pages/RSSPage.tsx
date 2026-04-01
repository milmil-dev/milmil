import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { PageTransition } from '../components/PageTransition';
import { Button } from '../components/ui/button';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import {
  type DownloadRule,
  downloadKeys,
  type RSSFeed,
  rssFeedApi,
  ruleApi,
} from '../lib/api/downloads';
import { cn } from '../lib/utils';

// ─── Feed type badge ──────────────────────────────────────────────────────────
const feedTypeColors: Record<string, { bg: string; text: string }> = {
  mikan: { bg: 'oklch(32% 0.14 30)', text: 'oklch(80% 0.12 30)' },
  nyaa: { bg: 'oklch(32% 0.14 145)', text: 'oklch(80% 0.12 145)' },
  dmhy: { bg: 'oklch(32% 0.14 260)', text: 'oklch(80% 0.12 260)' },
  custom: { bg: 'oklch(22% 0.01 280)', text: 'oklch(55% 0.01 280)' },
};

function TypeBadge({ type }: { type: string }) {
  const fallback = { bg: 'oklch(22% 0.01 280)', text: 'oklch(55% 0.01 280)' };
  const colors = feedTypeColors[type] ?? fallback;
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {type}
    </span>
  );
}

// ─── Feed row ─────────────────────────────────────────────────────────────────
function FeedRow({
  feed,
  refreshing,
  onRefresh,
  onEdit,
  onDelete,
}: {
  feed: RSSFeed;
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lastFetched = feed.last_fetched_at
    ? new Date(feed.last_fetched_at).toLocaleString()
    : 'Never';

  return (
    <div
      className="group flex items-center gap-4 px-4 py-3 rounded transition-colors hover:bg-[oklch(14%_0.02_280)]"
      style={{ borderBottom: '1px solid oklch(16% 0.01 280)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-white truncate">{feed.name}</p>
          <TypeBadge type={feed.type} />
          {!feed.enabled && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[oklch(18%_0.01_280)] text-[oklch(42%_0.01_280)]">
              OFF
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono truncate mt-0.5 text-mm-text-secondary">{feed.url}</p>
        <p className="text-[10px] text-mm-text-tertiary mt-0.5">Last fetched: {lastFetched}</p>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="xs" variant="secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Fetching\u2026' : 'Refresh'}
        </Button>
        <Button size="xs" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button size="xs" variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Rule row ─────────────────────────────────────────────────────────────────
function RuleRow({
  rule,
  feedName,
  onEdit,
  onDelete,
}: {
  rule: DownloadRule;
  feedName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-4 px-4 py-3 rounded transition-colors hover:bg-[oklch(14%_0.02_280)]"
      style={{ borderBottom: '1px solid oklch(16% 0.01 280)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-white truncate">{rule.name}</p>
          {!rule.enabled && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[oklch(18%_0.01_280)] text-[oklch(42%_0.01_280)]">
              OFF
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono truncate mt-0.5 text-mm-text-secondary">
          /{rule.filter_regex}/{rule.exclude_regex ? ` exclude /${rule.exclude_regex}/` : ''}
        </p>
        <p className="text-[10px] text-mm-text-tertiary mt-0.5">Feed: {feedName}</p>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="xs" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button size="xs" variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Feed form ────────────────────────────────────────────────────────────────
interface FeedFormValues {
  name: string;
  url: string;
  type: string;
}

const FEED_TYPES = ['mikan', 'nyaa', 'dmhy', 'custom'] as const;

function FeedForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: {
  defaultValues: FeedFormValues;
  onSubmit: (values: FeedFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5 mt-4"
    >
      <form.Field
        name="name"
        validators={{ onChange: ({ value }) => (!value ? 'Name required' : undefined) }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
            <FieldLabel
              htmlFor="feed-name"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Name
            </FieldLabel>
            <Input
              id="feed-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="Mikan Anime"
              className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="url"
        validators={{ onChange: ({ value }) => (!value ? 'URL required' : undefined) }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
            <FieldLabel
              htmlFor="feed-url"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              URL
            </FieldLabel>
            <Input
              id="feed-url"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="https://mikanani.me/RSS/..."
              className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field name="type">
        {(field) => (
          <Field>
            <FieldLabel
              htmlFor="feed-type"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Type
            </FieldLabel>
            <div className="flex gap-2">
              {FEED_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => field.handleChange(t)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded border transition-colors uppercase',
                    field.state.value === t
                      ? 'border-mm-accent text-mm-accent bg-mm-accent/10'
                      : 'border-[oklch(22%_0.01_280)] text-mm-text-tertiary hover:text-white hover:border-[oklch(30%_0.01_280)]'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full font-bold text-black bg-mm-accent"
          >
            {isSubmitting ? 'Saving\u2026' : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

// ─── Rule form ────────────────────────────────────────────────────────────────
interface RuleFormValues {
  name: string;
  enabled: number;
  rss_feed_id: string;
  filter_regex: string;
  exclude_regex: string;
  save_dir: string;
  episode_offset: number;
  resolution_filter: string;
  subgroup_filter: string;
  min_seeders: number;
}

function RuleForm({
  defaultValues,
  feeds,
  onSubmit,
  submitLabel,
}: {
  defaultValues: RuleFormValues;
  feeds: RSSFeed[];
  onSubmit: (values: RuleFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5 mt-4"
    >
      <form.Field
        name="name"
        validators={{ onChange: ({ value }) => (!value ? 'Name required' : undefined) }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
            <FieldLabel
              htmlFor="rule-name"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Name
            </FieldLabel>
            <Input
              id="rule-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="My Rule"
              className="bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="rss_feed_id"
        validators={{ onChange: ({ value }) => (!value ? 'Feed required' : undefined) }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
            <FieldLabel
              htmlFor="rule-feed"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Feed
            </FieldLabel>
            <select
              id="rule-feed"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              className="flex h-9 w-full rounded border px-3 py-1 text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white outline-none"
            >
              <option value="" className="bg-mm-surface">
                Select a feed...
              </option>
              {feeds.map((f) => (
                <option key={f.id} value={f.id} className="bg-mm-surface">
                  {f.name}
                </option>
              ))}
            </select>
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="filter_regex"
        validators={{ onChange: ({ value }) => (!value ? 'Filter regex required' : undefined) }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.isTouched && field.state.meta.errors.length > 0}>
            <FieldLabel
              htmlFor="rule-filter"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Filter Regex
            </FieldLabel>
            <Input
              id="rule-filter"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder=".*1080p.*"
              className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
            <FieldError>
              {field.state.meta.isTouched && field.state.meta.errors[0]
                ? String(field.state.meta.errors[0])
                : null}
            </FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field name="exclude_regex">
        {(field) => (
          <Field>
            <FieldLabel
              htmlFor="rule-exclude"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Exclude Regex
            </FieldLabel>
            <Input
              id="rule-exclude"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder=".*720p.*"
              className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
          </Field>
        )}
      </form.Field>

      <form.Field name="save_dir">
        {(field) => (
          <Field>
            <FieldLabel
              htmlFor="rule-dir"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-mm-text-secondary"
            >
              Save Directory
            </FieldLabel>
            <Input
              id="rule-dir"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="/mnt/media/anime"
              className="font-mono text-sm bg-transparent border-[oklch(22%_0.01_280)] focus:border-[oklch(65%_0.2_35)] text-white"
            />
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full font-bold text-black bg-mm-accent"
          >
            {isSubmitting ? 'Saving\u2026' : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  count,
  onAdd,
  addLabel,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <span className="text-xs font-mono text-mm-text-tertiary">{count}</span>
      </div>
      <Button size="sm" onClick={onAdd}>
        + {addLabel}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type DrawerMode =
  | { kind: 'add-feed' }
  | { kind: 'edit-feed'; feed: RSSFeed }
  | { kind: 'add-rule' }
  | { kind: 'edit-rule'; rule: DownloadRule }
  | null;

type DeleteTarget = { kind: 'feed'; feed: RSSFeed } | { kind: 'rule'; rule: DownloadRule } | null;

export function RSSPage() {
  const queryClient = useQueryClient();
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: feeds = [], isLoading: feedsLoading } = useQuery({
    queryKey: downloadKeys.feeds(),
    queryFn: rssFeedApi.list,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: downloadKeys.rules(),
    queryFn: ruleApi.list,
  });

  const feedNameMap = new Map(feeds.map((f) => [f.id, f.name]));

  // ── Feed mutations ─────────────────────────────────────────────────────────
  const createFeedMutation = useMutation({
    mutationFn: (data: { name: string; url: string; type: string }) => rssFeedApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      setDrawer(null);
      toast.success('Feed added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateFeedMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RSSFeed> }) =>
      rssFeedApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      setDrawer(null);
      toast.success('Feed updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFeedMutation = useMutation({
    mutationFn: (id: string) => rssFeedApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      setDeleteTarget(null);
      toast.success('Feed deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshFeedMutation = useMutation({
    mutationFn: async (id: string) => {
      setRefreshingId(id);
      return rssFeedApi.refresh(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      setRefreshingId(null);
      toast.success('Feed refreshed');
    },
    onError: (err: Error) => {
      setRefreshingId(null);
      toast.error(`Refresh failed: ${err.message}`);
    },
  });

  // ── Rule mutations ─────────────────────────────────────────────────────────
  const createRuleMutation = useMutation({
    mutationFn: (data: Omit<DownloadRule, 'id' | 'last_triggered_at' | 'created_at'>) =>
      ruleApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      setDrawer(null);
      toast.success('Rule added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DownloadRule> }) =>
      ruleApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      setDrawer(null);
      toast.success('Rule updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => ruleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      setDeleteTarget(null);
      toast.success('Rule deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Skeleton ───────────────────────────────────────────────────────────────
  const skeletonRows = [1, 2, 3];

  function SkeletonList() {
    return (
      <div className="space-y-1">
        {skeletonRows.map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
            <div className="flex-1 space-y-2">
              <div
                className="h-3 rounded"
                style={{ backgroundColor: 'oklch(18% 0.01 280)', width: '40%' }}
              />
              <div
                className="h-2 rounded"
                style={{ backgroundColor: 'oklch(15% 0.01 280)', width: '65%' }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Drawer title ───────────────────────────────────────────────────────────
  const drawerTitle = drawer
    ? {
        'add-feed': 'Add Feed',
        'edit-feed': 'Edit Feed',
        'add-rule': 'Add Rule',
        'edit-rule': 'Edit Rule',
      }[drawer.kind]
    : '';

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Header */}
        <div className="px-8 pt-12 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mm-accent">milmil</p>
          <h1 className="text-3xl font-bold text-white mt-1 tracking-tight">
            RSS Feeds &amp; Rules
          </h1>
        </div>

        {/* RSS Feeds section */}
        <div className="px-8 pb-8">
          <SectionHeader
            title="RSS Feeds"
            count={feeds.length}
            onAdd={() => setDrawer({ kind: 'add-feed' })}
            addLabel="Add Feed"
          />

          {feedsLoading ? (
            <SkeletonList />
          ) : feeds.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-mm-text-tertiary text-sm">No RSS feeds yet.</p>
              <p className="text-mm-text-muted text-xs mt-1">
                Add a feed to start auto-downloading.
              </p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
              }}
              className="rounded border"
              style={{ borderColor: 'oklch(18% 0.01 280)', backgroundColor: 'oklch(11% 0.01 280)' }}
            >
              <AnimatePresence mode="popLayout">
                {feeds.map((feed) => (
                  <motion.div
                    key={feed.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <FeedRow
                      feed={feed}
                      refreshing={refreshingId === feed.id}
                      onRefresh={() => refreshFeedMutation.mutate(feed.id)}
                      onEdit={() => setDrawer({ kind: 'edit-feed', feed })}
                      onDelete={() => setDeleteTarget({ kind: 'feed', feed })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Download Rules section */}
        <div className="px-8 pb-16">
          <SectionHeader
            title="Download Rules"
            count={rules.length}
            onAdd={() => setDrawer({ kind: 'add-rule' })}
            addLabel="Add Rule"
          />

          {rulesLoading ? (
            <SkeletonList />
          ) : rules.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-mm-text-tertiary text-sm">No download rules yet.</p>
              <p className="text-mm-text-muted text-xs mt-1">
                Rules auto-download matching items from RSS feeds.
              </p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
              }}
              className="rounded border"
              style={{ borderColor: 'oklch(18% 0.01 280)', backgroundColor: 'oklch(11% 0.01 280)' }}
            >
              <AnimatePresence mode="popLayout">
                {rules.map((rule) => (
                  <motion.div
                    key={rule.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                  >
                    <RuleRow
                      rule={rule}
                      feedName={feedNameMap.get(rule.rss_feed_id) ?? 'Unknown'}
                      onEdit={() => setDrawer({ kind: 'edit-rule', rule })}
                      onDelete={() => setDeleteTarget({ kind: 'rule', rule })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Add/Edit modal */}
        <Modal open={drawer !== null} onClose={() => setDrawer(null)} title={drawerTitle} size="md">
          {drawer?.kind === 'add-feed' && (
            <FeedForm
              defaultValues={{ name: '', url: '', type: 'mikan' }}
              submitLabel="Add Feed"
              onSubmit={async (values) => {
                await createFeedMutation.mutateAsync(values);
              }}
            />
          )}

          {drawer?.kind === 'edit-feed' && (
            <FeedForm
              defaultValues={{
                name: drawer.feed.name,
                url: drawer.feed.url,
                type: drawer.feed.type,
              }}
              submitLabel="Save Changes"
              onSubmit={async (values) => {
                await updateFeedMutation.mutateAsync({ id: drawer.feed.id, data: values });
              }}
            />
          )}

          {drawer?.kind === 'add-rule' && (
            <RuleForm
              defaultValues={{
                name: '',
                enabled: 1,
                rss_feed_id: '',
                filter_regex: '',
                exclude_regex: '',
                save_dir: '',
                episode_offset: 0,
                resolution_filter: '',
                subgroup_filter: '',
                min_seeders: 0,
              }}
              feeds={feeds}
              submitLabel="Add Rule"
              onSubmit={async (values) => {
                await createRuleMutation.mutateAsync(values);
              }}
            />
          )}

          {drawer?.kind === 'edit-rule' && (
            <RuleForm
              defaultValues={{
                name: drawer.rule.name,
                enabled: drawer.rule.enabled,
                rss_feed_id: drawer.rule.rss_feed_id,
                filter_regex: drawer.rule.filter_regex,
                exclude_regex: drawer.rule.exclude_regex,
                save_dir: drawer.rule.save_dir,
                episode_offset: drawer.rule.episode_offset,
                resolution_filter: drawer.rule.resolution_filter ?? '',
                subgroup_filter: drawer.rule.subgroup_filter ?? '',
                min_seeders: drawer.rule.min_seeders ?? 0,
              }}
              feeds={feeds}
              submitLabel="Save Changes"
              onSubmit={async (values) => {
                await updateRuleMutation.mutateAsync({ id: drawer.rule.id, data: values });
              }}
            />
          )}
        </Modal>

        {/* Delete confirmation modal */}
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.kind === 'feed' ? deleteTarget.feed.name : deleteTarget?.kind === 'rule' ? deleteTarget.rule.name : ''}"?`}
          size="sm"
        >
          <p className="text-[13px] text-mm-text-secondary mb-5">
            {deleteTarget?.kind === 'feed'
              ? 'This feed and all its items will be removed. Associated rules will stop matching.'
              : 'This download rule will be permanently removed.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget?.kind === 'feed') deleteFeedMutation.mutate(deleteTarget.feed.id);
                else if (deleteTarget?.kind === 'rule')
                  deleteRuleMutation.mutate(deleteTarget.rule.id);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
