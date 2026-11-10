/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The map-conversion arithmetic the app and the engine share (#479): a drawing point's Eastings and Northings. */

export { getEffectiveHorizontalScale, authoredNonUnitFactors, getEffectiveAxisScales, detectScaleUnitMismatch, inferMapUnitScale, resolveMapUnitToMetreScale, type ScaleFields, type FactorName, type ScaleUnitMismatch } from './geo-scale.js';
export { computeModelCenterInIfcMeters, effectiveMapConversionForGeometry } from './map-absolute.js';
export { resolveMapAxisDirection, refusedAxisDelta, type MapAxisDirection } from './map-axis-direction.js';
export { getMapUnitScale, mapUnitsToMeters, metersToMapUnits, viewerDeltaToProjectedDelta } from './map-units.js';
export {
  getEffectiveGeoreference, getIfcLengthUnitScale, hasStandardGeoreferencing, mergeMapConversion, mergeProjectedCRS, resolveEpsetMapUnitScale, supportsStandardGeoreferencing,
  type EffectiveGeoreference, type GeorefMutationDataLike,
} from './effective-georef.js';
export { hasUsableMapGeoref, viewerPointToProjected, type MapGeoreference, type ProjectedPoint, type Vec3 } from './pick-to-geo.js';
export { drawingPointToMap, type MapAnchor, type MapPoint } from './map-coordinates.js';
