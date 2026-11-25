/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The frame of an auto-fit viewport holds its drawing where the drawing lands.
 * A plan of the set is centred on the model's extent (`viewCentre`), not on its
 * own bounds, so a storey smaller than the building lies to one side of the
 * viewport's position. The box was sized from the bounds around that position,
 * and the frame cut the plan off: skolebygg A-102, Plan 03, 36 mm on the right
 * and 34 mm at the top.
 */

import { describe, expect, it } from 'vitest';
import type { SheetViewport } from './document.js';
import { placer } from './sheet-graphic.js';
import { fitViewportBox } from './viewport-fit.js';

type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };
const plan = (bounds: Bounds) => ({ bounds, config: { plane: { axis: 'y' as const, position: 1.2, flipped: false } } });

/** The drawing's corners on the paper, as the sheet places them, and the box around the viewport's position. */
function measure(bounds: Bounds, vp: SheetViewport) {
  const at = placer(plan(bounds), vp);
  const corners = [bounds.min, bounds.max, { x: bounds.min.x, y: bounds.max.y }, { x: bounds.max.x, y: bounds.min.y }].map(at);
  const box = fitViewportBox(bounds, vp.scale, vp.center);
  const frame = { x0: vp.x - box.width / 2, x1: vp.x + box.width / 2, y0: vp.y - box.height / 2, y1: vp.y + box.height / 2 };
  const past = Math.max(0, ...corners.flatMap((p) => [frame.x0 - p.x, p.x - frame.x1, frame.y0 - p.y, p.y - frame.y1]));
  return { box, past };
}

const vp = (center: SheetViewport['center']): SheetViewport => ({ id: 'vp', viewId: 'v', x: 400, y: 300, scale: 200, width: 0, height: 0, center });

describe('the frame of a drawing centred off its own bounds (skolebygg A-102)', () => {
  // A storey 70 x 69 m whose middle lies 9 m east and 6 m north of the building's (the extent's centre, the viewport's `center`).
  const storey: Bounds = { min: { x: -26, y: -40.5 }, max: { x: 44, y: 28.5 } };

  it('holds every corner of the drawing where the sheet places it', () => {
    const { past } = measure(storey, vp({ x: 0, y: 0 }));
    expect(past, 'paper mm of the drawing past its frame').toBe(0);
  });

  it('keeps the margin past the drawing on the side it leans to', () => {
    const { box } = measure(storey, vp({ x: 0, y: 0 }));
    const k = 1000 / 200;
    // Drawing half-width 35 m, offset 9 m: the box reaches (35 + 9) m and 10 mm past the position on each side.
    expect(box.width).toBeCloseTo(2 * ((35 + 9) * k + 10), 6);
    expect(box.height).toBeCloseTo(2 * ((34.5 + 6) * k + 10), 6);
  });

  it('gives a drawing centred on its bounds, or off by no more than the margin, the box it had', () => {
    const plain = fitViewportBox(storey, 200);
    expect(measure(storey, vp(null)).box).toEqual(plain);
    // 1 m at 1:200 is 5 mm, inside the 10 mm margin: nothing changes and the drawing still fits.
    const near = measure(storey, vp({ x: 8, y: -5 }));
    expect(near.box).toEqual(plain);
    expect(near.past).toBe(0);
  });
});
