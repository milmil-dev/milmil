import { api } from '../api-client';

export interface UpdateCheck {
  current: string;
  latest: string | null;
  has_update: boolean;
  release_url?: string;
  published_at?: string;
  stale: boolean;
}

export const systemApi = {
  updateCheck: () => api.get<UpdateCheck>('/api/v1/system/update-check'),
};
