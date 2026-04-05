import { clamp, Disposables } from '../shared';

const ACTIVATION_THRESHOLD = 10; // px before swipe activates
const MAX_SEEK_SECONDS = 120;
const SEEK_PX_PER_SECOND = 4; // px of horizontal drag per second of seek

export class SwipeHandler {
  private startX = 0;
  private startY = 0;
  private active = false;
  private direction: 'horizontal' | 'vertical-left' | 'vertical-right' | null = null;
  private sensitivity = 1;

  onSeek?: (deltaSeconds: number) => void;
  onSeekCommit?: (deltaSeconds: number) => void;
  onVolumeChange?: (delta: number) => void;
  onBrightnessChange?: (delta: number) => void;

  constructor(containerEl: HTMLElement, disposables: Disposables) {
    let pointerId: number | null = null;

    const isControlArea = (e: PointerEvent): boolean => {
      const target = e.target as HTMLElement;
      return (
        target.closest('[data-player-controls]') !== null ||
        target.closest('input') !== null ||
        target.closest('button') !== null ||
        target.closest('textarea') !== null
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isControlArea(e)) return;
      if (pointerId !== null) return;

      pointerId = e.pointerId;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.active = false;
      this.direction = null;

      // Determine which half of the container the pointer started in
      const rect = containerEl.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const isLeftHalf = relativeX < rect.width / 2;

      containerEl.setPointerCapture(e.pointerId);

      const onPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        const dx = ev.clientX - this.startX;
        const dy = ev.clientY - this.startY;

        if (!this.active) {
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx < ACTIVATION_THRESHOLD && absDy < ACTIVATION_THRESHOLD) return;

          // Determine swipe direction
          if (absDx > absDy) {
            this.direction = 'horizontal';
          } else {
            this.direction = isLeftHalf ? 'vertical-left' : 'vertical-right';
          }
          this.active = true;
        }

        if (this.direction === 'horizontal') {
          const deltaSeconds = clamp(
            (dx / SEEK_PX_PER_SECOND) * this.sensitivity,
            -MAX_SEEK_SECONDS,
            MAX_SEEK_SECONDS,
          );
          this.onSeek?.(deltaSeconds);
        } else if (this.direction === 'vertical-right') {
          // Invert: dragging up = positive delta
          const delta = clamp((-dy / containerEl.clientHeight) * 2 * this.sensitivity, -1, 1);
          this.onVolumeChange?.(delta);
        } else if (this.direction === 'vertical-left') {
          const delta = clamp((-dy / containerEl.clientHeight) * 2 * this.sensitivity, -1, 1);
          this.onBrightnessChange?.(delta);
        }
      };

      const onPointerUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        if (this.active && this.direction === 'horizontal') {
          const dx = ev.clientX - this.startX;
          const deltaSeconds = clamp(
            (dx / SEEK_PX_PER_SECOND) * this.sensitivity,
            -MAX_SEEK_SECONDS,
            MAX_SEEK_SECONDS,
          );
          this.onSeekCommit?.(deltaSeconds);
        }

        this.active = false;
        this.direction = null;
        pointerId = null;
        containerEl.removeEventListener('pointermove', onPointerMove);
        containerEl.removeEventListener('pointerup', onPointerUp);
        containerEl.removeEventListener('pointercancel', onPointerUp);
      };

      containerEl.addEventListener('pointermove', onPointerMove);
      containerEl.addEventListener('pointerup', onPointerUp);
      containerEl.addEventListener('pointercancel', onPointerUp);
    };

    disposables.addEventListener(containerEl, 'pointerdown', onPointerDown);
  }

  setSensitivity(value: number) {
    this.sensitivity = value;
  }

  isActive(): boolean {
    return this.active;
  }
}
