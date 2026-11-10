/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's drawing coordinates and the 3D model: a drafted point lives in the drawing's (x, y) space and its 3D position is on the
 * view's plane. These are the exact inverses of `@ifc-lite/drawing-2d`'s `projectTo2D` / `projectTo2DBasis` (math.ts):
 *
 *   cardinal: plane axis k, in-plane axes (u, v) = getProjectionAxes(k),
 *             x = flipped ? -p[u] : p[u], y = p[v], p[k] = position
 *   custom:   x = dot(p - origin, tangent), y = dot(p - origin, bitangent)
 *
 * This file holds the part with no other imports (the worker that traces a scan's outline takes it too); `drawing-frame.ts` re-exports it and adds the paper mapping.
 *
 * World is the viewer's render frame (Y-up, RTC-shifted metres), the frame the drawing was generated in. The app's
 * `drafting/frame.ts` re-exports them (and adds its screen mapping), so the sheet and the engine's PDF place a point alike.
 *
 * A plan squared to the building (`plan-orientation.ts`) carries a `turn` on its plane: the world is first turned back
 * about the vertical by it, about the frame's origin, then projected as above. Its drawing is the cardinal drawing
 * turned (`turnedPoint`), so the building's walls run along the drawing's axes while its text stays upright.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { Pt } from './draft-types.js';

type Axis = 'x' | 'y' | 'z';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A view's plane with the turn its plan is drawn at: radians about the vertical, counter-clockwise seen from above (the
 * IfcSite's rotation, `coordinateInfo.buildingRotation`), by which the world is turned back before it is projected.
 * Absent or 0: the world's axes. Only a cardinal plan (axis y, no custom plane) is turned.
 */
export type DrawingPlane = SectionPlaneConfig & { turn?: number };

/** The turn `plane` is drawn at (`DrawingPlane`), 0 for anything but a turned cardinal plan. */
export function turnOf(plane: DrawingPlane): number {
  const t = plane.turn;
  return plane.axis === 'y' && !plane.customPlane && typeof t === 'number' && Number.isFinite(t) ? t : 0;
}

/** `w` turned about the vertical by `-turn` (cos, sin of the turn): the world as the turned plan sees it. */
function turnedBack(w: Vec3, c: number, s: number): Vec3 {
  return { x: w.x * c - w.z * s, y: w.y, z: w.x * s + w.z * c };
}

function projectionAxes(axis: Axis): { u: Axis; v: Axis } {
  if (axis === 'x') return { u: 'z', v: 'y' };
  if (axis === 'y') return { u: 'x', v: 'z' };
  return { u: 'x', v: 'y' };
}

/** A drawing point on the view's plane, in world coordinates. */
export function drawingToWorld(plane: DrawingPlane, p: Pt): Vec3 {
  const custom = plane.customPlane;
  if (custom) {
    return {
      x: custom.origin.x + p.x * custom.tangent.x + p.y * custom.bitangent.x,
      y: custom.origin.y + p.x * custom.tangent.y + p.y * custom.bitangent.y,
      z: custom.origin.z + p.x * custom.tangent.z + p.y * custom.bitangent.z,
    };
  }
  const { u, v } = projectionAxes(plane.axis);
  const world: Vec3 = { x: 0, y: 0, z: 0 };
  world[plane.axis] = plane.position;
  world[u] = plane.flipped ? -p.x : p.x;
  world[v] = p.y;
  const turn = turnOf(plane);
  return turn ? turnedBack(world, Math.cos(turn), -Math.sin(turn)) : world;
}

/** A world point projected onto the view's drawing coordinates (its distance from the plane is dropped). */
export function worldToDrawing(plane: DrawingPlane, w: Vec3): Pt {
  const custom = plane.customPlane;
  if (custom) {
    const d = { x: w.x - custom.origin.x, y: w.y - custom.origin.y, z: w.z - custom.origin.z };
    return {
      x: d.x * custom.tangent.x + d.y * custom.tangent.y + d.z * custom.tangent.z,
      y: d.x * custom.bitangent.x + d.y * custom.bitangent.y + d.z * custom.bitangent.z,
    };
  }
  const turn = turnOf(plane);
  const seen = turn ? turnedBack(w, Math.cos(turn), Math.sin(turn)) : w;
  const { u, v } = projectionAxes(plane.axis);
  return { x: plane.flipped ? -seen[u] : seen[u], y: seen[v] };
}

/**
 * The projection of world points `(x, y, z)` onto `plane`'s drawing, for loops over mesh vertices: `worldToDrawing`
 * without building a point per vertex. The one projection the inline vertex loops (plan symbols, openings, DIMALL's
 * bodies) use, so a turned plan turns them all.
 */
export function drawingProjector(plane: DrawingPlane): (x: number, y: number, z: number) => Pt {
  if (plane.customPlane) return (x, y, z) => worldToDrawing(plane, { x, y, z });
  const turn = turnOf(plane);
  const { u, v } = projectionAxes(plane.axis);
  const sign = plane.flipped ? -1 : 1;
  if (!turn) {
    const iu = u === 'x' ? 0 : u === 'y' ? 1 : 2, iv = v === 'x' ? 0 : v === 'y' ? 1 : 2;
    const at: [number, number, number] = [0, 0, 0];
    return (x, y, z) => { at[0] = x; at[1] = y; at[2] = z; return { x: sign * at[iu], y: at[iv] }; };
  }
  // A turned plan: u = x, v = z of the world turned back.
  const c = Math.cos(turn), s = Math.sin(turn);
  return (x, _y, z) => ({ x: sign * (x * c - z * s), y: x * s + z * c });
}

/** A point of the cardinal (unturned) drawing of `plane`'s view, in `plane`'s own, turned drawing: the generator draws cardinal, a turned plan is that drawing turned. */
export function turnedPoint(plane: DrawingPlane, p: Pt): Pt {
  const turn = turnOf(plane);
  if (!turn) return p;
  return worldToDrawing(plane, drawingToWorld({ ...plane, turn: 0 }, p));
}

/** The inverse of `turnedPoint`: a point of `plane`'s own, turned drawing as the cardinal (world-axes) drawing has it, which is where the 3D overlay and the generator's own frame sit. */
export function unturnedPoint(plane: DrawingPlane, p: Pt): Pt {
  const turn = turnOf(plane);
  if (!turn) return p;
  return worldToDrawing({ ...plane, turn: 0 }, drawingToWorld(plane, p));
}

