export interface ScreenshotOptions {
  includeSubtitles?: boolean;
  includeWatermark?: boolean;
  watermarkText?: string; // e.g., "Anime Title - Ep 12 - 00:15:30"
}

export class Screenshot {
  constructor(private videoEl: HTMLVideoElement) {}

  async capture(options: ScreenshotOptions = {}): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = this.videoEl.videoWidth;
    canvas.height = this.videoEl.videoHeight;
    const ctx = canvas.getContext('2d')!;

    // Draw video frame
    ctx.drawImage(this.videoEl, 0, 0);

    // Optionally add watermark (bottom-right corner)
    if (options.includeWatermark && options.watermarkText) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText(options.watermarkText, canvas.width - 16, canvas.height - 16);
    }

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      }, 'image/png');
    });
  }

  /** Copy screenshot to clipboard, falls back to download */
  async copyToClipboard(blob: Blob): Promise<void> {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // Fallback: download instead
      this.download(blob);
    }
  }

  /** Download as file */
  download(blob: Blob, filename?: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `screenshot-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
