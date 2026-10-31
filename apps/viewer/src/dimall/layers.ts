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

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/**
 * The boxes of one wall's outlines with the layers joined: two boxes that run the same way, overlap along the wall
 * and touch across it are one box. The pieces on either side of a door or window do not overlap along the wall and
 * stay apart.
 */
export function joinLayers(boxes: readonly Box[]): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  const along = (b: Box) => b.x1 - b.x0 >= b.y1 - b.y0;
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < out.length && !again; i++) {
      for (let j = i + 1; j < out.length && !again; j++) {
        const a = out[i], b = out[j];
        if (along(a) !== along(b)) continue;
        const [l, t] = along(a) ? (['x', 'y'] as const) : (['y', 'x'] as const);
        if (overlap(a[`${l}0`], a[`${l}1`], b[`${l}0`], b[`${l}1`]) <= TOUCH || overlap(a[`${t}0`], a[`${t}1`], b[`${t}0`], b[`${t}1`]) < -TOUCH) continue;
        out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
        out.splice(j, 1);
        again = true;
      }
    }
  }
  return out;
}
