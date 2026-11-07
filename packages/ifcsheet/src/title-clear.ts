/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's title keeps clear of the elevation and section marks printed under its drawing (#221, #557). The marks stand outside the
 * building, past the viewport's box, where the title also stands; the title is the one that gives way and moves down below them. Pure,
 * paper millimetres, y running down the sheet.
 */

import { tableWidthEm } from './text-advance.js';
import type { Point2D } from '@ifc-lite/drawing-2d';

export interface PaperBox { x0: number; y0: number; x1: number; y1: number }

/** Paper millimetres kept between a title and a mark above it. */
export const TITLE_MARK_GAP_MM = 1;

interface PlacedText { at: Point2D; text: string; size: number; align?: 'left' | 'center' | 'right'; angle?: number }

/** The box a printed text fills: its width from the engine's table, its height the text height above the baseline, turned about its anchor. */
export function textPaperBox(t: PlacedText): PaperBox {
  const w = tableWidthEm(t.text) * t.size;
  const x = t.align === 'center' ? -w / 2 : t.align === 'right' ? -w : 0;
  const a = ((t.angle ?? 0) * Math.PI) / 180;
  const corners = [[x, -t.size], [x + w, -t.size], [x, 0], [x + w, 0]].map(([cx, cy]) => ({ x: t.at.x + cx * Math.cos(a) + cy * Math.sin(a), y: t.at.y - cx * Math.sin(a) + cy * Math.cos(a) }));
  return { x0: Math.min(...corners.map((c) => c.x)), x1: Math.max(...corners.map((c) => c.x)), y0: Math.min(...corners.map((c) => c.y)), y1: Math.max(...corners.map((c) => c.y)) };
}

/** The box of a set of runs, or null for none. */
export function runsPaperBox(runs: readonly (readonly Point2D[])[]): PaperBox | null {
  const pts = runs.flat();
  if (pts.length === 0) return null;
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
}

/**
 * How far down, mm, `title` must move to stand clear of every mark box it meets: each mark that overlaps it across the sheet (and
 * reaches into it or lies below its top) pushes it to `gap` under that mark's bottom. 0 when nothing is in the way.
 */
export function titleDrop(title: PaperBox, marks: readonly PaperBox[], gap = TITLE_MARK_GAP_MM): number {
  let drop = 0;
  for (let again = true; again;) {
    again = false;
    for (const m of marks) {
      const across = m.x0 < title.x1 + gap && m.x1 > title.x0 - gap;
      const top = title.y0 + drop;
      if (across && m.y1 + gap > top && m.y0 < title.y1 + drop) {
        drop = m.y1 + gap - title.y0;
        again = true;
      }
    }
  }
  return drop;
}
