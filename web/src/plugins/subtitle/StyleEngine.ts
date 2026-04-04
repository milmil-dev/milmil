import type { SubtitleStyleConfig } from './types';

/** Preset subtitle style templates */
export const SUBTITLE_PRESETS: Record<string, SubtitleStyleConfig> = {
  default: {
    fontFamily: 'Noto Sans CJK, sans-serif',
    fontSize: 24,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.75,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadowType: 'none',
    position: 'bottom',
    positionOffset: 10,
    safeMargin: 5,
    fadeAnimation: true,
    respectAssStyle: true,
  },
  cinema: {
    fontFamily: 'Georgia, serif',
    fontSize: 26,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    strokeWidth: 2,
    strokeColor: '#000000',
    shadowType: 'outline',
    position: 'bottom',
    positionOffset: 8,
    safeMargin: 10,
    fadeAnimation: true,
    respectAssStyle: false,
  },
  anime: {
    fontFamily: 'Noto Sans CJK, sans-serif',
    fontSize: 28,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    strokeWidth: 3,
    strokeColor: '#000000',
    shadowType: 'outline',
    position: 'bottom',
    positionOffset: 6,
    safeMargin: 5,
    fadeAnimation: false,
    respectAssStyle: true,
  },
  highContrast: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 30,
    color: '#FFE600',
    backgroundColor: '#000000',
    backgroundOpacity: 0.9,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadowType: 'none',
    position: 'bottom',
    positionOffset: 10,
    safeMargin: 5,
    fadeAnimation: false,
    respectAssStyle: false,
  },
};

export class StyleEngine {
  private currentPreset: string = 'default';
  private customOverrides: Partial<SubtitleStyleConfig> = {};

  /** Get the resolved style (preset + user overrides) */
  getStyle(): SubtitleStyleConfig {
    const base =
      SUBTITLE_PRESETS[this.currentPreset] ?? SUBTITLE_PRESETS.default!;
    return { ...base, ...this.customOverrides };
  }

  setPreset(name: string) {
    if (name in SUBTITLE_PRESETS) {
      this.currentPreset = name;
      this.customOverrides = {}; // Reset overrides when switching preset
    }
  }

  getPresetName(): string {
    return this.currentPreset;
  }

  getPresetNames(): string[] {
    return Object.keys(SUBTITLE_PRESETS);
  }

  /** Apply custom overrides on top of the preset */
  setOverrides(overrides: Partial<SubtitleStyleConfig>) {
    this.customOverrides = { ...this.customOverrides, ...overrides };
  }

  /** Reset to preset defaults */
  resetOverrides() {
    this.customOverrides = {};
  }
}
