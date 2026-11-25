/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectView } from './document.js';
import { viewExtent, type ModelExtent } from './drawing-set.js';

/**
 * The part of a plan's drawing `bounds` (drawing metres) inside the room the layout made for it: `viewExtent` about
 * `center`, the point its viewport puts at its position (`viewCentre` for a plan of the set). That room is the box
 * the engine's sheet clips the drawing to (`sheetGraphic`). What lies outside is what the framing left out of the
 * extent (a survey marker far from the building: `farElements`), so a sheet that frames a plan on these bounds, and
 * places its elevation marks round them, does it on the building, as the engine's does. `bounds` as they are for a
 * view the layout centres on its drawing (an elevation, a section, a detail), for a site plan (its plot and terrain
 * reach past the building) and when nothing of the drawing is in the room.
 */
export function boundsInRoom<B extends { min: { x: number; y: number }; max: { x: number; y: number } }>(
  view: ProjectView, center: { x: number; y: number }, bounds: B, extent: ModelExtent,
): B {
  if (view.kind !== 'plan' || view.site || view.detail) return bounds;
  const size = viewExtent(view, extent);
  const min = { x: Math.max(bounds.min.x, center.x - size.w / 2), y: Math.max(bounds.min.y, center.y - size.h / 2) };
  const max = { x: Math.min(bounds.max.x, center.x + size.w / 2), y: Math.min(bounds.max.y, center.y + size.h / 2) };
  if (!(min.x < max.x && min.y < max.y)) return bounds;
  if (min.x === bounds.min.x && min.y === bounds.min.y && max.x === bounds.max.x && max.y === bounds.max.y) return bounds;
  return { ...bounds, min, max };
}
