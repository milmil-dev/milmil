import { Disposables, OSDFeedback } from '../shared';

import { ABLoop, type ABLoopState } from './ABLoop';
import { AutoNext } from './AutoNext';
import type { SegmentMark } from './SkipSegment';
import { SkipSegment } from './SkipSegment';
import { SpeedControl } from './SpeedControl';

export interface PlaybackPluginAPI {
  // A-B Loop
  toggleABLoop(): void;
  getABLoopState(): { state: ABLoopState; a: number; b: number };

  // Auto Next
  setAutoNext(enabled: boolean): void;
  cancelAutoNext(): void;

  // Skip Segments
  setSegments(segments: SegmentMark[]): void;
  setAutoSkip(op: boolean, ed: boolean): void;
  getSegments(): SegmentMark[];

  // Speed
  setSpeed(speed: number): void;
  getSpeed(): number;
  increaseSpeed(): number;
  decreaseSpeed(): number;
  resetSpeed(): void;

  // Callbacks
  onNextEpisode(cb: () => void): void;

  dispose(): void;
}

export function createPlaybackPlugin(
  videoEl: HTMLVideoElement,
  containerEl: HTMLElement,
): PlaybackPluginAPI {
  const disposables = new Disposables();
  const osd = new OSDFeedback(containerEl);
  disposables.add(() => osd.dispose());

  // --- Sub-components ---
  const abLoop = new ABLoop(videoEl);
  const autoNext = new AutoNext(containerEl);
  const skipSegment = new SkipSegment(videoEl, containerEl);
  const speedControl = new SpeedControl(videoEl);

  disposables.add(() => abLoop.dispose());
  disposables.add(() => autoNext.dispose());
  disposables.add(() => skipSegment.dispose());

  // --- A-B Loop OSD feedback ---
  abLoop.onStateChange = (state, a, _b) => {
    switch (state) {
      case 'a-set':
        osd.show({ text: `Loop A: ${a.toFixed(1)}s` });
        break;
      case 'looping':
        osd.show({ text: `Loop A-B` });
        break;
      case 'idle':
        osd.show({ text: 'Loop Off' });
        break;
    }
  };

  // --- Listen for plugin-action events (from KeyboardPlugin) ---
  disposables.addEventListener(containerEl, 'plugin-action' as keyof HTMLElementEventMap, ((
    e: CustomEvent<{ action: string }>,
  ) => {
    if (e.detail.action === 'playback:ab-loop') {
      abLoop.toggle();
    }
  }) as EventListener);

  // --- Auto-next on video end ---
  disposables.addEventListener(videoEl, 'ended', () => {
    autoNext.trigger();
  });

  // --- Next episode callback holder ---
  let nextEpisodeCb: (() => void) | null = null;
  autoNext.onNextEpisode = () => nextEpisodeCb?.();

  return {
    // A-B Loop
    toggleABLoop: () => abLoop.toggle(),
    getABLoopState: () => abLoop.getState(),

    // Auto Next
    setAutoNext: (enabled) => autoNext.setEnabled(enabled),
    cancelAutoNext: () => autoNext.cancel(),

    // Skip Segments
    setSegments: (segments) => skipSegment.setSegments(segments),
    setAutoSkip: (op, ed) => skipSegment.setAutoSkip(op, ed),
    getSegments: () => skipSegment.getSegments(),

    // Speed
    setSpeed: (speed) => {
      speedControl.set(speed);
      osd.show({ text: `\u25B6 ${speedControl.get()}x` });
    },
    getSpeed: () => speedControl.get(),
    increaseSpeed: () => {
      const s = speedControl.increase();
      osd.show({ text: `\u25B6 ${s}x` });
      return s;
    },
    decreaseSpeed: () => {
      const s = speedControl.decrease();
      osd.show({ text: `\u25B6 ${s}x` });
      return s;
    },
    resetSpeed: () => {
      speedControl.reset();
      osd.show({ text: '\u25B6 1x' });
    },

    // Callbacks
    onNextEpisode: (cb) => {
      nextEpisodeCb = cb;
    },

    dispose: () => disposables.dispose(),
  };
}
