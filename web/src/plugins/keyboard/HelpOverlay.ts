import type { KeyBinding } from '@/lib/api/preferences';

import { Disposables } from '../shared';
import { ACTION_GROUPS, ACTION_LABELS } from './defaults';

export class HelpOverlay {
  private overlay: HTMLDivElement;
  private card: HTMLDivElement;
  private disposables = new Disposables();
  private visible = false;

  constructor(
    containerEl: HTMLElement,
    private getBindings: () => KeyBinding[],
    private bindingToString: (b: KeyBinding) => string
  ) {
    // Full-screen overlay
    this.overlay = document.createElement('div');
    const os = this.overlay.style;
    os.position = 'absolute';
    os.inset = '0';
    os.zIndex = '200';
    os.background = 'rgba(0, 0, 0, 0.8)';
    os.backdropFilter = 'blur(24px)';
    os.setProperty('-webkit-backdrop-filter', 'blur(24px)');
    os.display = 'none';
    os.justifyContent = 'center';
    os.alignItems = 'center';
    os.overflowY = 'auto';
    os.transition = 'opacity 200ms ease-out';
    os.opacity = '0';

    // Inner card
    this.card = document.createElement('div');
    const cs = this.card.style;
    cs.maxWidth = '600px';
    cs.width = '100%';
    cs.maxHeight = '80vh';
    cs.background = 'rgba(30, 30, 30, 0.9)';
    cs.borderRadius = '20px';
    cs.border = '1px solid rgba(255, 255, 255, 0.1)';
    cs.padding = '24px';
    cs.overflowY = 'auto';
    cs.scrollbarWidth = 'thin';
    cs.color = '#fff';

    this.overlay.appendChild(this.card);

    // Click backdrop to close
    this.disposables.addEventListener(this.overlay, 'click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    containerEl.appendChild(this.overlay);
  }

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  show() {
    this.rebuildContent();
    this.overlay.style.display = 'flex';
    // Force reflow
    void this.overlay.offsetWidth;
    this.overlay.style.opacity = '1';
    this.visible = true;
  }

  hide() {
    this.overlay.style.opacity = '0';
    setTimeout(() => {
      if (!this.visible) {
        this.overlay.style.display = 'none';
      }
    }, 200);
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  private rebuildContent() {
    this.card.innerHTML = '';
    const bindings = this.getBindings();
    const bindingMap = new Map<string, KeyBinding>();
    for (const b of bindings) {
      bindingMap.set(b.action, b);
    }

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Keyboard Shortcuts';
    title.style.textAlign = 'center';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.margin = '0 0 20px 0';
    this.card.appendChild(title);

    // Groups
    for (const [groupName, actions] of Object.entries(ACTION_GROUPS)) {
      // Group header
      const header = document.createElement('div');
      header.textContent = groupName;
      header.style.color = 'rgba(255, 255, 255, 0.6)';
      header.style.textTransform = 'uppercase';
      header.style.fontSize = '12px';
      header.style.letterSpacing = '0.08em';
      header.style.marginTop = '16px';
      header.style.marginBottom = '8px';
      this.card.appendChild(header);

      // Rows
      for (const action of actions) {
        const binding = bindingMap.get(action);
        if (!binding) continue;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '6px 0';

        const label = document.createElement('span');
        label.textContent = ACTION_LABELS[action] ?? action;
        label.style.fontSize = '14px';
        label.style.color = '#fff';

        const badge = document.createElement('span');
        badge.textContent = this.bindingToString(binding);
        badge.style.background = 'rgba(255, 255, 255, 0.1)';
        badge.style.borderRadius = '8px';
        badge.style.padding = '4px 8px';
        badge.style.fontFamily = 'monospace';
        badge.style.fontSize = '13px';
        badge.style.color = 'rgba(255, 255, 255, 0.9)';

        row.appendChild(label);
        row.appendChild(badge);
        this.card.appendChild(row);
      }
    }

    // Close hint
    const hint = document.createElement('div');
    hint.textContent = 'Press ? or Esc to close';
    hint.style.textAlign = 'center';
    hint.style.color = 'rgba(255, 255, 255, 0.4)';
    hint.style.fontSize = '12px';
    hint.style.marginTop = '20px';
    this.card.appendChild(hint);
  }

  dispose() {
    this.overlay.remove();
    this.disposables.dispose();
  }
}
