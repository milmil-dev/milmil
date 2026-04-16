import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkMonitor, type NetworkProfile } from './network-monitor';

// Helper: bytes for a given Mbps over durationMs
function bytesForMbps(mbps: number, durationMs: number): number {
  return (mbps * 1_000_000 * (durationMs / 1000)) / 8;
}

describe('NetworkMonitor', () => {
  let originalNavigator: any;

  beforeEach(() => {
    originalNavigator = (globalThis as any).navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  function setNavigatorConnection(conn: any) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...((globalThis as any).navigator ?? {}), connection: conn },
      writable: true,
      configurable: true,
    });
  }

  function clearNavigatorConnection() {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...((globalThis as any).navigator ?? {}), connection: undefined },
      writable: true,
      configurable: true,
    });
  }

  it('returns medium when navigator.connection is unavailable', () => {
    clearNavigatorConnection();
    const monitor = new NetworkMonitor();
    expect(monitor.getProfile()).toBe('medium');
    monitor.destroy();
  });

  it('records slow segment downloads and transitions profile to slow', () => {
    clearNavigatorConnection();
    const monitor = new NetworkMonitor();

    // Record 5 slow segments (0.5 Mbps each)
    const durationMs = 1000;
    const bytes = bytesForMbps(0.5, durationMs);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(bytes, durationMs);
    }

    expect(monitor.getProfile()).toBe('slow');
    monitor.destroy();
  });

  it('records fast segment downloads and transitions profile to fast', () => {
    clearNavigatorConnection();
    const monitor = new NetworkMonitor();

    // Record 5 fast segments (20 Mbps each)
    const durationMs = 1000;
    const bytes = bytesForMbps(20, durationMs);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(bytes, durationMs);
    }

    expect(monitor.getProfile()).toBe('fast');
    monitor.destroy();
  });

  it('notifies subscribers on profile change', () => {
    clearNavigatorConnection();
    const monitor = new NetworkMonitor();
    const received: NetworkProfile[] = [];
    const unsub = monitor.subscribe((p) => received.push(p));

    // Push slow segments
    const durationMs = 1000;
    const slowBytes = bytesForMbps(0.5, durationMs);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(slowBytes, durationMs);
    }

    expect(received).toContain('slow');

    // Push fast segments to flip to fast
    const fastBytes = bytesForMbps(20, durationMs);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(fastBytes, durationMs);
    }

    expect(received).toContain('fast');

    unsub();
    monitor.destroy();
  });

  it('does not notify after unsubscribe', () => {
    clearNavigatorConnection();
    const monitor = new NetworkMonitor();
    const received: NetworkProfile[] = [];
    const unsub = monitor.subscribe((p) => received.push(p));
    unsub();

    const durationMs = 1000;
    const slowBytes = bytesForMbps(0.5, durationMs);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(slowBytes, durationMs);
    }

    expect(received).toHaveLength(0);
    monitor.destroy();
  });

  it('uses Connection API when available and ignores segment speeds', () => {
    const listeners: Array<() => void> = [];
    const mockConn = {
      downlink: 15, // fast
      addEventListener: vi.fn((_: string, fn: () => void) => listeners.push(fn)),
      removeEventListener: vi.fn(),
    };
    setNavigatorConnection(mockConn);

    const monitor = new NetworkMonitor();
    // Should pick up fast from Connection API immediately
    expect(monitor.getProfile()).toBe('fast');

    // Simulate connection change to slow
    mockConn.downlink = 1;
    listeners.forEach((fn) => fn());
    expect(monitor.getProfile()).toBe('slow');

    // Recording segments when Connection API is present should not override
    const fastBytes = bytesForMbps(20, 1000);
    for (let i = 0; i < 5; i++) {
      monitor.recordSegmentDownload(fastBytes, 1000);
    }
    // Still slow because Connection API is authoritative
    expect(monitor.getProfile()).toBe('slow');

    monitor.destroy();
    expect(mockConn.removeEventListener).toHaveBeenCalled();
  });
});
