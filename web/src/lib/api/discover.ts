import { api } from '../api-client';

export interface AnimeSummary {
  bangumi_id: number;
  anilist_id?: number;
  title: string;
  title_original: string;
  title_en?: string;
  cover_image: string;
  banner_image?: string;
  description?: string;
  genres?: string[];
  air_date?: string;
  episode_count: number;
  score: number;
}

export interface AnimeDetail extends AnimeSummary {
  synopsis: string;
  banner_image?: string;
  tags: string[];
  popularity?: number;
  rating: { score: number; total: number };
}

export interface CalendarDay {
  weekday: string;
  weekday_en: string;
  items: AnimeSummary[];
}

export interface Episode {
  bangumi_episode_id: number;
  sort: number;
  title: string;
  title_original: string;
  air_date?: string;
  synopsis?: string;
}

export const discoverApi = {
  calendar: () => api.get<CalendarDay[]>('/api/v1/discover/calendar'),
  trending: (page: number) => api.get<AnimeSummary[]>(`/api/v1/discover/trending?page=${page}`),
  search: (q: string) =>
    api.get<AnimeSummary[]>(`/api/v1/discover/search?q=${encodeURIComponent(q)}`),
  detail: (id: number) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
  episodes: (id: number) => api.get<Episode[]>(`/api/v1/discover/anime/${id}/episodes`),
};

export const discoverKeys = {
  calendar: () => ['discover', 'calendar'] as const,
  trending: (page: number) => ['discover', 'trending', page] as const,
  search: (q: string) => ['discover', 'search', q] as const,
  detail: (id: number) => ['discover', 'detail', id] as const,
  episodes: (id: number) => ['discover', 'episodes', id] as const,
};
