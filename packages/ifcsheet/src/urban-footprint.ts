/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A storey's footprint, to the outer face of its walls, from the rendered
 * meshes of what stands on it. Each element is projected onto the plan
 * (`meshOutline2d`, winding-robust, holes kept) and the outlines are united
 * by the kernel's 2D booleans (`resolve2d` / `intersection2d`, i_overlay):
 * no 3D boolean, one projection per element.
 *
 * - The ENCLOSURE (walls, columns, curtain walls) gives the outline. Its
 *   union is a ring of walls with holes: the rooms, and any courtyard.
 *   Touching walls are not exactly touching in f32 mesh coordinates, so the
 *   holes are found on the union of the outlines grown by `CLOSE` (a gap
 *   narrower than twice that closes); the area itself is measured on the
 *   outlines as they are.
 * - The FLOOR (the storey's non-roof slabs and its rooms) tells the holes
 *   apart: one at least half covered by floor is inside the building and
 *   filled; one that is not is a courtyard or light well and stays out. The
 *   floor never adds area of its own, so a balcony slab or a slab edge past
 *   the wall does not widen the footprint.
 * - A storey with walls but no floor has its holes filled (`assumedInterior`);
 *   one with floor but no walls takes the floor's outline.
 *
 * The wasm module must be initialised (`ensureWasm`). Coordinates are the
 * viewer's: plan (x, z) of the Y-up render frame, metres.
 */

import { Contours2D, difference2d, intersection2d, meshOutline2d, resolve2d } from '@ifc-lite/wasm';
import { footprintArea, ringArea, signedRingArea, type FootprintShape, type Pt } from './urban-indicators.js';
import { offsetRing } from './urban-ring-offset.js';

export interface PlanMesh {
  positions: Float32Array;
  indices: Uint32Array;
  /** World position of vertex i = origin + positions[3i..3i+3]. */
  origin?: readonly number[];
}

export interface StoreyFootprint {
  shapes: FootprintShape[];
  source: 'walls' | 'floor';
  /** Walls without floor: every hole was taken as inside the building. */
  assumedInterior: boolean;
  /** Indices of the elements, per group, that gave no outline (left out: the area is a lower bound). */
  unmeasured: { enclosure: number[]; floor: number[] };
}

/** A hole is inside the building when at least this share of it is floor. */
const INTERIOR_COVER = 0.5;
/** Metres the wall outlines grow by to find the holes: closes gaps under 10 mm. */
const CLOSE = 0.005;
const PLAN_AXIS = 1;

type Box = [number, number, number, number];

/**
 * Every element's plan outline rings, in world plan coordinates (f64, origin
 * added after projection), and the elements (by index) left without one: no
 * ring at all, or a mesh whose outline failed (over the kernel's triangle budget).
 */
function outlines(elements: readonly (readonly PlanMesh[])[]): { rings: Pt[][]; failed: number[] } {
  const rings: Pt[][] = [];
  const failed: number[] = [];
  elements.forEach((meshes, index) => {
    let own = 0;
    let broken = false;
    for (const mesh of meshes) {
      let outline;
      try {
        outline = meshOutline2d(mesh.positions, mesh.indices, PLAN_AXIS, false);
      } catch (err) {
        if (!failed.length) console.warn('[urban] an element has no plan outline; it is counted as unmeasured', err);
        broken = true;
        continue;
      }
      if (!outline) continue;
      try {
        // The Y axis projects to (u, v) = (x, z).
        const ox = mesh.origin?.[0] ?? 0, oz = mesh.origin?.[2] ?? 0;
        for (let c = 0; c < outline.contourCount; c++) {
          const flat = outline.contour(c);
          if (!flat || flat.length < 6) continue;
          const ring: Pt[] = [];
          for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] + ox, flat[i + 1] + oz]);
          rings.push(ring);
          own++;
        }
      } finally {
        outline.free();
      }
    }
    if (broken || own === 0) failed.push(index);
  });
  return { rings, failed };
}

function contours(rings: readonly (readonly Pt[])[]): Contours2D {
  const coords: number[] = [];
  const lengths: number[] = [];
  for (const ring of rings) {
    for (const [x, y] of ring) coords.push(x, y);
    lengths.push(ring.length);
  }
  return new Contours2D(new Float64Array(coords), new Uint32Array(lengths));
}

/** The disjoint shapes of a boolean result, each its outer ring and holes. */
function shapesOf(set: Contours2D): FootprintShape[] {
  const offsets = set.shapeOffsets();
  const count = set.ringCount;
  const shapes: FootprintShape[] = [];
  for (let s = 0; s < offsets.length; s++) {
    const end = s + 1 < offsets.length ? offsets[s + 1] : count;
    const rings: Pt[][] = [];
    for (let r = offsets[s]; r < end; r++) {
      const flat = set.ring(r);
      if (!flat) continue;
      const ring: Pt[] = [];
      for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
      rings.push(ring);
    }
    if (rings.length) shapes.push({ outer: rings[0], holes: rings.slice(1) });
  }
  return shapes;
}

/** A union of rings (counter-clockwise covers, clockwise cuts), as disjoint shapes. */
function unite(rings: readonly (readonly Pt[])[]): FootprintShape[] {
  if (!rings.length) return [];
  const raw = contours(rings);
  try {
    const set = resolve2d(raw);
    try { return shapesOf(set); } finally { set.free(); }
  } finally { raw.free(); }
}

/** `a − b` as rings (outer counter-clockwise, holes clockwise). */
function subtract(a: readonly (readonly Pt[])[], b: readonly (readonly Pt[])[]): (readonly Pt[])[] {
  if (!a.length) return [];
  const ca = contours(a), cb = contours(b);
  try {
    const set = difference2d(ca, cb);
    try {
      return shapesOf(set).flatMap((shape) => [oriented(shape.outer, true), ...shape.holes.map((h) => oriented(h, false))]);
    } finally { set.free(); }
  } finally { ca.free(); cb.free(); }
}

function boxOf(ring: readonly Pt[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Orient a ring: counter-clockwise to cover, clockwise to cut. */
const oriented = (ring: readonly Pt[], ccw: boolean): readonly Pt[] => ((signedRingArea(ring) >= 0) === ccw ? ring : [...ring].reverse());

/** The share of `hole` the floor covers, intersecting only the floor rings whose bounds meet it. */
function floorCover(hole: readonly Pt[], floor: readonly Pt[][], floorBoxes: readonly Box[]): number {
  const box = boxOf(hole);
  const near = floor.filter((_, i) => overlaps(floorBoxes[i], box));
  const area = ringArea(hole);
  if (!near.length || area <= 0) return 0;
  const a = contours([oriented(hole, true)]);
  const b = contours(near);
  try {
    const both = intersection2d(a, b);
    try { return footprintArea(shapesOf(both)) / area; } finally { both.free(); }
  } finally { a.free(); b.free(); }
}

/** The footprint of one storey, from its elements' meshes (one list per element); no shapes when nothing on it has a plan outline. */
export function storeyFootprint(enclosure: readonly (readonly PlanMesh[])[], floor: readonly (readonly PlanMesh[])[]): StoreyFootprint {
  const walls = outlines(enclosure);
  const floors = outlines(floor);
  const unmeasured = { enclosure: walls.failed, floor: floors.failed };
  if (!walls.rings.length) {
    const shapes = unite(floors.rings);
    return { shapes, source: 'floor', assumedInterior: false, unmeasured };
  }
  const assumedInterior = floors.rings.length === 0;
  const floorBoxes = floors.rings.map(boxOf);
  // The holes, on the grown walls: rooms and courtyards, no longer leaking through hairline gaps.
  const closed = unite(walls.rings.map((r) => offsetRing(r, CLOSE)));
  const fill: (readonly Pt[])[] = [];
  const courtyards: (readonly Pt[])[] = [];
  for (const shape of closed) {
    for (const hole of shape.holes) {
      if (assumedInterior || floorCover(hole, floors.rings, floorBoxes) >= INTERIOR_COVER) {
        // Back to the room's size, and as far again into the walls, so it fuses with them.
        fill.push(offsetRing(oriented(hole, true), 2 * CLOSE));
      } else {
        // Back to the courtyard's size: a filled room around it (an island of walls in it) must not cover it.
        courtyards.push(offsetRing(oriented(hole, true), CLOSE));
      }
    }
  }
  const rooms = courtyards.length ? subtract(fill, courtyards) : fill;
  return { shapes: unite([...walls.rings, ...rooms]), source: 'walls', assumedInterior, unmeasured };
}
