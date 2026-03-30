import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { EpisodeListItem } from '../components/EpisodeListItem';
import { MediaRail } from '../components/MediaRail';
import { PageTransition } from '../components/PageTransition';
import { discoverApi, discoverKeys } from '../lib/api/discover';
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
import { animeApi, animeKeys } from '../lib/api/anime';
import type { PlayableEpisode } from '../lib/api/anime';
import { animeGradient } from '../lib/gradient';
import { useAuth } from '../hooks/use-auth';
import { useBgStore } from '../store/bg-store';

export function AnimeDetailPage() {
  const { i18n } = useLingui();
  const { id } = useParams({ strict: false });
  const numericId = Number(id);
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

  const continueEpisode = useMemo(() => {
    if (!playableData?.episodes) return null;
    // Find first episode with progress but not completed
    const inProgress = playableData.episodes.find(
      ep => ep.progress && !ep.progress.completed && ep.progress.position_seconds > 0 && ep.media_file
    );
    if (inProgress) return inProgress;
    // Find next unwatched episode after last completed
    const lastCompleted = [...playableData.episodes]
      .reverse()
      .find(ep => ep.progress?.completed);
    if (lastCompleted) {
      const nextSort = lastCompleted.sort + 1;
      return playableData.episodes.find(ep => ep.sort >= nextSort && ep.media_file);
    }
    // First episode with a file
    return playableData.episodes.find(ep => ep.media_file) ?? null;
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

  const episodeList: PlayableEpisode[] =
    playableData?.episodes ??
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
    })) ??
    [];

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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
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

                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left sm:pt-2">
                    {/* Title */}
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-7 sm:leading-8 line-clamp-2">
                      {anime.title}
                    </h1>
                    {anime.title_original && anime.title_original !== anime.title && (
                      <p className="text-[13px] text-gray-400 truncate">{anime.title_original}</p>
                    )}

                    {/* Tags */}
                    {anime.tags?.length > 0 && (
                      <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                        {anime.tags.slice(0, 6).map((tag) => (
                          <Link
                            key={tag}
                            to="/search"
                            search={{ genre: tag }}
                            className="text-[11px] sm:text-[12px] font-semibold px-2 sm:px-2.5 py-1 rounded-md bg-white/[0.06] text-white/70 hover:bg-mm-accent/15 hover:text-mm-accent transition-colors"
                          >
                            {translateGenre(tag, i18n.locale)}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Score + meta */}
                    <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                      {anime.score > 0 && (
                        <span className="text-[15px] sm:text-[16px] font-bold text-mm-accent">
                          ♡ {anime.score.toFixed(1)}
                        </span>
                      )}
                      {anime.episode_count > 0 && (
                        <span className="text-[12px] sm:text-[13px] text-gray-400">
                          {anime.episode_count} {i18n._(msg`common.ep`)}
                        </span>
                      )}
                      {anime.air_date && (
                        <span className="text-[12px] sm:text-[13px] text-gray-400">
                          {new Date(anime.air_date).getFullYear()}
                        </span>
                      )}
                      {anime.rating && anime.rating.total > 0 && (
                        <span className="text-[12px] sm:text-[13px] text-gray-400">
                          {anime.rating.total} {i18n._(msg`anime.ratings`)}
                        </span>
                      )}
                    </div>

                    {/* Synopsis — hidden on small mobile, visible sm+ */}
                    {anime.synopsis && (
                      <p
                        className="hidden sm:block text-[14px] sm:text-[15px] text-gray-200 max-w-[660px] leading-relaxed line-clamp-4"
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                      >
                        {anime.synopsis}
                      </p>
                    )}
                  </div>
                </div>

                {/* Synopsis — below poster on mobile only */}
                {anime.synopsis && (
                  <p
                    className="sm:hidden mt-4 text-[13px] text-gray-300 leading-relaxed line-clamp-5"
                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                  >
                    {anime.synopsis}
                  </p>
                )}
              </motion.div>
            </div>
          </div>
        </div>

        {/* Continue Watching banner */}
        {continueEpisode && continueEpisode.media_file && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6 px-4 md:px-8"
          >
            <Link
              to="/watch/$fileId"
              params={{ fileId: continueEpisode.media_file.id }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-mm-accent/10 border border-mm-accent/20 hover:bg-mm-accent/15 transition-colors group"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-mm-accent/20 text-mm-accent group-hover:bg-mm-accent/30 transition-colors shrink-0">
                <span className="text-sm ml-0.5">▶</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {i18n._(msg`anime.continueWatching`)}
                </p>
                <p className="text-xs text-white/50 truncate">
                  {i18n._(msg`anime.episode`)} {continueEpisode.sort}
                  {continueEpisode.title ? ` — ${continueEpisode.title_zh || continueEpisode.title}` : ''}
                  {continueEpisode.progress && !continueEpisode.progress.completed
                    ? ` · ${formatTime(continueEpisode.progress.position_seconds)} / ${formatTime(continueEpisode.progress.duration_seconds)}`
                    : ''}
                </p>
              </div>
            </Link>
          </motion.div>
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
                          href={ep.media_file ? `/watch/${ep.media_file.id}` : '#'}
                          hasFile={!!ep.media_file}
                          fileQuality={ep.media_file?.height ? `${ep.media_file.height}p` : undefined}
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
                <AnimeCard key={rec.anilist_id} anime={rec} />
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
