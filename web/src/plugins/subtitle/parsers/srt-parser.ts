import type { SubtitleCue } from '../types';

/**
 * Parse SRT subtitle content into SubtitleCue[].
 *
 * SRT format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * Text line 1
 * Text line 2
 * ```
 */
export function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Normalize line endings and split into blocks by blank lines
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find the timestamp line (contains "-->")
    let tsLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes('-->')) {
        tsLineIdx = i;
        break;
      }
    }
    if (tsLineIdx === -1) continue;

    const tsLine = lines[tsLineIdx]!;
    const match = tsLine.match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!match) continue;

    const toSeconds = (h: string, m: string, s: string, ms: string) =>
      Number.parseInt(h, 10) * 3600 +
      Number.parseInt(m, 10) * 60 +
      Number.parseInt(s, 10) +
      Number.parseInt(ms, 10) / 1000;

    const startTime = toSeconds(match[1]!, match[2]!, match[3]!, match[4]!);
    const endTime = toSeconds(match[5]!, match[6]!, match[7]!, match[8]!);

    // Collect text lines after the timestamp, strip basic HTML-like tags for plain text
    const text = lines
      .slice(tsLineIdx + 1)
      .join('\n')
      .trim();

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}
