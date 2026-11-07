/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { clipPolyline } from './clip.js';

// Measured on the Bonsai house, North Elevation (#557): the roof ridge lies on the viewport's top edge, one float32 step out of level.
const box = { x: 309.5, y: 144.1040951013565, w: 199.99998092651367, h: 81.79180979728699 };

describe('clipPolyline on the box edge (#557)', () => {
  it('keeps a ridge lying on the edge whole, though its end is 6e-7 mm outside', () => {
    const runs = clipPolyline([{ x: 429.78202056884766, y: 144.10409927368164 }, { x: 394.7765989303589, y: 144.10409450531006 }], box);
    expect(runs).toHaveLength(1);
    expect(runs[0][runs[0].length - 1].x).toBeCloseTo(394.7765989303589, 9);
    expect(runs[0][0].x).toBeCloseTo(429.78202056884766, 9);
  });

  it('still cuts a line that really leaves the box, 1 mm out', () => {
    const runs = clipPolyline([{ x: 400, y: 150 }, { x: 400, y: box.y - 1 }], box);
    expect(runs).toHaveLength(1);
    expect(runs[0][1].y).toBeCloseTo(box.y - 1e-3, 6);
  });
});
