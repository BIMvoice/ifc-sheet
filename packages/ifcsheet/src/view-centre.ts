/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ModelExtent } from './drawing-set.js';
import { ELEVATION_PLANES } from './elevation-planes.js';
import type { ProjectView } from './document.js';

/**
 * The drawing point (metres) a view's viewport is centred on, so that its
 * drawing lines up with the room the layout reserved for it (`viewExtent`, the
 * box the sheet clips to): the centre of the model's extent in the view's own
 * drawing coordinates. A plan is drawn from what its level cuts, so its own
 * bounds are those of one storey, or include a far element the framing left
 * out; centred on those, it lands beside its box and the box clips it. Every
 * plan centred on the extent also lies over the others. A facade elevation is
 * drawn with the ground around the building (a hill, a plot), so its own
 * bounds are wider than the building and not centred on it; it is centred on
 * the building the same way (#648). `null` for the views that stay centred on
 * their drawing: sections, details and interior elevations.
 */
export function viewCentre(view: Pick<ProjectView, 'kind'> & { detail?: unknown; interior?: unknown; direction?: keyof typeof ELEVATION_PLANES }, extent: ModelExtent): { x: number; y: number } | null {
  if (view.detail) return null;
  if (view.kind === 'elevation' && view.direction && !view.interior) {
    // The drawing runs along x (looking along z) or along z (looking along x); looking from the far side flips it (`projectTo2D`).
    const { axis, flipped } = ELEVATION_PLANES[view.direction];
    const along = axis === 'z' ? (extent.min.x + extent.max.x) / 2 : (extent.min.z + extent.max.z) / 2;
    return { x: flipped ? -along : along, y: (extent.min.y + extent.max.y) / 2 };
  }
  // A plan's drawing is (x, z) of the viewer frame (`getProjectionAxes('y')`).
  if (view.kind !== 'plan') return null;
  return { x: (extent.min.x + extent.max.x) / 2, y: (extent.min.z + extent.max.z) / 2 };
}
