import type { KeyBinding } from '@/lib/api/preferences';

import { Disposables, OSDFeedback } from '../shared';
import { HelpOverlay } from './HelpOverlay';
import { KeyBindingManager } from './KeyBindingManager';

export interface KeyboardPluginAPI {
  updateBindings(custom: KeyBinding[]): void;
  getBindings(): KeyBinding[];
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export function createKeyboardPlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement,
  options?: {
    customBindings?: KeyBinding[];
    onNextEpisode?: () => void;
    onToggleHelp?: () => void;
    onToggleTechInfo?: () => void;
  }
): KeyboardPluginAPI {
  const disposables = new Disposables();
  const osd = new OSDFeedback(containerEl);
  const manager = new KeyBindingManager(containerEl, options?.customBindings);
  const helpOverlay = new HelpOverlay(
    containerEl,
    () => manager.getBindings(),
    (b) => manager.bindingToString(b)
  );
  disposables.add(() => osd.dispose());
  disposables.add(() => manager.dispose());
  disposables.add(() => helpOverlay.dispose());

  // Close help overlay on Escape
  disposables.addEventListener(containerEl, 'keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape' && helpOverlay.isVisible()) {
      (e as KeyboardEvent).preventDefault();
      helpOverlay.hide();
    }
  });

  let savedSpeed = 1;

  // --- Wire up action handlers ---

  // Playback
  manager.on('playback:toggle', () => {
    if (videoEl.paused) {
      videoEl.play();
      osd.show({ text: '\u25B6' });
    } else {
      videoEl.pause();
      osd.show({ text: '\u23F8' });
    }
  });

  manager.on('playback:seek-backward-5', () => {
    videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
    osd.show({ text: '\u23EA -5s' });
  });

  manager.on('playback:seek-forward-5', () => {
    videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 5);
    osd.show({ text: '\u23E9 +5s' });
  });

  manager.on('playback:seek-backward-30', () => {
    videoEl.currentTime = Math.max(0, videoEl.currentTime - 30);
    osd.show({ text: '\u23EA -30s' });
  });

  manager.on('playback:seek-forward-30', () => {
    videoEl.currentTime = Math.min(videoEl.duration, videoEl.currentTime + 30);
    osd.show({ text: '\u23E9 +30s' });
  });

  manager.on('playback:frame-forward', () => {
    videoEl.pause();
    videoEl.currentTime += 1 / 30; // Assume ~30fps
    osd.show({ text: '\u25B6| Frame' });
  });

  manager.on('playback:frame-backward', () => {
    videoEl.pause();
    videoEl.currentTime -= 1 / 30;
    osd.show({ text: '|\u25C0 Frame' });
  });

  manager.on('playback:speed-up', () => {
    const newRate = Math.min(4, videoEl.playbackRate + 0.25);
    videoEl.playbackRate = newRate;
    osd.show({ text: `\u25B6 ${newRate}x` });
  });

  manager.on('playback:speed-down', () => {
    const newRate = Math.max(0.25, videoEl.playbackRate - 0.25);
    videoEl.playbackRate = newRate;
    osd.show({ text: `\u25B6 ${newRate}x` });
  });

  manager.on('playback:speed-reset', () => {
    videoEl.playbackRate = 1;
    osd.show({ text: '\u25B6 1x' });
  });

  // Long-press ArrowRight for 3x fast-forward
  manager.onLongPress(
    'ArrowRight',
    () => {
      savedSpeed = videoEl.playbackRate;
      videoEl.playbackRate = 3;
      osd.show({ text: '\u23E9 3x', duration: 60000 });
    },
    () => {
      videoEl.playbackRate = savedSpeed;
      osd.hide();
    }
  );

  // Volume
  manager.on('volume:up', () => {
    videoEl.volume = Math.min(1, videoEl.volume + 0.05);
    osd.show({ text: `\uD83D\uDD0A ${Math.round(videoEl.volume * 100)}%` });
  });

  manager.on('volume:down', () => {
    videoEl.volume = Math.max(0, videoEl.volume - 0.05);
    osd.show({ text: `\uD83D\uDD0A ${Math.round(videoEl.volume * 100)}%` });
  });

  manager.on('volume:mute', () => {
    videoEl.muted = !videoEl.muted;
    osd.show({
      text: videoEl.muted
        ? '\uD83D\uDD07 Muted'
        : `\uD83D\uDD0A ${Math.round(videoEl.volume * 100)}%`,
    });
  });

  // UI
  manager.on('ui:fullscreen', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerEl.requestFullscreen();
  });

  manager.on('ui:pip', () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else videoEl.requestPictureInPicture();
  });

  manager.on('ui:next-episode', () => options?.onNextEpisode?.());
  manager.on('ui:help', () => {
    helpOverlay.toggle();
    options?.onToggleHelp?.();
  });
  manager.on('ui:tech-info', () => options?.onToggleTechInfo?.());

  // Subtitle and capture actions emit custom events on the container
  // so other plugins can handle them
  const emitPluginEvent = (action: string) => {
    containerEl.dispatchEvent(new CustomEvent('plugin-action', { detail: { action } }));
  };

  manager.on('subtitle:toggle', () => emitPluginEvent('subtitle:toggle'));
  manager.on('subtitle:next-track', () => emitPluginEvent('subtitle:next-track'));
  manager.on('subtitle:delay-decrease', () => emitPluginEvent('subtitle:delay-decrease'));
  manager.on('subtitle:delay-increase', () => emitPluginEvent('subtitle:delay-increase'));
  manager.on('playback:ab-loop', () => emitPluginEvent('playback:ab-loop'));
  manager.on('capture:screenshot', () => emitPluginEvent('capture:screenshot'));
  manager.on('capture:screenshot-with-subs', () => emitPluginEvent('capture:screenshot-with-subs'));
  manager.on('capture:gif-mode', () => emitPluginEvent('capture:gif-mode'));

  return {
    updateBindings: (custom) => manager.updateBindings(custom),
    getBindings: () => manager.getBindings(),
    setEnabled: (enabled) => manager.setEnabled(enabled),
    dispose: () => disposables.dispose(),
  };
}
