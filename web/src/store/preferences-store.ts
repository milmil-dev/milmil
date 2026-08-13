import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type GlobalPreferences, preferencesApi, type SubtitleStyle } from '../lib/api/preferences';
import type { BufferMode, DanmakuDensity } from '../lib/api/stream';

// Default values
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Noto Sans CJK',
  fontSize: 24,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  strokeWidth: 2,
  strokeColor: '#000000',
  shadowType: 'outline',
  position: 'bottom',
  positionOffset: 10,
  safeMargin: 5,
  fadeAnimation: true,
  respectAssStyle: true,
};

interface PreferencesState extends GlobalPreferences {
  // Actions
  updateSubtitleStyle: (style: Partial<SubtitleStyle>) => void;
  updatePreference: <K extends keyof GlobalPreferences>(
    key: K,
    value: GlobalPreferences[K]
  ) => void;
  syncFromBackend: () => Promise<void>;
  resetToDefaults: () => void;
  toggleDanmaku: () => void;
  setDanmakuOpacity: (v: number) => void;
  setDanmakuFontSize: (v: number) => void;
  setDanmakuSpeed: (v: number) => void;
}

// Debounced sync helper
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedSync = (state: GlobalPreferences) => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    preferencesApi.putGlobal(state).catch(console.error);
  }, 2000);
};

// Helper to extract preferences from full state (excluding actions)
function extractPrefs(state: PreferencesState): GlobalPreferences {
  return {
    subtitleStyle: state.subtitleStyle,
    subtitlePreset: state.subtitlePreset,
    keyboardBindings: state.keyboardBindings,
    gestureEnabled: state.gestureEnabled,
    gestureSensitivity: state.gestureSensitivity,
    autoNext: state.autoNext,
    autoSkipOp: state.autoSkipOp,
    autoSkipEd: state.autoSkipEd,
    danmakuEnabled: state.danmakuEnabled,
    danmakuOpacity: state.danmakuOpacity,
    danmakuFontSize: state.danmakuFontSize,
    danmakuSpeed: state.danmakuSpeed,
    danmakuDensity: state.danmakuDensity,
    danmakuArea: state.danmakuArea,
    danmakuBold: state.danmakuBold,
    danmakuStroke: state.danmakuStroke,
    danmakuFilterScroll: state.danmakuFilterScroll,
    danmakuFilterTop: state.danmakuFilterTop,
    danmakuFilterBottom: state.danmakuFilterBottom,
    danmakuAntiSubtitle: state.danmakuAntiSubtitle,
    danmakuFontFamily: state.danmakuFontFamily,
    danmakuColor: state.danmakuColor,
    danmakuBlockKeywords: state.danmakuBlockKeywords,
    danmakuChineseConvert: state.danmakuChineseConvert,
    bufferMode: state.bufferMode,
    defaultSubtitleLanguage: state.defaultSubtitleLanguage,
    defaultAudioLanguage: state.defaultAudioLanguage,
  };
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // Defaults
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      subtitlePreset: 'default',
      keyboardBindings: [],
      gestureEnabled: true,
      gestureSensitivity: 50,
      autoNext: true,
      autoSkipOp: false,
      autoSkipEd: false,
      danmakuEnabled: true,
      danmakuOpacity: 1,
      danmakuFontSize: 20,
      danmakuSpeed: 144,
      danmakuDensity: 'medium' as DanmakuDensity,
      danmakuArea: 1,
      danmakuBold: false,
      danmakuStroke: 'shadow' as const,
      danmakuFilterScroll: true,
      danmakuFilterTop: true,
      danmakuFilterBottom: true,
      danmakuAntiSubtitle: false,
      danmakuFontFamily: 'sans-serif',
      danmakuColor: '#FFFFFF',
      danmakuBlockKeywords: [] as string[],
      danmakuChineseConvert: 'none' as const,
      bufferMode: 'auto' as BufferMode,
      defaultSubtitleLanguage: null,
      defaultAudioLanguage: null,

      // Actions
      updateSubtitleStyle: (style) => {
        set((s) => ({
          subtitleStyle: { ...s.subtitleStyle, ...style },
        }));
        debouncedSync(extractPrefs(get()));
      },

      updatePreference: (key, value) => {
        set({ [key]: value } as Partial<PreferencesState>);
        debouncedSync(extractPrefs(get()));
      },

      syncFromBackend: async () => {
        try {
          const prefs = await preferencesApi.getGlobal();
          if (prefs && Object.keys(prefs).length > 0) {
            set(prefs as Partial<PreferencesState>);
          }
        } catch {
          // Silently fail — localStorage has the data
        }
      },

      toggleDanmaku: () => {
        set((s) => ({ danmakuEnabled: !s.danmakuEnabled }));
        debouncedSync(extractPrefs(get()));
      },
      setDanmakuOpacity: (v) => {
        set({ danmakuOpacity: v });
        debouncedSync(extractPrefs(get()));
      },
      setDanmakuFontSize: (v) => {
        set({ danmakuFontSize: v });
        debouncedSync(extractPrefs(get()));
      },
      setDanmakuSpeed: (v) => {
        set({ danmakuSpeed: v });
        debouncedSync(extractPrefs(get()));
      },

      resetToDefaults: () => {
        set({
          subtitleStyle: DEFAULT_SUBTITLE_STYLE,
          subtitlePreset: 'default',
          keyboardBindings: [],
          gestureEnabled: true,
          gestureSensitivity: 50,
          autoNext: true,
          autoSkipOp: false,
          autoSkipEd: false,
          danmakuEnabled: true,
          danmakuOpacity: 1,
          danmakuFontSize: 20,
          danmakuSpeed: 144,
          danmakuDensity: 'medium' as DanmakuDensity,
          danmakuArea: 1,
          danmakuBold: false,
          danmakuStroke: 'shadow' as const,
          danmakuFilterScroll: true,
          danmakuFilterTop: true,
          danmakuFilterBottom: true,
          danmakuAntiSubtitle: false,
          bufferMode: 'auto' as BufferMode,
          defaultSubtitleLanguage: null,
          defaultAudioLanguage: null,
        });
        debouncedSync(extractPrefs(get()));
      },
    }),
    {
      name: 'milmil-preferences',
      partialize: (state) => ({
        subtitleStyle: state.subtitleStyle,
        subtitlePreset: state.subtitlePreset,
        keyboardBindings: state.keyboardBindings,
        gestureEnabled: state.gestureEnabled,
        gestureSensitivity: state.gestureSensitivity,
        autoNext: state.autoNext,
        autoSkipOp: state.autoSkipOp,
        autoSkipEd: state.autoSkipEd,
        danmakuEnabled: state.danmakuEnabled,
        danmakuOpacity: state.danmakuOpacity,
        danmakuFontSize: state.danmakuFontSize,
        danmakuSpeed: state.danmakuSpeed,
        danmakuDensity: state.danmakuDensity,
        danmakuArea: state.danmakuArea,
        danmakuBold: state.danmakuBold,
        danmakuStroke: state.danmakuStroke,
        danmakuFilterScroll: state.danmakuFilterScroll,
        danmakuFilterTop: state.danmakuFilterTop,
        danmakuFilterBottom: state.danmakuFilterBottom,
        danmakuAntiSubtitle: state.danmakuAntiSubtitle,
        danmakuFontFamily: state.danmakuFontFamily,
        danmakuColor: state.danmakuColor,
        danmakuBlockKeywords: state.danmakuBlockKeywords,
        danmakuChineseConvert: state.danmakuChineseConvert,
        bufferMode: state.bufferMode,
        defaultSubtitleLanguage: state.defaultSubtitleLanguage,
        defaultAudioLanguage: state.defaultAudioLanguage,
      }),
    }
  )
);
