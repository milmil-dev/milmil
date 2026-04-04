import { clamp } from '../shared';

export interface VideoFilterState {
  brightness: number; // 0-200, default 100
  contrast: number; // 0-200, default 100
  saturation: number; // 0-200, default 100
  warmth: number; // 0-100 (sepia), default 0
}

export class VideoFilter {
  private state: VideoFilterState = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    warmth: 0,
  };

  constructor(private videoEl: HTMLVideoElement) {}

  setBrightness(v: number) {
    this.state.brightness = clamp(v, 0, 200);
    this.apply();
  }

  setContrast(v: number) {
    this.state.contrast = clamp(v, 0, 200);
    this.apply();
  }

  setSaturation(v: number) {
    this.state.saturation = clamp(v, 0, 200);
    this.apply();
  }

  setWarmth(v: number) {
    this.state.warmth = clamp(v, 0, 100);
    this.apply();
  }

  getState(): VideoFilterState {
    return { ...this.state };
  }

  private apply() {
    this.videoEl.style.filter = [
      `brightness(${this.state.brightness}%)`,
      `contrast(${this.state.contrast}%)`,
      `saturate(${this.state.saturation}%)`,
      this.state.warmth > 0 ? `sepia(${this.state.warmth}%)` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  reset() {
    this.state = { brightness: 100, contrast: 100, saturation: 100, warmth: 0 };
    this.apply();
  }

  dispose() {
    this.videoEl.style.filter = '';
  }
}
