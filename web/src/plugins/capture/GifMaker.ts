export interface GifMakerOptions {
  startTime: number;
  endTime: number; // max 15s from start
  width?: number; // default: video width
  fps?: number; // default: 15
  includeSubtitles?: boolean;
}

/**
 * Creates short WebM video clips from a video element using
 * canvas.captureStream + MediaRecorder (no external dependencies).
 */
export class GifMaker {
  private recording = false;
  private recorder: MediaRecorder | null = null;

  constructor(private videoEl: HTMLVideoElement) {}

  /** Capture a clip as a WebM blob */
  async createClip(options: GifMakerOptions): Promise<Blob> {
    const duration = Math.min(options.endTime - options.startTime, 15);
    const canvas = document.createElement('canvas');
    const scale = options.width ? options.width / this.videoEl.videoWidth : 1;
    canvas.width = Math.round(this.videoEl.videoWidth * scale);
    canvas.height = Math.round(this.videoEl.videoHeight * scale);
    const ctx = canvas.getContext('2d')!;

    // Use canvas.captureStream + MediaRecorder
    const stream = canvas.captureStream(options.fps ?? 15);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
    });
    this.recorder = recorder;
    this.recording = true;

    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        this.recording = false;
        this.recorder = null;
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
      recorder.onerror = () => {
        this.recording = false;
        this.recorder = null;
        reject(new Error('MediaRecorder error'));
      };

      recorder.start();
      this.videoEl.currentTime = options.startTime;

      const drawFrame = () => {
        if (!this.recording) return;
        if (this.videoEl.currentTime >= options.startTime + duration) {
          recorder.stop();
          return;
        }
        ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };

      this.videoEl.addEventListener(
        'seeked',
        () => {
          this.videoEl.play();
          drawFrame();
        },
        { once: true },
      );
    });
  }

  /** Download the clip as a file */
  download(blob: Blob, filename?: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `clip-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  isRecording(): boolean {
    return this.recording;
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recording = false;
  }
}
