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
  next_episode?: number;
}

export interface RelatedAnime {
  relation_type: string;
  anime: AnimeSummary;
}

export interface BangumiComment {
  id: number;
  username: string;
  nickname: string;
  avatar?: string;
  rate: number;
  comment: string;
  updated_at: number;
}

export interface UserReview {
  id: number;
  summary: string;
  score: number;
  username: string;
  avatar?: string;
}

export interface AnimeDetail extends AnimeSummary {
  synopsis: string;
  banner_image?: string;
  trailer_url?: string;
  tags: string[];
  popularity?: number;
  rating: { score: number; total: number };
  relations?: RelatedAnime[];
  recommendations?: AnimeSummary[];
  reviews?: UserReview[];
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
  image?: string;
  duration?: number; // minutes
}

export const discoverApi = {
  calendar: () => api.get<CalendarDay[]>('/api/v1/discover/calendar'),
  trending: (page: number) => api.get<AnimeSummary[]>(`/api/v1/discover/trending?page=${page}`),
  search: (q: string) =>
    api.get<AnimeSummary[]>(`/api/v1/discover/search?q=${encodeURIComponent(q)}`),
  browse: (genre: string, page = 1) =>
    api.get<AnimeSummary[]>(
      `/api/v1/discover/browse?genre=${encodeURIComponent(genre)}&page=${page}`
    ),
  detail: (id: number) => api.get<AnimeDetail>(`/api/v1/discover/anime/${id}`),
  episodes: (id: number) => api.get<Episode[]>(`/api/v1/discover/anime/${id}/episodes`),
  comments: (id: number) => api.get<BangumiComment[]>(`/api/v1/discover/anime/${id}/comments`),
  resolve: (anilistId: number) =>
    api.get<{ bangumi_id: number }>(`/api/v1/discover/resolve?anilist_id=${anilistId}`),
};

export const discoverKeys = {
  calendar: () => ['discover', 'calendar'] as const,
  trending: (page: number) => ['discover', 'trending', page] as const,
  search: (q: string) => ['discover', 'search', q] as const,
  browse: (genre: string, page: number) => ['discover', 'browse', genre, page] as const,
  detail: (id: number) => ['discover', 'detail', id] as const,
  episodes: (id: number) => ['discover', 'episodes', id] as const,
  comments: (id: number) => ['discover', 'comments', id] as const,
};
