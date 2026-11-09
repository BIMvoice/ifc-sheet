/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557: the drop of a view title under the marks below its drawing is bounded. The title never leaves the sheet's drawing area, and what a
 * viewport reserves under its box (for legends and a site plan's marks) is as tall as the title's real bottom, not a fixed 12 mm.
 */

import { describe, expect, it } from 'vitest';
import { stripHeight, TITLE_DESCENT_MM, viewTitleLayout } from './view-title.js';

const box = { x: 40, y: 60, w: 120, h: 80 };
const size = 3.5;
const level = box.y + box.h + size + 1.5;
/** An elevation mark that ends 30 mm under the box (3 m outside the building at 1:100). */
const deep = { x0: 50, x1: 70, y0: 142, y1: 170 };

describe('the drop of a view title is bounded (#557)', () => {
  it('keeps the title inside the drawing area, at the lowest place that stays inside, when a mark would push it out', () => {
    const areaBottom = 180;
    const free = viewTitleLayout(box, size, 'A-12', { text: 'Plan  1:100', marks: [{ ...deep, y1: 200 }] });
    expect(free.baseline).toBeGreaterThan(areaBottom);
    const kept = viewTitleLayout(box, size, 'A-12', { text: 'Plan  1:100', marks: [{ ...deep, y1: 200 }], areaBottom });
    expect(kept.baseline).toBeCloseTo(areaBottom - TITLE_DESCENT_MM);
    expect(kept.number?.ring.y).toBeCloseTo(kept.baseline - size - 0.4);
  });
  it('lets the title drop as far as the mark asks while that stays inside', () => {
    const kept = viewTitleLayout(box, size, undefined, { text: 'Plan  1:100', marks: [deep], areaBottom: 400 });
    expect(kept.baseline - size).toBeGreaterThanOrEqual(deep.y1 + 1 - 1e-9);
  });
  it('does not lift a title that is already below the drawing area', () => {
    expect(viewTitleLayout(box, size, undefined, { text: 'Plan  1:100', marks: [deep], areaBottom: 100 }).baseline).toBe(level);
  });
});

describe('what a viewport reserves under its box for its title (#557)', () => {
  it('is 12 mm for a title that did not drop, and reaches the title\'s bottom when it did', () => {
    expect(stripHeight(box)).toBe(12);
    expect(stripHeight(box, level + TITLE_DESCENT_MM)).toBe(12);
    const dropped = viewTitleLayout(box, size, undefined, { text: 'Plan  1:100', marks: [deep] });
    expect(stripHeight(box, dropped.baseline + TITLE_DESCENT_MM)).toBeCloseTo(dropped.baseline + TITLE_DESCENT_MM - (box.y + box.h));
    expect(stripHeight(box, dropped.baseline + TITLE_DESCENT_MM)).toBeGreaterThan(12);
  });
});
