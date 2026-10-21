/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The vertical section plane through a line drawn on a plan, in world metres
 * (the viewer frame: X east, Y up, Z south). The SECTION command and the
 * starting set's proposed sections both cut on it.
 */

import type { SectionCustomPlane } from './document.js';

/** A world point, metres. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

const cross = (a: WorldPoint, b: WorldPoint): WorldPoint => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: WorldPoint, b: WorldPoint): number => a.x * b.x + a.y * b.y + a.z * b.z;
const tuple = (v: WorldPoint): [number, number, number] => [v.x, v.y, v.z];

/**
 * The vertical plane through `p` and `q`, looking toward `side` (the normal
 * points away from it). `null` when `p` and `q` are the same point in plan.
 */
export function sectionPlaneThrough(p: WorldPoint, q: WorldPoint, side: WorldPoint): SectionCustomPlane | null {
  // Horizontal direction along the line (viewer frame is Y-up).
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  let normal: WorldPoint = { x: dz / len, y: 0, z: -dx / len };
  // Keep the picked side: the normal points away from it.
  if ((side.x - p.x) * normal.x + (side.z - p.z) * normal.z > 0) normal = { x: -normal.x, y: 0, z: -normal.z };
  const up: WorldPoint = { x: 0, y: 1, z: 0 };
  // Looking along −normal with world up, screen right is (−normal) × up.
  const tangent = cross({ x: -normal.x, y: 0, z: -normal.z }, up);
  return {
    normal: tuple(normal),
    distance: dot(p, normal),
    pickedAt: tuple(p),
    tangent: tuple(tangent),
    bitangent: tuple(up),
  };
}

/**
 * `pickedAt` projected onto the plane: the anchor on the live plane. Only
 * `distance` changes as a plane is moved, so `pickedAt` sits off it; the cap
 * polygon basis, the drag gizmo and a drawing's origin use this point. The
 * projection is `pickedAt + (distance − dot(pickedAt, normal)) · normal`; just
 * after a fresh pick it equals `pickedAt`.
 */
export function customPlaneCenter(plane: Pick<SectionCustomPlane, 'pickedAt' | 'normal' | 'distance'>): [number, number, number] {
  const { pickedAt: p, normal: n, distance: d } = plane;
  const dotPicked = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
  const k = d - dotPicked;
  return [p[0] + k * n[0], p[1] + k * n[1], p[2] + k * n[2]];
}
