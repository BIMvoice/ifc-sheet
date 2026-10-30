/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coordinates a site plan prints beside a chosen point: Easting and Northing in the project's CRS (Stereo 70, EPSG:3844, in
 * Romania), in metres. The app's site plan and the engine's PDF both read them here.
 *
 * The chain, every step an existing function:
 *  1. drawing point to viewer render frame: `drawingToWorld(plane, p)` (`drawing-frame.ts`, the exact inverse of the drawing
 *     generator's projection); on a plan, drawing (x, y) = viewer (x, z).
 *  2. viewer frame to map: `viewerPointToProjected` (`pick-to-geo.ts`), the measure tool's XYZ readout: the offset from the anchor
 *     model's IFC origin (`originViewer`) rotated by XAxisAbscissa / XAxisOrdinate, scaled by Scale and the map unit, plus
 *     Eastings / Northings: E = E0 + s(x cos t - y sin t), N = N0 + s(x sin t + y cos t) in IFC (x, y).
 *  3. map unit to metres: `mapUnitsToMeters` (`map-units.ts`).
 *
 * Without a usable IfcMapConversion the label falls back to the model's own X / Y (IFC project coordinates, the RTC shift added
 * back), marked as local.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { drawingToWorld, type Vec3 } from '../drawing-frame.js';
import type { Pt } from '../draft-types.js';
import { mapUnitsToMeters } from './map-units.js';
import { viewerPointToProjected, type MapGeoreference } from './pick-to-geo.js';

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
