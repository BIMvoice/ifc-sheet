/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #666: what a dragged box or a freehand loop selects. A window takes what lies wholly inside, a crossing also what a
 * line of it passes through, a loop what it encloses.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boxRegion, entityInRegion, pointInPolygon, thinPath, type Region } from './region-select.js';
import type { EntityShape, Pt } from './types.js';

const line = (a: Pt, b: Pt): EntityShape => ({ type: 'line', a, b });
const box = boxRegion({ x: 0, y: 0 }, { x: 10, y: 10 });
const dimension = (x: number): EntityShape => ({ type: 'dimension', variant: 'aligned', a: { x, y: 1 }, b: { x: x + 4, y: 1 }, at: { x, y: 2 }, height: 0.25 });

describe('window and crossing (#666)', () => {
  it('a window takes a line wholly inside and not one that leaves the box', () => {
    assert.equal(entityInRegion(line({ x: 1, y: 1 }, { x: 9, y: 1 }), box, false), true);
    assert.equal(entityInRegion(line({ x: 1, y: 1 }, { x: 19, y: 1 }), box, false), false);
  });

  it('a crossing also takes a line that runs through the box with both ends outside', () => {
    const through = line({ x: -5, y: 5 }, { x: 15, y: 5 });
    assert.equal(entityInRegion(through, box, false), false);
    assert.equal(entityInRegion(through, box, true), true);
  });

  it('a crossing leaves out a diagonal line whose bounding box overlaps the box but which misses it', () => {
    assert.equal(entityInRegion(line({ x: 5, y: 20 }, { x: 20, y: 5 }), box, true), false);
  });

  it('does not select a line that lies wholly outside', () => {
    assert.equal(entityInRegion(line({ x: 20, y: 20 }, { x: 30, y: 20 }), box, true), false);
  });

  it('measures a box dragged either way round the same', () => {
    assert.deepEqual(boxRegion({ x: 10, y: 10 }, { x: 0, y: 0 }), box);
  });
});

describe('lasso (#666)', () => {
  // An L: the loop encloses the bottom bar and the left bar, not the upper-right corner.
  const pts: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 10 }, { x: 0, y: 10 }];
  const loop: Region = { kind: 'loop', pts };

  it('takes a line inside the loop and not one in the notch the loop cuts out', () => {
    assert.equal(entityInRegion(line({ x: 1, y: 1 }, { x: 9, y: 1 }), loop, false), true);
    assert.equal(entityInRegion(line({ x: 5, y: 8 }, { x: 8, y: 8 }), loop, false), false);
  });

  it('does not take a line whose ends are inside but which leaves the loop between them', () => {
    assert.equal(entityInRegion(line({ x: 1, y: 9 }, { x: 9, y: 1.5 }), loop, false), false);
  });

  it('takes a dimension whose lines all lie inside, and not one that is partly outside', () => {
    const wide: Region = { kind: 'loop', pts: [{ x: -1, y: -2 }, { x: 8, y: -2 }, { x: 8, y: 4 }, { x: -1, y: 4 }] };
    assert.equal(entityInRegion(dimension(0), wide, false), true);
    assert.equal(entityInRegion(dimension(6), wide, false), false);
  });

  it('tests a point against a polygon', () => {
    assert.equal(pointInPolygon({ x: 1, y: 1 }, pts), true);
    assert.equal(pointInPolygon({ x: 8, y: 8 }, pts), false);
  });

  it('thins a dragged path, keeping a point only once it has moved on', () => {
    let path: readonly Pt[] = [{ x: 0, y: 0 }];
    for (const p of [{ x: 0.1, y: 0 }, { x: 0.2, y: 0 }, { x: 5, y: 0 }]) path = thinPath(path, p, 1);
    assert.equal(path.length, 2);
  });
});
