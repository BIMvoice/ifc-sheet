/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #666: which drafted elements a dragged region selects. Plain geometry, no screen, no store.
 *
 * A region is a box or a freehand loop (a lasso). An element is built from the lines it is picked by
 * (`entitySkeleton`: a dimension's lines, a text's frame, a hatch's outline). It is "inside" a region
 * when every one of those lines lies within it, and "touched" when any line has a point within it.
 * A box dragged to the right selects what is inside (window); to the left, what it touches (crossing).
 * A loop selects what is inside it. An arc or circle counts as touched when its bounding box meets the region's.
 */

import { entitySkeleton } from './annotation';
import { primBounds, shapePrims, type Bounds, type Prim } from './curves';
import type { EntityShape, Pt } from './types';

export type Region =
  | { kind: 'box'; min: Pt; max: Pt }
  | { kind: 'loop'; pts: readonly Pt[] };

/** The box through two opposite corners, whichever way it was dragged. */
export function boxRegion(a: Pt, b: Pt): Region {
  return { kind: 'box', min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
}

/** Even-odd test: true when `p` is inside the polygon (a point on the edge may fall on either side). */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return cross(a, b, p) === 0 && Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** True when the segments ab and cd cross or touch. */
export function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return onSegment(c, d, a) || onSegment(c, d, b) || onSegment(a, b, c) || onSegment(a, b, d);
}

function contains(region: Region, p: Pt): boolean {
  if (region.kind === 'loop') return pointInPolygon(p, region.pts);
  return p.x >= region.min.x && p.x <= region.max.x && p.y >= region.min.y && p.y <= region.max.y;
}

/** The edges of the region's outline. */
function outline(region: Region): Array<[Pt, Pt]> {
  const pts = region.kind === 'loop'
    ? region.pts
    : [region.min, { x: region.max.x, y: region.min.y }, region.max, { x: region.min.x, y: region.max.y }];
  return pts.map((p, i): [Pt, Pt] => [p, pts[(i + 1) % pts.length]]);
}

function regionBounds(region: Region): Bounds {
  if (region.kind === 'box') return { min: region.min, max: region.max };
  return {
    min: { x: Math.min(...region.pts.map((p) => p.x)), y: Math.min(...region.pts.map((p) => p.y)) },
    max: { x: Math.max(...region.pts.map((p) => p.x)), y: Math.max(...region.pts.map((p) => p.y)) },
  };
}

function boundsMeet(a: Bounds, b: Bounds): boolean {
  return a.max.x >= b.min.x && a.min.x <= b.max.x && a.max.y >= b.min.y && a.min.y <= b.max.y;
}

/** The points a primitive must have within a region to count as inside it: a segment's ends, an arc's bounding corners. */
function extremes(prim: Prim): Pt[] {
  if (prim.kind === 'seg') return [prim.a, prim.b];
  const { min, max } = primBounds(prim);
  return [min, max, { x: min.x, y: max.y }, { x: max.x, y: min.y }];
}

function isInside(prim: Prim, region: Region): boolean {
  if (!extremes(prim).every((p) => contains(region, p))) return false;
  // A loop can leave and come back: a segment whose ends are inside but which crosses the loop is not.
  return region.kind === 'box' || prim.kind !== 'seg' || !outline(region).some(([c, d]) => segmentsMeet(prim.a, prim.b, c, d));
}

function isTouched(prim: Prim, region: Region): boolean {
  if (prim.kind === 'arc') return boundsMeet(primBounds(prim), regionBounds(region));
  return contains(region, prim.a) || contains(region, prim.b) || outline(region).some(([c, d]) => segmentsMeet(prim.a, prim.b, c, d));
}

/** Whether the element is inside the region, or, with `crossing`, also when only part of it is. */
export function entityInRegion(shape: EntityShape, region: Region, crossing: boolean): boolean {
  const prims = entitySkeleton(shape).flatMap(shapePrims);
  if (prims.length === 0) return false;
  if (prims.every((prim) => isInside(prim, region))) return true;
  return crossing && prims.some((prim) => isTouched(prim, region));
}

/** Thins a dragged path: keeps a point only when it is at least `min` away from the last one kept. */
export function thinPath(path: readonly Pt[], p: Pt, min: number): readonly Pt[] {
  const last = path[path.length - 1];
  return last && Math.hypot(p.x - last.x, p.y - last.y) < min ? path : [...path, p];
}
