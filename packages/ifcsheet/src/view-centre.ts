/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ModelExtent } from './drawing-set.js';
import type { ProjectView } from './document.js';

/**
 * The drawing point (metres) a view's viewport is centred on, so that its
 * drawing lines up with the room the layout reserved for it (`viewExtent`, the
 * box the sheet clips to): the centre of the model's extent in the view's own
 * drawing coordinates. A plan is drawn from what its level cuts, so its own
 * bounds are those of one storey, or include a far element the framing left
 * out; centred on those, it lands beside its box and the box clips it. Every
 * plan centred on the extent also lies over the others. `null` for the views
 * that stay centred on their drawing: elevations, sections and details.
 */
export function viewCentre(view: Pick<ProjectView, 'kind'> & { detail?: unknown }, extent: ModelExtent): { x: number; y: number } | null {
  // A plan's drawing is (x, z) of the viewer frame (`getProjectionAxes('y')`).
  if (view.kind !== 'plan' || view.detail) return null;
  return { x: (extent.min.x + extent.max.x) / 2, y: (extent.min.z + extent.max.z) / 2 };
}
