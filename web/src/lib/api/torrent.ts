import { api } from '../api-client';

export interface TorrentResult {
  Title: string;
  Link: string;
  PubDate: string;
}

export const torrentApi = {
  search: (q: string) =>
    api.get<TorrentResult[]>(`/api/v1/torrent-search?q=${encodeURIComponent(q)}`),
  add: (data: { url: string; name: string }) => api.post<any>('/api/v1/torrent-search/add', data),
};

export const torrentKeys = {
  search: (q: string) => ['torrent', 'search', q] as const,
};
