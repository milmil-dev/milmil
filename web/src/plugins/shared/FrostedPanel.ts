export interface FrostedPanelOptions {
  width?: number;
  maxHeight?: number;
  position?: 'bottom-right' | 'bottom-center' | 'center';
  onClose?: () => void;
}

const PANEL_POSITIONS: Record<
  NonNullable<FrostedPanelOptions['position']>,
  Partial<CSSStyleDeclaration>
> = {
  'bottom-right': { bottom: '60px', right: '16px' },
  'bottom-center': { bottom: '60px', left: '50%', transform: 'translateX(-50%) scale(1)' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(1)' },
};

const PANEL_HIDDEN_TRANSFORMS: Record<NonNullable<FrostedPanelOptions['position']>, string> = {
  'bottom-right': 'scale(0.95)',
  'bottom-center': 'translateX(-50%) scale(0.95)',
  center: 'translate(-50%, -50%) scale(0.95)',
};

export class FrostedPanel {
  protected panel: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private isVisible = false;
  private opts: FrostedPanelOptions;

  constructor(parentEl: HTMLElement, opts?: FrostedPanelOptions) {
    this.opts = opts ?? {};
    const position = this.opts.position ?? 'bottom-right';
    const width = this.opts.width ?? 320;
    const maxHeight = this.opts.maxHeight ?? 400;

    // Backdrop — transparent click catcher
    this.backdrop = document.createElement('div');
    this.backdrop.style.position = 'absolute';
    this.backdrop.style.inset = '0';
    this.backdrop.style.zIndex = '199';
    this.backdrop.style.display = 'none';
    this.backdrop.addEventListener('click', () => this.hide());

    // Panel
    this.panel = document.createElement('div');
    const ps = this.panel.style;
    ps.position = 'absolute';
    ps.zIndex = '200';
    ps.width = `${width}px`;
    ps.maxHeight = `${maxHeight}px`;
    ps.background = 'rgba(20, 20, 20, 0.85)';
    ps.backdropFilter = 'blur(24px)';
    ps.setProperty('-webkit-backdrop-filter', 'blur(24px)');
    ps.border = '1px solid rgba(255, 255, 255, 0.1)';
    ps.borderRadius = '16px';
    ps.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
    ps.overflowY = 'auto';
    ps.scrollbarWidth = 'thin';
    ps.padding = '16px';
    ps.transition = 'opacity 200ms ease-out, transform 200ms ease-out';
    ps.opacity = '0';
    ps.transform = PANEL_HIDDEN_TRANSFORMS[position];
    ps.display = 'none';
    ps.color = '#fff';
    ps.fontSize = '13px';

    // Apply position styles
    const posStyles = PANEL_POSITIONS[position];
    for (const [key, value] of Object.entries(posStyles)) {
      if (value !== undefined && typeof value === 'string') {
        ps.setProperty(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value);
      }
    }

    parentEl.appendChild(this.backdrop);
    parentEl.appendChild(this.panel);
  }

  show() {
    if (this.isVisible) return;
    this.isVisible = true;

    this.backdrop.style.display = 'block';
    this.panel.style.display = 'block';

    // Force reflow
    void this.panel.offsetWidth;

    this.panel.style.opacity = '1';
    const position = this.opts.position ?? 'bottom-right';
    const visibleTransform = PANEL_POSITIONS[position].transform;
    this.panel.style.transform = visibleTransform ?? 'scale(1)';
  }

  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;

    const position = this.opts.position ?? 'bottom-right';
    this.panel.style.opacity = '0';
    this.panel.style.transform = PANEL_HIDDEN_TRANSFORMS[position];

    // Wait for transition to finish before hiding
    setTimeout(() => {
      if (!this.isVisible) {
        this.panel.style.display = 'none';
        this.backdrop.style.display = 'none';
      }
    }, 200);

    this.opts.onClose?.();
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  setContent(html: string) {
    this.panel.innerHTML = html;
  }

  appendElement(el: HTMLElement) {
    this.panel.appendChild(el);
  }

  dispose() {
    this.backdrop.remove();
    this.panel.remove();
  }
}
