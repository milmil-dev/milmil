import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimeCard } from '../components/AnimeCard';
import { DuplicatesPanel } from '../components/anime/DuplicatesPanel';
import { EpisodeStatusCard } from '../components/anime/EpisodeStatusCard';
import { EpisodeListItem } from '../components/EpisodeListItem';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { useDocumentTitle } from '../hooks/use-document-title';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { downloadKeys, ruleApi } from '../lib/api/downloads';
import { translateGenre } from '../lib/genre-i18n';

/** The milmil:// scheme is only registered by the native macOS client. */
const IS_MAC = /Mac/.test(
  typeof navigator === 'undefined' ? '' : (navigator.platform ?? navigator.userAgent)
);

const RELATION_LABELS: Record<string, Record<string, string>> = {
  PREQUEL: { en: 'Prequel', 'zh-Hant': '前作', 'zh-Hans': '前作' },
  SEQUEL: { en: 'Sequel', 'zh-Hant': '續作', 'zh-Hans': '续作' },
  SIDE_STORY: { en: 'Side Story', 'zh-Hant': '番外篇', 'zh-Hans': '番外篇' },
  PARENT: { en: 'Parent', 'zh-Hant': '本篇', 'zh-Hans': '本篇' },
  ALTERNATIVE: { en: 'Alternative', 'zh-Hant': '替代版', 'zh-Hans': '替代版' },
  SPIN_OFF: { en: 'Spin-off', 'zh-Hant': '衍生作', 'zh-Hans': '衍生作' },
  SUMMARY: { en: 'Summary', 'zh-Hant': '總集篇', 'zh-Hans': '总集篇' },
  CHARACTER: { en: 'Character', 'zh-Hant': '角色', 'zh-Hans': '角色' },
  OTHER: { en: 'Other', 'zh-Hant': '其他', 'zh-Hans': '其他' },
};

function getRelationLabel(type: string, locale: string): string {
  return RELATION_LABELS[type]?.[locale] ?? RELATION_LABELS[type]?.en ?? type.replace(/_/g, ' ');
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

import { Refresh03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '../components/ui/button';
import { useAuth } from '../hooks/use-auth';
import type { PlayableEpisode } from '../lib/api/anime';
import { animeApi, animeKeys } from '../lib/api/anime';
import { collectionApi, collectionKeys } from '../lib/api/collection';
import type { AnimeCharacter, AnimeSummary, FranchiseEntry } from '../lib/api/discover';
import { groupSeasons, type SeasonGroup } from '../lib/franchise';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
import { useBgStore } from '../store/bg-store';
import { Skeleton, SkeletonParagraph, SkeletonText } from '../components/Skeleton';

interface RelatedAnime {
  relation_type: string;
  anime: { bangumi_id: number; title: string; title_original?: string };
}

function buildSeasonChain(
  relations: RelatedAnime[] | undefined,
  currentId: number,
  currentTitle: string
): Array<{ bangumiId: number; title: string; label: string; isCurrent: boolean }> {
  if (!relations?.length) return [];

  const sequels = relations.filter(
    (r) => r.relation_type === 'SEQUEL' || r.relation_type === 'Sequel'
  );
  const prequels = relations.filter(
    (r) => r.relation_type === 'PREQUEL' || r.relation_type === 'Prequel'
  );

  if (sequels.length === 0 && prequels.length === 0) return [];

  const chain: Array<{ bangumiId: number; title: string; label: string; isCurrent: boolean }> = [];

  // Prequels (reversed — earliest first)
  for (let i = prequels.length - 1; i >= 0; i--) {
    chain.push({
      bangumiId: prequels[i]!.anime.bangumi_id,
      title: prequels[i]!.anime.title,
      label: `S${chain.length + 1}`,
      isCurrent: false,
    });
  }

  // Current
  chain.push({
    bangumiId: currentId,
    title: currentTitle,
    label: `S${chain.length + 1}`,
    isCurrent: true,
  });

  // Sequels
  for (const sequel of sequels) {
    chain.push({
      bangumiId: sequel.anime.bangumi_id,
      title: sequel.anime.title,
      label: `S${chain.length + 1}`,
      isCurrent: false,
    });
  }

  return chain;
}

function seasonLinkParams(entry: FranchiseEntry) {
  return { id: entry.bangumi_id > 0 ? String(entry.bangumi_id) : `al-${entry.anilist_id}` };
}

/**
 * One S-number pill. A season that aired as one run is a single link; a
 * split season renders as "S1 | 1 | 2" with one link per cour so both halves
 * stay reachable without pretending the second cour is a new season.
 */
function SeasonPill({
  group,
  isCurrent,
}: {
  group: SeasonGroup;
  isCurrent: (entry: FranchiseEntry) => boolean;
}) {
  const active = group.parts.some(isCurrent);
  const single = group.parts.length === 1 ? group.parts[0] : undefined;
  if (single) {
    return (
      <Link
        to="/anime/$id"
        params={seasonLinkParams(single)}
        className={cn(
          'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
          active
            ? 'bg-mm-accent/20 text-mm-accent'
            : 'bg-ink/[0.06] text-ink/50 hover:bg-ink/[0.10] hover:text-ink/70'
        )}
        title={single.title}
      >
        {`S${group.season}`}
      </Link>
    );
  }
  return (
    <div
      className={cn(
        'flex items-stretch rounded-full overflow-hidden shrink-0 text-xs font-medium',
        active ? 'bg-mm-accent/20' : 'bg-ink/[0.06]'
      )}
    >
      <span className={cn('pl-3 pr-2 py-1', active ? 'text-mm-accent' : 'text-ink/50')}>
        {`S${group.season}`}
      </span>
      {group.parts.map((entry, idx) => (
        <Link
          key={entry.anilist_id}
          to="/anime/$id"
          params={seasonLinkParams(entry)}
          className={cn(
            'px-2.5 py-1 border-l transition-colors',
            active ? 'border-mm-accent/20' : 'border-ink/10',
            isCurrent(entry)
              ? 'bg-mm-accent/25 text-mm-accent'
              : 'text-ink/50 hover:bg-ink/[0.10] hover:text-ink/70'
          )}
          title={entry.title}
        >
          {entry.part || idx + 1}
        </Link>
      ))}
    </div>
  );
}

/** Episode and cast lists collapse past these counts behind a "show more" toggle. */
const EPISODE_PREVIEW_COUNT = 24;
const CHARACTER_PREVIEW_COUNT = 10;

function SynopsisBlock({ text }: { text: string }) {
  const { i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);
  // Rough guard so short synopses don't get a useless toggle.
  const collapsible = text.length > 180 || text.split('\n').length > 3;
  return (
    <div className="max-w-[660px]">
      <p
        className={cn(
          'text-[13px] sm:text-[14px] font-medium text-ink/75 leading-relaxed whitespace-pre-line',
          collapsible && !expanded && 'line-clamp-3'
        )}
      >
        {text}
      </p>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-[12px] font-semibold text-ink/50 hover:text-mm-accent transition-colors cursor-pointer"
        >
          {expanded ? i18n._(msg`watch.showLess`) : i18n._(msg`watch.showMore`)}
        </button>
      )}
    </div>
  );
}

function ExternalLinks({
  links,
  children,
}: {
  links: Array<{ label: string; href: string } | false>;
  /** Trailing controls that act on this metadata, e.g. refresh. */
  children?: ReactNode;
}) {
  const shown = links.filter((l): l is { label: string; href: string } => !!l);
  return (
    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 pt-1">
      {shown.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-ink/40 hover:text-mm-accent transition-colors"
        >
          {l.label}
          <span aria-hidden="true" className="text-[10px]">
            ↗
          </span>
        </a>
      ))}
      {children}
    </div>
  );
}

function ShowMoreToggle({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  const { i18n } = useLingui();
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-ink/[0.06] text-ink/60 hover:bg-ink/[0.10] hover:text-ink transition-colors cursor-pointer"
      >
        {expanded
          ? i18n._(msg`watch.showLess`)
          : `${i18n._(msg`watch.showMore`)} (+${hiddenCount})`}
      </button>
    </div>
  );
}

function ScoreSelector({
  score,
  onChange,
  disabled,
}: {
  score: number | null;
  onChange: (score: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => {
            // Clicking the same score again clears it
            onChange(score === i + 1 ? null : i + 1);
          }}
          className={cn(
            'w-2.5 h-2.5 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed',
            score != null && i < score ? 'bg-mm-accent' : 'bg-ink/[0.10] hover:bg-ink/[0.20]'
          )}
          title={`${i + 1}/10`}
        />
      ))}
      {score != null && <span className="ml-1 text-xs text-ink/50 tabular-nums">{score}/10</span>}
    </div>
  );
}

function CharacterCard({ entry, cvLabel }: { entry: AnimeCharacter; cvLabel: string }) {
  const isMain = entry.role === 'MAIN';
  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-ink/[0.03] border border-ink/[0.05] hover:bg-ink/[0.06] transition-colors">
      {/* Images row */}
      <div className="flex items-end gap-2">
        {/* Character image */}
        <div className="w-12 h-14 rounded-md overflow-hidden shrink-0 bg-ink/[0.08]">
          {entry.character.image ? (
            <img
              src={entry.character.image}
              alt={entry.character.name}
              className="w-full h-full object-cover"
            />
          ) : null}
        </div>
        {/* Voice actor image */}
        {entry.voice_actor && (
          <div className="w-10 h-12 rounded-md overflow-hidden shrink-0 bg-ink/[0.08] -ml-4 border border-black/40">
            {entry.voice_actor.image ? (
              <img
                src={entry.voice_actor.image}
                alt={entry.voice_actor.name}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
        )}
        {/* Role badge */}
        {isMain && (
          <span className="ml-auto text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-mm-accent/15 text-mm-accent shrink-0">
            MAIN
          </span>
        )}
      </div>
      {/* Names */}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-ink/90 leading-snug truncate">
          {entry.character.name}
        </p>
        {entry.voice_actor && (
          <p className="text-[11px] text-ink/45 truncate mt-0.5">
            <span className="text-ink/30">{cvLabel} </span>
            {entry.voice_actor.name}
          </p>
        )}
      </div>
    </div>
  );
}

export function AnimeDetailPage() {
  const { i18n } = useLingui();
  const { id } = useParams({ strict: false });
  const isAniListOnly = id?.startsWith('al-') ?? false;
  const numericId = isAniListOnly ? Number(id!.slice(3)) : Number(id);
  const detailId = isAniListOnly ? id! : numericId;
  const navigate = useNavigate();
  const setImage = useBgStore((s) => s.setImage);

  const {
    data: anime,
    isLoading,
    isError,
  } = useQuery({
    queryKey: discoverKeys.detail(detailId),
    queryFn: () => discoverApi.detail(detailId),
    enabled: isAniListOnly || !Number.isNaN(numericId),
  });

  useDocumentTitle(anime?.title ?? 'Anime');

  const { data: episodes = [] } = useQuery({
    queryKey: discoverKeys.episodes(numericId),
    queryFn: () => discoverApi.episodes(numericId),
    enabled: !isAniListOnly && !Number.isNaN(numericId),
  });

  const { isAuthenticated } = useAuth();

  const { data: playableData } = useQuery({
    queryKey: animeKeys.playableEpisodes(numericId),
    queryFn: () => animeApi.playableEpisodes(numericId),
    enabled: !isAniListOnly && !Number.isNaN(numericId) && isAuthenticated,
  });

  const { data: comments = [] } = useQuery({
    queryKey: discoverKeys.comments(numericId),
    queryFn: () => discoverApi.comments(numericId),
    enabled: !isAniListOnly && !Number.isNaN(numericId),
  });

  const { data: franchise } = useQuery({
    queryKey: discoverKeys.franchise(numericId),
    queryFn: () => discoverApi.franchise(numericId),
    enabled: !isAniListOnly && !Number.isNaN(numericId),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Check if anime has active subscription
  const { data: rules = [] } = useQuery({
    queryKey: downloadKeys.rules(),
    queryFn: () => ruleApi.list(),
    enabled: isAuthenticated,
    staleTime: 60000,
  });
  const hasSubscription =
    !isAniListOnly && rules.some((r) => r.bangumi_id === numericId && r.enabled);

  // Check if anime has local playable files
  const hasPlayableFiles = (playableData?.episodes?.filter((ep) => ep.media_file)?.length ?? 0) > 0;
  const playableCount = playableData?.episodes?.filter((ep) => ep.media_file)?.length ?? 0;

  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: (status: string) => collectionApi.updateStatus(numericId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(numericId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
      toast.success(i18n._(msg`anime.collectionUpdated`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scoreMutation = useMutation({
    mutationFn: (score: number | null) => animeApi.updateScore(numericId, score),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(numericId) }),
  });

  const syncFlagsMutation = useMutation({
    mutationFn: (syncDisabled: 0 | 1) =>
      animeApi.updateSyncFlags(numericId, { sync_disabled: syncDisabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(numericId) });
      toast.success(i18n._(msg`anime.syncFlagsUpdated`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshMetaMutation = useMutation({
    mutationFn: async () => {
      const tasks: Promise<unknown>[] = [discoverApi.detail(detailId, { refresh: true })];
      if (!isAniListOnly && !Number.isNaN(numericId)) {
        tasks.push(discoverApi.episodes(numericId, { refresh: true }));
      }
      await Promise.all(tasks);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoverKeys.detail(detailId) });
      if (!isAniListOnly) {
        queryClient.invalidateQueries({ queryKey: discoverKeys.episodes(numericId) });
      }
      toast.success(i18n._(msg`anime.metaRefreshed`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const continueEpisode = useMemo(() => {
    if (!playableData?.episodes) return null;
    // Find first episode with progress but not completed
    const inProgress = playableData.episodes.find(
      (ep) =>
        ep.progress && !ep.progress.completed && ep.progress.position_seconds > 0 && ep.media_file
    );
    if (inProgress) return inProgress;
    // Find next unwatched episode after last completed
    const lastCompleted = [...playableData.episodes].reverse().find((ep) => ep.progress?.completed);
    if (lastCompleted) {
      const nextSort = lastCompleted.sort + 1;
      return playableData.episodes.find((ep) => ep.sort >= nextSort && ep.media_file);
    }
    // First episode with a file
    return playableData.episodes.find((ep) => ep.media_file) ?? null;
  }, [playableData]);

  // Build episode list: merge playable data (local files + progress) with discover images
  const episodeList: PlayableEpisode[] = (() => {
    if (playableData?.episodes?.length) {
      // Merge discover episode images into playable episodes (local DB may lack thumbnails)
      const discoverImageMap = new Map(episodes?.map((e) => [e.sort, e.image]) ?? []);
      return playableData.episodes.map((ep) => ({
        ...ep,
        image: ep.image || discoverImageMap.get(ep.sort) || null,
        synopsis: ep.synopsis || episodes?.find((e) => e.sort === ep.sort)?.synopsis || null,
      }));
    }
    return (
      episodes?.map((e) => ({
        episode_id: '',
        sort: e.sort,
        title: e.title,
        title_zh: null,
        air_date: e.air_date ?? null,
        synopsis: e.synopsis ?? null,
        synopsis_zh: null,
        image: e.image ?? null,
        media_file: null,
        progress: null,
      })) ?? []
    );
  })();

  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  // Collapsed, the list is a window that starts a few episodes before the one
  // the viewer is on, so someone at episode 300 isn't shown episodes 1-24.
  const continueIdx = continueEpisode
    ? episodeList.findIndex((ep) => ep.sort === continueEpisode.sort)
    : -1;
  const episodeWindowStart = Math.max(
    0,
    Math.min(continueIdx - 3, episodeList.length - EPISODE_PREVIEW_COUNT)
  );
  const visibleEpisodes = showAllEpisodes
    ? episodeList
    : episodeList.slice(episodeWindowStart, episodeWindowStart + EPISODE_PREVIEW_COUNT);
  const [showAllCharacters, setShowAllCharacters] = useState(false);
  // Season pills and recommendations navigate between ids without remounting
  // the page, so collapse the lists again when the anime changes.
  const [expandedFor, setExpandedFor] = useState(id);
  if (expandedFor !== id) {
    setExpandedFor(id);
    setShowAllEpisodes(false);
    setShowAllCharacters(false);
  }

  // Set full-screen background image (behind sidebar) — Seanime style
  useEffect(() => {
    const img = anime?.banner_image || anime?.cover_image;
    if (img?.startsWith('http')) {
      setImage(img, { tone: 'page' });
    }
    return () => setImage(null);
  }, [anime?.banner_image, anime?.cover_image, setImage]);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <Skeleton className="h-[340px] rounded-none" />
          <div className="px-4 md:px-8 py-6 space-y-4">
            <SkeletonText className="h-6 w-[30%]" />
            <SkeletonText className="h-4 w-[60%]" />
            <SkeletonParagraph lines={3} className="max-w-3xl pt-2" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (isError || !anime) {
    return (
      <PageTransition>
        <div className="min-h-screen flex flex-col items-center justify-center">
          <p className="text-sm text-mm-text-tertiary">
            {isError ? i18n._(msg`common.loadFailed`) : i18n._(msg`anime.notFound`)}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-3"
          >
            {i18n._(msg`common.retry`)}
          </Button>
          <Link
            to="/"
            className="mt-2 text-[12px] text-mm-text-muted hover:text-mm-text-secondary transition-colors"
          >
            {i18n._(msg`common.backHome`)}
          </Link>
        </div>
      </PageTransition>
    );
  }

  const hasCover = anime.cover_image?.startsWith('http');

  return (
    <PageTransition>
      <div className="min-h-screen pb-16">
        {/* Hero section */}
        <div className="relative w-full overflow-hidden md:min-h-[clamp(340px,45vh,28rem)]">
          <div className="relative z-[2] h-full flex">
            <div className="flex-1 flex flex-col justify-start p-4 pt-6 md:p-8 md:pt-12 min-w-0 max-w-[900px]">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                {/* Mobile: stacked layout / Desktop: side-by-side */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                  {/* Poster */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="shrink-0 w-[120px] h-[170px] sm:w-[160px] sm:h-[225px] lg:w-[200px] lg:h-[290px] rounded-md overflow-hidden shadow-md"
                    style={hasCover ? undefined : { background: animeGradient(anime.title) }}
                  >
                    {hasCover && (
                      <img
                        src={anime.cover_image}
                        alt={anime.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </motion.div>

                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left sm:pt-2">
                    {/* Title */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.4 }}
                    >
                      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-ink tracking-tight leading-7 sm:leading-8 line-clamp-2">
                        {anime.title}
                      </h1>
                      {anime.title_original && anime.title_original !== anime.title && (
                        <p className="text-[13px] font-medium text-ink/60 mt-1 truncate">
                          {anime.title_original}
                        </p>
                      )}
                    </motion.div>

                    {/* Meta line: score · type · episodes · year + status indicators */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                      className="flex items-center justify-center sm:justify-start gap-2 flex-wrap"
                    >
                      {anime.score > 0 && (
                        <span className="text-[15px] font-bold text-mm-accent tabular-nums">
                          ★ {anime.score.toFixed(1)}
                        </span>
                      )}
                      {anime.media_type && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink/[0.10] text-ink/60 font-medium">
                          {anime.media_type}
                        </span>
                      )}
                      {anime.episode_count > 0 && (
                        <span className="text-[12px] font-medium text-ink/55">
                          {anime.episode_count} {i18n._(msg`common.ep`)}
                        </span>
                      )}
                      {anime.air_date && (
                        <span className="text-[12px] font-medium text-ink/55">
                          {anime.air_date.slice(0, 7)}
                        </span>
                      )}
                      {anime.rating && anime.rating.total > 0 && (
                        <span className="text-[11px] font-medium text-ink/35">
                          {anime.rating.total} {i18n._(msg`anime.ratings`)}
                        </span>
                      )}
                      {/* Not yet aired */}
                      {anime.air_date && new Date(anime.air_date) > new Date() && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {i18n._(msg`anime.notAired`)}
                        </span>
                      )}
                      {/* Inline status dots */}
                      {hasSubscription && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 text-[10px] font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                          {i18n._(msg`anime.subscribed`)}
                        </span>
                      )}
                      {hasPlayableFiles && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                          {playableCount} {i18n._(msg`anime.playableEps`)}
                        </span>
                      )}
                    </motion.div>

                    {/* Tags */}
                    {anime.tags?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="flex flex-wrap justify-center sm:justify-start gap-1.5"
                      >
                        {anime.tags.slice(0, 6).map((tag) => (
                          <Link
                            key={tag}
                            to="/search"
                            search={{ genre: tag }}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded bg-ink/[0.08] text-ink/60 hover:bg-mm-accent/15 hover:text-mm-accent transition-colors"
                          >
                            {translateGenre(tag, i18n.locale)}
                          </Link>
                        ))}
                      </motion.div>
                    )}

                    {/* Season tabs — franchise-powered */}
                    {(() => {
                      const franchiseSeasons = franchise?.main_series;
                      if (franchiseSeasons && franchiseSeasons.length > 1) {
                        const isCurrent = (entry: FranchiseEntry) =>
                          entry.bangumi_id === numericId || entry.anilist_id === anime.anilist_id;
                        return (
                          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                            {groupSeasons(franchiseSeasons).map((group) => (
                              <SeasonPill key={group.season} group={group} isCurrent={isCurrent} />
                            ))}
                          </div>
                        );
                      }
                      const seasons = buildSeasonChain(anime.relations, numericId, anime.title);
                      if (seasons.length <= 1) return null;
                      return (
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                          {seasons.map((s) => (
                            <Link
                              key={s.bangumiId}
                              to="/anime/$id"
                              params={{ id: String(s.bangumiId) }}
                              className={cn(
                                'px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0',
                                s.isCurrent
                                  ? 'bg-mm-accent/20 text-mm-accent'
                                  : 'bg-ink/[0.06] text-ink/50 hover:bg-ink/[0.10] hover:text-ink/70'
                              )}
                              title={s.title}
                            >
                              {s.label}
                            </Link>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Actions + collection status — single row */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.4 }}
                      className="flex items-center justify-center sm:justify-start gap-1.5 flex-wrap"
                    >
                      {/* Primary: play / resume the next episode with a local file */}
                      {continueEpisode?.media_file &&
                        (() => {
                          const prog = continueEpisode.progress;
                          const resuming =
                            !!prog &&
                            !prog.completed &&
                            prog.position_seconds > 0 &&
                            prog.duration_seconds > 0;
                          const epNum =
                            continueEpisode.sort % 1 === 0
                              ? Math.floor(continueEpisode.sort)
                              : continueEpisode.sort;
                          return (
                            <Link
                              to="/watch/$animeId"
                              params={{ animeId: String(numericId) }}
                              search={{ ep: epNum }}
                              title={
                                resuming
                                  ? `${formatTime(prog.duration_seconds - prog.position_seconds)} ${i18n._(msg`player.remaining`)}`
                                  : undefined
                              }
                              className="relative overflow-hidden inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-mm-accent text-[12px] font-semibold text-ink-contrast shadow-sm hover:brightness-110 transition-[filter]"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                              {resuming
                                ? i18n._(msg`anime.continueWatching`)
                                : i18n._(msg`anime.play`)}
                              <span className="tabular-nums opacity-80">EP {epNum}</span>
                              {resuming && (
                                <span
                                  aria-hidden="true"
                                  className="absolute left-0 bottom-0 h-[3px] bg-ink-contrast/40"
                                  style={{
                                    width: `${(prog.position_seconds / prog.duration_seconds) * 100}%`,
                                  }}
                                />
                              )}
                            </Link>
                          );
                        })()}

                      {/* Bookmark toggle */}
                      {!isAniListOnly &&
                        isAuthenticated &&
                        (() => {
                          const isBookmarked =
                            playableData?.watch_status && playableData.watch_status !== 'none';
                          return (
                            <motion.button
                              type="button"
                              onClick={() =>
                                statusMutation.mutate(isBookmarked ? 'none' : 'planning')
                              }
                              disabled={statusMutation.isPending}
                              aria-pressed={!!isBookmarked}
                              whileTap={{ scale: 0.97 }}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer',
                                isBookmarked
                                  ? 'bg-mm-accent/15 text-mm-accent hover:bg-mm-accent/25'
                                  : 'bg-ink/[0.08] hover:bg-ink/[0.14] text-ink/70 hover:text-ink'
                              )}
                            >
                              <motion.svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill={isBookmarked ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={cn(
                                  'size-3.5',
                                  isBookmarked ? 'text-mm-accent' : 'text-ink/70'
                                )}
                                animate={isBookmarked ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                                transition={{ duration: 0.3 }}
                              >
                                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                              </motion.svg>
                              {isBookmarked
                                ? i18n._(msg`anime.inCollection`)
                                : i18n._(msg`anime.addToCollection`)}
                            </motion.button>
                          );
                        })()}

                      {/* Search resources */}
                      {!isAniListOnly && (
                        <Link
                          to="/downloads"
                          search={{ anime: String(anime.bangumi_id) }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink/[0.08] hover:bg-ink/[0.14] text-[12px] font-medium text-ink/70 hover:text-ink transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3.5"
                          >
                            <circle cx={11} cy={11} r={8} />
                            <path d="m21 21-4.3-4.3" />
                          </svg>
                          {i18n._(msg`anime.searchResources`)}
                        </Link>
                      )}

                      {/* Open in the native macOS app (milmil:// URL scheme) */}
                      {!isAniListOnly && IS_MAC && (
                        <a
                          href={`milmil://anime/${anime.bangumi_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink/[0.08] hover:bg-ink/[0.14] text-[12px] font-medium text-ink/70 hover:text-ink transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3.5"
                          >
                            <rect x={3} y={4} width={18} height={14} rx={2} />
                            <path d="M8 21h8" />
                            <path d="M12 18v3" />
                          </svg>
                          {i18n._(msg`anime.openInApp`)}
                        </a>
                      )}

                      {/* Tracker sync toggle */}
                      {!isAniListOnly &&
                        isAuthenticated &&
                        playableData &&
                        (() => {
                          const syncDisabled = playableData.sync_disabled === 1;
                          return (
                            <button
                              type="button"
                              onClick={() => syncFlagsMutation.mutate(syncDisabled ? 0 : 1)}
                              aria-pressed={!syncDisabled}
                              aria-label={
                                syncDisabled
                                  ? i18n._(msg`anime.enableTrackerSync`)
                                  : i18n._(msg`anime.excludeTrackerSync`)
                              }
                              disabled={syncFlagsMutation.isPending}
                              title={
                                syncDisabled
                                  ? i18n._(msg`anime.enableTrackerSync`)
                                  : i18n._(msg`anime.excludeTrackerSync`)
                              }
                              className={cn(
                                'inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                                syncDisabled
                                  ? 'bg-ink/[0.04] text-ink/30 hover:bg-ink/[0.10] hover:text-ink/60'
                                  : 'bg-ink/[0.08] text-ink/60 hover:bg-ink/[0.14] hover:text-ink'
                              )}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3.5"
                              >
                                {/* Tracker sync: a link, struck through when excluded */}
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                {syncDisabled && <path d="m2 2 20 20" />}
                              </svg>
                            </button>
                          );
                        })()}
                    </motion.div>

                    {/* Collection watch status + personal score — inline when in collection */}
                    <AnimatePresence>
                      {!isAniListOnly &&
                        playableData?.watch_status &&
                        playableData.watch_status !== 'none' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -4 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -4 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="flex items-center justify-center sm:justify-start gap-3 flex-wrap"
                          >
                            <div className="relative">
                              <select
                                aria-label={i18n._(msg`anime.inCollection`)}
                                value={playableData.watch_status}
                                onChange={(e) => statusMutation.mutate(e.target.value)}
                                className="text-[11px] pl-2 pr-6 py-1 rounded-lg bg-ink/[0.06] text-ink/60 border-none outline-none cursor-pointer hover:bg-ink/[0.10] transition-colors appearance-none"
                                disabled={statusMutation.isPending}
                              >
                                <option value="watching" className="bg-mm-bg-elevated">
                                  {i18n._(msg`collection.watching`)}
                                </option>
                                <option value="planning" className="bg-mm-bg-elevated">
                                  {i18n._(msg`collection.planning`)}
                                </option>
                                <option value="completed" className="bg-mm-bg-elevated">
                                  {i18n._(msg`collection.completed`)}
                                </option>
                                <option value="paused" className="bg-mm-bg-elevated">
                                  {i18n._(msg`collection.paused`)}
                                </option>
                                <option value="dropped" className="bg-mm-bg-elevated">
                                  {i18n._(msg`collection.dropped`)}
                                </option>
                              </select>
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-ink/40"
                              >
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </div>
                            <ScoreSelector
                              score={playableData.user_score ?? null}
                              onChange={(s) => scoreMutation.mutate(s)}
                              disabled={scoreMutation.isPending}
                            />
                          </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Synopsis — expandable */}
                    {anime.synopsis && <SynopsisBlock key={id} text={anime.synopsis} />}

                    <ExternalLinks
                      links={[
                        !isAniListOnly && {
                          label: 'Bangumi',
                          href: `https://bgm.tv/subject/${numericId}`,
                        },
                        (anime.anilist_id ?? 0) > 0 && {
                          label: 'AniList',
                          href: `https://anilist.co/anime/${anime.anilist_id}`,
                        },
                        (playableData?.mal_id ?? 0) > 0 && {
                          label: 'MAL',
                          href: `https://myanimelist.net/anime/${playableData!.mal_id}`,
                        },
                        (playableData?.tmdb_id ?? 0) > 0 && {
                          label: 'TMDB',
                          href: `https://www.themoviedb.org/tv/${playableData!.tmdb_id}`,
                        },
                        (playableData?.anidb_id ?? 0) > 0 && {
                          label: 'AniDB',
                          href: `https://anidb.net/anime/${playableData!.anidb_id}`,
                        },
                      ]}
                    >
                      <button
                        type="button"
                        onClick={() => refreshMetaMutation.mutate()}
                        disabled={refreshMetaMutation.isPending}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/40 hover:text-mm-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <HugeiconsIcon
                          icon={Refresh03Icon}
                          size={12}
                          strokeWidth={1.8}
                          className={refreshMetaMutation.isPending ? 'animate-spin' : undefined}
                        />
                        {i18n._(msg`anime.refreshMeta`)}
                      </button>
                    </ExternalLinks>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Episode completeness status — self-hides when everything is present */}
        {!isAniListOnly && (
          <div className="px-4 md:px-8 pt-2">
            <EpisodeStatusCard bangumiId={numericId} />
          </div>
        )}

        {/* Duplicate file detection — self-hides when no duplicates */}
        {!isAniListOnly && (
          <div className="px-4 md:px-8 pt-2">
            <DuplicatesPanel bangumiId={numericId} />
          </div>
        )}

        {/* Trailer + Episodes */}
        {(episodeList.length > 0 || anime.trailer_url) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="px-4 md:px-8 py-6"
          >
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Episodes — left column */}
              {episodeList.length > 0 && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-ink">
                      {i18n._(msg`anime.episodes`)}
                    </h2>
                    <span className="text-[13px] text-mm-text-muted tabular-nums">
                      {episodeList.length} {i18n._(msg`common.ep`)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                    {visibleEpisodes.map((ep, idx) => (
                      <motion.div
                        key={ep.episode_id || `ep-${ep.sort}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        // Cap the stagger so long lists don't trickle in for seconds.
                        transition={{ delay: Math.min(idx, 12) * 0.02, duration: 0.25 }}
                      >
                        <EpisodeListItem
                          sort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                          title={ep.title_zh || ep.title || ''}
                          titleOriginal={ep.title ?? undefined}
                          synopsis={(ep.synopsis_zh || ep.synopsis) ?? undefined}
                          image={ep.image ?? undefined}
                          airDate={ep.air_date ?? undefined}
                          isActive={false}
                          bangumiId={numericId}
                          episodeSort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                          hasFile={!!ep.media_file}
                          fileQuality={
                            ep.media_file?.height
                              ? `${ep.media_file.height}p${ep.media_file.video_codec ? ` ${ep.media_file.video_codec.toUpperCase()}` : ''}`
                              : undefined
                          }
                          progress={
                            ep.progress && ep.progress.duration_seconds > 0
                              ? ep.progress.position_seconds / ep.progress.duration_seconds
                              : undefined
                          }
                          completed={ep.progress?.completed}
                        />
                      </motion.div>
                    ))}
                  </div>
                  {episodeList.length > EPISODE_PREVIEW_COUNT && (
                    <ShowMoreToggle
                      expanded={showAllEpisodes}
                      hiddenCount={episodeList.length - EPISODE_PREVIEW_COUNT}
                      onToggle={() => setShowAllEpisodes((v) => !v)}
                    />
                  )}
                </div>
              )}

              {/* Trailer — right column, sticky */}
              {anime.trailer_url && (
                <div className="lg:w-[360px] xl:w-[420px] shrink-0">
                  <h2 className="text-lg font-semibold text-ink mb-4">
                    {i18n._(msg`anime.trailer`)}
                  </h2>
                  <div className="lg:sticky lg:top-6">
                    <div
                      className="relative rounded-lg overflow-hidden border border-ink/[0.06]"
                      style={{ aspectRatio: '16/9' }}
                    >
                      <iframe
                        src={anime.trailer_url}
                        title={`${anime.title} trailer`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Characters & Voice Actors */}
        {anime.characters && anime.characters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="px-4 md:px-8 py-6"
          >
            <h2 className="text-lg font-semibold text-ink mb-4">{i18n._(msg`anime.characters`)}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(showAllCharacters
                ? anime.characters
                : anime.characters.slice(0, CHARACTER_PREVIEW_COUNT)
              ).map((c: AnimeCharacter) => (
                <CharacterCard
                  key={c.character.id}
                  entry={c}
                  cvLabel={i18n._(msg`anime.voiceActor`)}
                />
              ))}
            </div>
            {anime.characters.length > CHARACTER_PREVIEW_COUNT && (
              <ShowMoreToggle
                expanded={showAllCharacters}
                hiddenCount={anime.characters.length - CHARACTER_PREVIEW_COUNT}
                onToggle={() => setShowAllCharacters((v) => !v)}
              />
            )}
          </motion.div>
        )}

        {/* Side stories — franchise-powered, with fallback to relations */}
        {(() => {
          if (franchise?.side_stories && franchise.side_stories.length > 0) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="px-4 md:px-8 py-6"
              >
                <h2 className="text-lg font-semibold text-ink mb-4">
                  {i18n._(msg`anime.sideStories`)}
                </h2>
                <MediaRail>
                  {franchise.side_stories.map((entry) => {
                    const cardAnime: AnimeSummary = {
                      bangumi_id: entry.bangumi_id,
                      anilist_id: entry.anilist_id,
                      title: entry.title,
                      title_original: entry.title_original,
                      cover_image: entry.cover_image,
                      episode_count: entry.episode_count,
                      score: entry.score,
                      media_type: entry.media_type,
                    };
                    return (
                      <div key={entry.anilist_id} className="shrink-0 w-[150px]">
                        {entry.bangumi_id > 0 ? (
                          <AnimeCard anime={cardAnime} />
                        ) : (
                          <Link to="/anime/$id" params={{ id: `al-${entry.anilist_id}` }}>
                            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink/[0.05] hover:opacity-80 transition-opacity">
                              <img
                                src={entry.cover_image}
                                alt={entry.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </Link>
                        )}
                        <p className="text-xs text-ink/70 mt-1.5 line-clamp-2">{entry.title}</p>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-mm-accent/60 mt-0.5">
                          {entry.media_type ||
                            getRelationLabel(entry.relation_type || '', i18n.locale)}
                        </p>
                      </div>
                    );
                  })}
                </MediaRail>
              </motion.div>
            );
          }
          if (anime.relations && anime.relations.length > 0) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="px-4 md:px-8 py-6"
              >
                <h2 className="text-lg font-semibold text-ink mb-4">
                  {i18n._(msg`anime.relations`)}
                </h2>
                <MediaRail>
                  {anime.relations.map((rel) => (
                    <div
                      key={`${rel.relation_type}-${rel.anime.anilist_id}`}
                      className="shrink-0 w-[150px]"
                    >
                      <AnimeCard anime={rel.anime} />
                      <p className="text-[10px] font-medium uppercase tracking-wider text-mm-accent/60 mt-1">
                        {getRelationLabel(rel.relation_type, i18n.locale)}
                      </p>
                    </div>
                  ))}
                </MediaRail>
              </motion.div>
            );
          }
          return null;
        })()}

        {/* Recommendations */}
        {anime.recommendations && anime.recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="px-4 md:px-8 py-6"
          >
            <h2 className="text-lg font-semibold text-ink mb-4">
              {i18n._(msg`anime.recommendations`)}
            </h2>
            <MediaRail>
              {anime.recommendations.map((rec) => (
                <div key={rec.anilist_id ?? rec.bangumi_id} className="shrink-0 w-[150px]">
                  <AnimeCard
                    anime={rec}
                    onClick={async (e) => {
                      e.preventDefault();
                      if (rec.bangumi_id > 0) {
                        navigate({ to: `/anime/${rec.bangumi_id}` as string });
                        return;
                      }
                      if (rec.anilist_id) {
                        try {
                          const resolved = await discoverApi.resolve(rec.anilist_id);
                          if (resolved.bangumi_id > 0) {
                            navigate({ to: `/anime/${resolved.bangumi_id}` as string });
                          }
                        } catch {
                          // no bangumi match found
                        }
                      }
                    }}
                  />
                </div>
              ))}
            </MediaRail>
          </motion.div>
        )}

        {/* Reviews + Bangumi comments — side by side on wide screens when both exist */}
        <div
          className={cn(
            (anime.reviews?.length ?? 0) > 0 && comments.length > 0 && 'xl:grid xl:grid-cols-2'
          )}
        >
          {anime.reviews && anime.reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="px-4 md:px-8 py-6"
            >
              <h2 className="text-lg font-semibold text-ink mb-4">{i18n._(msg`anime.reviews`)}</h2>
              <div className="space-y-3 max-w-2xl xl:max-w-none">
                {anime.reviews.map((review) => (
                  <a
                    key={review.id}
                    href={`https://anilist.co/review/${review.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 p-3 rounded-lg bg-ink/[0.03] hover:bg-ink/[0.06] transition-colors"
                  >
                    {/* Avatar */}
                    {review.avatar ? (
                      <img
                        src={review.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full shrink-0 object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full shrink-0 bg-ink/[0.08]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-ink/70">
                          {review.username}
                        </span>
                        <span className="text-[11px] font-bold text-mm-accent tabular-nums">
                          {review.score}/100
                        </span>
                      </div>
                      <p className="text-[13px] text-ink/50 leading-relaxed mt-0.5 line-clamp-2 group-hover:text-ink/70 transition-colors">
                        {review.summary}
                      </p>
                    </div>
                    <span className="text-[11px] text-ink/20 shrink-0 mt-1">↗</span>
                  </a>
                ))}
              </div>
            </motion.div>
          )}

          {/* Bangumi Comments (吐槽) */}
          {comments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="px-4 md:px-8 py-6"
            >
              <h2 className="text-lg font-semibold text-ink mb-4">{i18n._(msg`anime.comments`)}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl xl:max-w-none">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-ink/[0.03]">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt=""
                        className="w-7 h-7 rounded-full shrink-0 object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full shrink-0 bg-ink/[0.08]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-ink/60 truncate">
                          {c.nickname || c.username}
                        </span>
                        {c.rate > 0 && (
                          <span className="text-[11px] font-bold text-mm-accent tabular-nums shrink-0">
                            ★ {c.rate}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-ink/50 leading-relaxed mt-0.5 line-clamp-3">
                        {c.comment}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
