export type MemoryEvent = 'memory-pressure' | 'memory-normal';
type Listener = (event: MemoryEvent) => void;

const HEAP_PRESSURE_THRESHOLD = 0.7;
const DANMAKU_PRESSURE_THRESHOLD = 2000;
const RECOVERY_COUNT = 3;

export class MemoryMonitor {
  private listeners: Set<Listener> = new Set();
  private pressured = false;
  private normalCount = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const mem = (performance as any).memory;
    if (mem) {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const interval = isMobile ? 30_000 : 60_000;
      this.pollTimer = setInterval(() => this.checkHeap(), interval);
    }
  }

  private checkHeap() {
    const mem = (performance as any).memory;
    if (!mem) return;
    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    if (ratio >= HEAP_PRESSURE_THRESHOLD) {
      this.setPressured(true);
    } else {
      this.tickNormal();
    }
  }

  reportActiveDanmaku(count: number) {
    if (count >= DANMAKU_PRESSURE_THRESHOLD) {
      this.setPressured(true);
    } else {
      this.tickNormal();
    }
  }

  private setPressured(value: boolean) {
    if (value) {
      this.normalCount = 0;
      if (!this.pressured) {
        this.pressured = true;
        this.notify('memory-pressure');
      }
    }
  }

  private tickNormal() {
    if (!this.pressured) return;
    this.normalCount++;
    if (this.normalCount >= RECOVERY_COUNT) {
      this.pressured = false;
      this.normalCount = 0;
      this.notify('memory-normal');
    }
  }

  private notify(event: MemoryEvent) {
    for (const fn of this.listeners) fn(event);
  }

  isPressured(): boolean {
    return this.pressured;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy() {
    this.listeners.clear();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
}
