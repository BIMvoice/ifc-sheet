/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Small gaps in a building's walls, closed before its outline is traced (#642). A wall that stops short of the next, a
 * corner two walls miss by a hand's breadth: the outline would leak through each, and DIMALL would read the plan as
 * open, strings running inside rooms or left out. A gap up to a tolerance tied to the walls' thickness is closed by a
 * box over it; a wider one is a real opening and stays open. Pure, in the walls' frame.
 */

import type { Box } from './outline.js';

/** Gaps this narrow (metres) are the grid's to merge, not a gap. */
const TOUCH = 0.01;
/** A closed gap is at most this many wall thicknesses wide: a slot a little wider than a wall (a notch, a light well) is a real one. */
const THICKNESSES = 1;
/** The tolerance never goes below or above these (metres). */
const MIN_TOL = 0.15;
const MAX_TOL = 0.6;

/** How wide a gap the walls close: their median thickness, within the limits. */
export function closingTolerance(walls: readonly Box[]): number {
  const t = walls.map((b) => Math.min(b.x1 - b.x0, b.y1 - b.y0)).sort((a, b) => a - b);
  if (t.length === 0) return MIN_TOL;
  return Math.min(MAX_TOL, Math.max(MIN_TOL, t[t.length >> 1] * THICKNESSES));
}

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);

/** The boxes that close the gaps between wall boxes up to `tol` wide: end to end or end to side (over the band they share), and corner to corner (over the square between). */
export function closingBoxes(walls: readonly Box[], tol: number = closingTolerance(walls)): Box[] {
  const out: Box[] = [];
  for (const swap of [false, true]) {
    // In the second pass the axes trade places, so one rule closes the gaps along x and along y.
    const v = (b: Box): Box => (swap ? { x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : b);
    const sorted = walls.map(v).sort((a, b) => a.x0 - b.x0);
    sorted.forEach((a, i) => {
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const gx = b.x0 - a.x1;
        if (gx > tol) break;
        if (gx <= TOUCH) continue;
        const shared = overlap(a.y0, a.y1, b.y0, b.y1);
        if (shared >= TOUCH) out.push(v({ x0: a.x1, x1: b.x0, y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) }));
        // A corner is the same pair in both passes: it is closed once.
        else if (!swap && -shared > TOUCH && -shared <= tol) {
          const below = a.y1 <= b.y0;
          out.push({ x0: a.x1, x1: b.x0, y0: below ? a.y1 : b.y1, y1: below ? b.y0 : a.y0 });
        }
      }
    });
  }
  return out;
}
