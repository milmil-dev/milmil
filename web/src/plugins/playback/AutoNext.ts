import { Disposables } from '../shared';

export class AutoNext {
  private disposables = new Disposables();
  private countdownEl: HTMLDivElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private remaining = 5;
  private cancelled = false;

  onNextEpisode?: () => void;
  onCountdownUpdate?: (remaining: number) => void;

  constructor(
    private containerEl: HTMLElement,
    private enabled: boolean = true
  ) {}

  /** Called when video ends */
  trigger() {
    if (!this.enabled) return;
    this.cancelled = false;
    this.remaining = 5;
    this.showCountdown();

    this.timer = setInterval(() => {
      if (this.cancelled) return;
      this.remaining--;
      this.onCountdownUpdate?.(this.remaining);
      this.updateCountdownUI();
      if (this.remaining <= 0) {
        this.hideCountdown();
        this.onNextEpisode?.();
      }
    }, 1000);
  }

  cancel() {
    this.cancelled = true;
    if (this.timer) clearInterval(this.timer);
    this.hideCountdown();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  private showCountdown() {
    // Create IINA-style frosted glass card in bottom-right
    this.countdownEl = document.createElement('div');
    Object.assign(this.countdownEl.style, {
      position: 'absolute',
      bottom: '80px',
      right: '24px',
      zIndex: '100',
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '16px 20px',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '14px',
      transition: 'opacity 300ms ease-out',
    });

    // Countdown circle (SVG)
    const svg = this.createCountdownSVG();

    // Text + cancel button
    const textDiv = document.createElement('div');
    textDiv.innerHTML = `
      <div style="font-weight:600;margin-bottom:4px">Next Episode</div>
      <div style="color:rgba(255,255,255,0.6);font-size:12px">Starting in ${this.remaining}s</div>
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      borderRadius: '8px',
      color: '#fff',
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '12px',
    });
    cancelBtn.addEventListener('click', () => this.cancel());

    this.countdownEl.appendChild(svg);
    this.countdownEl.appendChild(textDiv);
    this.countdownEl.appendChild(cancelBtn);
    this.containerEl.appendChild(this.countdownEl);
  }

  private createCountdownSVG(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
    svg.setAttribute('viewBox', '0 0 40 40');

    const bg = document.createElementNS(ns, 'circle');
    bg.setAttribute('cx', '20');
    bg.setAttribute('cy', '20');
    bg.setAttribute('r', '17');
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    bg.setAttribute('stroke-width', '3');

    const progress = document.createElementNS(ns, 'circle');
    progress.setAttribute('cx', '20');
    progress.setAttribute('cy', '20');
    progress.setAttribute('r', '17');
    progress.setAttribute('fill', 'none');
    progress.setAttribute('stroke', '#fff');
    progress.setAttribute('stroke-width', '3');
    progress.setAttribute('stroke-dasharray', `${2 * Math.PI * 17}`);
    progress.setAttribute('stroke-dashoffset', '0');
    progress.setAttribute('transform', 'rotate(-90 20 20)');
    progress.style.transition = 'stroke-dashoffset 1s linear';
    progress.id = 'countdown-progress';

    svg.appendChild(bg);
    svg.appendChild(progress);
    return svg;
  }

  private updateCountdownUI() {
    if (!this.countdownEl) return;
    const textEl = this.countdownEl.querySelector('div > div:last-child');
    if (textEl) textEl.textContent = `Starting in ${this.remaining}s`;

    const progress = this.countdownEl.querySelector(
      '#countdown-progress'
    ) as SVGCircleElement | null;
    if (progress) {
      const circumference = 2 * Math.PI * 17;
      const offset = circumference * (1 - this.remaining / 5);
      progress.setAttribute('stroke-dashoffset', String(offset));
    }
  }

  private hideCountdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.countdownEl) {
      this.countdownEl.style.opacity = '0';
      const el = this.countdownEl;
      setTimeout(() => el.remove(), 300);
      this.countdownEl = null;
    }
  }

  dispose() {
    this.cancel();
    this.disposables.dispose();
  }
}
