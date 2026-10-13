/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which changed elements a view shows. A view looks at a band of the model
 * along one axis: a plan from its level's floor up to its cut, a section or an
 * elevation either side of its cut as far as its depth. An element is in view
 * when its box (where it was, or where it is now) reaches into the band; one
 * with no box (a space with no geometry, a type) is in no view. The extent
 * across the band is not limited: the view's own crop is not read. Pure.
 */

import type { ModelChange } from './compare';

export interface ViewBand {
  viewId: string;
  /** The axis the band is across: y for a plan (height), z or x for a section or elevation. */
  axis: 'x' | 'y' | 'z';
  from: number;
  to: number;
}

/** A plan sees from its floor to its cut. */
export const planBand = (viewId: string, floor: number, cut: number): ViewBand => ({ viewId, axis: 'y', from: Math.min(floor, cut), to: Math.max(floor, cut) });

/** A section or elevation sees `depth` either side of its cut: which side it looks to is not read, so both are counted. */
export const cutBand = (viewId: string, axis: 'x' | 'z', position: number, depth: number): ViewBand => ({ viewId, axis, from: position - depth, to: position + depth });

const AXIS = { x: 0, y: 1, z: 2 } as const;

function reaches(box: readonly number[] | undefined, band: ViewBand): boolean {
  if (!box || box.length !== 6) return false;
  const i = AXIS[band.axis];
  return box[i] <= band.to && box[i + 3] >= band.from;
}

/** The changes a view shows, in the order given. */
export function changesInView(changes: readonly ModelChange[], band: ViewBand): ModelChange[] {
  return changes.filter((c) => reaches(c.before, band) || reaches(c.after, band));
}
