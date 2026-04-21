import { api } from '../api-client';

export interface DupFileInfo {
  id: string;
  path: string;
  filename: string;
  size_bytes: number;
  resolution: number;
  subgroup: string;
  mod_time: string;
}

export interface DupSet {
  anime_id: string;
  anime_title?: string;
  episode_id: string;
  episode_number: number;
  preferred_id: string;
  manually_set: boolean;
  files: DupFileInfo[];
  wasted_bytes: number;
}

export interface CleanupResult {
  deleted: number;
  reclaimed_bytes: number;
  skipped: number;
  errors: string[];
}

export const duplicatesApi = {
  anime: (bangumiId: number) => api.get<DupSet[]>(`/api/v1/anime/${bangumiId}/duplicates`),
  library: (libraryId: string) => api.get<DupSet[]>(`/api/v1/libraries/${libraryId}/duplicates`),
  setPreferred: (episodeId: string, mediaFileId: string) =>
    api.patch<void>(`/api/v1/episodes/${episodeId}/preferred`, {
      media_file_id: mediaFileId,
    }),
  deleteFile: (id: string) => api.delete<void>(`/api/v1/media-files/${id}`),
  cleanupLibrary: (libraryId: string) =>
    api.post<CleanupResult>(`/api/v1/libraries/${libraryId}/duplicates/cleanup`, {}),
};

export const duplicatesKeys = {
  anime: (bangumiId: number) => ['duplicates-anime', bangumiId] as const,
  library: (libraryId: string) => ['duplicates-library', libraryId] as const,
};
