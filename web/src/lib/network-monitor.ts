export type NetworkProfile = 'fast' | 'medium' | 'slow';

type Listener = (profile: NetworkProfile) => void;

const FAST_THRESHOLD = 10; // Mbps
const SLOW_THRESHOLD = 2;

export class NetworkMonitor {
  private listeners: Set<Listener> = new Set();
  private currentProfile: NetworkProfile = 'medium';
  private segmentSpeeds: number[] = [];
  private connectionHandler: (() => void) | null = null;

  constructor() {
    this.initConnectionAPI();
  }

  private initConnectionAPI() {
    const conn = (navigator as any).connection;
    if (!conn) return;
    this.connectionHandler = () => {
      const newProfile = this.profileFromConnection(conn);
      this.updateProfile(newProfile);
    };
    conn.addEventListener('change', this.connectionHandler);
    this.currentProfile = this.profileFromConnection(conn);
  }

  private profileFromConnection(conn: any): NetworkProfile {
    const downlink = conn.downlink as number | undefined;
    if (downlink === undefined) return 'medium';
    if (downlink >= FAST_THRESHOLD) return 'fast';
    if (downlink <= SLOW_THRESHOLD) return 'slow';
    return 'medium';
  }

  recordSegmentDownload(bytes: number, durationMs: number) {
    if (durationMs <= 0) return;
    const mbps = (bytes * 8) / (durationMs / 1000) / 1_000_000;
    this.segmentSpeeds.push(mbps);
    if (this.segmentSpeeds.length > 5) this.segmentSpeeds.shift();
    if ((navigator as any).connection) return;
    const avg = this.segmentSpeeds.reduce((a, b) => a + b, 0) / this.segmentSpeeds.length;
    const newProfile: NetworkProfile =
      avg >= FAST_THRESHOLD ? 'fast' : avg <= SLOW_THRESHOLD ? 'slow' : 'medium';
    this.updateProfile(newProfile);
  }

  private updateProfile(profile: NetworkProfile) {
    if (profile === this.currentProfile) return;
    this.currentProfile = profile;
    for (const fn of this.listeners) fn(profile);
  }

  getProfile(): NetworkProfile {
    return this.currentProfile;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy() {
    this.listeners.clear();
    if (this.connectionHandler) {
      (navigator as any).connection?.removeEventListener('change', this.connectionHandler);
    }
  }
}
