import { Disposables, OSDFeedback } from '../shared';
import { StyleEngine } from './StyleEngine';
import { SubtitleRenderer } from './SubtitleRenderer';
import { TrackManager } from './TrackManager';
import type { SubtitleStyleConfig, SubtitleTrack } from './types';

export interface SubtitlePluginAPI {
  loadTracks(tracks: SubtitleTrack[]): void;
  addTrack(track: SubtitleTrack): void;
  getTracks(): SubtitleTrack[];
  setPrimary(index: number): void;
  setSecondary(index: number): void;
  getPrimaryTrack(): SubtitleTrack | null;
  getSecondaryTrack(): SubtitleTrack | null;
  nextTrack(): void;
  setDelay(seconds: number): void;
  adjustDelay(delta: number): void;
  getDelay(): number;
  // Renderer & style
  updateStyle(config: Partial<SubtitleStyleConfig>): void;
  setPreset(name: string): void;
  getPresetName(): string;
  getPresetNames(): string[];
  toggle(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/**
 * Create the SubtitlePlugin — manages subtitle track loading, switching,
 * cue polling, DOM overlay rendering, and style presets.
 */
export function createSubtitlePlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement,
  appLocale?: string,
  initialStyle?: Partial<SubtitleStyleConfig>,
): SubtitlePluginAPI {
  const disposables = new Disposables();
  const trackManager = new TrackManager(videoEl, appLocale);
  const osd = new OSDFeedback(containerEl);
  const styleEngine = new StyleEngine();

  // Apply initial style overrides (e.g., from preferences store)
  if (initialStyle) {
    styleEngine.setOverrides(initialStyle);
  }

  const renderer = new SubtitleRenderer(containerEl, styleEngine.getStyle());

  // Wire TrackManager cue updates to the renderer
  trackManager.onCuesUpdate = (primaryCues, secondaryCues) => {
    renderer.setPrimaryCues(primaryCues);
    renderer.setSecondaryCues(secondaryCues);
  };

  disposables.add(() => osd.dispose());
  disposables.add(() => trackManager.dispose());
  disposables.add(() => renderer.dispose());

  let visible = true;

  return {
    loadTracks: (tracks) => trackManager.loadTracks(tracks),
    addTrack: (track) => trackManager.addTrack(track),
    getTracks: () => trackManager.getTracks(),
    setPrimary: (i) => trackManager.setPrimary(i),
    setSecondary: (i) => trackManager.setSecondary(i),
    getPrimaryTrack: () => trackManager.getPrimaryTrack(),
    getSecondaryTrack: () => trackManager.getSecondaryTrack(),
    nextTrack: () => {
      trackManager.nextTrack();
      const t = trackManager.getPrimaryTrack();
      osd.show({ text: t ? `Subtitle: ${t.label}` : 'Subtitles Off' });
    },
    setDelay: (s) => trackManager.setDelay(s),
    adjustDelay: (d) => {
      trackManager.adjustDelay(d);
      osd.show({
        text: `Subtitle Delay: ${trackManager.getDelay().toFixed(1)}s`,
      });
    },
    getDelay: () => trackManager.getDelay(),

    // Style & rendering
    updateStyle: (config) => {
      styleEngine.setOverrides(config);
      renderer.updateStyle(styleEngine.getStyle());
    },
    setPreset: (name) => {
      styleEngine.setPreset(name);
      renderer.updateStyle(styleEngine.getStyle());
      osd.show({ text: `Subtitle Style: ${name}` });
    },
    getPresetName: () => styleEngine.getPresetName(),
    getPresetNames: () => styleEngine.getPresetNames(),
    toggle: () => {
      visible = !visible;
      renderer.setVisible(visible);
      osd.show({ text: visible ? 'Subtitles On' : 'Subtitles Off' });
    },
    setVisible: (v) => {
      visible = v;
      renderer.setVisible(v);
    },

    dispose: () => {
      disposables.dispose();
    },
  };
}
