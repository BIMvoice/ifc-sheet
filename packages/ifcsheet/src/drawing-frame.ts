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
 * World is the viewer's render frame (Y-up, RTC-shifted metres), the frame the drawing was generated in. The app's
 * `drafting/frame.ts` re-exports them (and adds its screen mapping), so the sheet and the engine's PDF place a point alike.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { Pt } from './draft-types.js';
import { paperSigns } from './sheet-graphic.js';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Axis = 'x' | 'y' | 'z';

function projectionAxes(axis: Axis): { u: Axis; v: Axis } {
  if (axis === 'x') return { u: 'z', v: 'y' };
  if (axis === 'y') return { u: 'x', v: 'z' };
  return { u: 'x', v: 'y' };
}

/** A drawing point on the view's plane, in world coordinates. */
export function drawingToWorld(plane: SectionPlaneConfig, p: Pt): Vec3 {
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
  return world;
}

/** A world point projected onto the view's drawing coordinates (its distance from the plane is dropped). */
export function worldToDrawing(plane: SectionPlaneConfig, w: Vec3): Pt {
  const custom = plane.customPlane;
  if (custom) {
    const d = { x: w.x - custom.origin.x, y: w.y - custom.origin.y, z: w.z - custom.origin.z };
    return {
      x: d.x * custom.tangent.x + d.y * custom.tangent.y + d.z * custom.tangent.z,
      y: d.x * custom.bitangent.x + d.y * custom.bitangent.y + d.z * custom.bitangent.z,
    };
  }
  const { u, v } = projectionAxes(plane.axis);
  return { x: plane.flipped ? -w[u] : w[u], y: w[v] };
}

export type SectionAxisName = 'down' | 'front' | 'side';

/** The drafting name of each cut axis (a plan cuts on y, a front view on z, a side view on x). */
export const AXIS_NAME = { y: 'down', z: 'front', x: 'side' } as const satisfies Record<'x' | 'y' | 'z', SectionAxisName>;

/** The cut axis of each view kind (`AXIS_NAME` in the sheet inverts it). */
const CUT_AXIS = { down: 'y', front: 'z', side: 'x' } as const;

/** Screen sign per drawing axis for a cut axis (mirrors `axisFlipForSection`): the engine's `paperSigns`, so the PDF and the sheet are mirrored the same way. */
export function screenSigns(axis: SectionAxisName): { kx: 1 | -1; ky: 1 | -1 } {
  return paperSigns(CUT_AXIS[axis]);
}
