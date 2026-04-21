import { Disposables, OSDFeedback } from '../shared';

import { AudioEnhancer } from './AudioEnhancer';
import { VideoFilter, type VideoFilterState } from './VideoFilter';

/** HTMLVideoElement with audioTracks (not yet in standard lib types) */
interface AudioTrack {
  enabled: boolean;
  label: string;
  language: string;
}

interface AudioTrackList {
  readonly length: number;
  [index: number]: AudioTrack | undefined;
}

interface HTMLVideoElementWithAudioTracks extends HTMLVideoElement {
  audioTracks?: AudioTrackList;
}

export interface MediaSettingsPluginAPI {
  // Video filters
  setBrightness(v: number): void;
  setContrast(v: number): void;
  setSaturation(v: number): void;
  setWarmth(v: number): void;
  getFilterState(): VideoFilterState;
  resetFilters(): void;

  // Audio
  setVolume(percent: number): void;
  getVolume(): number;

  // Audio tracks
  getAudioTracks(): { index: number; label: string; language: string; enabled: boolean }[];
  setAudioTrack(index: number): void;

  dispose(): void;
}

export function createMediaSettingsPlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement
): MediaSettingsPluginAPI {
  const disposables = new Disposables();
  const osd = new OSDFeedback(containerEl);
  const videoFilter = new VideoFilter(videoEl);
  const audioEnhancer = new AudioEnhancer(videoEl);
  disposables.add(() => osd.dispose());
  disposables.add(() => videoFilter.dispose());
  disposables.add(() => audioEnhancer.dispose());

  return {
    setBrightness: (v) => {
      videoFilter.setBrightness(v);
      osd.show({ text: `\u2600 Brightness ${v}%` });
    },
    setContrast: (v) => {
      videoFilter.setContrast(v);
      osd.show({ text: `\u25D0 Contrast ${v}%` });
    },
    setSaturation: (v) => {
      videoFilter.setSaturation(v);
      osd.show({ text: `Saturation ${v}%` });
    },
    setWarmth: (v) => {
      videoFilter.setWarmth(v);
      osd.show({ text: `Warmth ${v}%` });
    },
    getFilterState: () => videoFilter.getState(),
    resetFilters: () => {
      videoFilter.reset();
      osd.show({ text: 'Filters Reset' });
    },

    setVolume: (p) => {
      audioEnhancer.setVolume(p);
      osd.show({ text: `\uD83D\uDD0A ${p}%` });
    },
    getVolume: () => audioEnhancer.getVolume(),

    getAudioTracks: () => {
      const el = videoEl as HTMLVideoElementWithAudioTracks;
      const tracks = el.audioTracks;
      if (!tracks) return [];
      const result: { index: number; label: string; language: string; enabled: boolean }[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (!t) continue;
        result.push({
          index: i,
          label: t.label || `Track ${i + 1}`,
          language: t.language || '',
          enabled: t.enabled,
        });
      }
      return result;
    },
    setAudioTrack: (index) => {
      const el = videoEl as HTMLVideoElementWithAudioTracks;
      const tracks = el.audioTracks;
      if (!tracks) return;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track) track.enabled = i === index;
      }
      const t = tracks[index];
      osd.show({ text: `\uD83D\uDD08 ${t?.label || `Track ${index + 1}`}` });
    },

    dispose: () => disposables.dispose(),
  };
}
