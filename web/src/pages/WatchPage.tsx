import { useParams, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PageTransition } from '@/components/PageTransition';
import { Skeleton } from '@/components/Skeleton';
import { discoverApi, discoverKeys } from '@/lib/api/discover';
import { animeApi, animeKeys } from '@/lib/api/anime';
import type { PlayableEpisode } from '@/lib/api/anime';

function resolveEpisode(episodes: PlayableEpisode[], ep?: number): PlayableEpisode | undefined {
  if (ep !== undefined) {
    return episodes.find((e) => e.sort === ep);
  }
  const inProgress = episodes.find(
    (e) => e.media_file && e.progress && e.progress.position_seconds > 0 && !e.progress.completed
  );
  if (inProgress) return inProgress;
  const fresh = episodes.find((e) => e.media_file && !e.progress);
  if (fresh) return fresh;
  return episodes.find((e) => e.media_file);
}

export function WatchPage() {
  const { animeId } = useParams({ strict: false });
  const { ep } = useSearch({ strict: false }) as { ep?: number };
  const bangumiId = Number(animeId);

  const { data: animeDetail, isLoading: detailLoading } = useQuery({
    queryKey: discoverKeys.detail(bangumiId),
    queryFn: () => discoverApi.detail(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: animeKeys.playableEpisodes(bangumiId),
    queryFn: () => animeApi.playableEpisodes(bangumiId),
    enabled: !Number.isNaN(bangumiId),
  });

  const currentEpisode = useMemo(
    () => resolveEpisode(episodesData?.episodes ?? [], ep),
    [episodesData, ep]
  );

  const fileId = currentEpisode?.media_file?.id ?? null;

  if (detailLoading || episodesLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-black/20 p-6">
          <Skeleton className="h-8 w-1/3 mb-4" />
          <Skeleton className="aspect-video w-full mb-4" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-black/20 p-6">
        <p className="text-white">Anime: {animeDetail?.title}</p>
        <p className="text-white/60">Episode: {currentEpisode?.sort} — {currentEpisode?.title}</p>
        <p className="text-white/40">FileId: {fileId}</p>
      </div>
    </PageTransition>
  );
}
