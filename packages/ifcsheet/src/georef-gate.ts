/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a model's georeference is one the app anchors map coordinates on (an IfcMapConversion with a projected CRS, not the
 * IfcSite's latitude and longitude). The one gate: the app's anchor selection (`lib/geo`) and the engine's PDF (`site-frame.ts`)
 * both read it here, so a coordinate point is printed from the map only where the app prints it from the map.
 */

import type { GeoreferenceInfo } from '@ifc-lite/parser';

export function hasStandardGeoreferencing(
  georef: Pick<GeoreferenceInfo, 'source' | 'projectedCRS' | 'mapConversion'> | null | undefined,
): boolean {
  return Boolean(
    georef
    && georef.source !== 'siteLocation'
    && georef.projectedCRS?.name
    && georef.mapConversion
    // PR #1965 review: presence alone isn't enough -- a malformed
    // IfcMapConversion with a NaN eastings/northings/orthogonalHeight must
    // not pass this gate. `hasUsableMapGeoref` (pick-to-geo.ts) delegates
    // here for the XYZ readout and federation-alignment gate, so this
    // finiteness check protects both, not just the DXF underlay path.
    // `orthogonalHeight` joins eastings/northings here (2nd PR #1965 review
    // round) because every consumer reads it straight through with no
    // fallback -- `viewerPointToProjected` (pick-to-geo.ts) adds it directly
    // into the returned height, and `federationAlign.ts`'s `hC`/`hS`/`ifcZr`
    // computations multiply it by the map-unit scale and add it to the IFC Z
    // used to align two models. A NaN here has nowhere to go but straight
    // into Z.
    && Number.isFinite(georef.mapConversion.eastings)
    && Number.isFinite(georef.mapConversion.northings)
    && Number.isFinite(georef.mapConversion.orthogonalHeight)
    // Scale and the XAxisAbscissa/XAxisOrdinate axis pair are DELIBERATELY
    // NOT part of this finiteness gate, unlike orthogonalHeight above. The
    // DXF export/underlay path (`dxfExportGeoref.ts`'s
    // `resolveGeorefLinearParams`) already substitutes finite fallbacks for
    // exactly this case -- Scale=0/NaN/negative becomes 1, a degenerate or
    // non-finite axis becomes the no-rotation default (1, 0) -- specifically
    // so a malformed Scale/axis still renders the DXF underlay somewhere
    // rather than disabling it outright (see that file's "GUARD PHILOSOPHY"
    // header comment). `selectAnchorGeoref` (useAnchorGeoreference.ts) gates
    // anchor selection through this same function, so adding Scale/axis here
    // would make `hasUsableMapGeoref` reject that model as an anchor before
    // `resolveGeorefLinearParams` ever gets a chance to apply its fallback --
    // turning a georeference that currently renders (via the fallback) into
    // one that's silently disabled instead. `orthogonalHeight` has no such
    // downstream fallback anywhere, which is why it's guarded here and
    // Scale/axis are not.
    //
    // This does leave `federationAlign.ts`'s `getAxis()` and
    // `getEffectiveHorizontalScale()` reading a NaN Scale or axis pair
    // without an equivalent fallback (unlike the DXF path) -- a real gap,
    // but a pre-existing one this gate change doesn't widen, and fixing it
    // belongs in that file's own math, not in loosening/tightening this
    // shared presence gate.
  );
}
