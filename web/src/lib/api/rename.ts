import { api } from '../api-client';

export type RenameStatus = 'ok' | 'skip_same_as_current' | 'skip_collision' | 'error';

export interface RenamePlan {
  media_file_id: string;
  old_path: string;
  new_path: string;
  status: RenameStatus;
  error?: string;
}

export interface RenameBatch {
  batch_id: string;
  applied_at: string;
  row_count: number;
  reverted_count: number;
}

export interface ApplyResult {
  batch_id: string;
  applied: number;
  skipped: number;
  errors: string[];
}

export interface UndoResult {
  reverted: number;
  skipped: number;
  errors: string[];
}

export const renameApi = {
  setConfig: (libraryId: string, template: string, auto: boolean) =>
    api.patch<void>(`/api/v1/libraries/${libraryId}/rename-config`, { template, auto }),
  preview: (libraryId: string, animeId?: string) => {
    const qs = animeId ? `?anime_id=${encodeURIComponent(animeId)}` : '';
    return api.get<{ plans: RenamePlan[] }>(`/api/v1/libraries/${libraryId}/rename/preview${qs}`);
  },
  apply: (libraryId: string, plans: RenamePlan[]) =>
    api.post<ApplyResult>(`/api/v1/libraries/${libraryId}/rename/apply`, { plans }),
  undo: (libraryId: string, batchId: string) =>
    api.post<UndoResult>(`/api/v1/libraries/${libraryId}/rename/undo`, { batch_id: batchId }),
  history: (libraryId: string) =>
    api.get<RenameBatch[]>(`/api/v1/libraries/${libraryId}/rename/history`),
};

export const renameKeys = {
  preview: (libraryId: string, animeId?: string) =>
    ['rename-preview', libraryId, animeId ?? ''] as const,
  history: (libraryId: string) => ['rename-history', libraryId] as const,
};
