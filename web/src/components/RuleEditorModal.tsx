import {
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type AnimeSummary, discoverApi, discoverKeys } from '@/lib/api/discover';
import {
  type DownloadRule,
  downloadKeys,
  type RSSFeed,
  rssFeedApi,
  ruleApi,
} from '@/lib/api/downloads';
import { libraryApi, libraryKeys } from '@/lib/api/library';
import { cn } from '@/lib/utils';
import { Modal } from './Modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Skeleton } from './Skeleton';
import { externalHref } from '../lib/sanitize';

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
  const [matchMode, setMatchMode] = useState<MatchMode>((rule?.match_mode as MatchMode) || 'fuzzy');
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>(
    (rule?.episode_filter as EpisodeFilter) || 'all'
  );
  const [episodeRange, setEpisodeRange] = useState(rule?.episode_range || '');
  const [subgroupFilter, setSubgroupFilter] = useState<string[]>(
    rule?.subgroup_filter
      ? rule.subgroup_filter
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  );
  const [subgroupInput, setSubgroupInput] = useState('');
  const [resolution, setResolution] = useState(rule?.resolution_filter || '');
  const [libraryId, setLibraryId] = useState(rule?.library_id || '');

  // ── Name field (shared by create & edit) ──
  const [ruleName, setRuleName] = useState(rule?.name || '');
  const [rssUrl, setRssUrl] = useState(feed?.url || '');
  const [rssEditing, setRssEditing] = useState(!feed?.url);
  const [feedType, setFeedType] = useState(feed?.type || 'mikan');
  const [filterRegex] = useState('');

  // ── Linked anime ──
  const [bangumiId, setBangumiId] = useState<number | null>(rule?.bangumi_id ?? null);
  const [animeSearchInput, setAnimeSearchInput] = useState('');
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [animePickerOpen, setAnimePickerOpen] = useState(false);
  const animePickerRef = useRef<HTMLDivElement>(null);

  // ── Fetch linked anime detail on mount ──
  const { data: linkedAnimeDetail } = useQuery({
    queryKey: discoverKeys.detail(bangumiId!),
    queryFn: () => discoverApi.detail(bangumiId!),
    enabled: !!bangumiId && !selectedAnime,
    staleTime: 86400000,
  });
  // Sync fetched detail into selectedAnime state
  useEffect(() => {
    if (linkedAnimeDetail && bangumiId && !selectedAnime) {
      setSelectedAnime(linkedAnimeDetail);
    }
  }, [linkedAnimeDetail, bangumiId, selectedAnime]);

  // ── Preview state ──
  const [previewOpen] = useState(true);

  // ── Anime search debounce ──
  useEffect(() => {
    if (!animeSearchInput.trim()) {
      setAnimeSearchQuery('');
      return;
    }
    const timer = setTimeout(() => setAnimeSearchQuery(animeSearchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [animeSearchInput]);

  // ── Click outside to close anime picker ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (animePickerRef.current && !animePickerRef.current.contains(e.target as Node)) {
        setAnimePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Queries ──
  const { data: libraries = [] } = useQuery({
    queryKey: libraryKeys.list(),
    queryFn: () => libraryApi.list(),
  });

  const { data: animeResults = [] } = useQuery({
    queryKey: discoverKeys.search(animeSearchQuery),
    queryFn: () => discoverApi.search(animeSearchQuery),
    enabled: animeSearchQuery.length > 0,
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

  // ── Available subgroups from preview ──
  const availableSubgroups = useMemo(() => {
    const groups = new Set<string>();
    for (const item of previewItems) {
      if (item.subgroup) groups.add(item.subgroup);
    }
    return Array.from(groups).sort();
  }, [previewItems]);

  // ── Mutations ──
  // ── Validation ──
  const createValid = isCreateMode
    ? !!(rssUrl.trim() && ruleName.trim() && libraryId && bangumiId)
    : true;

  const creatingRef = useRef(false);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      if (!ruleName.trim()) throw new Error('Rule name is required');
      if (!libraryId) throw new Error('Save location is required');
      if (!bangumiId) throw new Error('Linked anime is required');
      // 1. Create RSS feed
      const feed = await rssFeedApi.create({ name: ruleName, url: rssUrl, type: feedType });
      try {
        // 2. Create download rule linked to the feed
        await ruleApi.create({
          name: ruleName,
          enabled: enabled ? 1 : 0,
          rss_feed_id: feed.id,
          filter_regex: filterRegex,
          exclude_regex: '',
          save_dir: savePath,
          episode_offset: 0,
          resolution_filter: resolution,
          subgroup_filter: subgroupFilter.join(','),
          min_seeders: 0,
          library_id: libraryId,
          bangumi_id: bangumiId,
          match_mode: matchMode,
          episode_filter: episodeFilter,
          episode_range: episodeFilter === 'range' ? episodeRange : '',
        });
      } catch (err) {
        await rssFeedApi.delete(feed.id).catch(() => {});
        throw err;
      }
      // 3. Trigger refresh
      await rssFeedApi.refresh(feed.id);
    },
    onSuccess: () => {
      creatingRef.current = false;
      toast.success(i18n._(msg`ruleEditor.saved`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      onClose();
    },
    onError: (err: Error) => {
      creatingRef.current = false;
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error('No rule to update');
      // Update feed URL/type if changed
      if (feed && (rssUrl !== feed.url || feedType !== feed.type)) {
        await rssFeedApi.update(feed.id, { url: rssUrl, type: feedType });
      }
      await ruleApi.update(rule.id, {
        name: ruleName,
        enabled: enabled ? 1 : 0,
        rss_feed_id: rule.rss_feed_id,
        filter_regex: rule.filter_regex,
        exclude_regex: rule.exclude_regex,
        save_dir: savePath || rule.save_dir,
        episode_offset: rule.episode_offset,
        match_mode: matchMode,
        episode_filter: episodeFilter,
        episode_range: episodeFilter === 'range' ? episodeRange : '',
        subgroup_filter: subgroupFilter.join(','),
        resolution_filter: resolution,
        min_seeders: rule.min_seeders,
        library_id: libraryId || null,
        bangumi_id: bangumiId,
      });
      // Refresh feed so filter changes take effect on the existing queue immediately,
      // mirroring the initial-subscribe behaviour (refreshNewSubscription) —
      // otherwise the user waits up to 30 min for the next cron tick.
      if (feed) await rssFeedApi.refresh(feed.id);
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error('No rule to delete');
      await ruleApi.delete(rule.id);
      if (feed) await rssFeedApi.delete(feed.id);
    },
    onSuccess: () => {
      toast.success(i18n._(msg`ruleEditor.deleted`));
      queryClient.invalidateQueries({ queryKey: downloadKeys.rules() });
      queryClient.invalidateQueries({ queryKey: downloadKeys.feeds() });
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
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
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Left column: Form ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-4">
            {isCreateMode ? (
              <h2 className="text-base font-semibold text-ink truncate">
                {i18n._(msg`ruleEditor.createTitle`)}
              </h2>
            ) : (
              <div className="min-w-0 flex-1">
                <input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="text-base font-semibold text-ink truncate bg-transparent border-none outline-none focus:ring-0 p-0 w-full placeholder:text-ink/30"
                  placeholder={i18n._(msg`ruleEditor.ruleNamePlaceholder`)}
                />
                <p className="text-[10px] text-ink/20 font-mono mt-0.5">{rule!.id}</p>
              </div>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-ink/40">
                {enabled ? i18n._(msg`ruleEditor.enabled`) : i18n._(msg`ruleEditor.disabled`)}
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          {/* ── RSS URL ── */}
          <Section label={i18n._(msg`ruleEditor.rssUrl`)}>
            {rssEditing ? (
              <div className="space-y-2">
                <textarea
                  value={rssUrl}
                  onChange={(e) => setRssUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRssEditing(false);
                  }}
                  placeholder="https://mikanani.me/RSS/Bangumi?bangumiId=..."
                  rows={3}
                  className="w-full bg-ink/[0.03] border border-ink/[0.08] rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink/20 font-mono resize-none outline-none focus:border-ink/15 transition-colors"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setRssEditing(false)}
                  className="text-[11px] text-ink/50 hover:text-ink px-2.5 py-1.5 rounded bg-ink/[0.06] hover:bg-ink/[0.1] transition-colors"
                >
                  {i18n._(msg`ruleEditor.done`)}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {externalHref(rssUrl) ? (
                  <a
                    href={externalHref(rssUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[12px] text-blue-400/70 hover:text-blue-400 font-mono break-all leading-relaxed transition-colors"
                  >
                    {rssUrl}
                  </a>
                ) : (
                  <p className="block text-[12px] text-ink/50 font-mono break-all leading-relaxed">
                    {rssUrl}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setRssEditing(true)}
                  className="text-[11px] text-ink/30 hover:text-ink/60 px-2 py-1 rounded bg-ink/[0.04] hover:bg-ink/[0.08] transition-colors"
                >
                  {i18n._(msg`ruleEditor.editUrl`)}
                </button>
              </div>
            )}
          </Section>

          {/* ── Feed Type ── */}
          <Section label={i18n._(msg`ruleEditor.feedType`)}>
            <div className="flex flex-wrap gap-2">
              {(['mikan', 'nyaa', 'custom'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFeedType(t)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer capitalize',
                    feedType === t
                      ? 'bg-ink/[0.10] text-ink ring-1 ring-ink/[0.15]'
                      : 'bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.07] hover:text-ink/60'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Create-mode: Name ── */}
          {isCreateMode && (
            <Section label={i18n._(msg`ruleEditor.ruleName`)}>
              <Input
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder={i18n._(msg`ruleEditor.ruleNamePlaceholder`)}
                className="bg-ink/[0.03] border-transparent text-ink text-[13px] placeholder:text-ink/20"
              />
            </Section>
          )}

          {/* ── Linked Anime ── */}
          <Section label={i18n._(msg`ruleEditor.linkedAnime`)}>
            <div ref={animePickerRef} className="relative">
              {bangumiId && selectedAnime ? (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-ink/[0.04]">
                  <img
                    src={selectedAnime.cover_image}
                    alt=""
                    className="w-8 h-11 rounded object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink/90 font-medium truncate">
                      {selectedAnime.title || selectedAnime.title_original}
                    </p>
                    <p className="text-[10px] text-ink/30">Bangumi #{bangumiId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBangumiId(null);
                      setSelectedAnime(null);
                    }}
                    className="text-ink/25 hover:text-ink/50 transition-colors cursor-pointer shrink-0"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              ) : bangumiId && !selectedAnime ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-ink/[0.04]">
                  <span className="text-[13px] text-ink/50">Bangumi #{bangumiId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBangumiId(null);
                      setSelectedAnime(null);
                    }}
                    className="text-ink/25 hover:text-ink/50 transition-colors cursor-pointer"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={12} />
                  </button>
                </div>
              ) : (
                <Input
                  value={animeSearchInput}
                  onChange={(e) => {
                    setAnimeSearchInput(e.target.value);
                    setAnimePickerOpen(true);
                  }}
                  onFocus={() => {
                    if (animeSearchQuery) setAnimePickerOpen(true);
                  }}
                  placeholder={i18n._(msg`ruleEditor.searchAnime`)}
                  className="bg-ink/[0.03] border-transparent text-ink text-[13px] placeholder:text-ink/20"
                />
              )}
              {/* Dropdown results */}
              <AnimatePresence>
                {animePickerOpen && animeResults.length > 0 && !bangumiId && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-mm-bg-elevated shadow-xl shadow-black/40"
                  >
                    {animeResults.slice(0, 8).map((anime) => (
                      <button
                        key={anime.bangumi_id}
                        type="button"
                        onClick={() => {
                          setBangumiId(anime.bangumi_id);
                          setSelectedAnime(anime);
                          setAnimePickerOpen(false);
                          setAnimeSearchInput('');
                          // Auto-fill rule name if empty
                          setRuleName(anime.title || anime.title_original);
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-ink/[0.06] transition-colors cursor-pointer text-left"
                      >
                        <img
                          src={anime.cover_image}
                          alt=""
                          className="w-7 h-10 rounded object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-ink/80 truncate">
                            {anime.title || anime.title_original}
                          </p>
                          {anime.air_date && (
                            <p className="text-[10px] text-ink/25">{anime.air_date.slice(0, 4)}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Section>

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
                    'bg-ink/[0.04] text-ink/90',
                    'focus:outline-none focus:ring-1 focus:ring-ink/10',
                    'cursor-pointer'
                  )}
                >
                  <option value="" className="bg-mm-bg-elevated">
                    {i18n._(msg`ruleEditor.noLibrary`)}
                  </option>
                  {libraries.map((lib) => (
                    <option key={lib.id} value={lib.id} className="bg-mm-bg-elevated">
                      {lib.name}
                    </option>
                  ))}
                </select>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/30 pointer-events-none"
                />
              </div>
              {/* Save path */}
              {savePath && (
                <p className="text-[11px] text-ink/30 font-mono truncate px-1">{savePath}</p>
              )}
            </div>
          </Section>

          {/* ── Title Match (edit mode or custom tab) ── */}
          {!isCreateMode && (
            <Section label={i18n._(msg`ruleEditor.titleMatch`)}>
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
                <div className="mt-2 px-3 py-2 rounded-lg bg-ink/[0.03]">
                  <p className="text-[10px] text-ink/25 mb-0.5">
                    {i18n._(msg`ruleEditor.filterRegex`)}
                  </p>
                  <p className="text-[12px] text-ink/50 font-mono truncate">{rule.filter_regex}</p>
                </div>
              )}
            </Section>
          )}

          {/* ── Episodes (edit mode or custom tab) ── */}
          {!isCreateMode && (
            <Section label={i18n._(msg`ruleEditor.episodes`)}>
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
                      className="mt-2 bg-ink/[0.03] border-ink/[0.06] text-ink text-[13px] placeholder:text-ink/20 font-mono"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>
          )}

          {/* ── Release Groups ── */}
          <Section label={i18n._(msg`ruleEditor.releaseGroups`)}>
            <div className="space-y-2">
              {/* Selectable chips from preview data */}
              {availableSubgroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableSubgroups.map((sg) => {
                    const isSelected = subgroupFilter.includes(sg);
                    return (
                      <button
                        key={sg}
                        type="button"
                        onClick={() => (isSelected ? removeSubgroup(sg) : addSubgroup(sg))}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all cursor-pointer',
                          isSelected
                            ? 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/20'
                            : 'bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.07] hover:text-ink/60'
                        )}
                      >
                        {isSelected && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} />}
                        {sg}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Selected tags not in available list (manual entries) */}
              <AnimatePresence>
                {subgroupFilter.filter((t) => !availableSubgroups.includes(t)).length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-wrap gap-1.5 overflow-hidden"
                  >
                    {subgroupFilter
                      .filter((t) => !availableSubgroups.includes(t))
                      .map((tag) => (
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
              {/* Manual input fallback */}
              <Input
                value={subgroupInput}
                onChange={(e) => setSubgroupInput(e.target.value)}
                onKeyDown={handleSubgroupKeyDown}
                onBlur={() => {
                  if (subgroupInput.trim()) addSubgroup(subgroupInput);
                }}
                placeholder={
                  availableSubgroups.length > 0
                    ? i18n._(msg`ruleEditor.addGroupManual`)
                    : i18n._(msg`ruleEditor.addGroup`)
                }
                className="bg-ink/[0.03] border-transparent text-ink text-[13px] placeholder:text-ink/20"
              />
              {availableSubgroups.length === 0 && (
                <p className="text-[10px] text-ink/20 px-1">{i18n._(msg`ruleEditor.groupHint`)}</p>
              )}
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
                      ? 'bg-ink/[0.10] text-ink ring-1 ring-ink/[0.15]'
                      : 'bg-ink/[0.04] text-ink/40 hover:bg-ink/[0.07] hover:text-ink/60'
                  )}
                >
                  {RESOLUTION_LABELS[res]}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Footer ── */}
          <div className="flex items-center gap-2 pt-4">
            {!isCreateMode && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-[12px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
              >
                <HugeiconsIcon icon={Delete02Icon} size={13} />
                {i18n._(msg`ruleEditor.delete`)}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-[12px] text-ink/50 border-transparent hover:bg-ink/[0.04]"
            >
              {i18n._(msg`ruleEditor.cancel`)}
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !createValid}
              className="text-[12px] font-semibold text-ink-contrast bg-mm-accent hover:bg-mm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending
                ? i18n._(msg`ruleEditor.saving`)
                : i18n._(msg`ruleEditor.save`)}
            </Button>
          </div>
        </div>

        {/* ── Right column: Preview ── */}
        {!isCreateMode && feed && (
          <div className="md:w-[400px] md:shrink-0 md:pl-5 pt-5 md:pt-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink/25">
                {i18n._(msg`ruleEditor.preview`)}
              </span>
              {previewData && (
                <span className="text-[10px] text-ink/25 tabular-nums">
                  {previewData.matched} / {previewData.total}
                </span>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={() => refetchPreview()}
                className="text-[10px] text-ink/25 hover:text-ink/50 transition-colors cursor-pointer"
              >
                {i18n._(msg`ruleEditor.refreshPreview`)}
              </button>
            </div>

            {/* Items */}
            {previewLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 rounded-lg bg-ink/[0.03]" />
                ))}
              </div>
            ) : previewItems.length > 0 ? (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {previewItems.map((item) => (
                  <div
                    key={item.link}
                    className={cn(
                      'px-3 py-2 rounded-lg transition-colors',
                      item.already_downloaded ? 'bg-green-500/[0.06]' : 'bg-ink/[0.03]'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-[12px] truncate leading-snug',
                            item.already_downloaded ? 'text-ink/30' : 'text-ink/60'
                          )}
                          title={item.title}
                        >
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-ink/25">
                          {item.episode && <span>EP{item.episode}</span>}
                          {item.subgroup && (
                            <span className="text-orange-400/50">{item.subgroup}</span>
                          )}
                          {item.size && <span>{item.size}</span>}
                          {item.publish_date && <span>{relativeDate(item.publish_date)}</span>}
                          {item.already_downloaded && (
                            <span className="inline-flex items-center gap-0.5 text-green-400/60">
                              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} />
                              {i18n._(msg`ruleEditor.downloaded`)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink/15 text-center py-8">
                {i18n._(msg`ruleEditor.noPreviewItems`)}
              </p>
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
      <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink/25">{label}</h3>
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
        selected ? 'bg-ink/[0.08] ring-1 ring-ink/[0.12]' : 'bg-ink/[0.04] hover:bg-ink/[0.06]'
      )}
    >
      <span className={cn('text-[12px] font-medium', selected ? 'text-ink' : 'text-ink/60')}>
        {label}
      </span>
      {description && <span className="text-[10px] text-ink/25">{description}</span>}
    </button>
  );
}
