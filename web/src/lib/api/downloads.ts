import { api } from '../api-client';

export interface Download {
  id: string;
  gid: string;
  url: string;
  name: string;
  status: string; // active/waiting/paused/complete/error/removed
  total_bytes: number;
  completed_bytes: number;
  speed_bytes: number;
  save_dir: string;
  rule_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RSSFeed {
  id: string;
  name: string;
  url: string;
  type: string;
  enabled: number;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  created_at: string;
}

export interface DownloadRule {
  id: string;
  name: string;
  enabled: number;
  rss_feed_id: string;
  filter_regex: string;
  exclude_regex: string;
  save_dir: string;
  episode_offset: number;
  last_triggered_at: string | null;
  created_at: string;
}

export const downloadApi = {
  list: () => api.get<Download[]>('/api/v1/downloads'),
  add: (data: { url: string; name?: string; save_dir?: string }) =>
    api.post<Download>('/api/v1/downloads', data),
  pause: (gid: string) => api.post<void>(`/api/v1/downloads/${gid}/pause`),
  resume: (gid: string) => api.post<void>(`/api/v1/downloads/${gid}/resume`),
  delete: (gid: string) => api.delete<void>(`/api/v1/downloads/${gid}`),
};

export const rssFeedApi = {
  list: () => api.get<RSSFeed[]>('/api/v1/rss-feeds'),
  create: (data: { name: string; url: string; type: string }) =>
    api.post<RSSFeed>('/api/v1/rss-feeds', data),
  update: (id: string, data: Partial<RSSFeed>) =>
    api.put<void>(`/api/v1/rss-feeds/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/v1/rss-feeds/${id}`),
  refresh: (id: string) => api.post<void>(`/api/v1/rss-feeds/${id}/refresh`),
};

export const ruleApi = {
  list: () => api.get<DownloadRule[]>('/api/v1/download-rules'),
  create: (data: Omit<DownloadRule, 'id' | 'last_triggered_at' | 'created_at'>) =>
    api.post<DownloadRule>('/api/v1/download-rules', data),
  update: (id: string, data: Partial<DownloadRule>) =>
    api.put<void>(`/api/v1/download-rules/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/v1/download-rules/${id}`),
};

export const downloadKeys = {
  list: () => ['downloads'] as const,
  feeds: () => ['rss-feeds'] as const,
  rules: () => ['download-rules'] as const,
};
