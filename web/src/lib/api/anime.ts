import { api } from '../api-client';

export interface PlayableEpisodeMedia {
  id: string;
  filename: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
}

export interface PlayableEpisodeProgress {
  position_seconds: number;
  duration_seconds: number;
  completed: boolean;
}

export interface PlayableEpisode {
  episode_id: string;
  sort: number;
  title: string | null;
  title_zh: string | null;
  air_date: string | null;
  synopsis: string | null;
  synopsis_zh: string | null;
  image: string | null;
  media_file: PlayableEpisodeMedia | null;
  progress: PlayableEpisodeProgress | null;
}

export interface PlayableEpisodesResponse {
  anime_id: string;
  watch_status: string;
  mal_id: number | null;
  tmdb_id: number | null;
  anidb_id: number | null;
  user_score: number | null;
  sync_disabled: number;
  watch_status_override: string;
  episodes: PlayableEpisode[];
}

export interface AnimeSyncFlags {
  sync_disabled?: 0 | 1;
  watch_status_override?: string;
}

export const animeApi = {
  playableEpisodes: (bangumiId: number) =>
    api.get<PlayableEpisodesResponse>(`/api/v1/anime/${bangumiId}/playable-episodes`),
  updateScore: (bangumiId: number, score: number | null) =>
    api.patch<void>(`/api/v1/anime/${bangumiId}/score`, { score }),
  updateSyncFlags: (bangumiId: number, flags: AnimeSyncFlags) =>
    api.patch<void>(`/api/v1/anime/${bangumiId}/sync-flags`, flags),
};

export const animeKeys = {
  playableEpisodes: (bangumiId: number) => ['anime', 'playable-episodes', bangumiId] as const,
};
