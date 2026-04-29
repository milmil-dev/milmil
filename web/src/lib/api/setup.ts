import { api } from '../api-client';

export interface SetupStatus {
  has_admin: boolean;
  library_count: number;
}

export const setupApi = {
  getStatus: () => api.get<SetupStatus>('/api/v1/setup/status'),
};
