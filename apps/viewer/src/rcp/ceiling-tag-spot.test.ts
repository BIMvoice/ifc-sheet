/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textBox } from '@/drafting/annotation';
import { centredAnchor } from '@/labels/label-place';
import type { Box } from '@/drafting/cross-ref-marks';
import { clearTagSpot } from './ceiling-tag-spot';

/** A 4 x 3 m ceiling with its tag at the centre; a door leaf and swing are drawn across that centre (#271). */
const EXTENT: Box = { x0: 0, y0: 0, x1: 4, y1: 3 };
const CENTRE = { x: 2, y: 1.5 };
const HEIGHT = 0.25;
const boxAt = (c: { x: number; y: number }, text: string): Box => {
  const pts = textBox(centredAnchor(c, text, HEIGHT, undefined, 1), text, HEIGHT, 0);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};
const meet = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe('clearTagSpot', () => {
  it('keeps the centre of the ceiling when nothing is in the way', () => {
    assert.deepEqual(clearTagSpot(CENTRE, EXTENT, '+2.60', HEIGHT, 1, []), CENTRE);
  });

  it('moves the tag off a door leaf that crosses the centre, and keeps it on the ceiling', () => {
    const leaf: Box = { x0: 1.4, y0: 1.35, x1: 2.6, y1: 1.65 };
    const at = clearTagSpot(CENTRE, EXTENT, '+2.60', HEIGHT, 1, [leaf]);
    const box = boxAt(at, '+2.60');
    assert.equal(meet(box, leaf), false, `the tag at ${at.x}, ${at.y} still meets the leaf`);
    assert.ok(box.x0 >= EXTENT.x0 && box.x1 <= EXTENT.x1 && box.y0 >= EXTENT.y0 && box.y1 <= EXTENT.y1, 'the tag stays on its ceiling');
    assert.ok(Math.hypot(at.x - CENTRE.x, at.y - CENTRE.y) < 1, 'and goes to the nearest clear place');
  });

  it('keeps the centre when no place on the ceiling is clear', () => {
    const wall: Box = { x0: -1, y0: -1, x1: 5, y1: 4 };
    assert.deepEqual(clearTagSpot(CENTRE, EXTENT, '+2.60', HEIGHT, 1, [wall]), CENTRE);
  });
});
