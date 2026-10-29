/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * True north: read from the model, and turned into the angle a north arrow
 * takes on a drawing.
 *
 * The model states it as `IfcGeometricRepresentationContext.TrueNorth`, an
 * IfcDirection in the project's XY plane (attribute 6 in IFC2X3 and IFC4
 * alike; a sub-context derives it from its parent, so only plain contexts are
 * read). The 'Model' context's wins over any other, e.g. a 'Plan' one.
 *
 * Frames, as this module uses them:
 *  - IFC project XY, in which TrueNorth is stated. The geometry kernel does
 *    not apply a context's WorldCoordinateSystem, so this is also the frame
 *    the meshes are placed in (taken as identity here).
 *  - The viewer's render frame, Y-up: viewer (x, y, z) = IFC (x, z, −y)
 *    (`project/view-plane.ts` header; `viewerDeltaToProjectedDelta` reads
 *    viewer z as −IFC y). A direction needs no RTC shift.
 *  - The view's drawing: `worldToDrawing(plane, …)` (`drafting/frame.ts`).
 *  - The screen / paper: `drawingToScreen`'s signs (`screenSigns`), y down.
 */

import { gridNorthOf, trueNorthOf, type PlanDirection } from '@bimvoice/ifcsheet/true-north';
import { screenSigns, worldToDrawing, type SectionAxisName } from '@/drafting/frame';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';

/** Read by the engine, so the sheet's PDF and the screen turn the arrow by the same angle (`@bimvoice/ifcsheet/true-north`). */
export { gridNorthOf, trueNorthOf, type PlanDirection };

/**
 * The rotation a north arrow takes on a plan drawing: radians,
 * counter-clockwise as the user sees the screen or the paper, from the
 * drawing's up to `north` — the convention `placeSymbol` turns a symbol by.
 * `null` on anything but a cardinal plan (a section or elevation has no
 * north to point to).
 */
export function northArrowRotation(plane: SectionPlaneConfig, axis: SectionAxisName, north: PlanDirection): number | null {
  if (axis !== 'down' || plane.axis !== 'y' || plane.customPlane) return null;
  // Project XY → viewer (x, ·, −y) → drawing → screen (y down).
  const o = worldToDrawing(plane, { x: 0, y: 0, z: 0 });
  const tip = worldToDrawing(plane, { x: north.x, y: 0, z: -north.y });
  const { kx, ky } = screenSigns(axis);
  const sx = (tip.x - o.x) * kx;
  const sy = (tip.y - o.y) * ky;
  // On screen with y up the direction is (sx, −sy); turning up (0, 1) by θ counter-clockwise gives (−sin θ, cos θ).
  return Math.atan2(-sx, -sy);
}
