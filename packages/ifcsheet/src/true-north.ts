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

import { EntityExtractor, type IfcDataStore } from '@ifc-lite/parser';

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
