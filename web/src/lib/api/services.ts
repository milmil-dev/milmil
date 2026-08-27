import { api } from '../api-client';

export type ServiceKind = 'api' | 'worker' | 'bot' | 'daemon';

export interface ServiceExtra {
  address?: string;
  discovery_enabled?: boolean;
  discovery_port?: number;
  device_count?: number;
  bytes?: number;
  [key: string]: unknown;
}

export interface Service {
  id: string;
  kind: ServiceKind;
  name: string;
  enabled: boolean;
  controllable: boolean;
  runnable: boolean;
  running: boolean;
  interval_seconds: number | null;
  last_run_at: string | null;
  last_duration_ms: number | null;
  last_error: string;
  next_run_at: string | null;
  summary: string;
  extra: ServiceExtra | null;
}

export interface ServicesResponse {
  services: Service[];
  system: {
    version: string;
    uptime_seconds: number;
    started_at: string;
  };
}

export interface ServicePatch {
  enabled?: boolean;
  discovery_enabled?: boolean;
}

export interface JellyfinDevice {
  device_id: string;
  client: string;
  device_name: string;
  first_seen: string;
  last_seen: string;
  revoked: boolean;
}

export const servicesApi = {
  list: () => api.get<ServicesResponse>('/api/v1/system/services'),
  patch: (id: string, body: ServicePatch) =>
    api.patch<Service>(`/api/v1/system/services/${encodeURIComponent(id)}`, body),
  run: (id: string) =>
    api.post<{ started: boolean }>(`/api/v1/system/services/${encodeURIComponent(id)}/run`),
  jellyfinDevices: () =>
    api.get<{ devices: JellyfinDevice[] }>('/api/v1/system/services/jellyfin/devices'),
  revokeJellyfinDevice: (deviceId: string) =>
    api.delete<void>(`/api/v1/system/services/jellyfin/devices/${encodeURIComponent(deviceId)}`),
};

export const servicesKeys = {
  list: () => ['system', 'services'] as const,
  jellyfinDevices: () => ['system', 'services', 'jellyfin', 'devices'] as const,
};
