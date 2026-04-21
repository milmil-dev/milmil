import { Disposables } from '../shared';
import type { SubtitleTrack } from './types';

const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt'] as const;

type SubtitleFormat = SubtitleTrack['format'];

const EXT_TO_FORMAT: Record<string, SubtitleFormat> = {
  '.srt': 'srt',
  '.ass': 'ass',
  '.ssa': 'ssa',
  '.vtt': 'vtt',
};

export class DragDropLoader {
  private disposables = new Disposables();
  private dropOverlay: HTMLDivElement;
  private dragCounter = 0;

  private onTrackLoaded: (track: SubtitleTrack) => void;

  constructor(containerEl: HTMLElement, onTrackLoaded: (track: SubtitleTrack) => void) {
    this.onTrackLoaded = onTrackLoaded;
    this.dropOverlay = this.createDropOverlay();
    containerEl.appendChild(this.dropOverlay);

    this.disposables.addEventListener(containerEl, 'dragenter', this.handleDragEnter);
    this.disposables.addEventListener(containerEl, 'dragover', this.handleDragOver);
    this.disposables.addEventListener(containerEl, 'dragleave', this.handleDragLeave);
    this.disposables.addEventListener(containerEl, 'drop', this.handleDrop);
  }

  private createDropOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position: absolute',
      'inset: 0',
      'z-index: 50',
      'display: none',
      'align-items: center',
      'justify-content: center',
      'flex-direction: column',
      'gap: 12px',
      'background: rgba(0, 0, 0, 0.7)',
      'backdrop-filter: blur(12px)',
      '-webkit-backdrop-filter: blur(12px)',
      'border: 2px dashed rgba(255, 255, 255, 0.3)',
      'border-radius: 12px',
      'pointer-events: none',
      'transition: opacity 0.15s ease',
    ].join(';');

    // Subtitle icon (CC-style)
    const icon = document.createElement('div');
    icon.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M7 12h2m2 0h6M7 16h10"/>
    </svg>`;
    icon.style.cssText = 'opacity: 0.8;';

    const label = document.createElement('div');
    label.textContent = 'Drop subtitle file here';
    label.style.cssText = [
      'color: rgba(255, 255, 255, 0.8)',
      'font-size: 14px',
      'font-weight: 500',
      'letter-spacing: 0.01em',
    ].join(';');

    const hint = document.createElement('div');
    hint.textContent = '.srt .ass .ssa .vtt';
    hint.style.cssText = [
      'color: rgba(255, 255, 255, 0.4)',
      'font-size: 11px',
      'font-family: monospace',
    ].join(';');

    overlay.appendChild(icon);
    overlay.appendChild(label);
    overlay.appendChild(hint);

    return overlay;
  }

  private showOverlay() {
    this.dropOverlay.style.display = 'flex';
  }

  private hideOverlay() {
    this.dropOverlay.style.display = 'none';
  }

  private handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    this.dragCounter++;
    if (this.dragCounter === 1) {
      this.showOverlay();
    }
  };

  private handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  private handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.hideOverlay();
    }
  };

  private handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    this.dragCounter = 0;
    this.hideOverlay();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const ext = this.getExtension(file.name);
      if (!ext || !SUBTITLE_EXTENSIONS.includes(ext as (typeof SUBTITLE_EXTENSIONS)[number])) {
        continue;
      }

      try {
        const content = await file.text();
        const format = EXT_TO_FORMAT[ext];
        if (!format) continue;

        const baseName = file.name.replace(/\.[^.]+$/, '');

        const track: SubtitleTrack = {
          id: `drag-drop-${Date.now()}-${file.name}`,
          label: baseName,
          language: this.guessLanguage(baseName),
          source: 'drag-drop',
          format,
          content,
        };

        this.onTrackLoaded(track);
      } catch {
        console.warn(`[DragDropLoader] Failed to read file: ${file.name}`);
      }
    }
  };

  private getExtension(filename: string): string | null {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) return null;
    return filename.slice(dotIndex).toLowerCase();
  }

  /**
   * Try to guess the language from common subtitle filename patterns.
   * e.g., "Episode 01.ja.srt" -> "ja", "Episode 01.eng.ass" -> "eng"
   */
  private guessLanguage(baseName: string): string {
    const parts = baseName.split('.');
    if (parts.length >= 2) {
      const maybeLang = parts[parts.length - 1]!.toLowerCase();
      // Common 2-3 letter language codes
      if (/^[a-z]{2,3}$/.test(maybeLang)) {
        return maybeLang;
      }
    }
    return 'und'; // undetermined
  }

  dispose() {
    this.dropOverlay.remove();
    this.disposables.dispose();
  }
}
