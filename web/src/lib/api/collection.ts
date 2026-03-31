import { api } from '../api-client';

export interface CollectionAnime {
  id: string;
  bangumi_id: number | null;
  title: string;
  title_zh: string | null;
  title_en: string | null;
  cover_image_url: string | null;
  total_episodes: number | null;
  status: string;
  watch_status: string;
  watch_status_updated_at: string | null;
  genres: string;
  year: number | null;
  season: string | null;
  air_date: string | null;
  created_at: string;
  user_score: number | null;
  local_file_count: number;
}

export interface RecentCollectionAnime {
  id: string;
  bangumi_id: number | null;
  title: string;
  title_zh: string | null;
  cover_image_url: string | null;
  total_episodes: number | null;
  watch_status: string;
  user_score: number | null;
  local_file_count: number;
}

export interface StatusCount {
  watch_status: string;
  count: number;
}

export const collectionApi = {
  list: (params?: { status?: string; search?: string; sort?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sort) searchParams.set('sort', params.sort);
    const qs = searchParams.toString();
    return api.get<CollectionAnime[]>(`/api/v1/collection${qs ? `?${qs}` : ''}`);
  },
  recent: () => api.get<RecentCollectionAnime[]>('/api/v1/collection/recent'),
  statusCounts: () => api.get<StatusCount[]>('/api/v1/collection/status-counts'),
  updateStatus: (bangumiId: number, status: string) =>
    api.patch<void>(`/api/v1/collection/${bangumiId}/status`, { status }),
};

export const collectionKeys = {
  all: ['collection'] as const,
  list: (params?: { status?: string; search?: string; sort?: string }) =>
    [...collectionKeys.all, 'list', params] as const,
  recent: () => [...collectionKeys.all, 'recent'] as const,
  statusCounts: () => [...collectionKeys.all, 'status-counts'] as const,
};
