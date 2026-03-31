import { api } from '../api-client';

export interface WatchProgress {
  id: string;
  user_id: string;
  episode_id: string;
  media_file_id: string | null;
  position_seconds: number;
  duration_seconds: number | null;
  completed: number;
  last_watched_at: string;
  anime_id: string;
  anime_title: string;
  anime_title_zh: string | null;
  anime_cover_image: string | null;
  anime_bangumi_id: number | null;
  episode_number: number;
}

export const progressApi = {
  save: (data: {
    media_file_id: string;
    episode_id: string;
    position_seconds: number;
    duration_seconds: number;
    completed: boolean;
  }) => api.post<WatchProgress>('/api/v1/progress', data),
  recent: () => api.get<WatchProgress[]>('/api/v1/progress/recent'),
  byFile: (fileId: string) => api.get<WatchProgress>(`/api/v1/progress/file/${fileId}`),
};

export const progressKeys = {
  recent: () => ['progress', 'recent'] as const,
  byFile: (fileId: string) => ['progress', 'file', fileId] as const,
};
