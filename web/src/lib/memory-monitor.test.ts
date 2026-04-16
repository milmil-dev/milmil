import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryMonitor } from './memory-monitor';

// Stub window.matchMedia so MemoryMonitor constructor works in jsdom
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

// Stub performance.memory so the poll timer is NOT started (avoids real timers)
function stubPerformanceNoMemory() {
  Object.defineProperty(performance, 'memory', {
    writable: true,
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  stubMatchMedia(false);
  stubPerformanceNoMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MemoryMonitor', () => {
  it('starts in normal (non-pressured) state', () => {
    const monitor = new MemoryMonitor();
    expect(monitor.isPressured()).toBe(false);
    monitor.destroy();
  });

  it('detects pressure when active danmaku count reaches threshold (≥2000)', () => {
    const monitor = new MemoryMonitor();
    monitor.reportActiveDanmaku(1999);
    expect(monitor.isPressured()).toBe(false);

    monitor.reportActiveDanmaku(2000);
    expect(monitor.isPressured()).toBe(true);
    monitor.destroy();
  });

  it('returns to normal after 3 consecutive normal danmaku reports', () => {
    const monitor = new MemoryMonitor();

    // Enter pressure
    monitor.reportActiveDanmaku(2000);
    expect(monitor.isPressured()).toBe(true);

    // Two normal reports — still pressured
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);
    expect(monitor.isPressured()).toBe(true);

    // Third normal report — recovers
    monitor.reportActiveDanmaku(100);
    expect(monitor.isPressured()).toBe(false);
    monitor.destroy();
  });

  it('notifies subscribers when pressure begins', () => {
    const monitor = new MemoryMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);

    monitor.reportActiveDanmaku(2000);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('memory-pressure');
    monitor.destroy();
  });

  it('notifies subscribers on recovery to normal', () => {
    const monitor = new MemoryMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);

    // Trigger pressure
    monitor.reportActiveDanmaku(2000);
    expect(listener).toHaveBeenCalledWith('memory-pressure');

    // Recover
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);

    expect(listener).toHaveBeenCalledWith('memory-normal');
    expect(listener).toHaveBeenCalledTimes(2);
    monitor.destroy();
  });

  it('does not emit duplicate pressure events', () => {
    const monitor = new MemoryMonitor();
    const listener = vi.fn();
    monitor.subscribe(listener);

    monitor.reportActiveDanmaku(2000);
    monitor.reportActiveDanmaku(3000);
    monitor.reportActiveDanmaku(5000);

    // Should only fire once
    expect(listener).toHaveBeenCalledTimes(1);
    monitor.destroy();
  });

  it('resets normalCount when pressure is re-triggered during recovery', () => {
    const monitor = new MemoryMonitor();

    monitor.reportActiveDanmaku(2000); // pressure
    monitor.reportActiveDanmaku(100);  // +1 normal
    monitor.reportActiveDanmaku(100);  // +2 normal
    monitor.reportActiveDanmaku(2000); // pressure again → resets counter
    monitor.reportActiveDanmaku(100);  // +1 normal
    monitor.reportActiveDanmaku(100);  // +2 normal
    // Only 2 normal ticks since last pressure — still pressured
    expect(monitor.isPressured()).toBe(true);

    monitor.reportActiveDanmaku(100);  // +3 → recovers
    expect(monitor.isPressured()).toBe(false);
    monitor.destroy();
  });

  it('unsubscribe stops further notifications', () => {
    const monitor = new MemoryMonitor();
    const listener = vi.fn();
    const unsub = monitor.subscribe(listener);

    monitor.reportActiveDanmaku(2000); // pressure
    unsub();

    // Recover — listener should NOT fire for 'memory-normal'
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);
    monitor.reportActiveDanmaku(100);

    expect(listener).toHaveBeenCalledTimes(1); // only pressure
    monitor.destroy();
  });
});
