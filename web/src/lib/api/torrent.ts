import { api } from '../api-client';

export interface TorrentResult {
  title: string;
  magnet: string;
  torrent_url: string;
  size: string;
  seeders: number;
  leechers: number;
  publish_date: string;
  sub_group: string;
  info_hash: string;
  source_site: string;
}

export const torrentApi = {
  search: (q: string, source?: string) =>
    api.get<TorrentResult[]>(
      `/api/v1/torrent-search?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`
    ),
  providers: () => api.get<string[]>('/api/v1/torrent-search/providers'),
  add: (data: { url: string; name: string }) => api.post<any>('/api/v1/torrent-search/add', data),
};

export const torrentKeys = {
  search: (q: string, source?: string) => ['torrent', 'search', q, source] as const,
  providers: () => ['torrent', 'providers'] as const,
};
