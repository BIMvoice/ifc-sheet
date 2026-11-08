/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's title under its drawing, with the drawing's number in a ring at its start (#619, #162): the number a section or elevation mark
 * names ("1 / A-301"). The app's sheet and `sheetGraphic` (PDF, DXF, `ifcsheet build`) both place it here, so the two cannot drift.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import { penTags } from './dxf-pen-tags.js';
import type { SheetStroke } from './sheet-stroke.js';
import type { SheetText } from './sheet-graphic.js';

/** Width on paper of the drawing number's ring, mm: round for one or two characters, longer for a longer number. */
export const numberWidth = (n: string, size: number): number => Math.max(size + 1, n.length * size * 0.6 + 2);

/** The ring: a rounded rectangle `w` by `h` with its top-left at (`x`, `y`), corners of radius `h / 2`, paper mm. */
export interface TitleRing { x: number; y: number; w: number; h: number; r: number }

export interface ViewTitleLayout {
  /** Where the title's text starts (left aligned), paper mm. */
  textX: number;
  /** The baseline of the title and of the number, paper mm. */
  baseline: number;
  /** The ring and its number: absent for a view without a number. */
  number?: { text: string; ring: TitleRing; at: Point2D; size: number };
}

/**
 * Where a view's title sits: at the left edge of its drawing's box, one text height and 1.5 mm under it, the ring (if the view has a
 * number) first and the text 2 mm after it. `size` is the title's text height, mm.
 */
export function viewTitleLayout(box: { x: number; y: number; w: number; h: number }, size: number, number?: string): ViewTitleLayout {
  const baseline = box.y + box.h + size + 1.5;
  if (!number) return { textX: box.x, baseline };
  const w = numberWidth(number, size);
  const h = size + 1;
  return {
    textX: box.x + w + 2,
    baseline,
    number: { text: number, ring: { x: box.x, y: baseline - size - 0.4, w, h, r: h / 2 }, at: { x: box.x + w / 2, y: baseline - 0.2 }, size: size * 0.8 },
  };
}

/** The ring as a closed run of points (the first repeated last): straight sides and half circles, `steps` segments to each half. */
export function ringOutline({ x, y, w, h, r }: TitleRing, steps = 12): Point2D[] {
  const out: Point2D[] = [];
  const arc = (cx: number, cy: number, from: number): void => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (Math.PI * i) / steps;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + r, y + r, Math.PI / 2);
  out.push(out[0]);
  return out;
}

/** The title as what the sheet prints: the ring (a stroke on the app's `VIEWPORT-LABELS` layer), the number in it and the title's text. */
export function viewTitleSheet(box: { x: number; y: number; w: number; h: number }, size: number, text: string, number?: string): { strokes: SheetStroke[]; texts: SheetText[] } {
  const at = viewTitleLayout(box, size, number);
  const strokes: SheetStroke[] = [];
  const texts: SheetText[] = [];
  if (at.number) {
    strokes.push({ colour: '#000000', width: 0.25, runs: [ringOutline(at.number.ring)], dxf: penTags('VIEWPORT-LABELS', 0.25) });
    texts.push({ at: at.number.at, text: at.number.text, size: at.number.size, align: 'center', bold: true, layer: 'VIEWPORT-LABELS' });
  }
  texts.push({ at: { x: at.textX, y: at.baseline }, text, size, layer: 'VIEWPORT-LABELS' });
  return { strokes, texts };
}
