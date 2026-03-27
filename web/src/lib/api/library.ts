import { api } from '../api-client';

export interface Library {
  id: string;
  name: string;
  path: string;
  source_type: string;
  enabled: number;
  scan_interval_minutes: number;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanSummary {
  id: string;
  library_id: string;
  started_at: string;
  completed_at: string | null;
  files_found: number;
  files_matched: number;
  files_unmatched: number;
  errors: string;
}

export interface CreateLibraryInput {
  name: string;
  path: string;
  scan_interval_minutes?: number;
  source_type?: string;
  source_config?: Record<string, unknown>;
}

export interface UpdateLibraryInput {
  name: string;
  path: string;
  enabled: boolean;
  scan_interval_minutes: number;
  source_type?: string;
  source_config?: Record<string, unknown>;
}

export interface TestConnectionInput {
  source_type: string;
  source_config: Record<string, unknown>;
  path: string;
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

export const libraryApi = {
  list: () => api.get<Library[]>('/api/v1/libraries'),
  get: (id: string) => api.get<Library>(`/api/v1/libraries/${id}`),
  create: (input: CreateLibraryInput) => api.post<Library>('/api/v1/libraries', input),
  update: (id: string, input: UpdateLibraryInput) =>
    api.put<Library>(`/api/v1/libraries/${id}`, input),
  delete: (id: string) => api.delete<void>(`/api/v1/libraries/${id}`),
  scan: (id: string) => api.post<void>(`/api/v1/libraries/${id}/scan`),
  scanSummaries: (id: string) => api.get<ScanSummary[]>(`/api/v1/libraries/${id}/scan-summaries`),
  testConnection: (input: TestConnectionInput) =>
    api.post<TestConnectionResult>('/api/v1/libraries/test-connection', input),
};

export const libraryKeys = {
  all: ['libraries'] as const,
  list: () => [...libraryKeys.all, 'list'] as const,
  detail: (id: string) => [...libraryKeys.all, 'detail', id] as const,
  summaries: (id: string) => [...libraryKeys.all, 'summaries', id] as const,
};
