/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model elements a generated drawing shows and one point on each to label
 * it at: the centre of its biggest cut outline (plan, section), else of its
 * biggest projected outline (elevation), else the middle of its lines.
 * Pure, over the parts of the drawing it reads.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { Pt } from '../draft-types.js';
import { convexHull } from './label-geometry.js';

export type DrawingForLabels = Pick<Drawing2D, 'cutPolygons' | 'projectionPolygons' | 'lines'>;

/** A model element in a view: its renderer id, where its label goes and its outline (drawing coordinates). */
export interface ViewElement {
  renderId: number;
  anchor: Pt;
  /** The outline labels keep clear of: the biggest cut or projected outline, else the box round its lines. */
  ring: Pt[];
  /**
   * Every cut outline of an element the cut shows in more than one piece, `ring` among them: a wall its openings cut in
   * four is four pieces, and a label keeps off all of them, not only the biggest. Absent when `ring` is the only one.
   */
  pieces?: Pt[][];
  /** The plan or section cuts it (its outline is a cut outline, not one seen beyond the cut): what a room tag keeps its text off. */
  cut?: true;
}

interface Candidate {
  area: number;
  centre: Pt;
  ring: Pt[];
}

/** An outline more detailed than this is stood in for by its convex hull, thinned to this many points. */
const MAX_RING = 24;
function simpler(ring: readonly Pt[]): Pt[] {
  if (ring.length <= MAX_RING) return [...ring];
  const hull = convexHull(ring);
  return hull.length <= MAX_RING ? hull : Array.from({ length: MAX_RING }, (_, i) => hull[Math.floor((i * hull.length) / MAX_RING)]);
}

function ringCentre(ring: readonly Pt[]): Candidate | null {
  if (ring.length < 3) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) return null;
  return { area: Math.abs(a) / 2, centre: { x: cx / (3 * a), y: cy / (3 * a) }, ring: simpler(ring) };
}

function biggest(into: Map<number, Candidate>, id: number, c: Candidate | null): void {
  if (c && c.area > (into.get(id)?.area ?? 0)) into.set(id, c);
}

export function viewElements(drawing: DrawingForLabels): ViewElement[] {
  const cut = new Map<number, Candidate>();
  const pieces = new Map<number, Pt[][]>();
  for (const p of drawing.cutPolygons) {
    const c = ringCentre(p.polygon.outer);
    biggest(cut, p.entityId, c);
    if (!c) continue;
    const list = pieces.get(p.entityId);
    if (list) list.push(c.ring); else pieces.set(p.entityId, [c.ring]);
  }
  const projected = new Map<number, Candidate>();
  for (const p of drawing.projectionPolygons) if (!cut.has(p.entityId)) biggest(projected, p.entityId, ringCentre(p.polygon.outer));
  const box = new Map<number, { min: Pt; max: Pt }>();
  for (const l of drawing.lines) {
    if (cut.has(l.entityId) || projected.has(l.entityId) || l.visibility === 'hidden') continue;
    const b = box.get(l.entityId) ?? { min: { ...l.line.start }, max: { ...l.line.start } };
    for (const p of [l.line.start, l.line.end]) {
      b.min = { x: Math.min(b.min.x, p.x), y: Math.min(b.min.y, p.y) };
      b.max = { x: Math.max(b.max.x, p.x), y: Math.max(b.max.y, p.y) };
    }
    box.set(l.entityId, b);
  }
  return [
    ...[...cut].map(([renderId, c]): ViewElement => {
      const all = pieces.get(renderId) ?? [];
      return { renderId, anchor: c.centre, ring: c.ring, ...(all.length > 1 ? { pieces: all } : {}), cut: true };
    }),
    ...[...projected].map(([renderId, c]): ViewElement => ({ renderId, anchor: c.centre, ring: c.ring })),
    ...[...box].map(([renderId, b]): ViewElement => ({
      renderId,
      anchor: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 },
      ring: [b.min, { x: b.max.x, y: b.min.y }, b.max, { x: b.min.x, y: b.max.y }],
    })),
  ].sort((a, b) => a.renderId - b.renderId);
}
