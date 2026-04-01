import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { collectionApi, collectionKeys } from '../lib/api/collection';

/**
 * Lightweight hook that provides a bangumi_id → watch_status lookup map.
 * Fetched once and cached — used by AnimeCard to show collection status.
 */
export function useCollectionMap() {
  const { data: anime } = useQuery({
    queryKey: collectionKeys.list(),
    queryFn: () => collectionApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const map = new Map<number, string>();
    if (!anime) return map;
    for (const a of anime) {
      if (a.bangumi_id && a.watch_status && a.watch_status !== 'none') {
        map.set(a.bangumi_id, a.watch_status);
      }
    }
    return map;
  }, [anime]);
}
