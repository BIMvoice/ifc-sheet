/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rectangle an interior elevation's drawing is cut down to. Its wall
 * runs between the room's corners, where the side walls stand; an elevation
 * is closed at each end by those walls drawn cut. So the crop reaches past
 * each end of the wall by the thickness of the side wall the plane cuts
 * there, read off the drawing's own cut polygons: the side wall is cut
 * inside the crop, and nothing beyond it (the next room) is. Where no wall
 * is cut at an end (the room opens there), the crop stops at the end. Pure.
 */

import type { Bounds2D, Drawing2D } from '@ifc-lite/drawing-2d';
import type { InteriorElevation } from './types';

/** How close to the end of the wall a cut must start to be its side wall, metres. */
const AT_END_M = 0.01;
/** How far past a side wall's outer face the crop stops, so that face's line is not on the crop's edge, metres. */
const OUTLINE_M = 0.002;
/** The thickest side wall the crop reaches over, metres. */
const MAX_SIDE_WALL_M = 1;

/** The crop of `interior` on its generated drawing `drawing`: the wall, and the side walls cut at either end. */
export function interiorCropRect(drawing: Pick<Drawing2D, 'cutPolygons'>, { crop }: Pick<InteriorElevation, 'crop'>): Bounds2D {
  const height = crop.max.y - crop.min.y;
  let left = crop.min.x, right = crop.max.x;
  for (const p of drawing.cutPolygons) {
    const xs = p.polygon.outer.map((q) => q.x), ys = p.polygon.outer.map((q) => q.y);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    // A side wall stands most of the room's height, between its floor and top.
    const overlap = Math.min(Math.max(...ys), crop.max.y) - Math.max(Math.min(...ys), crop.min.y);
    if (overlap < height / 2) continue;
    if (Math.abs(hi - crop.min.x) < AT_END_M && crop.min.x - lo <= MAX_SIDE_WALL_M) left = Math.min(left, lo - OUTLINE_M);
    if (Math.abs(lo - crop.max.x) < AT_END_M && hi - crop.max.x <= MAX_SIDE_WALL_M) right = Math.max(right, hi + OUTLINE_M);
  }
  return { min: { x: left, y: crop.min.y }, max: { x: right, y: crop.max.y } };
}
