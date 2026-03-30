import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Share2, Star } from 'lucide-react';
import { motion } from 'motion/react';
import type { PlayableEpisodesResponse } from '../../lib/api/anime';
import { animeApi, animeKeys } from '../../lib/api/anime';
import { collectionApi, collectionKeys } from '../../lib/api/collection';
import type { AnimeDetail } from '../../lib/api/discover';
import { cn } from '../../lib/utils';

interface WatchTitleBarProps {
  anime: AnimeDetail;
  episodesData: PlayableEpisodesResponse;
  bangumiId: number;
}

export function WatchTitleBar({ anime, episodesData, bangumiId }: WatchTitleBarProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();

  const year = anime.air_date ? new Date(anime.air_date).getFullYear() : null;
  const episodeCount = anime.episode_count;
  const userScore = episodesData.user_score;
  const isInCollection = episodesData.watch_status !== '' && episodesData.watch_status !== 'none';

  const scoreMutation = useMutation({
    mutationFn: (score: number | null) => animeApi.updateScore(bangumiId, score),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(bangumiId) });
    },
  });

  const collectionMutation = useMutation({
    mutationFn: (status: string) => collectionApi.updateStatus(bangumiId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: animeKeys.playableEpisodes(bangumiId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.all });
    },
  });

  function handleScore() {
    const input = window.prompt(i18n._(msg`watch.scorePrompt`), userScore?.toString() ?? '');
    if (input === null) return;
    const parsed = Number.parseInt(input, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 10) return;
    scoreMutation.mutate(parsed);
  }

  function handleCollectionToggle() {
    collectionMutation.mutate(isInCollection ? 'none' : 'watching');
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col gap-1 px-1 py-2"
    >
      {/* Title */}
      <h1 className="text-base font-semibold text-white/90 leading-snug line-clamp-1">
        {anime.title}
      </h1>

      {/* Meta + Actions */}
      <div className="flex items-center justify-between gap-3">
        {/* Meta line */}
        <span className="text-xs text-white/50 shrink-0">
          {year && <span>{year}</span>}
          {year && episodeCount > 0 && <span className="mx-1.5 text-white/20">·</span>}
          {episodeCount > 0 && (
            <span>
              {episodeCount} {i18n._(msg`watch.episodes`)}
            </span>
          )}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Score */}
          <button
            type="button"
            onClick={handleScore}
            disabled={scoreMutation.isPending}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              'hover:bg-white/[0.08] text-white/60 hover:text-white/80',
              'disabled:opacity-40 disabled:pointer-events-none',
              userScore && 'text-amber-400/80 hover:text-amber-400'
            )}
          >
            <Star className="size-3.5" fill={userScore ? 'currentColor' : 'none'} />
            {userScore ? userScore : i18n._(msg`watch.rate`)}
          </button>

          {/* Collection toggle */}
          <button
            type="button"
            onClick={handleCollectionToggle}
            disabled={collectionMutation.isPending}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              'hover:bg-white/[0.08] text-white/60 hover:text-white/80',
              'disabled:opacity-40 disabled:pointer-events-none',
              isInCollection && 'text-blue-400/80 hover:text-blue-400'
            )}
          >
            {isInCollection ? (
              <>
                <BookmarkCheck className="size-3.5" />
                {i18n._(msg`watch.collected`)}
              </>
            ) : (
              <>
                <Bookmark className="size-3.5" />
                {i18n._(msg`watch.collect`)}
              </>
            )}
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
              'hover:bg-white/[0.08] text-white/60 hover:text-white/80'
            )}
          >
            <Share2 className="size-3.5" />
            {i18n._(msg`watch.share`)}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
