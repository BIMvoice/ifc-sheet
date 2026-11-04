/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A surveyor's DXF under a site plan, placed by the model's georeference (#182): the DXF is in map coordinates (eastings, northings),
 * the model has an IfcMapConversion, so nothing needs picking. The IfcMapConversion maps the model's plan point (x, y) to
 * `E = Eastings + s (a x - b y)`, `N = Northings + s (b x + a y)` with `(a, b)` the X axis abscissa and ordinate and `s` the scale.
 * The place (`at`, `scale`, `rotation`) that is its inverse puts every survey point on the model's plan.
 */

import type { ViewDxfUnderlay } from './dxf-underlay.js';

/** The part of an `IfcMapConversion` the placement needs (`MapConversion` of `@ifc-lite/parser` has these names), in the metres the DXF is in. */
export interface MapConversionPlacement {
  eastings: number;
  northings: number;
  xAxisAbscissa?: number;
  xAxisOrdinate?: number;
  scale?: number;
}

/** The underlay placed at the model's map conversion; null when the conversion is not usable (not numbers, a zero axis or scale). */
export function placeDxfByMapConversion(u: ViewDxfUnderlay, mc: MapConversionPlacement): ViewDxfUnderlay | null {
  const a0 = mc.xAxisAbscissa ?? 1;
  const b0 = mc.xAxisOrdinate ?? 0;
  const s = mc.scale ?? 1;
  const axis = Math.hypot(a0, b0);
  if (![mc.eastings, mc.northings, a0, b0, s].every(Number.isFinite) || !(axis > 1e-12) || !(s > 0)) return null;
  const a = a0 / axis;
  const b = b0 / axis;
  // The DXF's points are (E, -N) in the drawing frame (y runs down), so the shift is the conversion's origin in that frame.
  const ox = mc.eastings;
  const oy = -mc.northings;
  return {
    ...u,
    scale: 1 / s,
    rotation: Math.atan2(b, a),
    at: { x: -(a * ox - b * oy) / s, y: -(b * ox + a * oy) / s },
  };
}
