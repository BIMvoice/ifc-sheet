/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing cut down to a rectangle, in the drawing's own metres: the lines
 * are clipped to it, the filled polygons are clipped to it, and the drawing's
 * bounds become the rectangle. A detail view shows a drawing this way. Pure.
 */

import type { Bounds2D, Drawing2D, DrawingPolygon, DrawingLine } from '@ifc-lite/drawing-2d';

type P = { x: number; y: number };

/** The part of the segment a-b inside `r` (Liang-Barsky), or `null` when none of it is. */
function clipSegment(a: P, b: P, r: Bounds2D): [P, P] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.min.x], [dx, r.max.x - a.x], [-dy, a.y - r.min.y], [dy, r.max.y - a.y]] as const) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
}

/** A closed loop clipped to `r` (Sutherland-Hodgman); fewer than three points left means nothing is inside. */
function clipLoop(loop: readonly P[], r: Bounds2D): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p.x >= r.min.x, (a, b) => ({ x: r.min.x, y: a.y + ((b.y - a.y) * (r.min.x - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= r.max.x, (a, b) => ({ x: r.max.x, y: a.y + ((b.y - a.y) * (r.max.x - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= r.min.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.min.y - a.y)) / (b.y - a.y), y: r.min.y })],
    [(p) => p.y <= r.max.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.max.y - a.y)) / (b.y - a.y), y: r.max.y })],
  ];
  let out = [...loop];
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    });
    if (out.length === 0) break;
  }
  return out.length >= 3 ? out : [];
}

function clipPolygons(list: readonly DrawingPolygon[], r: Bounds2D): DrawingPolygon[] {
  return list.flatMap((d) => {
    const outer = clipLoop(d.polygon.outer, r);
    if (outer.length === 0) return [];
    return [{ ...d, polygon: { outer, holes: d.polygon.holes.map((h) => clipLoop(h, r)).filter((h) => h.length >= 3) } }];
  });
}

/** `drawing` as seen through the rectangle `r`. */
export function cropDrawing(drawing: Drawing2D, r: Bounds2D): Drawing2D {
  const lines = drawing.lines.flatMap((l): DrawingLine[] => {
    const seg = clipSegment(l.line.start, l.line.end, r);
    return seg ? [{ ...l, line: { ...l.line, start: seg[0], end: seg[1] } }] : [];
  });
  return {
    ...drawing,
    lines,
    cutPolygons: clipPolygons(drawing.cutPolygons, r),
    projectionPolygons: clipPolygons(drawing.projectionPolygons ?? [], r),
    ...(drawing.layerBaseCutPolygons ? { layerBaseCutPolygons: clipPolygons(drawing.layerBaseCutPolygons, r) } : {}),
    bounds: { min: { ...r.min }, max: { ...r.max } },
  };
}
