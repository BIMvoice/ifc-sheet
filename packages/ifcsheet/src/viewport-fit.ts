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

/**
 * A viewport box that fits a drawing's extent at its scale (plus a margin), in paper mm, centred on the viewport's position.
 *
 * With `centre` (the viewport's `center`: the drawing point put at that position), the drawing lands off the box's
 * middle when `centre` is not the middle of `bounds`: a plan of the set is centred on the model's extent (`viewCentre`),
 * and a storey smaller than the building sits to one side of it. The box then widens on both sides by that offset,
 * keeping the margin past it, so it holds the drawing where it lands; before, the frame cut the drawing off
 * (skolebygg A-102, 36 mm). A drawing off-centre by no more than the margin keeps the box it had.
 */
export function fitViewportBox(
  bounds: { min: { x: number; y: number }; max: { x: number; y: number } }, scale: number, centre: { x: number; y: number } | null = null,
): { width: number; height: number } {
  const k = 1000 / scale;
  const margin = 10;
  // How far past the drawing's half-size the box reaches on each side, paper mm: the margin, or the offset and the margin.
  const reach = (lo: number, hi: number, c: number | undefined): number => {
    const off = c === undefined ? 0 : Math.abs((lo + hi) / 2 - c) * k;
    return off > margin ? off + margin : margin;
  };
  return {
    width: Math.max(40, (bounds.max.x - bounds.min.x) * k + reach(bounds.min.x, bounds.max.x, centre?.x) * 2),
    height: Math.max(30, (bounds.max.y - bounds.min.y) * k + reach(bounds.min.y, bounds.max.y, centre?.y) * 2),
  };
}
