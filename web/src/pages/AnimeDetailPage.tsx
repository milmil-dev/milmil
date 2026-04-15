import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { AnimeCard } from '../components/AnimeCard';
import { EpisodeListItem } from '../components/EpisodeListItem';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { useDocumentTitle } from '../hooks/use-document-title';
import { discoverApi, discoverKeys } from '../lib/api/discover';
import { ruleApi, downloadKeys } from '../lib/api/downloads';
import { translateGenre } from '../lib/genre-i18n';

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

import { Button } from '../components/ui/button';
import { useAuth } from '../hooks/use-auth';
import type { PlayableEpisode } from '../lib/api/anime';
import { animeApi, animeKeys } from '../lib/api/anime';
import { collectionApi, collectionKeys } from '../lib/api/collection';
import type { AnimeCharacter } from '../lib/api/discover';
import { animeGradient } from '../lib/gradient';
import { cn } from '../lib/utils';
import { useBgStore } from '../store/bg-store';

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
      bangumiId: prequels[i].anime.bangumi_id,
      title: prequels[i].anime.title,
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

function SynopsisBlock({ text }: { text: string }) {
  return (
    <div
      className="max-w-[660px] max-h-[120px] overflow-auto text-[13px] sm:text-[14px] text-gray-200 leading-relaxed whitespace-pre-line scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
    >
      {text}
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
            score != null && i < score ? 'bg-mm-accent' : 'bg-white/[0.10] hover:bg-white/[0.20]'
          )}
          title={`${i + 1}/10`}
        />
      ))}
      {score != null && <span className="ml-1 text-xs text-white/50 tabular-nums">{score}/10</span>}
    </div>
  );
}

function CharacterCard({ entry, cvLabel }: { entry: AnimeCharacter; cvLabel: string }) {
  const isMain = entry.role === 'MAIN';
  return (
    <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] transition-colors">
      {/* Images row */}
      <div className="flex items-end gap-2">
        {/* Character image */}
        <div className="w-12 h-14 rounded-md overflow-hidden shrink-0 bg-white/[0.08]">
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
          <div className="w-10 h-12 rounded-md overflow-hidden shrink-0 bg-white/[0.08] -ml-4 border border-black/40">
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
          <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-mm-accent/15 text-mm-accent shrink-0">
            MAIN
          </span>
        )}
      </div>
      {/* Names */}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-white/90 leading-snug truncate">
          {entry.character.name}
        </p>
        {entry.voice_actor && (
          <p className="text-[11px] text-white/45 truncate mt-0.5">
            <span className="text-white/30">{cvLabel} </span>
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
  const numericId = Number(id);
  const navigate = useNavigate();
  const setImage = useBgStore((s) => s.setImage);

  const {
    data: anime,
    isLoading,
    isError,
  } = useQuery({
    queryKey: discoverKeys.detail(numericId),
    queryFn: () => discoverApi.detail(numericId),
    enabled: !Number.isNaN(numericId),
  });

  useDocumentTitle(anime?.title ?? 'Anime');

  const { data: episodes = [] } = useQuery({
    queryKey: discoverKeys.episodes(numericId),
    queryFn: () => discoverApi.episodes(numericId),
    enabled: !Number.isNaN(numericId),
  });

  const { isAuthenticated } = useAuth();

  const { data: playableData } = useQuery({
    queryKey: animeKeys.playableEpisodes(numericId),
    queryFn: () => animeApi.playableEpisodes(numericId),
    enabled: !Number.isNaN(numericId) && isAuthenticated,
  });

  const { data: comments = [] } = useQuery({
    queryKey: discoverKeys.comments(numericId),
    queryFn: () => discoverApi.comments(numericId),
    enabled: !Number.isNaN(numericId),
  });

  // Check if anime has active subscription
  const { data: rules = [] } = useQuery({
    queryKey: downloadKeys.rules(),
    queryFn: () => ruleApi.list(),
    enabled: isAuthenticated,
    staleTime: 60000,
  });
  const hasSubscription = rules.some((r) => r.bangumi_id === numericId && r.enabled);

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

  // Set full-screen background image (behind sidebar) — Seanime style
  useEffect(() => {
    const img = anime?.banner_image || anime?.cover_image;
    if (img?.startsWith('http')) {
      setImage(img);
    }
    return () => setImage(null);
  }, [anime?.banner_image, anime?.cover_image, setImage]);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen">
          <div className="h-[340px] animate-pulse bg-white/[0.04]" />
          <div className="px-4 md:px-8 py-6 space-y-4">
            <div className="h-6 rounded bg-white/[0.06]" style={{ width: '30%' }} />
            <div className="h-4 rounded bg-white/[0.04]" style={{ width: '60%' }} />
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

  // Build episode list: merge playable data (local files + progress) with discover images
  const episodeList: PlayableEpisode[] = useMemo(() => {
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
  }, [playableData, episodes]);

  return (
    <PageTransition>
      <div className="min-h-screen">
        {/* Hero section */}
        <div className="relative w-full overflow-hidden md:h-[clamp(340px,45vh,28rem)]">
          {/* External link icons — top right */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-[3] flex items-center gap-2">
            <a
              href={`https://bgm.tv/subject/${numericId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors"
              title="Bangumi"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {/* TV antenna */}
                <path d="M7 2l5 5 5-5"/>
                {/* TV body */}
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                {/* Screen */}
                <rect x="5" y="10" width="14" height="8" rx="1"/>
              </svg>
            </a>
            {anime?.anilist_id && anime.anilist_id > 0 && (
              <a
                href={`https://anilist.co/anime/${anime.anilist_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors"
                title="AniList"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.361 2.943L0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v11.54H6.361z" />
                </svg>
              </a>
            )}
            {playableData?.mal_id && playableData.mal_id > 0 && (
              <a
                href={`https://myanimelist.net/anime/${playableData.mal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors"
                title="MyAnimeList"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h4v10.5l2.5-3.5H12l-3 4.5L12 18H9.5L7 14.5V18H3V3zm8 0h4v6h2V3h4v15h-4v-6h-2v6h-4V3z" />
                </svg>
              </a>
            )}
            {playableData?.tmdb_id && playableData.tmdb_id > 0 && (
              <a
                href={`https://www.themoviedb.org/tv/${playableData.tmdb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors"
                title="TMDB"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c4.418 0 8 3.582 8 8s-3.582 8-8 8-8-3.582-8-8 3.582-8 8-8zm-1 3v4H7v2h4v4h2v-4h4v-2h-4V7h-2z" />
                </svg>
              </a>
            )}
            {playableData?.anidb_id && playableData.anidb_id > 0 && (
              <a
                href={`https://anidb.net/anime/${playableData.anidb_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm text-white/60 hover:bg-black/60 hover:text-white transition-colors text-[9px] font-bold tracking-tight"
                title="AniDB"
              >
                AniDB
              </a>
            )}
          </div>
          <div className="relative z-[2] h-full flex">
            <div className="flex-1 flex flex-col justify-start p-4 pt-6 md:p-8 md:pt-12 min-w-0 max-w-[700px]">
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

                  <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left sm:pt-2" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' }}>
                    {/* Title */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.4 }}
                    >
                      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-7 sm:leading-8 line-clamp-2">
                        {anime.title}
                      </h1>
                      {anime.title_original && anime.title_original !== anime.title && (
                        <p className="text-[13px] text-white/60 mt-1 truncate">{anime.title_original}</p>
                      )}
                    </motion.div>

                    {/* Meta line: score · episodes · year · ratings — compact single row */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                      className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap"
                    >
                      {anime.score > 0 && (
                        <span className="text-[16px] font-bold text-mm-accent tabular-nums">
                          ♡ {anime.score.toFixed(1)}
                        </span>
                      )}
                      {anime.score > 0 && (anime.episode_count > 0 || anime.air_date) && (
                        <span className="text-white/25">·</span>
                      )}
                      {anime.media_type && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.12] text-white/70 font-semibold">
                          {anime.media_type}
                        </span>
                      )}
                      {anime.episode_count > 0 && (
                        <span className="text-[13px] text-white/70 font-medium">
                          {anime.episode_count} {i18n._(msg`common.ep`)}
                        </span>
                      )}
                      {anime.air_date && (
                        <span className="text-[13px] text-white/70 font-medium">
                          {anime.air_date.slice(0, 7)}
                        </span>
                      )}
                      {anime.rating && anime.rating.total > 0 && (
                        <span className="text-[12px] text-white/45">
                          {anime.rating.total} {i18n._(msg`anime.ratings`)}
                        </span>
                      )}
                      {/* Not yet aired inline badge */}
                      {anime.air_date && new Date(anime.air_date) > new Date() && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {i18n._(msg`anime.notAired`)}
                        </span>
                      )}
                    </motion.div>

                    {/* Status badges: subscription + playable */}
                    {(hasSubscription || hasPlayableFiles) && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="flex items-center justify-center sm:justify-start gap-2 flex-wrap"
                      >
                        {hasSubscription && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-[11px] font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                            {i18n._(msg`anime.subscribed`)}
                          </span>
                        )}
                        {hasPlayableFiles && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 text-[11px] font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                            {playableCount} {i18n._(msg`anime.playableEps`)}
                          </span>
                        )}
                      </motion.div>
                    )}

                    {/* Tags */}
                    {anime.tags?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.4 }}
                        className="flex flex-wrap justify-center sm:justify-start gap-1.5"
                      >
                        {anime.tags.slice(0, 6).map((tag) => (
                          <Link
                            key={tag}
                            to="/search"
                            search={{ genre: tag }}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/[0.08] text-white/60 hover:bg-mm-accent/15 hover:text-mm-accent transition-colors"
                          >
                            {translateGenre(tag, i18n.locale)}
                          </Link>
                        ))}
                      </motion.div>
                    )}

                    {/* Season tabs */}
                    {(() => {
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
                                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
                              )}
                              title={s.title}
                            >
                              {s.label}
                            </Link>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Action buttons — grouped in a single row */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45, duration: 0.4 }}
                      className="flex items-center justify-center sm:justify-start gap-2 flex-wrap"
                    >
                      {/* Bookmark toggle */}
                      {isAuthenticated && (() => {
                        const isBookmarked = playableData?.watch_status && playableData.watch_status !== 'none';
                        return (
                          <motion.button
                            type="button"
                            onClick={() => statusMutation.mutate(isBookmarked ? 'none' : 'planning')}
                            disabled={statusMutation.isPending}
                            whileTap={{ scale: 0.97 }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-white/[0.08] hover:bg-white/[0.14] text-white/70 hover:text-white transition-colors cursor-pointer"
                          >
                            <motion.svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill={isBookmarked ? 'currentColor' : 'none'}
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={cn('size-4', isBookmarked ? 'text-mm-accent' : 'text-white/70')}
                              animate={isBookmarked ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
                            </motion.svg>
                            {i18n._(msg`anime.addToCollection`)}
                          </motion.button>
                        );
                      })()}

                      {/* Search resources */}
                      <Link
                        to="/downloads"
                        search={{ anime: String(anime.bangumi_id) }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-medium text-white/70 hover:text-white transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.3-4.3"/></svg>
                        {i18n._(msg`anime.searchResources`)}
                      </Link>

                      {/* Tracker sync toggle */}
                      {isAuthenticated && playableData && (() => {
                        const syncDisabled = playableData.sync_disabled === 1;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              syncFlagsMutation.mutate(syncDisabled ? 0 : 1)
                            }
                            disabled={syncFlagsMutation.isPending}
                            title={
                              syncDisabled
                                ? i18n._(msg`anime.enableTrackerSync`)
                                : i18n._(msg`anime.excludeTrackerSync`)
                            }
                            className={cn(
                              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
                              syncDisabled
                                ? 'bg-white/[0.04] text-white/40 hover:bg-white/[0.10] hover:text-white/70'
                                : 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white'
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
                              className="size-4"
                            >
                              {syncDisabled ? (
                                <>
                                  <path d="M18.364 5.636 5.636 18.364" />
                                  <path d="M21 12a9 9 0 0 1-9 9" />
                                  <path d="M3 12a9 9 0 0 1 9-9" />
                                </>
                              ) : (
                                <>
                                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                  <path d="M3 3v5h5" />
                                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                  <path d="M16 16h5v5" />
                                </>
                              )}
                            </svg>
                            {syncDisabled
                              ? i18n._(msg`anime.enableTrackerSync`)
                              : i18n._(msg`anime.excludeTrackerSync`)}
                          </button>
                        );
                      })()}

                    </motion.div>

                    {/* Collection watch status + personal score — inline when in collection */}
                    <AnimatePresence>
                    {playableData?.watch_status && playableData.watch_status !== 'none' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, y: -4 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="flex items-center justify-center sm:justify-start gap-3 flex-wrap"
                      >
                        <select
                          value={playableData.watch_status}
                          onChange={(e) => statusMutation.mutate(e.target.value)}
                          className="text-[12px] px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/70 border-none outline-none cursor-pointer hover:bg-white/[0.10] transition-colors appearance-none"
                          disabled={statusMutation.isPending}
                        >
                          <option value="watching" className="bg-zinc-900">
                            {i18n._(msg`collection.watching`)}
                          </option>
                          <option value="planning" className="bg-zinc-900">
                            {i18n._(msg`collection.planning`)}
                          </option>
                          <option value="completed" className="bg-zinc-900">
                            {i18n._(msg`collection.completed`)}
                          </option>
                          <option value="paused" className="bg-zinc-900">
                            {i18n._(msg`collection.paused`)}
                          </option>
                          <option value="dropped" className="bg-zinc-900">
                            {i18n._(msg`collection.dropped`)}
                          </option>
                        </select>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/30 shrink-0">
                            {i18n._(msg`anime.myScore`)}
                          </span>
                          <ScoreSelector
                            score={playableData.user_score ?? null}
                            onChange={(s) => scoreMutation.mutate(s)}
                            disabled={scoreMutation.isPending}
                          />
                        </div>
                      </motion.div>
                    )}
                    </AnimatePresence>

                    {/* Synopsis — expandable */}
                    {anime.synopsis && <SynopsisBlock text={anime.synopsis} />}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Continue Watching — floating card (matches HeroBanner ResumeCard) */}
          {continueEpisode &&
            continueEpisode.media_file &&
            (() => {
              const prog = continueEpisode.progress;
              const progress =
                prog && prog.duration_seconds > 0 ? prog.position_seconds / prog.duration_seconds : 0;
              const timeLeft =
                prog && !prog.completed ? prog.duration_seconds - prog.position_seconds : 0;
              const epNum = continueEpisode.sort % 1 === 0
                ? Math.floor(continueEpisode.sort)
                : continueEpisode.sort;

              const coverSrc = anime.cover_image;
              const hasCoverImg = coverSrc?.startsWith('http');

              const radius = 34;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset = circumference * (1 - progress);

              return (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="absolute right-6 bottom-8 z-[3] hidden lg:block"
                >
                  <Link
                    to="/watch/$animeId"
                    params={{ animeId: String(numericId) }}
                    search={{ ep: epNum }}
                    className="group flex items-center gap-5 rounded-xl overflow-hidden cursor-pointer border border-white/[0.08] pl-2 pr-6 py-2 transition-all duration-300 hover:border-white/[0.15] hover:scale-[1.02]"
                    style={{
                      backgroundColor: 'rgba(7,7,7,0.65)',
                      backdropFilter: 'blur(20px) saturate(1.4)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className="relative shrink-0 w-[86px] h-[115px] rounded-lg overflow-hidden">
                      <div
                        className="w-full h-full"
                        style={hasCoverImg ? undefined : { background: animeGradient(anime.title) }}
                      >
                        {hasCoverImg && (
                          <img src={coverSrc} alt={anime.title} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-colors">
                        <div className="relative w-[76px] h-[76px] flex items-center justify-center">
                          <svg className="absolute inset-0 -rotate-90" width="76" height="76" viewBox="0 0 76 76">
                            <circle cx="38" cy="38" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                            <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--mm-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-500" style={{ filter: 'drop-shadow(0 0 4px rgba(232,143,170,0.4))' }} />
                          </svg>
                          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="black"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 py-0.5">
                      <p className="text-[15px] font-semibold text-white truncate max-w-[210px]">
                        {anime.title}
                      </p>
                      <p className="text-[13px] text-white/45 mt-1.5 font-medium">
                        EP {epNum} · {prog ? formatTime(prog.position_seconds) : '0:00'}
                        {prog?.duration_seconds ? ` / ${formatTime(prog.duration_seconds)}` : ''}
                      </p>
                      {timeLeft > 0 && (
                        <p className="text-[11px] text-white/30 mt-2 font-medium tracking-wide">
                          {formatTime(timeLeft)} {i18n._(msg`player.remaining`)}
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })()}
        </div>

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
                    <h2 className="text-lg font-bold text-white">{i18n._(msg`anime.episodes`)}</h2>
                    <span className="text-[13px] text-mm-text-muted tabular-nums">
                      {episodeList.length} {i18n._(msg`common.ep`)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                    {episodeList.map((ep, idx) => (
                      <motion.div
                        key={ep.episode_id || `ep-${ep.sort}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02, duration: 0.25 }}
                      >
                        <EpisodeListItem
                          sort={ep.sort % 1 === 0 ? Math.floor(ep.sort) : ep.sort}
                          title={ep.title_zh || ep.title || `Episode ${ep.sort}`}
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
                </div>
              )}

              {/* Trailer — right column, sticky */}
              {anime.trailer_url && (
                <div className="lg:w-[360px] xl:w-[420px] shrink-0">
                  <h2 className="text-lg font-bold text-white mb-4">
                    {i18n._(msg`anime.trailer`)}
                  </h2>
                  <div className="lg:sticky lg:top-6">
                    <div
                      className="relative rounded-lg overflow-hidden border border-white/[0.06]"
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
            <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.characters`)}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {anime.characters.map((c: AnimeCharacter) => (
                <CharacterCard
                  key={c.character.id}
                  entry={c}
                  cvLabel={i18n._(msg`anime.voiceActor`)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Related anime — prequel, sequel, side stories */}
        {anime.relations && anime.relations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="px-4 md:px-8 py-6"
          >
            <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.relations`)}</h2>
            <MediaRail>
              {anime.relations.map((rel) => (
                <div
                  key={`${rel.relation_type}-${rel.anime.anilist_id}`}
                  className="shrink-0 w-[150px]"
                >
                  <AnimeCard anime={rel.anime} />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-mm-accent/60 mt-1">
                    {getRelationLabel(rel.relation_type, i18n.locale)}
                  </p>
                </div>
              ))}
            </MediaRail>
          </motion.div>
        )}

        {/* Recommendations */}
        {anime.recommendations && anime.recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="px-4 md:px-8 py-6"
          >
            <h2 className="text-lg font-bold text-white mb-4">
              {i18n._(msg`anime.recommendations`)}
            </h2>
            <div className="grid grid-cols-2 min-[768px]:grid-cols-4 min-[1080px]:grid-cols-5 min-[1320px]:grid-cols-6 gap-4">
              {anime.recommendations.slice(0, 6).map((rec) => (
                <AnimeCard
                  key={rec.anilist_id ?? rec.bangumi_id}
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
              ))}
            </div>
          </motion.div>
        )}

        {/* Reviews */}
        {anime.reviews && anime.reviews.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="px-4 md:px-8 py-6 pb-16"
          >
            <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.reviews`)}</h2>
            <div className="space-y-3 max-w-2xl">
              {anime.reviews.map((review) => (
                <a
                  key={review.id}
                  href={`https://anilist.co/review/${review.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  {/* Avatar */}
                  {review.avatar ? (
                    <img
                      src={review.avatar}
                      alt=""
                      className="w-8 h-8 rounded-full shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full shrink-0 bg-white/[0.08]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-white/70">
                        {review.username}
                      </span>
                      <span className="text-[11px] font-bold text-mm-accent tabular-nums">
                        {review.score}/100
                      </span>
                    </div>
                    <p className="text-[13px] text-white/50 leading-relaxed mt-0.5 line-clamp-2 group-hover:text-white/70 transition-colors">
                      {review.summary}
                    </p>
                  </div>
                  <span className="text-[11px] text-white/20 shrink-0 mt-1">↗</span>
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
            className="px-4 md:px-8 py-6 pb-16"
          >
            <h2 className="text-lg font-bold text-white mb-4">{i18n._(msg`anime.comments`)}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.03]">
                  {c.avatar ? (
                    <img
                      src={c.avatar}
                      alt=""
                      className="w-7 h-7 rounded-full shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full shrink-0 bg-white/[0.08]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-white/60 truncate">
                        {c.nickname || c.username}
                      </span>
                      {c.rate > 0 && (
                        <span className="text-[11px] font-bold text-mm-accent tabular-nums shrink-0">
                          ★ {c.rate}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-white/50 leading-relaxed mt-0.5 line-clamp-3">
                      {c.comment}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
