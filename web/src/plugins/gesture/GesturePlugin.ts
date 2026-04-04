import { clamp, Disposables, formatTime, OSDFeedback } from '../shared';
import { LongPressHandler } from './LongPressHandler';
import { SwipeHandler } from './SwipeHandler';
import { TapHandler } from './TapHandler';

export interface GesturePluginAPI {
  setEnabled(enabled: boolean): void;
  setSensitivity(value: number): void;
  dispose(): void;
}

export function createGesturePlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement,
  options?: { enabled?: boolean; sensitivity?: number },
): GesturePluginAPI {
  const disposables = new Disposables();
  const osd = new OSDFeedback(containerEl);
  disposables.add(() => osd.dispose());

  let enabled = options?.enabled ?? true;
  let brightness = 1; // CSS filter brightness (1 = normal)
  let savedSpeed = 1;

  // --- Swipe Handler ---
  const swipe = new SwipeHandler(containerEl, disposables);
  if (options?.sensitivity) swipe.setSensitivity(options.sensitivity);

  swipe.onSeek = (deltaSeconds) => {
    if (!enabled) return;
    const sign = deltaSeconds >= 0 ? '+' : '';
    const rounded = Math.round(deltaSeconds);
    const target = clamp(videoEl.currentTime + deltaSeconds, 0, videoEl.duration || 0);
    osd.show({
      icon: deltaSeconds >= 0 ? '\u23E9' : '\u23EA',
      text: `${sign}${rounded}s (${formatTime(target)})`,
      duration: 60000, // stay visible during swipe
    });
  };

  swipe.onSeekCommit = (deltaSeconds) => {
    if (!enabled) return;
    const target = clamp(videoEl.currentTime + deltaSeconds, 0, videoEl.duration || 0);
    videoEl.currentTime = target;
    const sign = deltaSeconds >= 0 ? '+' : '';
    const rounded = Math.round(deltaSeconds);
    osd.show({
      icon: deltaSeconds >= 0 ? '\u23E9' : '\u23EA',
      text: `${sign}${rounded}s`,
      duration: 800,
    });
  };

  let volumeAtSwipeStart: number | null = null;
  swipe.onVolumeChange = (delta) => {
    if (!enabled) return;
    if (volumeAtSwipeStart === null) volumeAtSwipeStart = videoEl.volume;
    const newVolume = clamp(volumeAtSwipeStart + delta, 0, 1);
    videoEl.volume = newVolume;
    videoEl.muted = newVolume === 0;
    osd.show({
      icon: '\uD83D\uDD0A',
      text: `${Math.round(newVolume * 100)}%`,
      duration: 60000,
    });
  };

  let brightnessAtSwipeStart: number | null = null;
  swipe.onBrightnessChange = (delta) => {
    if (!enabled) return;
    if (brightnessAtSwipeStart === null) brightnessAtSwipeStart = brightness;
    brightness = clamp(brightnessAtSwipeStart + delta, 0.2, 2);
    videoEl.style.filter = `brightness(${brightness})`;
    osd.show({
      icon: '\u2600\uFE0F',
      text: `${Math.round(brightness * 100)}%`,
      duration: 60000,
    });
  };

  // Reset baseline values when swipe ends (pointerup resets swipe.active)
  disposables.addEventListener(containerEl, 'pointerup', () => {
    if (volumeAtSwipeStart !== null) {
      volumeAtSwipeStart = null;
      osd.show({
        icon: '\uD83D\uDD0A',
        text: `${Math.round(videoEl.volume * 100)}%`,
        duration: 800,
      });
    }
    if (brightnessAtSwipeStart !== null) {
      brightnessAtSwipeStart = null;
      osd.show({
        icon: '\u2600\uFE0F',
        text: `${Math.round(brightness * 100)}%`,
        duration: 800,
      });
    }
  });

  // --- Tap Handler ---
  const tap = new TapHandler(containerEl, disposables);

  tap.onPlayPause = () => {
    if (!enabled) return;
    // Don't fire play/pause if a swipe just completed
    if (swipe.isActive()) return;
    if (videoEl.paused) {
      videoEl.play();
      osd.show({ text: '\u25B6' });
    } else {
      videoEl.pause();
      osd.show({ text: '\u23F8' });
    }
  };

  tap.onSeekBackward = () => {
    if (!enabled) return;
    videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
    osd.show({ icon: '\u23EA', text: '-10s' });
  };

  tap.onSeekForward = () => {
    if (!enabled) return;
    videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 10);
    osd.show({ icon: '\u23E9', text: '+10s' });
  };

  tap.onFullscreen = () => {
    if (!enabled) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerEl.requestFullscreen();
    }
  };

  // --- Long Press Handler ---
  const longPress = new LongPressHandler(containerEl, disposables);

  longPress.onLongPressStart = () => {
    if (!enabled) return;
    savedSpeed = videoEl.playbackRate;
    videoEl.playbackRate = 3;
    osd.show({ icon: '\u23E9', text: '3x', duration: 60000 });
  };

  longPress.onLongPressEnd = () => {
    if (!enabled) return;
    videoEl.playbackRate = savedSpeed;
    osd.hide();
  };

  // --- Disable gestures when typing ---
  disposables.addEventListener(containerEl, 'focusin', (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      enabled = false;
    }
  });

  disposables.addEventListener(containerEl, 'focusout', (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      enabled = options?.enabled ?? true;
    }
  });

  return {
    setEnabled(value: boolean) {
      enabled = value;
    },
    setSensitivity(value: number) {
      swipe.setSensitivity(value);
    },
    dispose() {
      disposables.dispose();
    },
  };
}
