import type { Disposables } from '../shared';

const DOUBLE_TAP_TIMEOUT = 300; // ms

type TapRegion = 'left' | 'center' | 'right';

export class TapHandler {
  onPlayPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onFullscreen?: () => void;

  constructor(containerEl: HTMLElement, disposables: Disposables) {
    let tapCount = 0;
    let tapRegion: TapRegion | null = null;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let pointerDownPos: { x: number; y: number } | null = null;

    const isControlArea = (e: PointerEvent): boolean => {
      const target = e.target as HTMLElement;
      return (
        target.closest('[data-player-controls]') !== null ||
        target.closest('input') !== null ||
        target.closest('button') !== null ||
        target.closest('textarea') !== null
      );
    };

    const getRegion = (e: PointerEvent): TapRegion => {
      const rect = containerEl.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      if (relX < 1 / 3) return 'left';
      if (relX > 2 / 3) return 'right';
      return 'center';
    };

    const resetTaps = () => {
      tapCount = 0;
      tapRegion = null;
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
      }
    };

    const commitTaps = () => {
      const count = tapCount;
      const region = tapRegion;
      resetTaps();

      if (count === 1 && region === 'center') {
        this.onPlayPause?.();
      } else if (count >= 2) {
        if (region === 'left') this.onSeekBackward?.();
        else if (region === 'right') this.onSeekForward?.();
        else if (region === 'center') this.onFullscreen?.();
      }
    };

    // Track pointer down position to distinguish taps from drags
    disposables.addEventListener(containerEl, 'pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isControlArea(e)) return;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    disposables.addEventListener(containerEl, 'pointerup', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isControlArea(e)) return;
      if (!pointerDownPos) return;

      // Ignore if pointer moved too far (it was a swipe, not a tap)
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        pointerDownPos = null;
        return;
      }
      pointerDownPos = null;

      const region = getRegion(e);

      if (tapTimer && tapRegion === region) {
        // Same region as previous tap — increment count
        tapCount++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(commitTaps, DOUBLE_TAP_TIMEOUT);
      } else {
        // New tap sequence
        resetTaps();
        tapCount = 1;
        tapRegion = region;
        tapTimer = setTimeout(commitTaps, DOUBLE_TAP_TIMEOUT);
      }
    });
  }
}
