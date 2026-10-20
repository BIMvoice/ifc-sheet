/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A revision cloud as a drafted shape: a closed run of scallops round a
 * rectangle, each scallop a half circle bulging outward, drawn as a polyline so
 * it is an ordinary shape (it moves, deletes, exports to DXF like any other).
 * `radius` is the scallop's radius; the rectangle is the box to mark, drawing
 * units. Pure; the same box gives the same cloud.
 */

import type { Pt } from '@/drafting/types';
import type { Rect } from '@/labels/label-geometry';
import type { ModelChange } from './compare';
import { boxInView, drawingRect, type ViewBand } from './visibility';

/** Points along each half circle. */
const STEPS = 6;

export function cloudRing(box: Rect, radius: number): Pt[] {
  // Counter-clockwise from the lower left; outward is to the right of the walking direction.
  const corners: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  const out: Pt[] = [];
  for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / (2 * radius)));
    const along = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const outward = { x: along.y, y: -along.x };
    const r = len / n / 2;
    for (let i = 0; i < n; i++) {
      const c = { x: a.x + along.x * (2 * i + 1) * r, y: a.y + along.y * (2 * i + 1) * r };
      for (let k = 0; k < STEPS; k++) {
        const t = Math.PI - (Math.PI * k) / STEPS;
        out.push({ x: c.x + along.x * r * Math.cos(t) + outward.x * r * Math.sin(t), y: c.y + along.y * r * Math.cos(t) + outward.y * r * Math.sin(t) });
      }
    }
  }
  return out;
}

/**
 * At most `max` boxes covering `boxes`: all of them when they are few; else the boxes are sorted into a grid of
 * about `max` cells by their centres and each cell gets the box round its members. A new version that moves
 * most of a model would otherwise ask for a cloud per element per view, thousands of drawn shapes.
 */
export function groupBoxes(boxes: readonly Rect[], max: number): Rect[] {
  if (boxes.length <= max) return [...boxes];
  const all = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
  const side = Math.max(1, Math.floor(Math.sqrt(max)));
  const w = (all.x1 - all.x0) / side || 1, h = (all.y1 - all.y0) / side || 1;
  const cells = new Map<number, Rect>();
  for (const b of boxes) {
    const ix = Math.min(side - 1, Math.floor(((b.x0 + b.x1) / 2 - all.x0) / w)), iy = Math.min(side - 1, Math.floor(((b.y0 + b.y1) / 2 - all.y0) / h));
    const k = ix * side + iy, c = cells.get(k);
    cells.set(k, c ? { x0: Math.min(c.x0, b.x0), y0: Math.min(c.y0, b.y0), x1: Math.max(c.x1, b.x1), y1: Math.max(c.y1, b.y1) } : b);
  }
  return [...cells.values()];
}

/**
 * The rectangles of a view to mark, in its drawing: round each changed element where it is now (an added,
 * moved, reshaped or edited element), where it was when it is gone, and, when it moved, where it was as well.
 * Only a place the view shows is marked (a moved element whose old place is outside the view's band, or an
 * element that stands elsewhere, gets none there).
 */
export function cloudBoxes(changes: readonly ModelChange[], band: ViewBand): Rect[] {
  const plane = band.plane;
  if (!plane) return [];
  const out: Rect[] = [];
  for (const c of changes) {
    const places = [c.after ?? c.before, ...(c.after && c.before && c.kinds.includes('moved') ? [c.before] : [])];
    for (const box of places) if (box && boxInView(box, band)) out.push(drawingRect(box, plane));
  }
  return out;
}
