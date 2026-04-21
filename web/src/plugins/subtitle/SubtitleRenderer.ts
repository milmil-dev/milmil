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
    initialStyle: SubtitleStyleConfig
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

    // Secondary subtitle container (opposite end from primary)
    this.secondaryContainer = this.createCueContainer('secondary');

    // Primary subtitle container (follows position setting)
    this.primaryContainer = this.createCueContainer('primary');

    this.overlay.appendChild(this.secondaryContainer);
    this.overlay.appendChild(this.primaryContainer);
    this.containerEl.appendChild(this.overlay);
  }

  private createCueContainer(role: 'primary' | 'secondary'): HTMLDivElement {
    const el = document.createElement('div');
    const s = this.styleConfig;
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: `0 ${s.safeMargin}%`,
      transition: s.fadeAnimation ? 'opacity 150ms ease-out' : 'none',
    });

    if (role === 'primary') {
      // Primary follows the user's position setting
      if (s.position === 'top') {
        el.style.top = `${s.positionOffset}%`;
      } else if (s.position === 'center') {
        el.style.top = '50%';
        el.style.transform = 'translateY(-50%)';
      } else {
        el.style.bottom = `${s.positionOffset}%`;
      }
    } else {
      // Secondary sits at the opposite end
      if (s.position === 'top') {
        el.style.bottom = `${s.positionOffset}%`;
      } else {
        el.style.top = `${s.positionOffset}%`;
      }
    }

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

  private renderCues(container: HTMLDivElement, cues: SubtitleCue[], isSecondary: boolean) {
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

  private applyStyle(el: HTMLSpanElement, cue: SubtitleCue, isSecondary: boolean) {
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

  private getTextEffect(s: SubtitleStyleConfig): Partial<CSSStyleDeclaration> {
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
    const s = cue.style!;

    // Base styles for ASS cues
    Object.assign(el.style, {
      fontFamily: s.fontFamily || this.styleConfig.fontFamily,
      fontSize: s.fontSize || `${this.styleConfig.fontSize}px`,
      color: s.color || this.styleConfig.color,
      lineHeight: '1.4',
      textAlign: 'center' as const,
      whiteSpace: 'pre-wrap',
      maxWidth: '80%',
      wordBreak: 'break-word',
      display: 'inline-block',
      marginBottom: '4px',
      paintOrder: 'stroke fill',
    });

    // Font weight / style / decoration
    if (s.fontWeight) el.style.fontWeight = s.fontWeight;
    if (s.fontStyle) el.style.fontStyle = s.fontStyle;
    if (s.textDecoration) el.style.textDecoration = s.textDecoration;

    // Outline and shadow via textShadow
    if (s.textShadow) el.style.textShadow = s.textShadow;
    if (s.webkitTextStroke) {
      (el.style as CSSStyleDeclaration & { webkitTextStroke: string }).webkitTextStroke =
        s.webkitTextStroke;
    }

    // Opaque box background (BorderStyle 3)
    if (s.backgroundColor) {
      el.style.backgroundColor = s.backgroundColor;
      el.style.padding = s.padding || '2px 4px';
      el.style.borderRadius = '2px';
    }

    // ASS-specific absolute positioning when cue has position data
    if (cue.position) {
      const container = el.parentElement;
      if (container) {
        // Override container's default flex positioning to allow absolute placement
        container.style.position = 'absolute';
        container.style.inset = '0';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'flex-end';

        // Map position percentages to alignment
        const { x, y } = cue.position;

        // Horizontal alignment
        if (x <= 25) {
          container.style.justifyContent = 'flex-start';
          container.style.paddingLeft = `${this.styleConfig.safeMargin}%`;
        } else if (x >= 75) {
          container.style.justifyContent = 'flex-end';
          container.style.paddingRight = `${this.styleConfig.safeMargin}%`;
        } else {
          container.style.justifyContent = 'center';
        }

        // Vertical alignment
        if (y <= 25) {
          container.style.alignItems = 'flex-start';
          container.style.paddingTop = `${this.styleConfig.positionOffset}%`;
        } else if (y >= 75) {
          container.style.alignItems = 'flex-end';
          container.style.paddingBottom = `${this.styleConfig.positionOffset}%`;
        } else {
          container.style.alignItems = 'center';
        }
      }
    }
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
    return a.every((c, i) => c.startTime === b[i]?.startTime && c.text === b[i]?.text);
  }

  /** Update style config (called when user changes settings) */
  updateStyle(config: SubtitleStyleConfig) {
    this.styleConfig = config;

    // Rebuild primary container position — clear both top/bottom, then set the correct one
    this.primaryContainer.style.top = '';
    this.primaryContainer.style.bottom = '';
    switch (this.styleConfig.position) {
      case 'top':
        this.primaryContainer.style.top = `${this.styleConfig.positionOffset}%`;
        break;
      case 'center':
        this.primaryContainer.style.top = '50%';
        this.primaryContainer.style.transform = 'translateY(-50%)';
        break;
      case 'bottom':
      default:
        this.primaryContainer.style.bottom = `${this.styleConfig.positionOffset}%`;
        this.primaryContainer.style.transform = '';
        break;
    }
    this.primaryContainer.style.padding = `0 ${this.styleConfig.safeMargin}%`;
    this.primaryContainer.style.transition = this.styleConfig.fadeAnimation
      ? 'opacity 150ms ease-out'
      : 'none';

    // Secondary container always stays at the opposite end
    this.secondaryContainer.style.top = '';
    this.secondaryContainer.style.bottom = '';
    if (this.styleConfig.position === 'top') {
      this.secondaryContainer.style.bottom = `${this.styleConfig.positionOffset}%`;
    } else {
      this.secondaryContainer.style.top = `${this.styleConfig.positionOffset}%`;
    }
    this.secondaryContainer.style.padding = `0 ${this.styleConfig.safeMargin}%`;

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
