/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getMapUnitScale } from './cesium-placement';
import { ifcToViewerAxes } from './coordinate-frame';
import {
  getEffectiveGeoreference,
  getIfcLengthUnitScale,
  type EffectiveGeoreference,
  type GeorefMutationDataLike,
} from './effective-georef';
import { hasUsableMapGeoref, viewerPointToProjected } from './pick-to-geo';
import { resolveStoreyOriginMeters as resolveEngineOrigin } from '@bimvoice/ifcsheet';
import type { CoordinateInfo } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Resolve an IfcBuildingStorey placement origin through every PlacementRelTo hop (the engine's reader, so the CLI's plans cut where the app's do). */
export function resolveStoreyOriginMeters(store: IfcDataStore, storeyId: number): Point3 | null {
  return resolveEngineOrigin(store, storeyId, getIfcLengthUnitScale(store));
}

/**
 * Resolve an IfcBuildingStorey's model-relative elevation to the absolute
 * height a user reads in the Inspector and the hierarchy badges (#4843).
 *
 * - With a usable IfcMapConversion: metres above the projected CRS vertical
 *   datum (the storey's engineering point run through MapConversion).
 * - Without one: the storey's world Z in the file's own coordinates, i.e. the
 *   full IfcLocalPlacement PlacementRelTo chain. Many exporters keep the
 *   real-world offset in the IfcSite/IfcBuilding placements rather than in a
 *   MapConversion; this is the same frame as the measure tool's Model row.
 * - The relative value is returned only when the placement chain cannot be
 *   resolved.
 *
 * `spatialHierarchy.storeyElevations` deliberately stays model-relative: it
 * drives level matching, grouping, sorting, isolation, editing, and
 * render-frame placement. Only display surfaces use this value. RTC/origin
 * shifts are render precision details and must not be added here; the chain
 * is read from the file's placements, before those shifts are applied.
 */
export function displayStoreyElevationMeters(
  relativeElevationMeters: number,
  georef: EffectiveGeoreference | null | undefined,
  store?: IfcDataStore | null,
  storeyId?: number,
): number {
  // The hierarchy value is intentionally relative, and its placement fallback
  // contains only the storey's own Z. For display, resolve the complete
  // PlacementRelTo chain so Site/Building offsets and rotations are included.
  const storeyOrigin = store && storeyId !== undefined && typeof store.getEntity === 'function'
    ? resolveStoreyOriginMeters(store, storeyId)
    : null;

  if (!hasUsableMapGeoref(georef)) {
    return storeyOrigin && Number.isFinite(storeyOrigin.z) ? storeyOrigin.z : relativeElevationMeters;
  }

  const mapUnitScale = getMapUnitScale(georef.projectedCRS, georef.lengthUnitScale);
  // Keeping the engineering point and origin in the same zero-based frame
  // makes RTC/origin shifts cancel while the canonical projection path
  // supplies MapConversion, unit, Scale, and FactorZ handling. The chain Z is
  // the only engineering height fed in, so OrthogonalHeight is added once.
  const viewerPoint = storeyOrigin
    ? ifcToViewerAxes(storeyOrigin)
    : { x: 0, y: relativeElevationMeters, z: 0 };
  const projected = viewerPointToProjected(
    viewerPoint,
    georef,
    { x: 0, y: 0, z: 0 },
  );
  const absoluteElevation = projected.height * mapUnitScale;

  return Number.isFinite(absoluteElevation) ? absoluteElevation : relativeElevationMeters;
}

/**
 * Per-model display-elevation lookup for surfaces that label many storeys at
 * once (the hierarchy tree). The effective georeference is resolved lazily and
 * once per model, so a model with no storeys pays nothing.
 */
export function createStoreyDisplayElevationResolver(
  store: IfcDataStore | null | undefined,
  coordinateInfo: CoordinateInfo | undefined,
  mutations: GeorefMutationDataLike | undefined,
): (storeyId: number, relativeElevationMeters: number) => number {
  let georef: EffectiveGeoreference | null | undefined;
  let georefResolved = false;
  return (storeyId, relativeElevationMeters) => {
    if (!store) return relativeElevationMeters;
    if (!georefResolved) {
      georef = getEffectiveGeoreference(store, coordinateInfo, mutations);
      georefResolved = true;
    }
    return displayStoreyElevationMeters(relativeElevationMeters, georef, store, storeyId);
  };
}
