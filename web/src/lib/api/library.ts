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
  rename_template?: string;
  rename_auto?: number;
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

export interface LibraryConnectionStatus {
  online: boolean;
  error?: string;
}

export interface LibraryCapacity {
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
  available: boolean;
}

export interface BrowseInput {
  source_type: string;
  source_config: Record<string, unknown>;
  path: string;
}

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  directories: BrowseEntry[];
}

export interface MediaFileEntry {
  id: string;
  library_id: string;
  path: string;
  filename: string;
  size_bytes: number;
  match_status: 'unmatched' | 'auto' | 'manual';
  dandanplay_anime_id: number | null;
  dandanplay_episode_id: number | null;
  subtitle_count: number;
  matched_anime_title: string;
  matched_episode_sort: number;
  matched_bangumi_id: number;
  created_at: string;
}

export interface MediaFilesResponse {
  items: MediaFileEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface LibraryWithStats extends Library {
  file_count: number;
  matched_count: number;
  unmatched_count: number;
  total_size_bytes: number;
}

export interface DiscoveredHost {
  ip: string;
  hostname: string;
  shares: string[];
}

export interface FileTreeFile {
  id: string;
  filename: string;
  size_bytes: number;
  match_status: 'unmatched' | 'auto' | 'manual';
  matched_anime_title: string;
  matched_episode_sort: number;
  matched_bangumi_id: number;
  subtitle_count: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  children?: FileTreeNode[];
  files?: FileTreeFile[];
  file_count: number;
  size_bytes: number;
}

export interface MediaFilesParams {
  status?: 'all' | 'matched' | 'unmatched';
  q?: string;
  page?: number;
  per_page?: number;
  sort_by?: 'filename' | 'size_bytes' | 'match_status' | 'subtitle_count';
  sort_order?: 'asc' | 'desc';
}

export const libraryApi = {
  list: () => api.get<LibraryWithStats[]>('/api/v1/libraries'),
  get: (id: string) => api.get<LibraryWithStats>(`/api/v1/libraries/${id}`),
  create: (input: CreateLibraryInput) => api.post<Library>('/api/v1/libraries', input),
  update: (id: string, input: UpdateLibraryInput) =>
    api.put<Library>(`/api/v1/libraries/${id}`, input),
  delete: (id: string) => api.delete<void>(`/api/v1/libraries/${id}`),
  scan: (id: string) => api.post<void>(`/api/v1/libraries/${id}/scan`),
  matchLibrary: (id: string) => api.post<void>(`/api/v1/libraries/${id}/match`),
  scanSummaries: (id: string) => api.get<ScanSummary[]>(`/api/v1/libraries/${id}/scan-summaries`),
  getConnectionStatus: (id: string) =>
    api.get<LibraryConnectionStatus>(`/api/v1/libraries/${id}/connection-status`),
  getCapacity: (id: string) =>
    api.get<LibraryCapacity>(`/api/v1/libraries/${id}/capacity`),
  testConnection: (input: TestConnectionInput) =>
    api.post<TestConnectionResult>('/api/v1/libraries/test-connection', input),
  browse: (input: BrowseInput) => api.post<BrowseResult>('/api/v1/libraries/browse', input),
  mediaFiles: (id: string, params: MediaFilesParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set('status', params.status);
    if (params.q) searchParams.set('q', params.q);
    if (params.page) searchParams.set('page', String(params.page));
    if (params.per_page) searchParams.set('per_page', String(params.per_page));
    if (params.sort_by) searchParams.set('sort_by', params.sort_by);
    if (params.sort_order) searchParams.set('sort_order', params.sort_order);
    const qs = searchParams.toString();
    return api.get<MediaFilesResponse>(`/api/v1/libraries/${id}/media-files${qs ? `?${qs}` : ''}`);
  },
  deleteAnime: (libraryId: string, animeId: string) =>
    api.delete<void>(`/api/v1/libraries/${libraryId}/anime/${animeId}`),
  fileTree: (id: string) => api.get<FileTreeNode>(`/api/v1/libraries/${id}/file-tree`),
  anime: (id: string) =>
    api.get<
      Array<{
        id: string;
        bangumi_id: number;
        anilist_id?: number;
        title: string;
        title_original: string;
        cover_image: string;
        genres: string[];
        air_date?: string;
        episode_count: number;
        score: number;
      }>
    >(`/api/v1/libraries/${id}/anime`),
  matchFile: (fileId: string, body: { bangumi_id: number; episode_id: number }) =>
    api.put<MediaFileEntry>(`/api/v1/media-files/${fileId}/match`, body),
  unmatchFile: (fileId: string) => api.delete<void>(`/api/v1/media-files/${fileId}/match`),
  discoverNetwork: () => api.get<{ hosts: DiscoveredHost[] }>('/api/v1/libraries/discover-network'),
  listRcloneRemotes: () =>
    api.get<{ remotes: { name: string; type: string }[] }>('/api/v1/rclone/remotes'),
};

export const mediaFileApi = {
  bulkMatch: (data: { file_ids: string[]; bangumi_id: number; episode_start: number }) =>
    api.post<{ matched: number }>('/api/v1/media-files/bulk-match', data),
  bulkUnmatch: (data: { file_ids: string[] }) =>
    api.post<{ cleared: number }>('/api/v1/media-files/bulk-unmatch', data),
};

export const libraryKeys = {
  all: ['libraries'] as const,
  list: () => [...libraryKeys.all, 'list'] as const,
  detail: (id: string) => [...libraryKeys.all, 'detail', id] as const,
  summaries: (id: string) => [...libraryKeys.all, 'summaries', id] as const,
  connectionStatus: (id: string) => [...libraryKeys.all, 'connection-status', id] as const,
  capacity: (id: string) => [...libraryKeys.all, 'capacity', id] as const,
  mediaFiles: (id: string, params: MediaFilesParams = {}) =>
    [...libraryKeys.all, 'media-files', id, params] as const,
  fileTree: (id: string) => [...libraryKeys.all, 'file-tree', id] as const,
  network: () => [...libraryKeys.all, 'network'] as const,
  rcloneRemotes: () => [...libraryKeys.all, 'rclone-remotes'] as const,
};
