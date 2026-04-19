import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { preferencesApi, type SeriesPreferences } from '@/lib/api/preferences';

/**
 * Per-series player preferences (subtitle/audio language, delay, speed, volume).
 * Restores user's last choices when they return to the same anime.
 */
export function useSeriesPreferences(seriesId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['series-preferences', seriesId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => preferencesApi.getSeries(seriesId!),
    enabled: !!seriesId,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<SeriesPreferences>) => {
      if (!seriesId) return;
      await preferencesApi.putSeries(seriesId, patch);
      return patch;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Partial<SeriesPreferences>>(key);
      queryClient.setQueryData(key, { ...(prev ?? {}), ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
  });

  return {
    prefs: query.data,
    isLoading: query.isLoading,
    save: mutation.mutate,
  };
}
