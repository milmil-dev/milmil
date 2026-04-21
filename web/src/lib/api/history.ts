import { api } from '../api-client';
import type { WatchProgress } from './progress';

export type HistoryFilter = 'all' | 'in_progress' | 'completed';

export interface HistoryPage {
  items: WatchProgress[];
  next_before: string | null;
}

export interface HistoryListParams {
  before?: string;
  limit?: number;
  filter?: HistoryFilter;
  q?: string;
}

function buildQuery(params: HistoryListParams): string {
  const sp = new URLSearchParams();
  if (params.before) sp.set('before', params.before);
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.filter && params.filter !== 'all') sp.set('filter', params.filter);
  if (params.q) sp.set('q', params.q);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const historyApi = {
  list: (params: HistoryListParams = {}) =>
    api.get<HistoryPage>(`/api/v1/progress/history${buildQuery(params)}`),
  delete: (id: string) =>
    api.delete<{ deleted: number }>(`/api/v1/progress/${encodeURIComponent(id)}`),
  batchDelete: (ids: string[]) =>
    api.post<{ deleted: number }>(`/api/v1/progress/batch-delete`, { ids }),
  clearAll: () => api.delete<{ deleted: number }>(`/api/v1/progress`),
};

export const historyKeys = {
  all: ['progress', 'history'] as const,
  list: (filter: HistoryFilter, q: string) => [...historyKeys.all, { filter, q }] as const,
};
