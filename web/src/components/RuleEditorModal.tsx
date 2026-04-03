import {
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  type DownloadRule,
  type RSSFeed,
  downloadKeys,
  rssFeedApi,
  ruleApi,
} from '@/lib/api/downloads';
import { libraryApi, libraryKeys } from '@/lib/api/library';
import { Modal } from './Modal';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { Input } from './ui/input';

// ── Types ──────────────────────────────────────────────────────────────────

interface RuleEditorModalProps {
  rule?: DownloadRule;
  feed?: RSSFeed;
  open: boolean;
  onClose: () => void;
}

type MatchMode = 'fuzzy' | 'exact';
type EpisodeFilter = 'all' | 'new' | 'range';

const RESOLUTIONS = ['', '1080p', '720p', '4K'] as const;
const RESOLUTION_LABELS: Record<string, string> = {
  '': 'All',
  '1080p': '1080p',
  '720p': '720p',
  '4K': '4K',
};

// ── Component ──────────────────────────────────────────────────────────────

export function RuleEditorModal({ rule, feed, open, onClose }: RuleEditorModalProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const isCreateMode = !rule;

  // ── Form state ──
  const [enabled, setEnabled] = useState(rule ? rule.enabled === 1 : true);
  const [matchMode, setMatchMode] = useState<MatchMode>(
    (rule?.match_mode as MatchMode) || 'fuzzy'
  );
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>(
    (rule?.episode_filter as EpisodeFilter) || 'all'
  );
  const [episodeRange, setEpisodeRange] = useState(rule?.episode_range || '');
  const [subgroupFilter, setSubgroupFilter] = useState<string[]>(
    rule?.subgroup_filter ? rule.subgroup_filter.split(',').map((s) => s.trim()).filter(Boolean) : []
  );
  const [subgroupInput, setSubgroupInput] = useState('');
  const [resolution, setResolution] = useState(rule?.resolution_filter || '');
  const [libraryId, setLibraryId] = useState(rule?.library_id || '');

  // ── Create-mode fields ──
  const [ruleName, setRuleName] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [filterRegex] = useState('');

  // ── Preview state ──
  const [previewOpen] = useState(true);
  const [hideDownloaded, setHideDownloaded] = useState(true);

  // ── Queries ──
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

  const selectedLibrary = libraries.find((l) => l.id === libraryId);
  const savePath = selectedLibrary?.path || rule?.save_dir || '';

  const {
    data: previewData,
    isLoading: previewLoading,
    refetch: refetchPreview,
  } = useQuery({
    queryKey: ['rss-preview', feed?.id, rule?.id],
    queryFn: () => rssFeedApi.preview(feed!.id, rule?.id),
    enabled: previewOpen && !!feed && !!rule,
    staleTime: 60_000,
  });

  const previewItems = previewData?.items ?? [];
  const filteredPreview = hideDownloaded
    ? previewItems.filter((item) => !item.already_downloaded)
    : previewItems;

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create RSS feed
      const feed = await rssFeedApi.create({ name: ruleName || 'New Rule', url: rssUrl, type: 'mikan' });
      // 2. Create download rule linked to the feed
      await ruleApi.create({
        name: ruleName || 'New Rule',
        enabled: enabled ? 1 : 0,
        rss_feed_id: feed.id,
        filter_regex: filterRegex,
        exclude_regex: '',
        save_dir: savePath,
        episode_offset: 0,
        resolution_filter: resolution,
        subgroup_filter: subgroupFilter.join(','),
        min_seeders: 0,
        library_id: libraryId || null,
        bangumi_id: null,
        match_mode: matchMode,
        episode_filter: episodeFilter,
        episode_range: episodeFilter === 'range' ? episodeRange : '',
      });
      // 3. Trigger refresh
      await rssFeedApi.refresh(feed.id);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`ruleEditor.saved`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!rule) throw new Error('No rule to update');
      return ruleApi.update(rule.id, {
        enabled: enabled ? 1 : 0,
        match_mode: matchMode,
        episode_filter: episodeFilter,
        episode_range: episodeFilter === 'range' ? episodeRange : '',
        subgroup_filter: subgroupFilter.join(','),
        resolution_filter: resolution,
        library_id: libraryId || null,
      });
    },
    onSuccess: () => {
      toast.success(i18n._(msg`ruleEditor.saved`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = isCreateMode ? createMutation : updateMutation;

  // ── Subgroup helpers ──
  const addSubgroup = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !subgroupFilter.includes(trimmed)) {
      setSubgroupFilter((prev) => [...prev, trimmed]);
    }
    setSubgroupInput('');
  };

  const removeSubgroup = (tag: string) => {
    setSubgroupFilter((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubgroupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSubgroup(subgroupInput);
    }
  };

  // ── Relative date formatter ──
  const relativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffH = Math.floor(diffMs / 3_600_000);
    if (diffH < 1) return i18n._(msg`ruleEditor.justNow`);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Left column: Form ── */}
        <div className="flex-1 min-w-0 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-white truncate">
            {isCreateMode ? i18n._(msg`ruleEditor.createTitle`) : rule!.name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-white/40">
              {enabled
                ? i18n._(msg`ruleEditor.enabled`)
                : i18n._(msg`ruleEditor.disabled`)}
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        {/* ── Create-mode: RSS URL + Name ── */}
        {isCreateMode && (
          <>
            <Section label={i18n._(msg`ruleEditor.rssUrl`)}>
              <Input
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                placeholder="https://mikanani.me/RSS/Bangumi?bangumiId=..."
                className="bg-white/[0.03] border-white/[0.06] text-white text-[13px] placeholder:text-white/20 font-mono"
              />
            </Section>
            <Section label={i18n._(msg`ruleEditor.ruleName`)}>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder={i18n._(msg`ruleEditor.ruleNamePlaceholder`)}
                className="bg-white/[0.03] border-white/[0.06] text-white text-[13px] placeholder:text-white/20"
              />
            </Section>
          </>
        )}

        {/* ── Destination ── */}
        <Section label={i18n._(msg`ruleEditor.destination`)}>
          <div className="space-y-2">
            {/* Library selector */}
            <div className="relative">
              <select
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                className={cn(
                  'w-full appearance-none rounded-lg px-3 py-2 pr-8 text-[13px] font-medium',
                  'bg-white/[0.04] border border-white/[0.06] text-white/90',
                  'focus:outline-none focus:ring-1 focus:ring-white/10',
                  'cursor-pointer'
                )}
              >
                <option value="" className="bg-zinc-900">
                  {i18n._(msg`ruleEditor.noLibrary`)}
                </option>
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id} className="bg-zinc-900">
                    {lib.name}
                  </option>
                ))}
              </select>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
              />
            </div>
            {/* Save path */}
            {savePath && (
              <p className="text-[11px] text-white/30 font-mono truncate px-1">{savePath}</p>
            )}
          </div>
        </Section>

        {/* ── Title Match (edit mode or custom tab) ── */}
        {!isCreateMode && <Section label={i18n._(msg`ruleEditor.titleMatch`)}>
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              selected={matchMode === 'fuzzy'}
              onClick={() => setMatchMode('fuzzy')}
              label={i18n._(msg`ruleEditor.fuzzy`)}
              description={i18n._(msg`ruleEditor.fuzzyDesc`)}
            />
            <OptionCard
              selected={matchMode === 'exact'}
              onClick={() => setMatchMode('exact')}
              label={i18n._(msg`ruleEditor.exact`)}
              description={i18n._(msg`ruleEditor.exactDesc`)}
            />
          </div>
          {/* Show filter regex read-only (edit mode only) */}
          {!isCreateMode && rule?.filter_regex && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <p className="text-[10px] text-white/25 mb-0.5">{i18n._(msg`ruleEditor.filterRegex`)}</p>
              <p className="text-[12px] text-white/50 font-mono truncate">{rule.filter_regex}</p>
            </div>
          )}
        </Section>}

        {/* ── Episodes (edit mode or custom tab) ── */}
        {!isCreateMode && <Section label={i18n._(msg`ruleEditor.episodes`)}>
          <div className="grid grid-cols-3 gap-2">
            <OptionCard
              selected={episodeFilter === 'all'}
              onClick={() => setEpisodeFilter('all')}
              label={i18n._(msg`ruleEditor.allEpisodes`)}
            />
            <OptionCard
              selected={episodeFilter === 'new'}
              onClick={() => setEpisodeFilter('new')}
              label={i18n._(msg`ruleEditor.newOnly`)}
            />
            <OptionCard
              selected={episodeFilter === 'range'}
              onClick={() => setEpisodeFilter('range')}
              label={i18n._(msg`ruleEditor.range`)}
            />
          </div>
          <AnimatePresence>
            {episodeFilter === 'range' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <Input
                  value={episodeRange}
                  onChange={(e) => setEpisodeRange(e.target.value)}
                  placeholder="1-12"
                  className="mt-2 bg-white/[0.03] border-white/[0.06] text-white text-[13px] placeholder:text-white/20 font-mono"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Section>}

        {/* ── Release Groups ── */}
        <Section label={i18n._(msg`ruleEditor.releaseGroups`)}>
          <div className="space-y-2">
            {/* Tags */}
            <AnimatePresence>
              {subgroupFilter.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-wrap gap-1.5 overflow-hidden"
                >
                  {subgroupFilter.map((tag) => (
                    <motion.span
                      key={tag}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-orange-500/10 text-orange-400/90"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeSubgroup(tag)}
                        className="text-orange-400/40 hover:text-orange-400/80 transition-colors cursor-pointer"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={9} />
                      </button>
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            {/* Input */}
            <Input
              value={subgroupInput}
              onChange={(e) => setSubgroupInput(e.target.value)}
              onKeyDown={handleSubgroupKeyDown}
              onBlur={() => { if (subgroupInput.trim()) addSubgroup(subgroupInput); }}
              placeholder={i18n._(msg`ruleEditor.addGroup`)}
              className="bg-white/[0.03] border-white/[0.06] text-white text-[13px] placeholder:text-white/20"
            />
            <p className="text-[10px] text-white/20 px-1">
              {i18n._(msg`ruleEditor.groupHint`)}
            </p>
          </div>
        </Section>

        {/* ── Resolution ── */}
        <Section label={i18n._(msg`ruleEditor.resolution`)}>
          <div className="flex flex-wrap gap-2">
            {RESOLUTIONS.map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer',
                  resolution === res
                    ? 'bg-mm-accent/15 text-mm-accent ring-1 ring-mm-accent/20'
                    : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60'
                )}
              >
                {RESOLUTION_LABELS[res]}
              </button>
            ))}
          </div>
        </Section>

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-[12px] text-white/50 border-white/[0.08] hover:bg-white/[0.04]"
            >
              {i18n._(msg`ruleEditor.cancel`)}
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="text-[12px] font-semibold text-black bg-mm-accent hover:bg-mm-accent/90"
            >
              {saveMutation.isPending
                ? i18n._(msg`ruleEditor.saving`)
                : i18n._(msg`ruleEditor.save`)}
            </Button>
          </div>
        </div>

        {/* ── Right column: Preview ── */}
        {!isCreateMode && feed && (
          <div className="md:w-[320px] md:shrink-0 md:border-l md:border-white/[0.04] md:pl-5 border-t md:border-t-0 border-white/[0.04] pt-5 md:pt-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/25">
                {i18n._(msg`ruleEditor.preview`)}
              </span>
              {previewData && (
                <span className="text-[10px] text-white/25 tabular-nums">
                  {previewData.matched} / {previewData.total}
                </span>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={hideDownloaded} onCheckedChange={setHideDownloaded} size={14} />
                <span className="text-[10px] text-white/30">{i18n._(msg`ruleEditor.hideDownloaded`)}</span>
              </div>
              <button
                type="button"
                onClick={() => refetchPreview()}
                className="text-[10px] text-white/25 hover:text-white/50 transition-colors cursor-pointer"
              >
                {i18n._(msg`ruleEditor.refreshPreview`)}
              </button>
            </div>

            {/* Items */}
            {previewLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 rounded bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : filteredPreview.length > 0 ? (
              <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                {filteredPreview.map((item) => (
                  <div
                    key={item.link}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-[10px] transition-colors',
                      item.already_downloaded ? 'bg-transparent' : 'bg-white/[0.02]'
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      {item.already_downloaded && (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} className="text-green-400/50 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-white/50 truncate leading-snug" title={item.title}>{item.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-white/25">
                          {item.episode && <span>EP{item.episode}</span>}
                          {item.subgroup && <span className="text-orange-400/50">{item.subgroup}</span>}
                          {item.size && <span>{item.size}</span>}
                          {item.publish_date && <span>{relativeDate(item.publish_date)}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-white/15 text-center py-6">{i18n._(msg`ruleEditor.noPreviewItems`)}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/25">{label}</h3>
      {children}
    </div>
  );
}

// ── Option card (radio-style) ──────────────────────────────────────────────

function OptionCard({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-all cursor-pointer',
        selected
          ? 'bg-mm-accent/[0.08] ring-1 ring-mm-accent/20'
          : 'bg-white/[0.04] hover:bg-white/[0.06]'
      )}
    >
      <span
        className={cn(
          'text-[12px] font-medium',
          selected ? 'text-mm-accent' : 'text-white/60'
        )}
      >
        {label}
      </span>
      {description && (
        <span className="text-[10px] text-white/25">{description}</span>
      )}
    </button>
  );
}
