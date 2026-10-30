/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export {
  getEffectiveGeoreference, getIfcLengthUnitScale, hasStandardGeoreferencing, mergeMapConversion, mergeProjectedCRS, resolveEpsetMapUnitScale, supportsStandardGeoreferencing,
  detectScaleUnitMismatch, getEffectiveHorizontalScale, inferMapUnitScale,
  type EffectiveGeoreference, type GeorefMutationDataLike, type ScaleUnitMismatch,
} from '@bimvoice/ifcsheet/georef';
