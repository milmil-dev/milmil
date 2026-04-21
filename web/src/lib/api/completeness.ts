import { api } from '../api-client';

export interface CompletenessReport {
  anime_id: string;
  bangumi_id?: number;
  title?: string;
  total: number;
  have: number[];
  missing: number[];
  airing_pending: number[];
  unknown_total: boolean;
  generated_at: string;
}

export const completenessApi = {
  anime: (bangumiId: number) => api.get<CompletenessReport>(`/api/v1/anime/${bangumiId}/missing`),
  librarySummary: (libraryId: string) =>
    api.get<CompletenessReport[]>(`/api/v1/libraries/${libraryId}/missing-summary`),
};

export const completenessKeys = {
  anime: (bangumiId: number) => ['completeness-anime', bangumiId] as const,
  library: (libraryId: string) => ['completeness-library', libraryId] as const,
};
