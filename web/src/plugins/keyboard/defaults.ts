import type { KeyBinding } from '@/lib/api/preferences';

export const DEFAULT_BINDINGS: KeyBinding[] = [
  // Playback
  { action: 'playback:toggle', key: ' ' },
  { action: 'playback:seek-backward-5', key: 'ArrowLeft' },
  { action: 'playback:seek-forward-5', key: 'ArrowRight' },
  { action: 'playback:seek-backward-30', key: 'ArrowLeft', modifiers: ['shift'] },
  { action: 'playback:seek-forward-30', key: 'ArrowRight', modifiers: ['shift'] },
  { action: 'playback:frame-forward', key: '.' },
  { action: 'playback:frame-backward', key: ',' },
  { action: 'playback:speed-down', key: '[' },
  { action: 'playback:speed-up', key: ']' },
  { action: 'playback:speed-reset', key: 'Backspace' },
  { action: 'playback:ab-loop', key: 'l' },
  // Volume
  { action: 'volume:up', key: 'ArrowUp' },
  { action: 'volume:down', key: 'ArrowDown' },
  { action: 'volume:mute', key: 'm' },
  // Subtitle
  { action: 'subtitle:toggle', key: 'c' },
  { action: 'subtitle:next-track', key: 'v' },
  { action: 'subtitle:delay-decrease', key: 'z' },
  { action: 'subtitle:delay-increase', key: 'x' },
  // Interface
  { action: 'ui:fullscreen', key: 'f' },
  { action: 'ui:pip', key: 'p' },
  { action: 'ui:help', key: '?' },
  { action: 'ui:tech-info', key: 'i' },
  { action: 'ui:next-episode', key: 'n' },
  // Capture
  { action: 'capture:screenshot', key: 's' },
  { action: 'capture:screenshot-with-subs', key: 's', modifiers: ['shift'] },
  { action: 'capture:gif-mode', key: 'g' },
];

// Human-readable action labels for help overlay
export const ACTION_LABELS: Record<string, string> = {
  'playback:toggle': 'Play / Pause',
  'playback:seek-backward-5': 'Seek -5s',
  'playback:seek-forward-5': 'Seek +5s',
  'playback:seek-backward-30': 'Seek -30s',
  'playback:seek-forward-30': 'Seek +30s',
  'playback:frame-forward': 'Next Frame',
  'playback:frame-backward': 'Previous Frame',
  'playback:speed-down': 'Speed -0.25x',
  'playback:speed-up': 'Speed +0.25x',
  'playback:speed-reset': 'Reset Speed',
  'playback:ab-loop': 'A-B Loop',
  'volume:up': 'Volume Up',
  'volume:down': 'Volume Down',
  'volume:mute': 'Mute',
  'subtitle:toggle': 'Subtitles On/Off',
  'subtitle:next-track': 'Next Subtitle',
  'subtitle:delay-decrease': 'Subtitle Delay -0.1s',
  'subtitle:delay-increase': 'Subtitle Delay +0.1s',
  'ui:fullscreen': 'Fullscreen',
  'ui:pip': 'Picture-in-Picture',
  'ui:help': 'Keyboard Shortcuts',
  'ui:tech-info': 'Tech Info',
  'ui:next-episode': 'Next Episode',
  'capture:screenshot': 'Screenshot',
  'capture:screenshot-with-subs': 'Screenshot with Subtitles',
  'capture:gif-mode': 'GIF Mode',
};

// Group actions for help overlay display
export const ACTION_GROUPS = {
  Playback: [
    'playback:toggle',
    'playback:seek-backward-5',
    'playback:seek-forward-5',
    'playback:seek-backward-30',
    'playback:seek-forward-30',
    'playback:frame-forward',
    'playback:frame-backward',
    'playback:speed-down',
    'playback:speed-up',
    'playback:speed-reset',
    'playback:ab-loop',
  ],
  Volume: ['volume:up', 'volume:down', 'volume:mute'],
  Subtitle: [
    'subtitle:toggle',
    'subtitle:next-track',
    'subtitle:delay-decrease',
    'subtitle:delay-increase',
  ],
  Interface: ['ui:fullscreen', 'ui:pip', 'ui:help', 'ui:tech-info', 'ui:next-episode'],
  Capture: ['capture:screenshot', 'capture:screenshot-with-subs', 'capture:gif-mode'],
};
