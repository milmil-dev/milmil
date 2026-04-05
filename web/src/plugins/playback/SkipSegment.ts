import { Disposables } from '../shared';

export interface SegmentMark {
  id: string;
  media_file_id: string;
  type: 'op' | 'ed' | 'recap' | 'preview';
  start_time: number;
  end_time: number;
  source: string;
}

export class SkipSegment {
  private disposables = new Disposables();
  private segments: SegmentMark[] = [];
  private skipButton: HTMLButtonElement | null = null;
  private autoSkip = { op: false, ed: false };
  private rafId: number | null = null;
  private currentSegment: SegmentMark | null = null;

  constructor(
    private videoEl: HTMLVideoElement,
    private containerEl: HTMLElement,
  ) {
    this.startMonitoring();
  }

  setSegments(segments: SegmentMark[]) {
    this.segments = segments;
  }

  setAutoSkip(op: boolean, ed: boolean) {
    this.autoSkip = { op, ed };
  }

  private startMonitoring() {
    const check = () => {
      const t = this.videoEl.currentTime;
      const seg = this.segments.find((s) => t >= s.start_time && t < s.end_time);

      if (seg && seg !== this.currentSegment) {
        this.currentSegment = seg;
        // Auto-skip if enabled
        if (
          (seg.type === 'op' && this.autoSkip.op) ||
          (seg.type === 'ed' && this.autoSkip.ed)
        ) {
          this.videoEl.currentTime = seg.end_time;
          this.currentSegment = null;
        } else {
          this.showSkipButton(seg);
        }
      } else if (!seg && this.currentSegment) {
        this.currentSegment = null;
        this.hideSkipButton();
      }

      this.rafId = requestAnimationFrame(check);
    };
    this.rafId = requestAnimationFrame(check);
  }

  private showSkipButton(seg: SegmentMark) {
    if (this.skipButton) return;

    const label =
      seg.type === 'op'
        ? 'Skip Intro'
        : seg.type === 'ed'
          ? 'Skip Ending'
          : `Skip ${seg.type}`;

    this.skipButton = document.createElement('button');
    this.skipButton.textContent = label;
    Object.assign(this.skipButton.style, {
      position: 'absolute',
      bottom: '80px',
      right: '24px',
      zIndex: '100',
      background: 'rgba(255,255,255,0.2)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '8px',
      color: '#fff',
      padding: '8px 20px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'opacity 200ms ease-out, background 150ms',
      opacity: '0',
    });

    this.skipButton.addEventListener('mouseenter', () => {
      if (this.skipButton) this.skipButton.style.background = 'rgba(255,255,255,0.3)';
    });
    this.skipButton.addEventListener('mouseleave', () => {
      if (this.skipButton) this.skipButton.style.background = 'rgba(255,255,255,0.2)';
    });
    this.skipButton.addEventListener('click', () => {
      this.videoEl.currentTime = seg.end_time;
      this.hideSkipButton();
    });

    this.containerEl.appendChild(this.skipButton);
    requestAnimationFrame(() => {
      if (this.skipButton) this.skipButton.style.opacity = '1';
    });
  }

  private hideSkipButton() {
    if (!this.skipButton) return;
    const btn = this.skipButton;
    btn.style.opacity = '0';
    setTimeout(() => btn.remove(), 200);
    this.skipButton = null;
  }

  /** Get segments for progress bar visualization */
  getSegments(): SegmentMark[] {
    return this.segments;
  }

  dispose() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.hideSkipButton();
    this.disposables.dispose();
  }
}
