import { Disposables } from '../shared';

export type ABLoopState = 'idle' | 'a-set' | 'looping';

export class ABLoop {
  private state: ABLoopState = 'idle';
  private pointA: number = 0;
  private pointB: number = 0;
  private disposables = new Disposables();
  private rafId: number | null = null;

  onStateChange?: (state: ABLoopState, a: number, b: number) => void;

  constructor(private videoEl: HTMLVideoElement) {}

  toggle() {
    switch (this.state) {
      case 'idle':
        this.pointA = this.videoEl.currentTime;
        this.state = 'a-set';
        break;
      case 'a-set':
        this.pointB = this.videoEl.currentTime;
        if (this.pointB <= this.pointA) {
          // B must be after A
          this.state = 'idle';
          break;
        }
        this.state = 'looping';
        this.startLoop();
        break;
      case 'looping':
        this.clear();
        break;
    }
    this.onStateChange?.(this.state, this.pointA, this.pointB);
  }

  private startLoop() {
    const check = () => {
      if (this.state !== 'looping') return;
      if (this.videoEl.currentTime >= this.pointB) {
        this.videoEl.currentTime = this.pointA;
      }
      this.rafId = requestAnimationFrame(check);
    };
    this.rafId = requestAnimationFrame(check);
  }

  clear() {
    this.state = 'idle';
    this.pointA = 0;
    this.pointB = 0;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  getState() {
    return { state: this.state, a: this.pointA, b: this.pointB };
  }

  dispose() {
    this.clear();
    this.disposables.dispose();
  }
}
