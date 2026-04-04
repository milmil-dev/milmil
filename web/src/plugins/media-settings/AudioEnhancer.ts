export class AudioEnhancer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private initialized = false;

  constructor(private videoEl: HTMLVideoElement) {}

  /** Lazy init — AudioContext requires user interaction first */
  private init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaElementSource(this.videoEl);
      this.gainNode = this.ctx.createGain();
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('AudioEnhancer: Failed to initialize', e);
    }
  }

  /** Set volume 0-200 (100 = normal, 200 = 2x boost) */
  setVolume(percent: number) {
    this.init();
    if (this.gainNode) {
      this.gainNode.gain.value = percent / 100;
    }
  }

  getVolume(): number {
    return this.gainNode ? Math.round(this.gainNode.gain.value * 100) : 100;
  }

  dispose() {
    this.source?.disconnect();
    this.gainNode?.disconnect();
    void this.ctx?.close();
  }
}
