/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A cut face hides what lies behind it (#749). The section's cut faces lie ON the plane, nearer the viewer than anything
 * projected beyond it, but they are not in the hidden-line depth buffer: a cut solid has no face at the plane, only the faces
 * further back. So an edge inside a cut wall, a window or a reveal a few centimetres behind the plane, was the nearest thing
 * the depth buffer saw there and printed as visible over the wall's cut fill.
 *
 * Exact and in 2D, on the reconstructed cut polygons: each classifiable line is split where it crosses a polygon's boundary,
 * and the pieces strictly inside a cut face become hidden. A piece on a boundary (within `tolerance`) stays as it was, so a
 * wall face that runs on behind the plane keeps its line along the cut outline.
 */

import type { DrawingLine, DrawingPolygon, Point2D } from './types.js';
import { isFeatureElementType } from './feature-elements.js';

/** How close to a cut face's outline a piece of line counts as on it, drawing units (metres): 0.1 mm. */
export const CUT_FACE_EDGE_TOLERANCE = 1e-4;

interface Face {
  rings: Point2D[][];
  min: Point2D;
  max: Point2D;
}

/** The faces that hide: every cut but a room's (a space is air, not a solid) and a void's (an opening is a boolean operand). */
function occludingFaces(polygons: readonly DrawingPolygon[]): Face[] {
  const faces: Face[] = [];
  for (const p of polygons) {
    if (isFeatureElementType(p.ifcType) || /^ifcspace$/i.test(p.ifcType ?? '')) continue;
    const rings = [p.polygon.outer, ...p.polygon.holes].filter((r) => r.length >= 3);
    if (rings.length === 0) continue;
    const min = { x: Infinity, y: Infinity }, max = { x: -Infinity, y: -Infinity };
    for (const q of p.polygon.outer) {
      min.x = Math.min(min.x, q.x); min.y = Math.min(min.y, q.y);
      max.x = Math.max(max.x, q.x); max.y = Math.max(max.y, q.y);
    }
    faces.push({ rings, min, max });
  }
  return faces;
}

/** Distance from `p` to the segment `a`-`b`. */
function segmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether `p` is inside the face, further than `tolerance` from every ring (even-odd, so a hole is outside). */
function strictlyInside(face: Face, p: Point2D, tolerance: number): boolean {
  if (p.x < face.min.x || p.x > face.max.x || p.y < face.min.y || p.y > face.max.y) return false;
  let inside = false;
  for (const ring of face.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if (segmentDistance(p, a, b) <= tolerance) return false;
      if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
    }
  }
  return inside;
}

/** The parameters along `s`-`e` (0..1) where it crosses a ring edge of `face`. */
function crossings(face: Face, s: Point2D, e: Point2D, out: number[]): void {
  const rx = e.x - s.x, ry = e.y - s.y;
  for (const ring of face.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      const qx = b.x - a.x, qy = b.y - a.y;
      const den = rx * qy - ry * qx;
      if (den === 0) continue; // parallel: on the outline or apart, the midpoint test decides
      const t = ((a.x - s.x) * qy - (a.y - s.y) * qx) / den;
      const u = ((a.x - s.x) * ry - (a.y - s.y) * rx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
    }
  }
}

/**
 * `lines` with the pieces that lie inside a cut face marked hidden. Only lines beyond the plane are hidden this way
 * (`category` other than `cut`, `depth` above 0); a line already hidden, and every other line, is returned as it was. A split
 * piece carries its own depth, interpolated along the parent the way the hidden-line classifier splits (`hidden-line.ts`).
 */
export function hideBehindCutFaces(lines: readonly DrawingLine[], polygons: readonly DrawingPolygon[], tolerance = CUT_FACE_EDGE_TOLERANCE): DrawingLine[] {
  const faces = occludingFaces(polygons);
  if (faces.length === 0) return [...lines];
  const out: DrawingLine[] = [];
  for (const line of lines) {
    const { start: s, end: e } = line.line;
    const depthEnd = line.depthEnd ?? line.depth;
    if (line.visibility !== 'visible' || line.category === 'cut' || Math.max(line.depth, depthEnd) <= 0) { out.push(line); continue; }
    const lo = { x: Math.min(s.x, e.x), y: Math.min(s.y, e.y) }, hi = { x: Math.max(s.x, e.x), y: Math.max(s.y, e.y) };
    const near = faces.filter((f) => f.max.x >= lo.x && f.min.x <= hi.x && f.max.y >= lo.y && f.min.y <= hi.y);
    if (near.length === 0) { out.push(line); continue; }
    const ts = [0, 1];
    for (const f of near) crossings(f, s, e, ts);
    ts.sort((a, b) => a - b);
    const at = (t: number): Point2D => ({ x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t });
    // Runs of one visibility, merged so an unsplit line comes back as one line.
    const runs: { t0: number; t1: number; hidden: boolean }[] = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 <= 1e-12) continue;
      const mid = at((t0 + t1) / 2);
      const hidden = near.some((f) => strictlyInside(f, mid, tolerance));
      const last = runs[runs.length - 1];
      if (last && last.hidden === hidden) last.t1 = t1;
      else runs.push({ t0, t1, hidden });
    }
    if (runs.length === 1 && !runs[0].hidden) { out.push(line); continue; }
    for (const r of runs) {
      const depth = line.depth + (depthEnd - line.depth) * r.t0;
      const end = line.depth + (depthEnd - line.depth) * r.t1;
      const piece: DrawingLine = { ...line, line: { start: at(r.t0), end: at(r.t1) }, visibility: r.hidden ? 'hidden' : 'visible', depth };
      if (end !== depth) piece.depthEnd = end;
      else delete piece.depthEnd;
      out.push(piece);
    }
  }
  return out;
}
