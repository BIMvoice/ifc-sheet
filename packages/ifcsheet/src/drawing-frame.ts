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
 *
 * A plan squared to the building (`plan-orientation.ts`) carries a `turn` on its plane: the world is first turned back
 * about the vertical by it, about the frame's origin, then projected as above. Its drawing is the cardinal drawing
 * turned (`turnedPoint`), so the building's walls run along the drawing's axes while its text stays upright.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { paperSigns } from './sheet-graphic.js';
import { drawingToWorld, drawingProjector, turnOf, turnedPoint, unturnedPoint, worldToDrawing, type DrawingPlane, type Vec3 } from './world-frame.js';

export { drawingToWorld, drawingProjector, turnOf, turnedPoint, unturnedPoint, worldToDrawing, type DrawingPlane, type Vec3 };

export type SectionAxisName = 'down' | 'front' | 'side';

/** The drafting name of each cut axis (a plan cuts on y, a front view on z, a side view on x). */
export const AXIS_NAME = { y: 'down', z: 'front', x: 'side' } as const satisfies Record<'x' | 'y' | 'z', SectionAxisName>;

/** The cut axis of each view kind (`AXIS_NAME` in the sheet inverts it). */
const CUT_AXIS = { down: 'y', front: 'z', side: 'x' } as const;

/** Screen sign per drawing axis for a cut axis (mirrors `axisFlipForSection`): the engine's `paperSigns`, so the PDF and the sheet are mirrored the same way. */
export function screenSigns(axis: SectionAxisName): { kx: 1 | -1; ky: 1 | -1 } {
  return paperSigns(CUT_AXIS[axis]);
}

/** Which way text and marks grow and which way x runs on screen, for a view cut on `axis`: a plan draws drawing-y downward (up = -1), a side view is mirrored (right = -1). The app's annotation frame and the engine's headless annotate step both read it, so they cannot drift. */
export function annotationFrameOf(axis: SectionAxisName): { up: 1 | -1; right: 1 | -1 } {
  const { kx, ky } = screenSigns(axis);
  return { up: ky === 1 ? -1 : 1, right: kx };
}

/**
 * The world direction a view looks FROM, out of the drawing toward the
 * viewer: the custom plane's normal when the view has one (the frame
 * `drawingToWorld` uses), else the cardinal axis; reversed for a flipped view.
 */
export function viewNormal(plane: SectionPlaneConfig): Vec3 {
  const sign = plane.flipped ? -1 : 1;
  const custom = plane.customPlane;
  if (custom) return { x: custom.normal.x * sign, y: custom.normal.y * sign, z: custom.normal.z * sign };
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  n[plane.axis] = sign;
  return n;
}
