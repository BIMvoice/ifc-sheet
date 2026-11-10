/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's true north, read from `IfcGeometricRepresentationContext.TrueNorth`
 * (attribute 6 in IFC2X3 and IFC4 alike; a sub-context derives it from its
 * parent, so only plain contexts are read). The 'Model' context's wins over any
 * other, e.g. a 'Plan' one.
 *
 * The one reader: the web app's site plan and the north arrow of a sheet
 * viewport (`viewport-marks.ts`) both call it, so the screen and the PDF turn
 * the arrow by the same angle. The direction is in the IFC project's XY plane,
 * the frame the meshes are placed in (the kernel does not apply a context's
 * WorldCoordinateSystem, so it is taken as identity).
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';
import { screenSigns, worldToDrawing, type SectionAxisName } from './drawing-frame.js';

/** A direction in the IFC project's XY plane, unit length. */
export interface PlanDirection {
  x: number;
  y: number;
}

const CONTEXT = 'IFCGEOMETRICREPRESENTATIONCONTEXT';
const CONTEXT_TYPE = 1;
const TRUE_NORTH = 5;

/** `(x, y)` as a unit direction; null for a zero or non-finite one. */
export function unitDirection(x: number, y: number): PlanDirection | null {
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
    const north = unitDirection(ratios[0], ratios[1]);
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
  return unitDirection(b, a);
}

/** The X axis (abscissa, ordinate) of the model's IfcMapConversion (attributes 5 and 6 of it and of IfcMapConversionScaled); null when it has none. */
export function mapConversionAxisOf(store: IfcDataStore | null | undefined): { abscissa?: number; ordinate?: number } | null {
  if (!store?.source?.length || !store.entityIndex) return null;
  const extractor = new EntityExtractor(store.source);
  const { byId, byType } = store.entityIndex;
  for (const type of ['IFCMAPCONVERSION', 'IFCMAPCONVERSIONSCALED']) {
    // @raw-entity-enumeration-ok The map conversion is read as stated; the app passes its edited one to `siteNorth` itself.
    const id = (byType.get(type) ?? [])[0];
    const ref = id === undefined ? undefined : byId.get(id);
    const attributes = ref ? extractor.extractEntity(ref)?.attributes : undefined;
    if (!attributes) continue;
    const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
    return { abscissa: num(attributes[5]), ordinate: num(attributes[6]) };
  }
  return null;
}

/**
 * The north a drawing's arrow points to, in project XY: the model's TrueNorth, else grid north of its
 * map conversion, else `null` (project north, +Y). The one rule, shared by the site plan, the viewport
 * arrow on the screen and the PDF/DXF writers.
 */
export function siteNorth(
  trueNorth: PlanDirection | null,
  mapConversionAxis: { abscissa?: number; ordinate?: number } | null | undefined,
): { north: PlanDirection | null; northSource: 'trueNorth' | 'gridNorth' | null } {
  if (trueNorth) return { north: trueNorth, northSource: 'trueNorth' };
  const grid = mapConversionAxis ? gridNorthOf(mapConversionAxis.abscissa, mapConversionAxis.ordinate) : null;
  return grid ? { north: grid, northSource: 'gridNorth' } : { north: null, northSource: null };
}

/** `siteNorth` for a model as stated in its file. */
export function northOfStore(store: IfcDataStore | null | undefined): PlanDirection | null {
  return siteNorth(trueNorthOf(store), mapConversionAxisOf(store)).north;
}

/**
 * The rotation a north arrow takes on a plan drawing: radians, counter-clockwise as the user sees the screen or the paper, from the
 * drawing's up to `north` (the convention `placeSymbol` turns a symbol by). `null` on anything but a cardinal plan (a section or
 * elevation has no north to point to).
 */
export function northArrowRotation(plane: SectionPlaneConfig, axis: SectionAxisName, north: PlanDirection): number | null {
  if (axis !== 'down' || plane.axis !== 'y' || plane.customPlane) return null;
  // Project XY -> viewer (x, ., -y) -> drawing -> screen (y down).
  const o = worldToDrawing(plane, { x: 0, y: 0, z: 0 });
  const tip = worldToDrawing(plane, { x: north.x, y: 0, z: -north.y });
  const { kx, ky } = screenSigns(axis);
  const sx = (tip.x - o.x) * kx;
  const sy = (tip.y - o.y) * ky;
  // On screen with y up the direction is (sx, -sy); turning up (0, 1) by theta counter-clockwise gives (-sin theta, cos theta).
  return Math.atan2(-sx, -sy);
}
