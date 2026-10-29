/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Clipping a run of points to a rectangle (Liang–Barsky per segment), for a drawing that must stay inside its viewport. */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { Rect } from './sheet-frame.js';

/** The part of segment `a`–`b` inside `box`, or `null` when none is. */
export function clipSegment(a: Point2D, b: Point2D, box: Rect): [Point2D, Point2D] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [[-dx, a.x - box.x], [dx, box.x + box.w - a.x], [-dy, a.y - box.y], [dy, box.y + box.h - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

/** `points` clipped to `box`: the runs that stay inside, each an open run of points; a run wholly inside comes back as it was. */
export function clipPolyline(points: readonly Point2D[], box: Rect): Point2D[][] {
  const out: Point2D[][] = [];
  let run: Point2D[] = [];
  for (let i = 1; i < points.length; i++) {
    const piece = clipSegment(points[i - 1], points[i], box);
    if (!piece) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    const [p, q] = piece;
    const last = run[run.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) {
      if (run.length > 1) out.push(run);
      run = [p];
    }
    run.push(q);
    // Left the box: the run ends here.
    if (q.x !== points[i].x || q.y !== points[i].y) {
      out.push(run);
      run = [];
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

/**
 * A closed loop clipped to `box` as a shape (Sutherland-Hodgman against the four sides): what is left is still one closed loop,
 * where a clipped outline would be open runs. Fewer than three points left means nothing of it shows. The loop is not repeated
 * at its end. For the fills of a coloured plan (#92), which must stay closed where a viewport cuts them.
 */
export function clipPolygon(loop: readonly Point2D[], box: Rect): Point2D[] {
  const [x0, y0, x1, y1] = [box.x, box.y, box.x + box.w, box.y + box.h];
  const sides: { inside: (p: Point2D) => boolean; at: (a: Point2D, b: Point2D) => Point2D }[] = [
    { inside: (p) => p.x >= x0, at: (a, b) => ({ x: x0, y: a.y + ((b.y - a.y) * (x0 - a.x)) / (b.x - a.x) }) },
    { inside: (p) => p.x <= x1, at: (a, b) => ({ x: x1, y: a.y + ((b.y - a.y) * (x1 - a.x)) / (b.x - a.x) }) },
    { inside: (p) => p.y >= y0, at: (a, b) => ({ x: a.x + ((b.x - a.x) * (y0 - a.y)) / (b.y - a.y), y: y0 }) },
    { inside: (p) => p.y <= y1, at: (a, b) => ({ x: a.x + ((b.x - a.x) * (y1 - a.y)) / (b.y - a.y), y: y1 }) },
  ];
  let out = [...loop];
  for (const side of sides) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (side.inside(cur)) {
        if (!side.inside(prev)) out.push(side.at(prev, cur));
        out.push(cur);
      } else if (side.inside(prev)) {
        out.push(side.at(prev, cur));
      }
    });
    if (out.length < 3) return [];
  }
  return out;
}

/** Whether `p` is in `box` (its edge counts). A text cannot be cut like a line: one whose anchor is outside the box is not on the sheet. */
export const pointInBox = (p: Point2D, box: Rect): boolean => p.x >= box.x - 1e-6 && p.x <= box.x + box.w + 1e-6 && p.y >= box.y - 1e-6 && p.y <= box.y + box.h + 1e-6;
