export interface OSDOptions {
  icon?: string;
  text: string;
  duration?: number;
  position?: 'center' | 'top-right' | 'bottom-right';
}

const POSITION_STYLES: Record<NonNullable<OSDOptions['position']>, Partial<CSSStyleDeclaration>> = {
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'top-right': { top: '16px', right: '16px', left: '', transform: '' },
  'bottom-right': { bottom: '80px', right: '16px', top: '', left: '', transform: '' },
};

export class OSDFeedback {
  private container: HTMLDivElement;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    const s = this.container.style;
    s.position = 'absolute';
    s.zIndex = '100';
    s.pointerEvents = 'none';
    s.padding = '8px 16px';
    s.borderRadius = '12px';
    s.background = 'rgba(0, 0, 0, 0.5)';
    s.backdropFilter = 'blur(20px)';
    s.setProperty('-webkit-backdrop-filter', 'blur(20px)');
    s.color = '#fff';
    s.fontSize = '14px';
    s.fontWeight = '500';
    s.transition = 'opacity 300ms ease-out';
    s.opacity = '0';
    s.display = 'none';
    s.top = '50%';
    s.left = '50%';
    s.transform = 'translate(-50%, -50%)';
    s.whiteSpace = 'nowrap';

    parentEl.appendChild(this.container);
  }

  show(opts: OSDOptions) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    // Apply position
    const pos = opts.position ?? 'center';
    // Reset positional props first
    this.container.style.top = '';
    this.container.style.left = '';
    this.container.style.right = '';
    this.container.style.bottom = '';
    this.container.style.transform = '';

    const posStyles = POSITION_STYLES[pos];
    for (const [key, value] of Object.entries(posStyles)) {
      if (value !== undefined && typeof value === 'string') {
        this.container.style.setProperty(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
      }
    }

    // Set content
    const iconPart = opts.icon ? `<span style="margin-right:6px">${opts.icon}</span>` : '';
    this.container.innerHTML = `${iconPart}<span>${opts.text}</span>`;

    // Animate in
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    // Force reflow so the transition triggers
    void this.container.offsetWidth;
    this.container.style.opacity = '1';

    // Schedule fade-out
    const duration = opts.duration ?? 800;
    this.timeout = setTimeout(() => {
      this.container.style.opacity = '0';
      this.timeout = setTimeout(() => {
        this.container.style.display = 'none';
        this.timeout = null;
      }, 300);
    }, duration);
  }

  hide() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.container.style.opacity = '0';
    this.container.style.display = 'none';
  }

  dispose() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.container.remove();
  }
}
