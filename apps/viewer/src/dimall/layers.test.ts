/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which outlines of one wall element are its layers (joined) and which are not (#632). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rect } from './fixture';
import { joinLayers } from './layers';
import { boxOf } from './outline';

const join = (...rings: ReturnType<typeof rect>[]) => joinLayers(rings.map(boxOf));

describe('joinLayers', () => {
  it('joins the layers of a wall that touch, with a mitred (shorter) layer among them', () => {
    assert.deepEqual(join(rect(0, 0, 8, 0.14), rect(0.1, 0.14, 7.9, 0.26), rect(0, 0.26, 8, 0.3)), [{ x0: 0, y0: 0, x1: 8, y1: 0.3 }]);
  });
  it('keeps a wall of two leaves with a cavity between them as two', () => {
    assert.equal(join(rect(0, 0, 8, 0.1), rect(0, 0.2, 8, 0.3)).length, 2);
  });
  it('does not widen a wall to the depth of its pilaster, nor to a step in it', () => {
    assert.deepEqual(join(rect(0, 0, 8, 0.3), rect(3, 0.3, 3.5, 0.8)).map((b) => b.y1), [0.3, 0.8]);
    assert.equal(join(rect(0, 0, 6, 0.3), rect(4, 0.3, 8, 0.6)).length, 2);
  });
  it('leaves the pieces either side of an opening apart', () => {
    assert.equal(join(rect(0, 0, 3, 0.3), rect(3.9, 0, 8, 0.3)).length, 2);
  });
});
