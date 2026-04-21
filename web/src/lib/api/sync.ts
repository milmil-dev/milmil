import { api } from '../api-client';

export type SyncProvider = 'anilist' | 'bangumi' | 'trakt';

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

export interface PullResult {
  provider: string;
  checked: number;
  updated_local: number;
  skipped: number;
  errors: string[];
}

export const syncApi = {
  status: () => api.get<SyncProviderStatus[]>('/api/v1/sync/status'),
  flush: (provider: SyncProvider) =>
    api.post<{ enqueued: number }>(`/api/v1/integrations/${provider}/sync`),
  pullNow: (provider: SyncProvider) => api.post<PullResult>(`/api/v1/sync/${provider}/pull`, {}),
  setPullEnabled: (provider: SyncProvider, enabled: boolean) =>
    api.post<void>(`/api/v1/sync/${provider}/pull-enabled`, { enabled }),
};

export const syncKeys = {
  status: () => ['sync', 'status'] as const,
};
