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
  resolution_filter: string;
  subgroup_filter: string;
  min_seeders: number;
  match_mode: string;
  episode_filter: string;
  episode_range: string;
  last_triggered_at: string | null;
  created_at: string;
  library_id: string | null;
  bangumi_id: number | null;
}

export interface SubscribeInput {
  anime_name: string;
  source: 'mikan' | 'nyaa' | 'dmhy';
  query?: string;
  mikan_bangumi_id?: string;
  sub_group?: string;
  resolution?: string;
  library_id?: string;
  bangumi_id?: number;
}

export interface SubscribeResponse {
  feed: RSSFeed;
  rule: DownloadRule;
}

export const downloadApi = {
  list: () => api.get<Download[]>('/api/v1/downloads'),
  grouped: () => api.get<DownloadGroup[]>('/api/v1/downloads/grouped'),
  files: (gid: string) => api.get<DownloadFileInfo>(`/api/v1/downloads/${gid}/files`),
  add: (data: { url: string; name?: string; save_dir?: string }) =>
    api.post<Download>('/api/v1/downloads', data),
  pause: (gid: string) => api.post<void>(`/api/v1/downloads/${gid}/pause`),
  resume: (gid: string) => api.post<void>(`/api/v1/downloads/${gid}/resume`),
  delete: (gid: string) => api.delete<void>(`/api/v1/downloads/${gid}`),
  deleteWithFiles: (gid: string) => api.delete<void>(`/api/v1/downloads/${gid}?delete_files=true`),
  batchDelete: (deleteFiles: boolean) =>
    api.delete<{ deleted: number }>(`/api/v1/downloads${deleteFiles ? '?delete_files=true' : ''}`),
};

export interface PreviewItem {
  title: string;
  link: string;
  episode: string;
  subgroup: string;
  size: string;
  publish_date: string;
  already_downloaded: boolean;
}

export interface PreviewResponse {
  items: PreviewItem[];
  total: number;
  matched: number;
}

export const rssFeedApi = {
  list: () => api.get<RSSFeed[]>('/api/v1/rss-feeds'),
  create: (data: { name: string; url: string; type: string }) =>
    api.post<RSSFeed>('/api/v1/rss-feeds', data),
  update: (id: string, data: Partial<RSSFeed>) => api.put<void>(`/api/v1/rss-feeds/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/v1/rss-feeds/${id}`),
  refresh: (id: string) => api.post<void>(`/api/v1/rss-feeds/${id}/refresh`),
  preview: (feedId: string, ruleId?: string) =>
    api.get<PreviewResponse>(
      `/api/v1/rss-feeds/${feedId}/preview${ruleId ? `?rule_id=${ruleId}` : ''}`
    ),
  previewUrl: (url: string) => api.post<PreviewResponse>('/api/v1/rss-feeds/preview-url', { url }),
};

export const ruleApi = {
  list: () => api.get<DownloadRule[]>('/api/v1/download-rules'),
  create: (data: Omit<DownloadRule, 'id' | 'last_triggered_at' | 'created_at'>) =>
    api.post<DownloadRule>('/api/v1/download-rules', data),
  update: (id: string, data: Partial<DownloadRule>) =>
    api.put<void>(`/api/v1/download-rules/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/v1/download-rules/${id}`),
};

export interface DownloadGroup {
  rule_id: string;
  rule_name: string;
  bangumi_id?: number;
  library_id?: string;
  library_name?: string;
  source?: string;
  resolution_filter?: string;
  subgroup_filter?: string;
  downloads: {
    id: string;
    gid: string;
    name: string;
    status: string;
    total_bytes: number;
    completed_bytes: number;
    speed_bytes: number;
    created_at: string;
  }[];
  active_count: number;
  complete_count: number;
  total_count: number;
}

export interface DownloadFileInfo {
  gid: string;
  name: string;
  status: string;
  dir: string;
  files: {
    path: string;
    size: number;
    complete: number;
    selected: boolean;
  }[];
}

export const subscribeApi = {
  subscribe: (data: SubscribeInput) => api.post<SubscribeResponse>('/api/v1/subscribe', data),
};

export const downloadKeys = {
  list: () => ['downloads'] as const,
  feeds: () => ['rss-feeds'] as const,
  rules: () => ['download-rules'] as const,
};
