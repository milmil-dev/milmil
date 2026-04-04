import { Disposables } from '../shared';
import type { SubtitleCue, SubtitleStyleConfig } from './types';

export class SubtitleRenderer {
  private overlay: HTMLDivElement;
  private primaryContainer: HTMLDivElement;
  private secondaryContainer: HTMLDivElement;
  private disposables = new Disposables();
  private styleConfig: SubtitleStyleConfig;
  private currentPrimaryCues: SubtitleCue[] = [];
  private currentSecondaryCues: SubtitleCue[] = [];

  constructor(
    private containerEl: HTMLElement,
    initialStyle: SubtitleStyleConfig,
  ) {
    this.styleConfig = initialStyle;

    // Create overlay div — fills the video container, pointer-events: none
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '50',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      overflow: 'hidden',
    });

    // Secondary subtitle container (TOP area)
    this.secondaryContainer = this.createCueContainer('top');

    // Primary subtitle container (BOTTOM area)
    this.primaryContainer = this.createCueContainer('bottom');

    this.overlay.appendChild(this.secondaryContainer);
    this.overlay.appendChild(this.primaryContainer);
    this.containerEl.appendChild(this.overlay);
  }

  private createCueContainer(position: 'top' | 'bottom'): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: `0 ${this.styleConfig.safeMargin}%`,
      ...(position === 'bottom'
        ? { bottom: `${this.styleConfig.positionOffset}%` }
        : { top: `${this.styleConfig.positionOffset}%` }),
      transition: this.styleConfig.fadeAnimation
        ? 'opacity 150ms ease-out'
        : 'none',
    });
    return el;
  }

  /** Update primary cues (called by TrackManager via onCuesUpdate) */
  setPrimaryCues(cues: SubtitleCue[]) {
    if (this.areSameCues(this.currentPrimaryCues, cues)) return;
    this.currentPrimaryCues = cues;
    this.renderCues(this.primaryContainer, cues, false);
  }

  /** Update secondary cues */
  setSecondaryCues(cues: SubtitleCue[]) {
    if (this.areSameCues(this.currentSecondaryCues, cues)) return;
    this.currentSecondaryCues = cues;
    this.renderCues(this.secondaryContainer, cues, true);
  }

  private renderCues(
    container: HTMLDivElement,
    cues: SubtitleCue[],
    isSecondary: boolean,
  ) {
    // Clear existing
    container.innerHTML = '';

    if (cues.length === 0) {
      if (this.styleConfig.fadeAnimation) {
        container.style.opacity = '0';
      }
      return;
    }

    container.style.opacity = '1';

    for (const cue of cues) {
      const span = document.createElement('span');
      this.applyStyle(span, cue, isSecondary);
      span.innerHTML = this.sanitizeText(cue.text);
      container.appendChild(span);
    }
  }

  private applyStyle(
    el: HTMLSpanElement,
    cue: SubtitleCue,
    isSecondary: boolean,
  ) {
    const s = this.styleConfig;

    // If respectAssStyle and cue has ASS style data, use those instead
    if (s.respectAssStyle && cue.style) {
      this.applyAssStyle(el, cue);
      return;
    }

    const bgAlphaHex = Math.round(s.backgroundOpacity * 255)
      .toString(16)
      .padStart(2, '0');

    Object.assign(el.style, {
      fontFamily: s.fontFamily,
      fontSize: `${isSecondary ? s.fontSize * 0.85 : s.fontSize}px`,
      color: s.color,
      backgroundColor: `${s.backgroundColor}${bgAlphaHex}`,
      padding: '2px 8px',
      borderRadius: '4px',
      lineHeight: '1.4',
      textAlign: 'center',
      whiteSpace: 'pre-wrap',
      maxWidth: '80%',
      wordBreak: 'break-word',
      display: 'inline-block',
      marginBottom: '4px',
      ...this.getTextEffect(s),
    });
  }

  private getTextEffect(
    s: SubtitleStyleConfig,
  ): Partial<CSSStyleDeclaration> {
    switch (s.shadowType) {
      case 'outline':
        return {
          textShadow: [
            `-${s.strokeWidth}px -${s.strokeWidth}px 0 ${s.strokeColor}`,
            ` ${s.strokeWidth}px -${s.strokeWidth}px 0 ${s.strokeColor}`,
            `-${s.strokeWidth}px  ${s.strokeWidth}px 0 ${s.strokeColor}`,
            ` ${s.strokeWidth}px  ${s.strokeWidth}px 0 ${s.strokeColor}`,
          ].join(', '),
          webkitTextStroke: `${s.strokeWidth * 0.5}px ${s.strokeColor}`,
          paintOrder: 'stroke fill',
        };
      case 'drop-shadow':
        return { textShadow: `2px 2px 4px ${s.strokeColor}` };
      case 'raised':
        return {
          textShadow: `1px 1px 0 ${s.strokeColor}, 2px 2px 0 ${s.strokeColor}`,
        };
      case 'depressed':
        return {
          textShadow: `-1px -1px 0 ${s.strokeColor}, -2px -2px 0 ${s.strokeColor}`,
        };
      default:
        return {};
    }
  }

  private applyAssStyle(el: HTMLSpanElement, cue: SubtitleCue) {
    // Apply ASS-specific styles from cue.style map
    // This will be fully implemented in Task 7
    // For now, fall back to default style
    this.applyStyle(el, { ...cue, style: undefined }, false);
  }

  /** Sanitize text — allow basic tags (<i>, <b>, <u>), strip everything else */
  private sanitizeText(text: string): string {
    return (
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Restore allowed tags
        .replace(/&lt;(\/?(i|b|u|em|strong))&gt;/gi, '<$1>')
        // Convert newlines to <br>
        .replace(/\n/g, '<br>')
    );
  }

  private areSameCues(a: SubtitleCue[], b: SubtitleCue[]): boolean {
    if (a.length !== b.length) return false;
    return a.every(
      (c, i) => c.startTime === b[i]?.startTime && c.text === b[i]?.text,
    );
  }

  /** Update style config (called when user changes settings) */
  updateStyle(config: Partial<SubtitleStyleConfig>) {
    this.styleConfig = { ...this.styleConfig, ...config };
    // Re-apply positions based on new safeMargin/positionOffset
    this.primaryContainer.style.padding = `0 ${this.styleConfig.safeMargin}%`;
    this.primaryContainer.style.bottom = `${this.styleConfig.positionOffset}%`;
    this.secondaryContainer.style.padding = `0 ${this.styleConfig.safeMargin}%`;
    this.secondaryContainer.style.top = `${this.styleConfig.positionOffset}%`;
    // Re-render current cues with new style
    this.renderCues(this.primaryContainer, this.currentPrimaryCues, false);
    this.renderCues(this.secondaryContainer, this.currentSecondaryCues, true);
  }

  setVisible(visible: boolean) {
    this.overlay.style.display = visible ? 'flex' : 'none';
  }

  dispose() {
    this.overlay.remove();
    this.disposables.dispose();
  }
}
