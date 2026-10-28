/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Defaults the starting set gives its views, as plain numbers over the
 * building's extent (metres, the viewer frame: X east, Y up, Z south):
 * where an elevation's plane stands and how far a view sees. A depth the
 * person has set is never replaced by these.
 */

import type { ElevationDirection } from './document.js';
import type { SectionProposal } from './section-proposals.js';

/**
 * How far OUTSIDE the model bounds an elevation's plane stands, metres. An
 * elevation is the building seen from in front: nothing is cut. A plane on
 * the bounds is degenerate for the projection classifier (every mesh touches
 * it) and one inside them cuts whatever element reaches the bounds, which is
 * the facade wall itself (#218). Beyond them, the whole building is projection.
 */
export const ELEVATION_CLEARANCE_M = 0.5;

/** Added to the depth a view must reach to see the far side of the building, metres. */
export const DEPTH_MARGIN_M = 1;

/** The box a default is measured on. */
export interface Extent3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** Rounded up to a tenth of a metre. */
const up = (v: number): number => Math.ceil(v * 10 - 1e-9) / 10;

/** Where an elevation's plane stands on its axis: `ELEVATION_CLEARANCE_M` outside the facade of `extent`, on its side (z for north and south, x for east and west). */
export function elevationPlaneOffset(direction: ElevationDirection, extent: Extent3): number {
  return { north: extent.min.z - ELEVATION_CLEARANCE_M, south: extent.max.z + ELEVATION_CLEARANCE_M, east: extent.max.x + ELEVATION_CLEARANCE_M, west: extent.min.x - ELEVATION_CLEARANCE_M }[direction];
}

/** An elevation sees from its plane through the whole building plus the margin. */
export function elevationDepth(direction: ElevationDirection, extent: Extent3): number {
  const through = direction === 'north' || direction === 'south' ? extent.max.z - extent.min.z : extent.max.x - extent.min.x;
  return up(Math.max(through, 1) + ELEVATION_CLEARANCE_M + DEPTH_MARGIN_M);
}

/** A proposed section sees to the far side of the building beyond its cut, plus the margin. */
export function proposalDepth(proposal: Pick<SectionProposal, 'a' | 'b' | 'side'>, extent: Extent3): number {
  const { a, b, side } = proposal;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1e-9) return up(DEPTH_MARGIN_M);
  // The unit normal of the cut line on the side the section looks toward.
  let nx = -(b.z - a.z) / len;
  let nz = (b.x - a.x) / len;
  if ((side.x - a.x) * nx + (side.z - a.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  // How far the building's corners reach along the normal beyond the cut.
  const reach = Math.max(...[extent.min.x, extent.max.x].flatMap((x) => [extent.min.z, extent.max.z].map((z) => (x - a.x) * nx + (z - a.z) * nz)));
  return up(Math.max(reach, 0) + DEPTH_MARGIN_M);
}
