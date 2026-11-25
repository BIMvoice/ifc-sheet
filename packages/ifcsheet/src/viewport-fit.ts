/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet's paper and the size a viewport takes on it: the scales a viewport
 * offers and the box that fits a drawing at one of them. Pure: paper mm and
 * drawing metres.
 */

import { paperMm } from './paper.js';
import type { ProjectSheet, SheetViewport } from './document.js';

/** The scales a viewport offers, most detailed first: details, buildings, sites. */
export const SHEET_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000] as const;

/** The sheet's paper as it lies on the table: width and height in mm, by its paper and orientation. */
export function paperOf(sheet: ProjectSheet): { w: number; h: number } {
  return paperMm(sheet.paper ?? 'A1', sheet.orientation ?? 'landscape');
}

/** Paper millimetres per drawing metre for a viewport. */
export function mmPerMetre(viewport: Pick<SheetViewport, 'scale'>): number {
  return 1000 / viewport.scale;
}

/** The margin, paper mm, a fitted viewport box keeps round its drawing. */
const FIT_MARGIN_MM = 10;

/** A viewport box that fits a drawing's extent at its scale (plus a margin), in paper mm. */
export function fitViewportBox(bounds: { min: { x: number; y: number }; max: { x: number; y: number } }, scale: number): { width: number; height: number } {
  const k = 1000 / scale;
  return {
    width: Math.max(40, (bounds.max.x - bounds.min.x) * k + FIT_MARGIN_MM * 2),
    height: Math.max(30, (bounds.max.y - bounds.min.y) * k + FIT_MARGIN_MM * 2),
  };
}

/**
 * A drawing's `bounds` (drawing metres) made even about `centre`, the point its viewport puts at the viewport's
 * position, for a box fitted to them (`fitViewportBox`, which centres the box on that position) to hold the drawing
 * where it lands. A plan of the set is centred on the model's extent (`viewCentre`), not on its own bounds, so a storey
 * smaller than the building lies to one side of it, and a box fitted to its bounds cut it off at the frame (skolebygg
 * A-102, 36 mm). Bounds off `centre` by no more than the box's margin are returned as they are: their box held them.
 */
export function boundsAbout<B extends { min: { x: number; y: number }; max: { x: number; y: number } }>(bounds: B, centre: { x: number; y: number }, scale: number): B {
  const k = 1000 / scale;
  const even = (lo: number, hi: number, c: number): [number, number] => {
    if (Math.abs((lo + hi) / 2 - c) * k <= FIT_MARGIN_MM) return [lo, hi];
    const half = Math.max(c - lo, hi - c);
    return [c - half, c + half];
  };
  const [x0, x1] = even(bounds.min.x, bounds.max.x, centre.x);
  const [y0, y1] = even(bounds.min.y, bounds.max.y, centre.y);
  if (x0 === bounds.min.x && x1 === bounds.max.x && y0 === bounds.min.y && y1 === bounds.max.y) return bounds;
  return { ...bounds, min: { x: x0, y: y0 }, max: { x: x1, y: y1 } };
}
