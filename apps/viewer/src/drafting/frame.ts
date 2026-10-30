/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bridge between a view's drawing coordinates and the 3D model.
 *
 * A drafted point lives in the drawing's (x, y) space; its 3D position is on
 * the view's plane. These are the exact inverses of
 * `@ifc-lite/drawing-2d`'s `projectTo2D` / `projectTo2DBasis` (math.ts):
 *
 *   cardinal: plane axis k, in-plane axes (u, v) = getProjectionAxes(k),
 *             x = flipped ? -p[u] : p[u], y = p[v], p[k] = position
 *   custom:   x = dot(p − origin, tangent), y = dot(p − origin, bitangent)
 *
 * World is the viewer's render frame (Y-up, RTC-shifted metres), the frame
 * the drawing was generated in.
 *
 * And the screen mapping the Drawing canvas uses: screen = drawing × scale,
 * mirrored on X for a side cut and on Y for every non-plan cut
 * (`axisFlipForSection`), plus the pan offset.
 */

import { AXIS_NAME, drawingToWorld, screenSigns, worldToDrawing, type SectionAxisName, type Vec3 } from '@bimvoice/ifcsheet';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { Pt } from './types';

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

export { AXIS_NAME, drawingToWorld, screenSigns, worldToDrawing, type SectionAxisName, type Vec3 };

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export function drawingToScreen(p: Pt, t: ViewTransform, axis: SectionAxisName): Pt {
  const { kx, ky } = screenSigns(axis);
  return { x: p.x * kx * t.scale + t.x, y: p.y * ky * t.scale + t.y };
}

export function screenToDrawing(s: Pt, t: ViewTransform, axis: SectionAxisName): Pt {
  const { kx, ky } = screenSigns(axis);
  return { x: (s.x - t.x) / (kx * t.scale), y: (s.y - t.y) / (ky * t.scale) };
}

/**
 * Typed coordinates are in the USER's frame — x to the right and y UP on
 * screen, angles counter-clockwise on screen — whatever way the drawing is
 * mirrored. These convert a user-frame vector to drawing space and back.
 */
export function userToDrawingVec(v: Pt, axis: SectionAxisName): Pt {
  const { kx, ky } = screenSigns(axis);
  return { x: v.x * kx, y: -v.y * ky };
}

export function drawingToUserVec(v: Pt, axis: SectionAxisName): Pt {
  const { kx, ky } = screenSigns(axis);
  return { x: v.x * kx, y: -v.y * ky };
}

/**
 * A typed ABSOLUTE point. The user's (0, 0) is `origin`, a point in drawing
 * space: the drawing origin on a view, the lower-left corner of the paper on a
 * sheet (where drawing y runs down from the top-left corner, so a typed
 * `20,30` is 20 mm from the left and 30 mm up from the bottom edge, on the
 * paper, not above it).
 */
export function userToDrawingPoint(p: Pt, axis: SectionAxisName, origin: Pt): Pt {
  const v = userToDrawingVec(p, axis);
  return { x: origin.x + v.x, y: origin.y + v.y };
}

export function drawingToUserPoint(p: Pt, axis: SectionAxisName, origin: Pt): Pt {
  return drawingToUserVec({ x: p.x - origin.x, y: p.y - origin.y }, axis);
}
