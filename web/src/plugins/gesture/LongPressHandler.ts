import type { Disposables } from '../shared';

const LONG_PRESS_THRESHOLD = 500; // ms
const CANCEL_MOVE_THRESHOLD = 15; // px

export class LongPressHandler {
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;

  constructor(containerEl: HTMLElement, disposables: Disposables) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isLongPressing = false;
    let startX = 0;
    let startY = 0;

    const isControlArea = (e: PointerEvent): boolean => {
      const target = e.target as HTMLElement;
      return (
        target.closest('[data-player-controls]') !== null ||
        target.closest('input') !== null ||
        target.closest('button') !== null ||
        target.closest('textarea') !== null
      );
    };

    const cancelTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const endLongPress = () => {
      cancelTimer();
      if (isLongPressing) {
        isLongPressing = false;
        this.onLongPressEnd?.();
      }
    };

    disposables.addEventListener(containerEl, 'pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (isControlArea(e)) return;

      startX = e.clientX;
      startY = e.clientY;

      cancelTimer();
      timer = setTimeout(() => {
        isLongPressing = true;
        timer = null;
        this.onLongPressStart?.();
      }, LONG_PRESS_THRESHOLD);
    });

    disposables.addEventListener(containerEl, 'pointermove', (e: PointerEvent) => {
      if (!timer && !isLongPressing) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > CANCEL_MOVE_THRESHOLD || dy > CANCEL_MOVE_THRESHOLD) {
        cancelTimer();
        // Don't end long press on move — only cancel the timer before it fires
      }
    });

    disposables.addEventListener(containerEl, 'pointerup', endLongPress);
    disposables.addEventListener(containerEl, 'pointercancel', endLongPress);
  }
}
