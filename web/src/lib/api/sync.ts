import { api } from '../api-client';

export type SyncProvider = 'anilist' | 'bangumi';

export interface SyncErrorEntry {
  anime_id: string;
  error: string;
  at: string;
}

export interface SyncProviderStatus {
  provider: SyncProvider;
  connected: boolean;
  last_sync: string;
  pending: number;
  last_errors: SyncErrorEntry[];
}

export const syncApi = {
  status: () => api.get<SyncProviderStatus[]>('/api/v1/sync/status'),
  flush: (provider: SyncProvider) =>
    api.post<{ enqueued: number }>(`/api/v1/integrations/${provider}/sync`),
};

export const syncKeys = {
  status: () => ['sync', 'status'] as const,
};
