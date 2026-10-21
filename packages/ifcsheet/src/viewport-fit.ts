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

/** A viewport box that fits a drawing's extent at its scale (plus a margin), in paper mm. */
export function fitViewportBox(bounds: { min: { x: number; y: number }; max: { x: number; y: number } }, scale: number): { width: number; height: number } {
  const k = 1000 / scale;
  const margin = 10;
  return {
    width: Math.max(40, (bounds.max.x - bounds.min.x) * k + margin * 2),
    height: Math.max(30, (bounds.max.y - bounds.min.y) * k + margin * 2),
  };
}
