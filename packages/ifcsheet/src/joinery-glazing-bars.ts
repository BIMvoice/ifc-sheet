/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Glazing bars in elevation (#448): thin lines dividing a pane's glass into equal lights, `vertical` of them up and down and `horizontal`
 * across. A pane with n bars of one direction has n + 1 lights in it. Pure, and kept out of `symbols.ts` to keep that file small.
 */

import type { CellRect, JoineryGlazingBars } from '@ifc-lite/create';
import type { JoineryStroke } from './joinery-symbols.js';

/** The arch a pane's glass sits under: `top` is the height of the arch's line at x, `half` how far from the centre the line is still at or above z. */
export interface BarClip {
  top(x: number): number;
  half(z: number): number;
}

/** The bars of one pane's glass `glass`, clipped to `clip` where the head is an arch. No bars (or no room) draws nothing. */
export function glazingBarStrokes(bars: JoineryGlazingBars, glass: CellRect, clip?: BarClip): JoineryStroke[] {
  const out: JoineryStroke[] = [];
  const w = glass.x1 - glass.x0, h = glass.z1 - glass.z0;
  if (w <= 0 || h <= 0) return out;
  for (let i = 1; i <= bars.vertical; i++) {
    const x = glass.x0 + (w * i) / (bars.vertical + 1);
    const z1 = clip ? Math.min(glass.z1, clip.top(x)) : glass.z1;
    if (z1 - glass.z0 > 1e-6) out.push({ pts: [{ x, y: glass.z0 }, { x, y: z1 }], weight: 'thin' });
  }
  for (let i = 1; i <= bars.horizontal; i++) {
    const z = glass.z0 + (h * i) / (bars.horizontal + 1);
    const half = clip ? clip.half(z) : Infinity;
    const x0 = Math.max(glass.x0, -half), x1 = Math.min(glass.x1, half);
    if (x1 - x0 > 1e-6) out.push({ pts: [{ x: x0, y: z }, { x: x1, y: z }], weight: 'thin' });
  }
  return out;
}
