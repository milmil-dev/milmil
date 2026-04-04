import { Disposables } from '../shared';
import type { SubtitleCue, SubtitleTrack } from './types';

/**
 * Parse WebVTT content into SubtitleCue[].
 * Handles the standard format: timestamps with `-->` separator and text lines.
 */
function parseVTTCues(vttContent: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalize line endings and split into blocks
  const blocks = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    // Find the line with the timestamp arrow
    let tsLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes('-->')) {
        tsLineIdx = i;
        break;
      }
    }
    if (tsLineIdx === -1) continue;

    const tsLine = lines[tsLineIdx]!;
    const match = tsLine.match(
      /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/
    );
    if (!match) continue;

    const toSeconds = (h: string | undefined, m: string, s: string, ms: string) => {
      const hours = h ? Number.parseInt(h.replace(':', ''), 10) : 0;
      return hours * 3600 + Number.parseInt(m, 10) * 60 + Number.parseInt(s, 10) + Number.parseInt(ms, 10) / 1000;
    };

    const startTime = toSeconds(match[1], match[2]!, match[3]!, match[4]!);
    const endTime = toSeconds(match[5], match[6]!, match[7]!, match[8]!);
    const text = lines
      .slice(tsLineIdx + 1)
      .join('\n')
      .trim();

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}

/** ISO 639-2/3 to 639-1 mapping for common anime languages */
const ISO_MAP: Record<string, string> = {
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
  tha: 'th',
  ind: 'id',
};

export class TrackManager {
  private tracks: SubtitleTrack[] = [];
  private activePrimaryIndex = -1;
  private activeSecondaryIndex = -1;
  private disposables = new Disposables();
  private cueCache = new Map<string, SubtitleCue[]>();
  private pollingActive = false;
  private rafId: number | null = null;

  // Subtitle delay in seconds
  private delay = 0;

  // Callbacks
  onTrackChange?: (primary: SubtitleTrack | null, secondary: SubtitleTrack | null) => void;
  onCuesUpdate?: (primaryCues: SubtitleCue[], secondaryCues: SubtitleCue[]) => void;

  constructor(
    private videoEl: HTMLVideoElement,
    private appLocale?: string
  ) {}

  /** Load tracks from API subtitle list */
  loadTracks(tracks: SubtitleTrack[]) {
    this.tracks = tracks;
    this.autoSelectPrimary();
  }

  /** Add a single track (e.g., from drag-drop) */
  addTrack(track: SubtitleTrack) {
    this.tracks.push(track);
  }

  getTracks(): SubtitleTrack[] {
    return this.tracks;
  }

  /** Select primary subtitle by index (-1 = off) */
  setPrimary(index: number) {
    this.activePrimaryIndex = index;
    this.onTrackChange?.(this.getPrimaryTrack(), this.getSecondaryTrack());
    if (index >= 0) {
      this.startCuePolling();
    } else if (this.activeSecondaryIndex < 0) {
      this.stopCuePolling();
      this.onCuesUpdate?.([], []);
    }
  }

  /** Select secondary subtitle by index (-1 = off) */
  setSecondary(index: number) {
    this.activeSecondaryIndex = index;
    this.onTrackChange?.(this.getPrimaryTrack(), this.getSecondaryTrack());
    if (index >= 0) {
      this.startCuePolling();
    } else if (this.activePrimaryIndex < 0) {
      this.stopCuePolling();
      this.onCuesUpdate?.([], []);
    }
  }

  getPrimaryTrack(): SubtitleTrack | null {
    return this.activePrimaryIndex >= 0 ? (this.tracks[this.activePrimaryIndex] ?? null) : null;
  }

  getSecondaryTrack(): SubtitleTrack | null {
    return this.activeSecondaryIndex >= 0 ? (this.tracks[this.activeSecondaryIndex] ?? null) : null;
  }

  /** Cycle to next track (for keyboard shortcut): off -> 0 -> 1 -> ... -> off */
  nextTrack() {
    const next = this.activePrimaryIndex + 1;
    this.setPrimary(next >= this.tracks.length ? -1 : next);
  }

  /**
   * Language matching logic (ported from WatchPage.tsx).
   * Scoring: exact locale match = 3, base language match = 2, ISO 639 mapped = 2, no match = 0.
   * Falls back to first track if nothing matches.
   */
  private autoSelectPrimary() {
    if (this.tracks.length === 0) return;

    const locale = (this.appLocale ?? 'zh-TW').toLowerCase();
    const localeBase = locale.split('-')[0] ?? locale;

    let bestIdx = 0;
    let bestScore = 0;

    for (let idx = 0; idx < this.tracks.length; idx++) {
      const sl = this.tracks[idx]!.language.toLowerCase();
      let score = 0;
      if (sl === locale) {
        score = 3;
      } else if (sl.startsWith(localeBase)) {
        score = 2;
      } else if (ISO_MAP[sl] === localeBase) {
        score = 2;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    this.setPrimary(bestIdx);
  }

  /** Fetch and parse cues for a track (with caching) */
  async getCues(track: SubtitleTrack): Promise<SubtitleCue[]> {
    const cacheKey = track.id;
    const cached = this.cueCache.get(cacheKey);
    if (cached) return cached;

    let content: string | undefined;

    if (track.content) {
      // Inline content (drag-drop)
      content = track.content;
    } else if (track.url) {
      // Fetch from server
      const response = await fetch(track.url);
      if (!response.ok) {
        console.warn(`[SubtitlePlugin] Failed to fetch track "${track.label}": ${response.status}`);
        return [];
      }
      content = await response.text();
    }

    if (!content) return [];

    let cues: SubtitleCue[];
    switch (track.format) {
      case 'vtt':
        cues = parseVTTCues(content);
        break;
      case 'ass':
      case 'ssa':
      case 'srt':
        // ASS/SSA/SRT parsers will be added in Task 7.
        // For now, attempt VTT parsing as the server converts to VTT on serve.
        cues = parseVTTCues(content);
        break;
      default:
        cues = [];
    }

    this.cueCache.set(cacheKey, cues);
    return cues;
  }

  /** Poll current time to emit active cues via requestAnimationFrame */
  private startCuePolling() {
    if (this.pollingActive) return;
    this.pollingActive = true;

    let lastPrimaryCueKey = '';
    let lastSecondaryCueKey = '';

    const poll = async () => {
      if (!this.pollingActive) return;

      const currentTime = this.videoEl.currentTime + this.delay;

      const filterActive = (cues: SubtitleCue[]): SubtitleCue[] =>
        cues.filter((c) => currentTime >= c.startTime && currentTime <= c.endTime);

      const primaryTrack = this.getPrimaryTrack();
      const secondaryTrack = this.getSecondaryTrack();

      const primaryCues = primaryTrack ? filterActive(await this.getCues(primaryTrack)) : [];
      const secondaryCues = secondaryTrack ? filterActive(await this.getCues(secondaryTrack)) : [];

      // Only notify if active cues changed (simple key: start+end of first cue)
      const pKey = primaryCues.map((c) => `${c.startTime}-${c.endTime}`).join('|');
      const sKey = secondaryCues.map((c) => `${c.startTime}-${c.endTime}`).join('|');

      if (pKey !== lastPrimaryCueKey || sKey !== lastSecondaryCueKey) {
        lastPrimaryCueKey = pKey;
        lastSecondaryCueKey = sKey;
        this.onCuesUpdate?.(primaryCues, secondaryCues);
      }

      this.rafId = requestAnimationFrame(poll);
    };

    this.rafId = requestAnimationFrame(poll);
  }

  private stopCuePolling() {
    this.pollingActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // --- Subtitle delay adjustment ---

  setDelay(seconds: number) {
    this.delay = seconds;
  }

  adjustDelay(delta: number) {
    this.delay += delta;
  }

  getDelay(): number {
    return this.delay;
  }

  dispose() {
    this.stopCuePolling();
    this.disposables.dispose();
    this.cueCache.clear();
    this.tracks = [];
    this.activePrimaryIndex = -1;
    this.activeSecondaryIndex = -1;
  }
}
