/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The map unit and the viewer-to-map delta of an `IfcMapConversion` (#479): what a point's Eastings and Northings are read from. The
 * app's measure readout, its site plan's coordinate point and the engine's PDF all read them here (`pick-to-geo.ts`), so a point is
 * printed from the map identically. The app's `cesium-placement.ts` takes them from here too.
 */

import type { MapConversion, ProjectedCRS } from '@ifc-lite/parser';
import { getEffectiveAxisScales, resolveMapUnitToMetreScale } from './geo-scale.js';
import { refusedAxisDelta, resolveMapAxisDirection } from './map-axis-direction.js';

export function getMapUnitScale(
  projectedCRS: Pick<ProjectedCRS, 'mapUnitScale'> | undefined,
  lengthUnitScale: number,
): number {
  return resolveMapUnitToMetreScale(projectedCRS?.mapUnitScale, lengthUnitScale);
}

export function mapUnitsToMeters(
  value: number,
  projectedCRS: Pick<ProjectedCRS, 'mapUnitScale'> | undefined,
  lengthUnitScale: number,
): number {
  return value * getMapUnitScale(projectedCRS, lengthUnitScale);
}

export function metersToMapUnits(
  value: number,
  projectedCRS: Pick<ProjectedCRS, 'mapUnitScale'> | undefined,
  lengthUnitScale: number,
): number {
  return value / getMapUnitScale(projectedCRS, lengthUnitScale);
}

export function viewerDeltaToProjectedDelta(
  deltaX: number,
  deltaZ: number,
  mapConversion: Pick<MapConversion, 'xAxisAbscissa' | 'xAxisOrdinate' | 'scale' | 'factorX' | 'factorY'>,
  projectedCRS: Pick<ProjectedCRS, 'mapUnitScale'> | undefined,
  lengthUnitScale: number,
): { eastings: number; northings: number } {
  const mapScale = getMapUnitScale(projectedCRS, lengthUnitScale);
  const { x: scaleX, y: scaleY } = getEffectiveAxisScales(mapConversion, mapScale, lengthUnitScale);
  // The axis is a DIRECTION: its length is not a second scale (#6700).
  const axis = resolveMapAxisDirection(mapConversion.xAxisAbscissa, mapConversion.xAxisOrdinate);
  if (!axis) {
    const refused = refusedAxisDelta(mapConversion.xAxisAbscissa, mapConversion.xAxisOrdinate);
    return { eastings: refused, northings: refused };
  }
  const { a: abscissa, b: ordinate } = axis;
  const eastMeters = abscissa * scaleX * deltaX + ordinate * scaleY * deltaZ;
  const northMeters = ordinate * scaleX * deltaX - abscissa * scaleY * deltaZ;

  return {
    eastings: metersToMapUnits(eastMeters, projectedCRS, lengthUnitScale),
    northings: metersToMapUnits(northMeters, projectedCRS, lengthUnitScale),
  };
}
