/** Disposable pattern — collect cleanup functions */
export class Disposables {
  private fns: (() => void)[] = [];

  add(fn: () => void) {
    this.fns.push(fn);
  }

  /** Listen to an event on a target, auto-cleanup on dispose */
  addEventListener<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Document | Window,
    event: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ) {
    target.addEventListener(event, handler as EventListener, options);
    this.add(() => target.removeEventListener(event, handler as EventListener, options));
  }

  dispose() {
    for (const fn of this.fns) fn();
    this.fns = [];
  }
}

/** Format time for OSD display (e.g., "1:23:45", "3:05") */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
