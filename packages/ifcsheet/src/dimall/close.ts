/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Small gaps in a building's walls, closed before its outline is traced (#642). A wall that stops short of the next, a
 * corner two walls miss by a hand's breadth: the outline would leak through each, and DIMALL would read the plan as
 * open, strings running inside rooms or left out. A gap up to a tolerance tied to the walls' thickness is closed by a
 * box over it; a wider one is a real opening and stays open, unless something the plan cuts stands in it and fills it:
 * the columns or cladding between two walls of a facade, the mullions and panes of a glazed corner. Pure, in the walls'
 * frame.
 */

import type { Box } from './outline.js';

/** Gaps this narrow (metres) are the grid's to merge, not a gap. */
const TOUCH = 0.01;
/** A closed gap is at most this many wall thicknesses wide: a slot a little wider than a wall (a notch, a light well) is a real one. */
const THICKNESSES = 1;
/** The tolerance never goes below or above these (metres). */
const MIN_TOL = 0.15;
const MAX_TOL = 0.6;
/** A gap wider than the tolerance is closed when what the plan cuts in it covers this share of its length. */
const FILLED = 0.9;
/** The widest gap (metres) a filling closes: a glazed corner of a house, not the open side of a court. */
const FILLED_REACH = 6;

/** How wide a gap the walls close: their median thickness, within the limits. */
export function closingTolerance(walls: readonly Box[]): number {
  const t = walls.map((b) => Math.min(b.x1 - b.x0, b.y1 - b.y0)).sort((a, b) => a - b);
  if (t.length === 0) return MIN_TOL;
  return Math.min(MAX_TOL, Math.max(MIN_TOL, t[t.length >> 1] * THICKNESSES));
}

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * Whether the `fillers` cover `FILLED` of the gap `g` along `x` (or along `y`): those standing in its band, their spans
 * along it joined. A filler stands in the band when its middle does: the plaster on the face of a wall beside the gap
 * lies outside it, the boards of a column's casing and the panes of a glazed wall inside.
 */
function filledBy(g: Box, fillers: readonly Box[], alongX: boolean): boolean {
  const [g0, g1] = alongX ? [g.x0, g.x1] : [g.y0, g.y1];
  if (g1 - g0 <= TOUCH) return false;
  const inBand = (f: Box) => (alongX ? within((f.y0 + f.y1) / 2, g.y0, g.y1) : within((f.x0 + f.x1) / 2, g.x0, g.x1));
  const spans = fillers
    .filter(inBand)
    .map((f): [number, number] => (alongX ? [Math.max(f.x0, g0), Math.min(f.x1, g1)] : [Math.max(f.y0, g0), Math.min(f.y1, g1)]))
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0, end = g0;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    covered += b - Math.max(a, end);
    end = b;
  }
  return covered >= FILLED * (g1 - g0);
}

const within = (c: number, a: number, b: number) => c > a && c < b;
const mid = (a: number, b: number) => (a + b) / 2;

/**
 * The two boxes that close a corner where `h`, running along x, and `v`, running along y, miss each other by more than
 * the tolerance: each wall carried on along its own band to the other's far face, so the corner is the walls' own and not
 * the room's. Empty unless the fillers cover both.
 */
function filledCorner(h: Box, v: Box, fillers: readonly Box[]): Box[] {
  const left = mid(v.x0, v.x1) < mid(h.x0, h.x1);
  const below = mid(v.y0, v.y1) < mid(h.y0, h.y1);
  const alongH: Box = { x0: left ? v.x0 : h.x1, x1: left ? h.x0 : v.x1, y0: h.y0, y1: h.y1 };
  const alongV: Box = { x0: v.x0, x1: v.x1, y0: below ? v.y1 : h.y0, y1: below ? h.y1 : v.y0 };
  return filledBy(alongH, fillers, true) && filledBy(alongV, fillers, false) ? [alongH, alongV] : [];
}

/** Each pair of wall boxes up to `reach` apart along x, in both passes: in the second the axes trade places (`v` turns a box back), so one rule closes the gaps along x and along y. */
function eachPair(walls: readonly Box[], reach: number, visit: (a: Box, b: Box, v: (b: Box) => Box, swap: boolean) => void): void {
  for (const swap of [false, true]) {
    const v = (b: Box): Box => (swap ? { x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 } : b);
    const sorted = walls.map(v).sort((a, b) => a.x0 - b.x0);
    sorted.forEach((a, i) => {
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (b.x0 - a.x1 > reach) break;
        if (b.x0 - a.x1 > TOUCH) visit(a, b, v, swap);
      }
    });
  }
}

/** The boxes that close the gaps between wall boxes up to `tol` wide: end to end or end to side (over the band they share), and corner to corner (over the square between). */
export function closingBoxes(walls: readonly Box[], tol: number = closingTolerance(walls)): Box[] {
  const out: Box[] = [];
  eachPair(walls, tol, (a, b, v, swap) => {
    const shared = overlap(a.y0, a.y1, b.y0, b.y1);
    if (shared >= TOUCH) out.push(v({ x0: a.x1, x1: b.x0, y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) }));
    // A corner is the same pair in both passes: it is closed once.
    else if (!swap && -shared > TOUCH && -shared <= tol) {
      const below = a.y1 <= b.y0;
      out.push({ x0: a.x1, x1: b.x0, y0: below ? a.y1 : b.y1, y1: below ? b.y0 : a.y0 });
    }
  });
  return out;
}

/**
 * The boxes that close the gaps between wall boxes wider than `tol`, up to `FILLED_REACH`, that the `fillers` (what else
 * the plan cuts: columns, cladding, mullions and panes) stand in and cover: end to end or end to side, a corner, or a step
 * in the facade. Each is the walls' own band carried on, so the building's corner and faces are where its walls put them.
 */
export function filledGaps(walls: readonly Box[], fillers: readonly Box[], tol: number = closingTolerance(walls)): Box[] {
  const out: Box[] = [];
  if (fillers.length === 0) return out;
  const turned = [fillers, fillers.map((b) => ({ x0: b.y0, x1: b.y1, y0: b.x0, y1: b.x1 }))];
  eachPair(walls, FILLED_REACH, (a, b, v, swap) => {
    const filling = turned[swap ? 1 : 0];
    const gx = b.x0 - a.x1;
    const shared = overlap(a.y0, a.y1, b.y0, b.y1);
    if (shared >= TOUCH) {
      const gap: Box = { x0: a.x1, x1: b.x0, y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) };
      if (gx > tol && filledBy(gap, filling, true)) out.push(v(gap));
      return;
    }
    if (gx <= tol && -shared > TOUCH && -shared <= tol) return;
    // A corner (a stub of wall runs either way, so both readings are tried; the same pair in both passes, closed once), or a step in the facade, the end of one wall and the start of the next joined across by what stands between them.
    const corner = swap ? [] : filledCorner(a, b, filling).concat(filledCorner(b, a, filling)).slice(0, 2);
    const step: Box = { x0: a.x1, x1: b.x0, y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
    if (corner.length) out.push(...corner);
    else if (gx <= MAX_TOL && filledBy(step, filling, false)) out.push(v(step));
  });
  return out;
}
