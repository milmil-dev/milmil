import type { KeyBinding } from '@/lib/api/preferences';

import { Disposables } from '../shared';
import { DEFAULT_BINDINGS } from './defaults';

export type ActionHandler = () => void;

export class KeyBindingManager {
  private bindings: KeyBinding[];
  private handlers = new Map<string, ActionHandler>();
  private disposables = new Disposables();
  private enabled = true;

  // Long-press state
  private longPressKey: string | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressActive = false;
  private onLongPressStart?: () => void;
  private onLongPressEnd?: () => void;

  constructor(containerEl: HTMLElement, customBindings?: KeyBinding[]) {
    // Merge custom bindings over defaults
    this.bindings = this.mergeBindings(DEFAULT_BINDINGS, customBindings ?? []);

    // Listen for keyboard events on the container
    this.disposables.addEventListener(containerEl, 'keydown', this.handleKeyDown);
    this.disposables.addEventListener(containerEl, 'keyup', this.handleKeyUp);

    // Make container focusable
    if (!containerEl.hasAttribute('tabindex')) {
      containerEl.setAttribute('tabindex', '-1');
    }
  }

  /** Register a handler for an action */
  on(action: string, handler: ActionHandler) {
    this.handlers.set(action, handler);
  }

  /** Register long-press handlers (e.g. for fast-forward) */
  onLongPress(key: string, start: () => void, end: () => void) {
    this.longPressKey = key;
    this.onLongPressStart = start;
    this.onLongPressEnd = end;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    // Ignore if typing in an input/textarea
    if (this.isInputFocused()) return;

    // Long-press detection for specific key (e.g. ArrowRight for fast-forward)
    if (this.longPressKey && e.key === this.longPressKey && !e.repeat) {
      this.longPressTimer = setTimeout(() => {
        this.longPressActive = true;
        this.onLongPressStart?.();
      }, 500); // 500ms threshold
    }

    // If long press is active, don't process normal bindings for that key
    if (this.longPressActive && e.key === this.longPressKey) {
      e.preventDefault();
      return;
    }

    // If this is a repeat of the long-press key and timer is pending, ignore
    if (e.repeat && e.key === this.longPressKey && this.longPressTimer) {
      e.preventDefault();
      return;
    }

    // Find matching binding
    const binding = this.findBinding(e);
    if (binding) {
      e.preventDefault();
      const handler = this.handlers.get(binding.action);
      handler?.();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    // Cancel long-press timer
    if (this.longPressKey && e.key === this.longPressKey) {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (this.longPressActive) {
        this.longPressActive = false;
        this.onLongPressEnd?.();
        return; // Don't trigger normal action after long-press
      }
    }
  };

  private findBinding(e: KeyboardEvent): KeyBinding | undefined {
    return this.bindings.find((b) => {
      if (b.key !== e.key) return false;
      const mods = b.modifiers ?? [];
      if (mods.includes('shift') !== e.shiftKey) return false;
      if (mods.includes('ctrl') !== e.ctrlKey) return false;
      if (mods.includes('alt') !== e.altKey) return false;
      if (mods.includes('meta') !== e.metaKey) return false;
      return true;
    });
  }

  private mergeBindings(defaults: KeyBinding[], custom: KeyBinding[]): KeyBinding[] {
    // Custom bindings override defaults by action name
    const map = new Map(defaults.map((b) => [b.action, b]));
    for (const b of custom) {
      map.set(b.action, b);
    }
    return Array.from(map.values());
  }

  /** Check for key binding conflicts */
  findConflicts(): Array<{ key: string; actions: string[] }> {
    const keyMap = new Map<string, string[]>();
    for (const b of this.bindings) {
      const keyStr = this.bindingToString(b);
      const existing = keyMap.get(keyStr) ?? [];
      existing.push(b.action);
      keyMap.set(keyStr, existing);
    }
    return Array.from(keyMap.entries())
      .filter(([, actions]) => actions.length > 1)
      .map(([key, actions]) => ({ key, actions }));
  }

  /** Format binding for display (e.g., "Shift+->") */
  bindingToString(b: KeyBinding): string {
    const parts = [
      ...(b.modifiers ?? []).map((m) => m.charAt(0).toUpperCase() + m.slice(1)),
      this.keyDisplayName(b.key),
    ];
    return parts.join('+');
  }

  private keyDisplayName(key: string): string {
    const names: Record<string, string> = {
      ' ': 'Space',
      ArrowLeft: '\u2190',
      ArrowRight: '\u2192',
      ArrowUp: '\u2191',
      ArrowDown: '\u2193',
      Backspace: '\u232B',
    };
    return names[key] ?? key.toUpperCase();
  }

  private isInputFocused(): boolean {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    );
  }

  updateBindings(custom: KeyBinding[]) {
    this.bindings = this.mergeBindings(DEFAULT_BINDINGS, custom);
  }

  getBindings(): KeyBinding[] {
    return [...this.bindings];
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  dispose() {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.disposables.dispose();
    this.handlers.clear();
  }
}
