/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coordinates a site plan prints beside a chosen point: Easting and
 * Northing in the project's CRS (Stereo 70, EPSG:3844, in Romania), in metres.
 *
 * The chain, every step an existing function:
 *  1. drawing point → viewer render frame: `drawingToWorld(plane, p)`
 *     (`drafting/frame.ts`, the exact inverse of the drawing generator's
 *     projection); on a plan, drawing (x, y) = viewer (x, z).
 *  2. viewer frame → map: `viewerPointToProjected` (`lib/geo/pick-to-geo.ts`),
 *     the measure tool's XYZ readout: the offset from the anchor model's IFC
 *     origin (`originViewer`, from `useAnchorGeoreference`) rotated by
 *     XAxisAbscissa / XAxisOrdinate, scaled by Scale and the map unit, plus
 *     Eastings / Northings — E = E0 + s·(x·cos θ − y·sin θ),
 *     N = N0 + s·(x·sin θ + y·cos θ) in IFC (x, y).
 *  3. map unit → metres: `mapUnitsToMeters` (`lib/geo/cesium-placement.ts`).
 *
 * Without a usable IfcMapConversion the label falls back to the model's own
 * X / Y (IFC project coordinates, the RTC shift added back), marked as local.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { drawingToWorld, type Vec3 } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';
import { viewerPointToProjected, type MapGeoreference } from '@/lib/geo/pick-to-geo';
import { mapUnitsToMeters } from '@/lib/geo/cesium-placement';

/** What places a viewer point on the map: the anchor's effective georeference and its IFC origin in the viewer frame. */
export interface MapAnchor {
  eff: MapGeoreference;
  originViewer: Vec3;
}

export interface MapPoint {
  /** Metres. */
  e: number;
  n: number;
  crs: string;
}

/** A drawing point's Easting / Northing in metres, in the anchor's projected CRS. */
export function drawingPointToMap(plane: SectionPlaneConfig, p: Pt, anchor: MapAnchor): MapPoint {
  const world = drawingToWorld(plane, p);
  const projected = viewerPointToProjected(world, anchor.eff, anchor.originViewer);
  const { projectedCRS, lengthUnitScale } = anchor.eff;
  return {
    e: mapUnitsToMeters(projected.eastings, projectedCRS, lengthUnitScale),
    n: mapUnitsToMeters(projected.northings, projectedCRS, lengthUnitScale),
    crs: projected.crsName,
  };
}

export { drawingPointToLocal } from '@bimvoice/ifcsheet';
