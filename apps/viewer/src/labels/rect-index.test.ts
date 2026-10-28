/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, type Rect } from './label-geometry';
import { RectIndex } from './rect-index';

const rnd = (() => { let s = 7; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
const box = (spread: number, size: number): Rect => { const x = rnd() * spread, y = rnd() * spread; return { x0: x, y0: y, x1: x + rnd() * size, y1: y + rnd() * size }; };

describe('RectIndex', () => {
  it('counts the boxes overlapping a box exactly as a flat scan does, wide boxes and negative coordinates included', () => {
    const boxes = [...Array.from({ length: 400 }, () => box(100, 3)), { x0: -50, y0: -50, x1: 500, y1: 40 }, { x0: -3, y0: -3, x1: -1, y1: -1 }];
    const index = new RectIndex(2);
    for (const b of boxes) index.add(b);
    for (let i = 0; i < 300; i++) {
      const q = box(120, 6);
      assert.equal(index.count(q), boxes.filter((b) => rectsOverlap(q, b)).length);
    }
    assert.equal(index.count({ x0: -4, y0: -4, x1: -2, y1: -2 }), 2);
  });

  it('stops a walk when the visit says so, and refuses a cell size that is not a size', () => {
    const index = new RectIndex<number>(1);
    for (let i = 0; i < 5; i++) index.add({ x0: 0, y0: 0, x1: 1, y1: 1 }, i);
    let seen = 0;
    index.query({ x0: 0, y0: 0, x1: 1, y1: 1 }, () => { seen++; return true; });
    assert.equal(seen, 1);
    assert.throws(() => new RectIndex(0));
    assert.throws(() => new RectIndex(Number.NaN));
  });
});
