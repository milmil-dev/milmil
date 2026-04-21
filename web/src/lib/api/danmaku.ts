import { api } from '../api-client';

export interface DanmakuSource {
  name: string;
  label: string;
}

export interface DanmakuSearchResult {
  videoId: string;
  title: string;
  danmakuCount: number;
  duration: string;
  thumbnail?: string;
}

export interface ExternalComment {
  text: string;
  time: number;
  mode: string;
  color: string;
}

export interface VideoPart {
  index: number;
  title: string;
  duration: number;
}

export interface ImportedDanmaku {
  source: string;
  count: number;
  saved: boolean;
  comments: ExternalComment[];
}

export const externalDanmakuApi = {
  sources: () => api.get<DanmakuSource[]>('/api/v1/danmaku/external/sources'),

  search: (source: string, q: string, page = 1) =>
    api.get<DanmakuSearchResult[]>(
      `/api/v1/danmaku/external/search?source=${encodeURIComponent(source)}&q=${encodeURIComponent(q)}&page=${page}`
    ),

  parts: (source: string, videoId: string) =>
    api.get<VideoPart[]>(
      `/api/v1/danmaku/external/parts?source=${encodeURIComponent(source)}&videoId=${encodeURIComponent(videoId)}`
    ),

  import: (source: string, videoId: string, episodeId: string, partIndex = 0) =>
    api.post<{ source: string; count: number; saved: boolean; comments: ExternalComment[] }>(
      '/api/v1/danmaku/external/import',
      { source, videoId, episodeId, partIndex }
    ),

  toggleSave: (episodeId: string, source: string, save: boolean) =>
    api.patch<{ saved: boolean }>(`/api/v1/danmaku/external/imported/${episodeId}/save`, {
      source,
      save,
    }),

  getImported: (episodeId: string) =>
    api.get<ImportedDanmaku[]>(`/api/v1/danmaku/external/imported/${episodeId}`),

  removeImported: (episodeId: string, source?: string) =>
    api.delete<void>(
      `/api/v1/danmaku/external/imported/${episodeId}${source ? `?source=${encodeURIComponent(source)}` : ''}`
    ),
};

export const externalDanmakuKeys = {
  sources: () => ['danmaku', 'external', 'sources'] as const,
  search: (source: string, q: string, page: number) =>
    ['danmaku', 'external', 'search', source, q, page] as const,
  imported: (episodeId: string) => ['danmaku', 'external', 'imported', episodeId] as const,
};
