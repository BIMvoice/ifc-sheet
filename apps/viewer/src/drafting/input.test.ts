/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The typed coordinate parser, edge by edge: the forms AutoCAD mode (#168)
 * relies on (absolute `x,y`, relative `@dx,dy`, polar `@d<angle`, a plain
 * distance) and the input it must refuse rather than guess at. The basic
 * cases are in `snaps-input.test.ts`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoordinateInput } from './input.js';

const last = { x: 10, y: 20 };
const point = (text: string, ctx = { last }) => {
  const r = parseCoordinateInput(text, ctx);
  assert.equal(r?.kind, 'point', `"${text}" is a point`);
  return (r as { pt: { x: number; y: number } }).pt;
};
const near = (got: { x: number; y: number }, x: number, y: number) =>
  assert.ok(Math.abs(got.x - x) < 1e-9 && Math.abs(got.y - y) < 1e-9, `${JSON.stringify(got)} vs ${x},${y}`);

describe('parseCoordinateInput', () => {
  it('absolute points ignore the last point', () => {
    near(point('3,4'), 3, 4);
    near(point('-3,-4'), -3, -4);
    near(point('+1.5,.25'), 1.5, 0.25);
    near(point('1e3,2E-1'), 1000, 0.2);
    near(point('  7 ,  8  '), 7, 8);
  });

  it('relative points add to the last point', () => {
    near(point('@3,4'), 13, 24);
    near(point('@ -10 , -20 '), 0, 0);
    near(point('@0,0'), 10, 20);
    near(point('@'), 10, 20);
  });

  it('polar points turn counter-clockwise from +x, in degrees', () => {
    near(point('@5<0'), 15, 20);
    near(point('@5<90'), 10, 25);
    near(point('@5<180'), 5, 20);
    near(point('@5<-90'), 10, 15);
    near(point('@5<450'), 10, 25);
    near(point('@-5<0'), 5, 20);
    near(point('2<90'), 0, 2); // absolute polar counts from the origin
  });

  it('a plain number is a distance, for the caller to apply along the current direction', () => {
    assert.deepEqual(parseCoordinateInput('250', { last }), { kind: 'distance', d: 250 });
    assert.deepEqual(parseCoordinateInput(' 0.5 ', { last: null }), { kind: 'distance', d: 0.5 });
    assert.deepEqual(parseCoordinateInput('-2', { last }), { kind: 'distance', d: -2 });
  });

  it('refuses what it cannot read exactly', () => {
    for (const bad of [
      '', '   ', '1,', ',1', '1,,2', '1,2,3', '<90', '3<', '1<2<3', '@1<2<3', 'a,b', '1;2', '1 2', '1.2.3', '0x10',
      'Infinity', '1e999', '1e999,0', 'NaN', '@@1,1', '@1', '@1,2,3', '1,2@', 'L',
    ]) assert.equal(parseCoordinateInput(bad, { last }), null, `"${bad}"`);
  });

  it('refuses a relative point with nothing to count from', () => {
    for (const rel of ['@', '@1,1', '@1<0']) assert.equal(parseCoordinateInput(rel, { last: null }), null, rel);
  });
});
