import { api } from '../api-client';

export interface DeviceCodeResponse {
  user_code: string;
  verification_url: string;
  expires_in: number;
  poll_interval: number;
}

export type DevicePollStatus = 'pending' | 'approved' | 'expired' | 'denied';

export const traktApi = {
  requestDeviceCode: () =>
    api.post<DeviceCodeResponse>('/api/v1/integrations/trakt/device-code', {}),
  pollDeviceCode: () =>
    api.post<{ status: DevicePollStatus }>('/api/v1/integrations/trakt/poll', {}),
  disconnect: () => api.delete<void>('/api/v1/integrations/trakt'),
};
