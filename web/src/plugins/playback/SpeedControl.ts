import { clamp } from '../shared';

export class SpeedControl {
  private savedSpeed = 1;

  constructor(private videoEl: HTMLVideoElement) {}

  set(speed: number) {
    this.videoEl.playbackRate = clamp(speed, 0.25, 4);
  }

  get(): number {
    return this.videoEl.playbackRate;
  }

  increase(step: number = 0.25) {
    this.set(this.get() + step);
    return this.get();
  }

  decrease(step: number = 0.25) {
    this.set(this.get() - step);
    return this.get();
  }

  reset() {
    this.set(1);
  }

  /** For long-press fast forward */
  startFastForward(multiplier: number = 3) {
    this.savedSpeed = this.get();
    this.set(multiplier);
  }

  stopFastForward() {
    this.set(this.savedSpeed);
  }
}
