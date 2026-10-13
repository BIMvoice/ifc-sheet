/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The block a text shape draws: its lines (a line break in the text starts a
 * new line) and the frame around them, in the text's own frame: origin at the
 * first line's baseline start, x along the text, y down the page. One
 * layout for the drawing, the picking box and the bounds, so they agree.
 */

import { textWidthEm, type TextFace } from './text-width';

export const TEXT_FRAMES = ['box', 'rounded', 'bubble'] as const;
/** The outline around a text, as drawing practice has it; none is the absence of the field. */
export type TextFrame = (typeof TEXT_FRAMES)[number];

/** Line pitch, in text heights. */
export const LINE_PITCH = 1.25;
/** The text box a text is picked and bounded by: from one height above the first baseline (the anchor is its corner). */
const BOX_ASCENT = 1;
/** Where the glyphs of a line reach, for centring the frame round them. */
export const GLYPH_ASCENT = 0.72;
export const GLYPH_DESCENT = 0.22;
/** Space between the text and its frame, in text heights: the same on all four sides. */
const PAD = 0.5;

export const textLines = (text: string): string[] => text.split('\n');

export type FrameShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export interface TextBlock {
  lines: { text: string; y: number }[];
  /** The text without its frame. */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** The outline to draw, and the box that holds it: the text box itself without a frame. */
  frame: FrameShape | null;
  outer: { x0: number; y0: number; x1: number; y1: number };
}

/** `face` is the font the text is drawn in; the width is that font's, measured where the browser can, else from a table (`text-width.ts`). */
export function textBlock(text: string, height: number, frame?: TextFrame, face?: TextFace): TextBlock {
  const lines = textLines(text);
  const width = Math.max(0.5, ...lines.map((l) => textWidthEm(l, face))) * height;
  const last = (lines.length - 1) * LINE_PITCH * height;
  const box = { x0: 0, y0: -BOX_ASCENT * height, x1: width, y1: last };
  const placed = lines.map((t, i) => ({ text: t, y: i * LINE_PITCH * height }));
  if (!frame) return { lines: placed, box, frame: null, outer: box };
  const pad = PAD * height;
  const outer = { x0: box.x0 - pad, y0: -GLYPH_ASCENT * height - pad, x1: box.x1 + pad, y1: last + GLYPH_DESCENT * height + pad };
  const w = outer.x1 - outer.x0, h = outer.y1 - outer.y0;
  if (frame === 'bubble') {
    // A short tag is a circle round its text; a longer one an ellipse with the same proportions.
    const cx = (outer.x0 + outer.x1) / 2, cy = (outer.y0 + outer.y1) / 2;
    const r = Math.hypot(w, h) / 2;
    const round = w <= 3 * height;
    const rx = round ? r : (w / 2) * Math.SQRT2, ry = round ? r : (h / 2) * Math.SQRT2;
    return { lines: placed, box, frame: { kind: 'ellipse', cx, cy, rx, ry }, outer: { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry } };
  }
  return { lines: placed, box, frame: { kind: 'rect', x: outer.x0, y: outer.y0, w, h, radius: frame === 'rounded' ? Math.min(w, h) * 0.25 : 0 }, outer };
}

/** The frames a stored value may name, else none. */
export const asTextFrame = (v: unknown): TextFrame | undefined => (TEXT_FRAMES as readonly unknown[]).includes(v) ? (v as TextFrame) : undefined;
