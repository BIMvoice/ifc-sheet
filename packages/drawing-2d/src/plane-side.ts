/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which side of the section plane a vertex is on, and where a triangle crosses it.
 *
 * A vertex within the plane tolerance of the plane is counted on the side the drawing does NOT look at: the cut is
 * taken a hair beyond the plane, on the viewed side. Every vertex then lands on exactly one side, so a face lying on the
 * plane is never cut twice, once from each side. Counting such a vertex as "on the plane" instead let the triangles on
 * both sides of an opening's jamb face each draw their edge along the jamb: the cut was the union of the solid on one
 * side and the opening on the other, and each layer of a wall was then closed whichever way its triangulation fell,
 * some solid across the opening and some open (#749, section B-B on a window jamb).
 *
 * A triangle with one vertex on the plane and the other two on either side of it is cut from that vertex to its far
 * edge; before, that vertex was taken twice and the crossing of the far edge was lost.
 *
 * A face on the plane with its solid on the viewed side (the outer face of a building on an elevation drawn at the
 * model's extent) is still cut, as before. One with its solid on the far side is not cut: it is beyond the cut.
 *
 * The tolerance is at least 10 µm (`PLANE_EPSILON`), wider than the few µm a flat face's vertices stray from its height in
 * the kernel's output; a narrower one cut that face along the diagonals of its triangles (#759).
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { EntityKey, SectionPlaneConfig, Vec3 } from './types.js';
import { makeEntityKey } from './types.js';
import { vec3Lerp } from './math.js';
import { looksUp } from './projection-bands.js';

/** `+1` when the drawing looks along the plane normal (a flipped section, a reflected plan), `-1` when it looks against it: the sign of the signed distance of what it sees. */
export function viewedSide(plane: Pick<SectionPlaneConfig, 'flipped' | 'reflected'>): 1 | -1 {
  return looksUp(plane) ? 1 : -1;
}

/** Max |coordinate| of a mesh's LOCAL (pre-origin) positions, the magnitude its float32 rounding noise scales with (#2622). */
function localMaxCoord(positions: Float32Array): number {
  let m = 0;
  for (let i = 0; i < positions.length; i++) {
    const a = Math.abs(positions[i]);
    if (a > m) m = a;
  }
  return m;
}

/**
 * The least plane tolerance, 10 µm. A face the geometry kernel builds on a given height does not keep every vertex on
 * it: on rvt01 the bottom face of the opening for window 24516 in wall 14797 has its corners 2.4e-8 m from the height
 * and the points the kernel added inside it 6.1e-6 m away. With a tolerance below that, the plane 1e-7 m under the sill
 * put the corners beyond the cut and the inner points on the viewed side, so that one flat face was cut along the
 * diagonals of its triangles and the plan drew a hole through the wall (#759). 10 µm is 0.0001 mm on paper at 1:100.
 */
const PLANE_EPSILON = 1e-5;

/** The plane tolerance of a mesh: `PLANE_EPSILON`, floored to the float32 noise of its local coordinates. */
export function meshPlaneEpsilon(mesh: Pick<MeshData, 'positions'>): number {
  return Math.max(PLANE_EPSILON, localMaxCoord(mesh.positions) * 2 ** -22);
}

/**
 * One plane tolerance per element: the largest of its meshes'. The layers of a wall are separate meshes, and with a
 * tolerance of their own a vertex they share could fall on one side of the plane for one layer and on the other side for
 * the next.
 */
export function entityPlaneEpsilons(meshes: readonly MeshData[]): Map<EntityKey, number> {
  const out = new Map<EntityKey, number>();
  for (const mesh of meshes) {
    const key = makeEntityKey(mesh.modelIndex ?? 0, mesh.expressId);
    const eps = meshPlaneEpsilon(mesh);
    if (eps > (out.get(key) ?? 0)) out.set(key, eps);
  }
  return out;
}

/**
 * The segment where a triangle crosses the plane, or `null`. `d0..d2` are the vertices' signed distances, `eps` the
 * plane tolerance and `viewed` the sign of the side the drawing looks at. A vertex is on the viewed side when its distance
 * is beyond `eps` on that side, and on the other side otherwise; the segment joins the two edges that change side. Where
 * the vertex off the viewed side lies within `eps` of the plane, the cut passes through that vertex.
 */
export function intersectTrianglePlane(
  v0: Vec3, v1: Vec3, v2: Vec3, d0: number, d1: number, d2: number, eps: number, viewed: 1 | -1,
): { p0: Vec3; p1: Vec3 } | null {
  const s0 = d0 * viewed > eps;
  const s1 = d1 * viewed > eps;
  const s2 = d2 * viewed > eps;
  if (s0 === s1 && s1 === s2) return null;
  const points: Vec3[] = [];
  const edge = (a: Vec3, b: Vec3, da: number, db: number, sa: boolean, sb: boolean): void => {
    if (sa === sb) return;
    const [off, dOff] = sa ? [b, db] : [a, da];
    points.push(Math.abs(dOff) <= eps ? off : vec3Lerp(a, b, da / (da - db)));
  };
  edge(v0, v1, d0, d1, s0, s1);
  edge(v1, v2, d1, d2, s1, s2);
  edge(v2, v0, d2, d0, s2, s0);
  return { p0: points[0], p1: points[1] };
}
