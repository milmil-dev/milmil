import { api } from '../api-client';

export interface SubtitleFile {
  id: string;
  media_file_id: string;
  path: string;
  language: string;
  format: string;
  source: string;
}

export const subtitleApi = {
  list: (mediaFileId: string) => api.get<SubtitleFile[]>(`/api/v1/subtitles/media/${mediaFileId}`),
};

export function getSubtitleUrl(subtitleId: string): string {
  const ApiUrl = import.meta.env.VITE_API_URL ?? '';
  const token = localStorage.getItem('milmil-token') ?? '';
  return `${ApiUrl}/api/v1/subtitles/${subtitleId}/content?token=${encodeURIComponent(token)}`;
}
