import { describe, expect, it } from 'vitest';
import { processDanmaku } from './danmaku-worker';

// Helper to build a dandanplay-format comment
function makeComment(time: number, type: string, color: number, text: string) {
  return { p: `${time},${type},${color}`, m: text };
}

describe('processDanmaku', () => {
  it('parses dandanplay format correctly (time, mode, color)', () => {
    const comments = [
      makeComment(1.5, '1', 16711680, 'red rtl'),   // type 1 → rtl, color #ff0000
      makeComment(2.0, '4', 65280, 'green bottom'), // type 4 → bottom, color #00ff00
      makeComment(3.0, '5', 255, 'blue top'),       // type 5 → top, color #0000ff
      makeComment(4.0, '6', 16777215, 'white rtl'), // type 6 → rtl, color #ffffff
    ];

    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 0.8,
      density: 'high',
      isMobile: false,
    });

    expect(result).toHaveLength(4);

    const rtl = result[0]!;
    const bottom = result[1]!;
    const top = result[2]!;
    const rtl2 = result[3]!;

    expect(rtl.text).toBe('red rtl');
    expect(rtl.time).toBe(1.5);
    expect(rtl.mode).toBe('rtl');
    expect(rtl.style.color).toBe('#ff0000');
    expect(rtl.style.fontSize).toBe('20px');
    expect(rtl.style.opacity).toBe(0.8);

    expect(bottom.mode).toBe('bottom');
    expect(bottom.style.color).toBe('#00ff00');

    expect(top.mode).toBe('top');
    expect(top.style.color).toBe('#0000ff');

    expect(rtl2.mode).toBe('rtl');
    expect(rtl2.style.color).toBe('#ffffff');
  });

  it('throttles to medium density (50 per 6s window) on desktop', () => {
    // Generate 80 comments all within the 0–6s window
    const comments = Array.from({ length: 80 }, (_, i) =>
      makeComment(i * 0.07, '1', 16777215, `comment ${i}`)
    );

    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'medium',
      isMobile: false,
    });

    expect(result).toHaveLength(50);
  });

  it('throttles to low density (15 per 6s window) on mobile', () => {
    // Generate 30 comments all within the 0–6s window
    const comments = Array.from({ length: 30 }, (_, i) =>
      makeComment(i * 0.2, '1', 16777215, `comment ${i}`)
    );

    const result = processDanmaku({
      comments,
      fontSize: 16,
      opacity: 1,
      density: 'low',
      isMobile: true,
    });

    expect(result).toHaveLength(15);
  });

  it('prioritizes rtl mode comments (sorting and windowing preserve insertion order within limit)', () => {
    // Mix of modes, all in the same 6s window. With high desktop limit (80) all should pass.
    // With low desktop limit (20), only first 20 sorted by time should remain.
    const rtlComments = Array.from({ length: 10 }, (_, i) =>
      makeComment(i * 0.1, '1', 16777215, `rtl ${i}`)       // times 0.0..0.9
    );
    const topComments = Array.from({ length: 10 }, (_, i) =>
      makeComment(i * 0.1 + 0.05, '5', 16777215, `top ${i}`) // times 0.05..0.95
    );

    const comments = [...topComments, ...rtlComments]; // intentionally mixed

    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'low',    // desktop limit = 20, exactly enough for all 20
      isMobile: false,
    });

    expect(result).toHaveLength(20);

    // After sorting by time, rtl comments at t=0.0, 0.1, 0.2... and top at 0.05, 0.15...
    // The first sorted item should be the rtl comment at t=0.0
    expect(result[0]!.mode).toBe('rtl');
    expect(result[0]!.time).toBe(0);

    // All results should be in ascending time order
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.time).toBeGreaterThanOrEqual(result[i - 1]!.time);
    }
  });

  it('handles unknown comment type by defaulting to rtl', () => {
    const comments = [makeComment(1.0, '99', 16777215, 'unknown type')];

    const result = processDanmaku({
      comments,
      fontSize: 20,
      opacity: 1,
      density: 'high',
      isMobile: false,
    });

    expect(result[0]!.mode).toBe('rtl');
  });

  it('resets window count when entering a new 6s window', () => {
    // 15 comments in window 0-6s and 15 comments in window 6-12s
    // With low mobile limit (15), all 30 should be included (15 per window)
    const window1 = Array.from({ length: 15 }, (_, i) =>
      makeComment(i * 0.3, '1', 16777215, `w1 ${i}`) // 0.0..4.2
    );
    const window2 = Array.from({ length: 15 }, (_, i) =>
      makeComment(6 + i * 0.3, '1', 16777215, `w2 ${i}`) // 6.0..10.2
    );

    const result = processDanmaku({
      comments: [...window1, ...window2],
      fontSize: 20,
      opacity: 1,
      density: 'low',
      isMobile: true,
    });

    expect(result).toHaveLength(30);
  });
});
