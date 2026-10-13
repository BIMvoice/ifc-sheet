/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mainBodyBounds, type Box3 } from './extents.js';

const box = (x0: number, z0: number, x1: number, z1: number, y1 = 3): Box3 => ({ min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

describe('mainBodyBounds', () => {
  it('nothing in, nothing out', () => assert.equal(mainBodyBounds([]), null));

  it('is the whole box when everything is part of the building', () => {
    const r = mainBodyBounds([box(0, 0, 10, 10), box(10, 0, 20, 10), box(5, 5, 8, 8)]);
    assert.deepEqual(r, { bounds: box(0, 0, 20, 10), leftOut: 0 });
  });

  it('leaves out a stray element far from the building', () => {
    // The house and a 1.8 m marker 30 m away: the box is the house.
    const r = mainBodyBounds([box(3, -9, 9, -3, 6), box(4, -8, 6, -6, 2), box(-29.8, 13.2, -28, 15, 1)]);
    assert.deepEqual(r, { bounds: box(3, -9, 9, -3, 6), leftOut: 1 });
  });

  it('follows elements that chain from the largest one, however far the chain runs', () => {
    const r = mainBodyBounds([box(0, 0, 8, 8), box(14, 0, 22, 8), box(28, 0, 36, 8)]);
    assert.equal(r?.leftOut, 0);
    assert.equal(r?.bounds.max.x, 36);
  });

  it('a different gap changes what is left out', () => {
    const boxes = [box(0, 0, 10, 10), box(25, 0, 30, 5)];
    assert.equal(mainBodyBounds(boxes, 10)?.leftOut, 1);
    assert.equal(mainBodyBounds(boxes, 20)?.leftOut, 0);
  });
});
