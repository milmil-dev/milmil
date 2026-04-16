import type { DanmakuComment, DanmakuDensity } from '@/lib/api/stream';

interface ProcessInput {
  comments: { p: string; m: string }[];
  fontSize: number;
  opacity: number;
  density: DanmakuDensity;
  isMobile: boolean;
}

const MODE_MAP: Record<string, 'rtl' | 'top' | 'bottom'> = {
  '1': 'rtl',
  '4': 'bottom',
  '5': 'top',
  '6': 'rtl',
};

const LIMITS: Record<DanmakuDensity, { desktop: number; mobile: number }> = {
  low: { desktop: 20, mobile: 15 },
  medium: { desktop: 50, mobile: 30 },
  high: { desktop: 80, mobile: 50 },
};

export function processDanmaku(input: ProcessInput): DanmakuComment[] {
  const { comments, fontSize, opacity, density, isMobile } = input;
  const limit = isMobile ? LIMITS[density].mobile : LIMITS[density].desktop;
  const WINDOW_SIZE = 6;

  const parsed: DanmakuComment[] = comments.map(({ p, m }) => {
    const parts = p.split(',');
    const time = parseFloat(parts[0] ?? '0');
    const type = parts[1] ?? '1';
    const colorInt = parseInt(parts[2] ?? '16777215', 10);
    return {
      text: m,
      time,
      mode: MODE_MAP[type] ?? 'rtl',
      style: {
        fontSize: `${fontSize}px`,
        color: `#${colorInt.toString(16).padStart(6, '0')}`,
        opacity,
      },
    };
  });

  parsed.sort((a, b) => a.time - b.time);

  const result: DanmakuComment[] = [];
  let windowStart = 0;
  let windowCount = 0;

  for (const comment of parsed) {
    if (comment.time >= windowStart + WINDOW_SIZE) {
      windowStart = Math.floor(comment.time / WINDOW_SIZE) * WINDOW_SIZE;
      windowCount = 0;
    }
    if (windowCount < limit) {
      result.push(comment);
      windowCount++;
    }
  }

  return result;
}

// Worker entry point — Vite compiles this as a separate module bundle.
// In Worker context, `self` is a DedicatedWorkerGlobalScope (no `document`).
// biome-ignore lint: Worker global scope setup
const _self = self as unknown as DedicatedWorkerGlobalScope;
_self.addEventListener('message', (e: MessageEvent<ProcessInput>) => {
  const result = processDanmaku(e.data);
  _self.postMessage(result);
});
