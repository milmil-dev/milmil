// web/src/hooks/use-anime-cover.ts
import { useQuery } from '@tanstack/react-query';
import { discoverApi, discoverKeys } from '@/lib/api/discover';

const ONE_DAY = 24 * 60 * 60 * 1000;

interface Result {
  coverUrl: string | undefined;
  title: string | undefined;
  titleOriginal: string | undefined;
  isLoading: boolean;
}

export function useAnimeCover(bangumiId: number | null | undefined): Result {
  const enabled = !!bangumiId;
  const { data, isLoading } = useQuery({
    queryKey: discoverKeys.detail(bangumiId ?? 0),
    queryFn: () => discoverApi.detail(bangumiId as number),
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
  });

  return {
    coverUrl: data?.cover_image,
    title: data?.title,
    titleOriginal: data?.title_original,
    isLoading: enabled && isLoading,
  };
}
