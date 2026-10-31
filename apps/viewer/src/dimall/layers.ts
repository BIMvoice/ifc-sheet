/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A wall with a material layer set is cut in one outline per layer (0.14 + 0.12 + 0.04 for the Bonsai house).
 * A plan dimensions the wall, not its layers: the layers of one wall are joined into the box of the whole wall.
 */

import type { Box } from './outline';

/** Layers of one wall touch within this (metres). */
const TOUCH = 0.01;

/** The part of the shorter box's run that the other must cover for the two to be layers of one wall; a mitred end shortens a layer by at most the thickness of the wall at each end, not more. */
const SAME_RUN = 0.9;

/** A piece no thicker than this (metres) lying on a wall is its finish, however little of the wall's run it covers; a pilaster stands proud by more. */
const FINISH = 0.03;
/** A piece no longer than this either way (metres) has no direction of its own: it is the corner of a layer, or the end of a short wall, cut off by what it meets. */
const STUB = 0.25;

/** No wall is thicker than this (metres). */
const WALL_MAX = 1;
/** The widest opening a wall is read as continuing across (metres). */
const MAX_GAP = 8;

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * The boxes of one wall's outlines with the layers joined: two boxes that run the same way, overlap along the wall
 * and touch across it are one box. The pieces on either side of a door or window do not overlap along the wall and
 * stay apart. Only the pieces of one wall element are given: two wall elements, a party wall or the leaves of a
 * double wall each modelled as a wall, are never joined here, touching or not.
 */
export function joinLayers(boxes: readonly Box[]): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  const along = (b: Box) => b.x1 - b.x0 >= b.y1 - b.y0;
  const stub = (q: Box) => Math.max(q.x1 - q.x0, q.y1 - q.y0) <= STUB;
  const layers = (a: Box, b: Box, horizontal: boolean): boolean => {
    const [l, t] = horizontal ? (['x', 'y'] as const) : (['y', 'x'] as const);
    const along0 = overlap(a[`${l}0`], a[`${l}1`], b[`${l}0`], b[`${l}1`]);
    const [la, lb] = [a[`${l}1`] - a[`${l}0`], b[`${l}1`] - b[`${l}0`]];
    const thick = Math.max(a[`${t}1`], b[`${t}1`]) - Math.min(a[`${t}0`], b[`${t}0`]);
    const touch = overlap(a[`${t}0`], a[`${t}1`], b[`${t}0`], b[`${t}1`]) >= -TOUCH;
    if (along0 <= TOUCH || !touch) return false;
    if (stub(a) || stub(b)) return true;
    // A finish lies on the wall however little of its run it covers.
    if (Math.min(a[`${t}1`] - a[`${t}0`], b[`${t}1`] - b[`${t}0`]) <= FINISH) return along0 >= 0.5 * Math.min(la, lb);
    // Layers run the length of their wall: a piece much shorter than the other, or sharing only part of its run with it (a pilaster, a step in the wall), is not a layer, and joining it would give the whole wall the thickness of the pilaster.
    return along0 >= SAME_RUN * Math.min(la, lb) && Math.min(la, lb) >= Math.max(la, lb) - 2 * thick;
  };
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < out.length && !again; i++) {
      for (let j = i + 1; j < out.length && !again; j++) {
        const a = out[i], b = out[j];
        // Two pieces with a direction join along it; a stub has none, and joins either way.
        const ways = stub(a) || stub(b) ? [true, false] : along(a) === along(b) ? [along(a)] : [];
        if (!ways.some((way) => layers(a, b, way))) continue;
        out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
        out.splice(j, 1);
        again = true;
      }
    }
  }
  return out.filter((b) => !out.some((o) => remnantOf(b, o)));
}

/** Whether `b` is what an opening leaves of a wall beside `o`, a whole piece of it: running end to end with it, and thinner, its band inside the piece's. Read on its own it would look like a cross wall. A pilaster stands on a wall's side, not at its end. */
function remnantOf(b: Box, o: Box): boolean {
  const remnant = (l: 'x' | 'y', t: 'x' | 'y') => {
    const band = o[`${t}1`] - o[`${t}0`];
    return b[`${l}1`] - b[`${l}0`] > b[`${t}1`] - b[`${t}0`] && band <= WALL_MAX && b[`${t}0`] >= o[`${t}0`] - TOUCH && b[`${t}1`] <= o[`${t}1`] + TOUCH && b[`${t}1`] - b[`${t}0`] < band - FINISH && (Math.abs(b[`${l}0`] - o[`${l}1`]) <= TOUCH || Math.abs(b[`${l}1`] - o[`${l}0`]) <= TOUCH);
  };
  return remnant('x', 'y') || remnant('y', 'x');
}

/**
 * The gaps left in one wall by openings the model cuts without filling them (no door, no window in them): the boxes
 * that close them. A hole in a wall is still the wall to the building's outline; left open, the outline leaks through it
 * and runs round the rooms. Only collinear pieces of the same thickness span a gap, and only up to `MAX_GAP`.
 */
export function wallGaps(boxes: readonly Box[]): Box[] {
  const gaps: Box[] = [];
  for (const horizontal of [true, false]) {
    const [l, t] = horizontal ? (['x', 'y'] as const) : (['y', 'x'] as const);
    // Either way: what is left of a wall between two openings can be wider than it is long.
    const pieces = [...boxes].sort((a, b) => a[`${l}0`] - b[`${l}0`]);
    pieces.forEach((a, i) => {
      const b = pieces.slice(i + 1).find((q) => Math.abs(q[`${t}0`] - a[`${t}0`]) <= TOUCH && Math.abs(q[`${t}1`] - a[`${t}1`]) <= TOUCH);
      if (!b || b[`${l}0`] <= a[`${l}1`] || b[`${l}0`] - a[`${l}1`] > MAX_GAP) return;
      gaps.push(horizontal ? { x0: a.x1, x1: b.x0, y0: a.y0, y1: a.y1 } : { y0: a.y1, y1: b.y0, x0: a.x0, x1: a.x1 });
    });
  }
  return gaps;
}
