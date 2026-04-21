import { compile } from 'ass-compiler';
import type { SubtitleCue } from '../types';

export interface AssStyleDef {
  Name: string;
  Fontname: string;
  Fontsize: string;
  PrimaryColour: string; // ASS color format: &HAABBGGRR
  SecondaryColour: string;
  OutlineColour: string;
  BackColour: string;
  Bold: string;
  Italic: string;
  Underline: string;
  BorderStyle: string;
  Outline: string;
  Shadow: string;
  Alignment: string; // numpad alignment (1-9)
  MarginL: string;
  MarginR: string;
  MarginV: string;
}

/**
 * Convert ASS color (&HAABBGGRR or &HBBGGRR) to CSS rgba string.
 * ASS stores colors as &HAABBGGRR where bytes are alpha, blue, green, red — reversed from CSS.
 */
export function assColorToCSS(color: string): string {
  // Normalize: remove &H prefix and & suffix if present
  let hex = color.replace(/^&H/i, '').replace(/&$/, '').toUpperCase();

  // Pad to 8 characters (AABBGGRR); if 6 chars, assume alpha = 00 (fully opaque)
  if (hex.length <= 6) {
    hex = '00' + hex.padStart(6, '0');
  }
  hex = hex.padStart(8, '0');

  const aa = Number.parseInt(hex.slice(0, 2), 16);
  const bb = Number.parseInt(hex.slice(2, 4), 16);
  const gg = Number.parseInt(hex.slice(4, 6), 16);
  const rr = Number.parseInt(hex.slice(6, 8), 16);

  // ASS alpha: 00 = fully opaque, FF = fully transparent (inverted from CSS)
  const alpha = Math.round((1 - aa / 255) * 100) / 100;

  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
}

/**
 * Convert ASS numpad alignment (1-9) to normalized x,y position.
 * Returns values as percentages for CSS positioning.
 *
 *   7 (top-left)     8 (top-center)     9 (top-right)
 *   4 (mid-left)     5 (mid-center)     6 (mid-right)
 *   1 (bot-left)     2 (bot-center)     3 (bot-right)
 */
export function assAlignmentToPosition(alignment: number): { x: number; y: number } {
  // x: left=0, center=50, right=100
  // y: top=0, center=50, bottom=100
  const col = (alignment - 1) % 3; // 0=left, 1=center, 2=right
  const row = Math.floor((alignment - 1) / 3); // 0=bottom, 1=middle, 2=top

  const xMap = [10, 50, 90];
  const yMap = [90, 50, 10]; // inverted: row 0 = bottom = 90%

  return {
    x: xMap[col] ?? 50,
    y: yMap[row] ?? 90,
  };
}

/**
 * Parse ASS/SSA content into SubtitleCue[] using ass-compiler.
 * Extracts styles, dialogues, and converts to the internal cue format.
 */
export function parseAss(content: string): SubtitleCue[] {
  let compiled;
  try {
    compiled = compile(content, {});
  } catch (err) {
    console.warn('[SubtitlePlugin] Failed to parse ASS content:', err);
    return [];
  }

  const cues: SubtitleCue[] = [];

  for (const dialogue of compiled.dialogues) {
    // Extract plain text from all slices/fragments, stripping drawing instructions
    const textParts: string[] = [];
    for (const slice of dialogue.slices) {
      for (const fragment of slice.fragments) {
        if (fragment.text && !fragment.drawing) {
          textParts.push(fragment.text);
        }
      }
    }

    const text = textParts.join('').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim();
    if (!text) continue;

    // Get the style for this dialogue from compiled styles
    const styleDef = compiled.styles[dialogue.style];
    const styleTag = styleDef?.tag;
    const styleMeta = styleDef?.style;

    // Build CSS-compatible style map from the ASS style definition
    const style: Record<string, string> = {};

    if (styleMeta) {
      style.fontFamily = styleMeta.Fontname;
      style.fontSize = `${styleMeta.Fontsize}px`;
      style.color = assColorToCSS(styleMeta.PrimaryColour);
      style.outlineColor = assColorToCSS(styleMeta.OutlineColour);
      style.backColor = assColorToCSS(styleMeta.BackColour);

      if (styleMeta.Bold === -1) style.fontWeight = 'bold';
      if (styleMeta.Italic === -1) style.fontStyle = 'italic';
      if (styleMeta.Underline === -1) style.textDecoration = 'underline';

      if (styleMeta.Outline > 0) {
        const outlineColor = assColorToCSS(styleMeta.OutlineColour);
        const w = styleMeta.Outline;
        style.textShadow = [
          `-${w}px -${w}px 0 ${outlineColor}`,
          ` ${w}px -${w}px 0 ${outlineColor}`,
          `-${w}px  ${w}px 0 ${outlineColor}`,
          ` ${w}px  ${w}px 0 ${outlineColor}`,
        ].join(', ');
        style.webkitTextStroke = `${w * 0.5}px ${outlineColor}`;
      }

      if (styleMeta.Shadow > 0) {
        const shadowColor = assColorToCSS(styleMeta.BackColour);
        const s = styleMeta.Shadow;
        const existingShadow = style.textShadow ? `${style.textShadow}, ` : '';
        style.textShadow = `${existingShadow}${s}px ${s}px ${s}px ${shadowColor}`;
      }

      if (styleMeta.BorderStyle === 3) {
        // Opaque box background
        style.backgroundColor = assColorToCSS(styleMeta.BackColour);
        style.padding = '2px 4px';
      }
    }

    // Apply inline override tags from the first fragment if present
    if (styleTag) {
      if (styleTag.fn) style.fontFamily = styleTag.fn;
      if (styleTag.fs) style.fontSize = `${styleTag.fs}px`;
      if (styleTag.c1) style.color = assColorToCSS(styleTag.c1);
      if (styleTag.b === 1) style.fontWeight = 'bold';
      if (styleTag.i === 1) style.fontStyle = 'italic';
      if (styleTag.u === 1) style.textDecoration = 'underline';
    }

    // Determine position from alignment
    const alignment = dialogue.alignment || styleMeta?.Alignment || 2;
    const position = dialogue.pos
      ? { x: dialogue.pos.x, y: dialogue.pos.y }
      : assAlignmentToPosition(alignment);

    cues.push({
      startTime: dialogue.start,
      endTime: dialogue.end,
      text,
      style,
      position,
      layer: dialogue.layer,
    });
  }

  // Sort by startTime, then by layer for proper rendering order
  cues.sort((a, b) => a.startTime - b.startTime || (a.layer ?? 0) - (b.layer ?? 0));

  return cues;
}
