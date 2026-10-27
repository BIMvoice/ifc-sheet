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
 *  - The view's drawing: `worldToDrawing(plane, …)` (`drawing-frame.ts`).
 *  - The screen / paper: `drawingToScreen`'s signs (`screenSigns`), y down.
 */

import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';
import { screenSigns, worldToDrawing, type SectionAxisName } from './drawing-frame.js';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';

/** A direction in the IFC project's XY plane, unit length. */
export interface PlanDirection {
  x: number;
  y: number;
}

const CONTEXT = 'IFCGEOMETRICREPRESENTATIONCONTEXT';
const CONTEXT_TYPE = 1;
const TRUE_NORTH = 5;

function unit(x: number, y: number): PlanDirection | null {
  const len = Math.hypot(x, y);
  return Number.isFinite(len) && len > 1e-12 ? { x: x / len, y: y / len } : null;
}

/** The model's true north in project XY, or `null` when no context states one. */
export function trueNorthOf(store: IfcDataStore | null | undefined): PlanDirection | null {
  if (!store?.source?.length || !store.entityIndex) return null;
  const extractor = new EntityExtractor(store.source);
  const { byId } = store.entityIndex;
  // @raw-entity-enumeration-ok TrueNorth is not editable in the app, so the parsed base table is the model's value.
  const contexts = store.entityIndex.byType.get(CONTEXT) ?? [];
  let found: PlanDirection | null = null;
  for (const id of contexts) {
    const ref = byId.get(id);
    const attributes = ref ? extractor.extractEntity(ref)?.attributes : undefined;
    const northId = attributes?.[TRUE_NORTH];
    if (typeof northId !== 'number') continue;
    const northRef = byId.get(northId);
    const ratios = northRef ? extractor.extractEntity(northRef)?.attributes?.[0] : undefined;
    if (!Array.isArray(ratios) || typeof ratios[0] !== 'number' || typeof ratios[1] !== 'number') continue;
    const north = unit(ratios[0], ratios[1]);
    if (!north) continue;
    if (attributes?.[CONTEXT_TYPE] === 'Model') return north;
    found ??= north;
  }
  return found;
}

/** Grid north (the map's +N) in project XY, from an IfcMapConversion's X axis (abscissa, ordinate) = (cos θ, sin θ). */
export function gridNorthOf(xAxisAbscissa: number | undefined, xAxisOrdinate: number | undefined): PlanDirection | null {
  const a = xAxisAbscissa ?? 1;
  const b = xAxisOrdinate ?? 0;
  // E = a·x − b·y, N = b·x + a·y: the local direction with ΔE = 0 and ΔN > 0 is (b, a).
  return unit(b, a);
}

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
