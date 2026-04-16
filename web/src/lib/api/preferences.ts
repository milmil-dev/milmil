import { api } from '../api-client';
import type { DanmakuDensity, BufferMode } from '../api/stream';

// Types
export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // 12-48
  color: string; // hex
  backgroundColor: string; // hex
  backgroundOpacity: number; // 0-1
  strokeWidth: number; // 0-4
  strokeColor: string;
  shadowType: 'none' | 'outline' | 'drop-shadow' | 'raised' | 'depressed';
  position: 'top' | 'center' | 'bottom';
  positionOffset: number; // 0-100 percent
  safeMargin: number; // 0-20 percent
  fadeAnimation: boolean;
  respectAssStyle: boolean;
}

export interface KeyBinding {
  action: string;
  key: string;
  modifiers?: ('shift' | 'ctrl' | 'alt' | 'meta')[];
}

export interface GlobalPreferences {
  subtitleStyle: SubtitleStyle;
  subtitlePreset: string;
  keyboardBindings: KeyBinding[];
  gestureEnabled: boolean;
  gestureSensitivity: number;
  autoNext: boolean;
  autoSkipOp: boolean;
  autoSkipEd: boolean;
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuSpeed: number;
  danmakuDensity: DanmakuDensity;
  bufferMode: BufferMode;
}

export interface SeriesPreferences {
  playbackSpeed: number;
  volume: number;
  subtitleLanguage: string;
  subtitleSecondaryLanguage: string | null;
  subtitleDelay: number;
  audioTrackLanguage: string;
}

export interface ExportResponse {
  version: number;
  preferences: Array<{
    scope: string;
    scope_id: string;
    data: Record<string, unknown>;
  }>;
  exported_at: string;
}

export const preferencesApi = {
  getGlobal: () => api.get<GlobalPreferences>('/api/v1/user/preferences'),
  putGlobal: (data: Partial<GlobalPreferences>) =>
    api.put<void>('/api/v1/user/preferences', { data }),
  getSeries: (seriesId: string) =>
    api.get<SeriesPreferences>(
      `/api/v1/user/preferences/series/${seriesId}`,
    ),
  putSeries: (seriesId: string, data: Partial<SeriesPreferences>) =>
    api.put<void>(`/api/v1/user/preferences/series/${seriesId}`, { data }),
  exportAll: () =>
    api.post<ExportResponse>('/api/v1/user/preferences/export'),
  importAll: (body: {
    version: number;
    preferences: ExportResponse['preferences'];
  }) => api.post<void>('/api/v1/user/preferences/import', body),
};
