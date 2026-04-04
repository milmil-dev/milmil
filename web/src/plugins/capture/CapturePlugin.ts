import { Disposables, OSDFeedback } from '../shared';
import { GifMaker } from './GifMaker';
import { Screenshot, type ScreenshotOptions } from './Screenshot';

export interface CapturePluginAPI {
  screenshot(options?: ScreenshotOptions): Promise<void>;
  enterGifMode(): void;
  exitGifMode(): void;
  isInGifMode(): boolean;
  dispose(): void;
}

export function createCapturePlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement,
): CapturePluginAPI {
  const disposables = new Disposables();
  const screenshotUtil = new Screenshot(videoEl);
  const gifMaker = new GifMaker(videoEl);
  const osd = new OSDFeedback(containerEl);
  let gifMode = false;

  disposables.add(() => osd.dispose());
  disposables.add(() => gifMaker.cancel());

  // Listen for plugin-action events from keyboard
  disposables.addEventListener(
    containerEl,
    'plugin-action' as keyof HTMLElementEventMap,
    ((e: CustomEvent<{ action: string }>) => {
      switch (e.detail.action) {
        case 'capture:screenshot':
          api.screenshot();
          break;
        case 'capture:screenshot-with-subs':
          api.screenshot({ includeSubtitles: true });
          break;
        case 'capture:gif-mode':
          gifMode ? api.exitGifMode() : api.enterGifMode();
          break;
      }
    }) as EventListener,
  );

  const api: CapturePluginAPI = {
    screenshot: async (opts) => {
      try {
        const blob = await screenshotUtil.capture(opts ?? {});
        await screenshotUtil.copyToClipboard(blob);
        showScreenshotToast(containerEl, blob);
        osd.show({ text: 'Copied to clipboard', position: 'top-right' });
      } catch {
        osd.show({ text: 'Screenshot failed' });
      }
    },
    enterGifMode: () => {
      gifMode = true;
      osd.show({
        text: 'Clip Mode \u2014 Select range on progress bar',
        duration: 2000,
      });
      // TODO: show range selector UI on progress bar
    },
    exitGifMode: () => {
      gifMode = false;
      gifMaker.cancel();
    },
    isInGifMode: () => gifMode,
    dispose: () => disposables.dispose(),
  };

  return api;
}

/** Toast showing screenshot thumbnail */
function showScreenshotToast(container: HTMLElement, blob: Blob) {
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'absolute',
    bottom: '80px',
    right: '24px',
    zIndex: '100',
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '8px',
    transition: 'opacity 300ms ease-out',
  } satisfies Partial<Record<string, string>>);

  const img = document.createElement('img');
  img.src = URL.createObjectURL(blob);
  img.style.width = '160px';
  img.style.borderRadius = '8px';
  toast.appendChild(img);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      URL.revokeObjectURL(img.src);
      toast.remove();
    }, 300);
  }, 3000);
}
