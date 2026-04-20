import type { BufferMode, DanmakuDensity } from '../api/stream';
import { api } from '../api-client';

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
  danmakuArea: number; // 0.25 | 0.5 | 0.75 | 1
  danmakuBold: boolean;
  danmakuStroke: 'none' | 'shadow' | 'stroke';
  danmakuFilterScroll: boolean;
  danmakuFilterTop: boolean;
  danmakuFilterBottom: boolean;
  danmakuAntiSubtitle: boolean;
  danmakuFontFamily: string;
  danmakuColor: string;
  bufferMode: BufferMode;
  defaultSubtitleLanguage: string | null;
  defaultAudioLanguage: string | null;
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

interface PreferenceEnvelope<T> {
  data: T;
}

export const preferencesApi = {
  getGlobal: async () => {
    const res = await api.get<PreferenceEnvelope<Partial<GlobalPreferences>>>(
      '/api/v1/user/preferences'
    );
    return res.data;
  },
  putGlobal: (data: Partial<GlobalPreferences>) =>
    api.put<void>('/api/v1/user/preferences', { data }),
  getSeries: async (seriesId: string) => {
    const res = await api.get<PreferenceEnvelope<Partial<SeriesPreferences>>>(
      `/api/v1/user/preferences/series/${seriesId}`
    );
    return res.data;
  },
  putSeries: (seriesId: string, data: Partial<SeriesPreferences>) =>
    api.put<void>(`/api/v1/user/preferences/series/${seriesId}`, { data }),
  exportAll: () => api.post<ExportResponse>('/api/v1/user/preferences/export'),
  importAll: (body: { version: number; preferences: ExportResponse['preferences'] }) =>
    api.post<void>('/api/v1/user/preferences/import', body),
};
