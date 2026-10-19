/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #76: the indicator definitions on footprints and rooms whose areas are known exactly. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { belowGroundFlags, footprintArea, urbanIndicators, type FootprintShape, type Pt, type StoreyInput } from './indicators';

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const plain = (w: number, h: number): FootprintShape[] => [{ outer: rect(0, 0, w, h), holes: [] }];
const storey = (name: string, elevation: number, footprint: FootprintShape[] | null): StoreyInput => ({ name, elevation, footprint });

describe('urban indicators (#76)', () => {
  it('a courtyard is cut out of the built area, whichever way its ring turns', () => {
    const outer = rect(0, 0, 20, 20);
    const court = rect(7, 7, 13, 13);
    assert.equal(footprintArea([{ outer, holes: [court] }]), 400 - 36);
    assert.equal(footprintArea([{ outer: [...outer].reverse(), holes: [[...court].reverse()] }]), 400 - 36);
  });

  it('a storey is a basement when more than half its height is under ±0.00', () => {
    // Basement -3.00..0.00, half-buried storey -1.20..+1.80, ground +1.80, top floor +4.80.
    assert.deepEqual(belowGroundFlags([-3, -1.2, 1.8, 4.8]), [true, false, false, false]);
    // A basement whose ceiling is 0.45 above ±0.00 is still one.
    assert.deepEqual(belowGroundFlags([-2.55, 0.45]), [true, false]);
    assert.deepEqual(belowGroundFlags([-3]), [true]);
  });

  it('Ac is the lowest storey above ground, Ad sums the storeys above ground, basements only on request', () => {
    const storeys = [storey('Etaj 1', 3, plain(10, 8)), storey('Subsol', -3, plain(12, 10)), storey('Parter', 0, plain(11, 9))];
    const r = urbanIndicators({ storeys, spaces: [], siteArea: 500 });
    assert.equal(r.ac, 99);
    assert.equal(r.ad, 99 + 80);
    assert.equal(r.pot, (99 / 500) * 100);
    assert.equal(r.cut, (99 + 80) / 500);
    assert.deepEqual(r.storeys.map((s) => [s.name, s.ground, s.inAd, s.belowGround]), [
      ['Etaj 1', false, true, false], ['Parter', true, true, false], ['Subsol', false, false, true],
    ]);
    const withBasement = urbanIndicators({ storeys, spaces: [], siteArea: 500, includeBelowGround: true });
    assert.equal(withBasement.ad, 99 + 80 + 120);
    assert.equal(withBasement.ac, 99);
  });

  it('without a site area POT and CUT are not given, never a made-up number', () => {
    for (const siteArea of [null, 0, -5, Number.NaN]) {
      const r = urbanIndicators({ storeys: [storey('P', 0, plain(10, 10))], spaces: [], siteArea });
      assert.equal(r.pot, null);
      assert.equal(r.cut, null);
      assert.equal(r.siteArea, null);
      assert.equal(r.ac, 100);
    }
  });

  it('Au sums the rooms by category and by storey; a room stating no area is left out, not counted as zero', () => {
    const storeys = [storey('P', 0, plain(10, 10)), storey('E', 3, plain(10, 10))];
    const r = urbanIndicators({
      storeys, siteArea: null,
      spaces: [
        { storey: 0, category: 'Living', area: 20.5 }, { storey: 0, category: 'Bath', area: 4.5 },
        { storey: 1, category: 'Living', area: 15 }, { storey: 1, category: 'Store', area: null }, { storey: null, category: 'Bath', area: 3 },
      ],
    });
    assert.equal(r.au, 43);
    assert.deepEqual(r.auByCategory, [{ category: 'Bath', area: 7.5 }, { category: 'Living', area: 35.5 }]);
    assert.deepEqual(r.storeys.map((s) => s.usefulArea), [15, 25]);
    assert.equal(urbanIndicators({ storeys, spaces: [], siteArea: null }).au, null);
  });

  it('a storey with no footprint gives no built area and adds nothing to Ad', () => {
    const r = urbanIndicators({ storeys: [storey('P', 0, plain(10, 10)), storey('Roof', 3, null)], spaces: [], siteArea: 100 });
    assert.equal(r.ad, 100);
    assert.equal(r.storeys[0].builtArea, null);
  });
});
