/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #76: the indicator definitions on footprints and rooms whose areas are known exactly; #111 review: Ad, Ad for CUT, the terrain and ±0.00. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { belowGroundFlags, footprintArea, urbanIndicators, zeroElevation, type FootprintShape, type Pt, type StoreyInput } from './indicators';

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

  it('a storey is a basement when more than half its height is under the terrain', () => {
    // Basement -3.00..0.00, half-buried storey -1.20..+1.80, ground +1.80, top floor +4.80; terrain at ±0.00.
    assert.deepEqual(belowGroundFlags([-3, -1.2, 1.8, 4.8]), [true, false, false, false]);
    // A basement whose ceiling is 0.45 above the terrain is still one.
    assert.deepEqual(belowGroundFlags([-2.55, 0.45]), [true, false]);
    assert.deepEqual(belowGroundFlags([-3]), [true]);
    // Basement -3.00..0.00 (its middle at -1.50): under a terrain at -1.40 it is one, under one at -1.60 it is not.
    assert.deepEqual(belowGroundFlags([-3, 0, 3], -1.4), [true, false, false]);
    assert.deepEqual(belowGroundFlags([-3, 0, 3], -1.6), [false, false, false]);
  });

  // Review of #111, item 2: the terrain was taken at ±0.00. A demisol from -1.50 to +1.20 with the terrain at -0.60 has
  // 0.90 of its 2.70 m buried, so it is not a basement; against ±0.00 it was one and was dropped.
  it('judges a basement against the terrain level: a demisol -1.50..+1.20 with the terrain at -0.60 is not one', () => {
    const storeys = [storey('Demisol', -1.5, plain(12, 10)), storey('Parter', 1.2, plain(12, 10)), storey('Etaj', 4, plain(12, 10))];
    const onTerrain = urbanIndicators({ storeys, spaces: [], siteArea: null, settings: { terrainLevel: -0.6 } });
    assert.deepEqual(onTerrain.storeys.map((s) => [s.name, s.belowGround]), [['Etaj', false], ['Parter', false], ['Demisol', false]]);
    assert.equal(onTerrain.terrainLevel, -0.6);
    // Against ±0.00 (the default terrain) its middle, -0.15, is under ground: a basement.
    const onZero = urbanIndicators({ storeys, spaces: [], siteArea: null });
    assert.equal(onZero.storeys.find((s) => s.name === 'Demisol')!.belowGround, true);
    // Ac is taken at the ±0.00 section, which here passes through the demisol, whatever the terrain.
    for (const r of [onTerrain, onZero]) assert.deepEqual(r.storeys.filter((s) => s.ground).map((s) => s.name), ['Demisol']);
  });

  // Review of #111, item 1: Ad left out every basement. STAS 4908-85 sums all levels; only CUT leaves some out.
  it('Ad sums every level, basements included; Ad for CUT leaves out a basement up to 1.80 m by default, and the user decides per level', () => {
    const storeys = [
      storey('Etaj 1', 3, plain(10, 8)), storey('Parter', 0, plain(11, 9)),
      storey('Subsol 1', -3, plain(12, 10)), storey('Subsol 2', -4.8, plain(12, 10)),
    ];
    const r = urbanIndicators({ storeys, spaces: [], siteArea: 500 });
    assert.equal(r.ac, 99);
    assert.equal(r.ad, 80 + 99 + 120 + 120);
    // Subsol 2 is 1.80 m floor to floor: left out by default; Subsol 1 (3.00 m) counts.
    assert.deepEqual(r.storeys.map((s) => [s.name, s.height === null ? null : Number(s.height.toFixed(2)), s.belowGround, s.inCut]), [
      ['Etaj 1', null, false, true], ['Parter', 3, false, true], ['Subsol 1', 3, true, true], ['Subsol 2', 1.8, true, false],
    ]);
    assert.equal(r.adCut, 80 + 99 + 120);
    assert.equal(r.cut, (80 + 99 + 120) / 500);
    assert.equal(r.pot, (99 / 500) * 100);
    // The user leaves Subsol 1 out (a parking level) and counts Subsol 2 after all.
    const chosen = urbanIndicators({ storeys, spaces: [], siteArea: 500, settings: { cutExcluded: { 'Subsol 1': true, 'Subsol 2': false } } });
    assert.equal(chosen.ad, r.ad, 'Ad does not move');
    assert.equal(chosen.adCut, 80 + 99 + 120);
    assert.deepEqual(chosen.storeys.map((s) => [s.name, s.inCut, s.inCutByDefault]), [
      ['Etaj 1', true, true], ['Parter', true, true], ['Subsol 1', false, true], ['Subsol 2', true, false],
    ]);
    const parkingOnly = urbanIndicators({ storeys, spaces: [], siteArea: 500, settings: { cutExcluded: { 'Subsol 1': true } } });
    assert.equal(parkingOnly.adCut, 80 + 99);
  });

  it('reads a model with absolute elevations against its ±0.00: the building reference, else the lowest level, flagged', () => {
    const storeys = [storey('Subsol', 242, plain(12, 10)), storey('Parter', 244.8, plain(11, 9)), storey('Etaj', 247.8, plain(10, 8))];
    const r = urbanIndicators({ storeys, spaces: [], siteArea: null, buildingRefElevation: 244.8 });
    assert.deepEqual(r.zero, { elevation: 244.8, source: 'building' });
    assert.deepEqual(r.storeys.map((s) => [s.name, Number(s.elevation.toFixed(2)), s.belowGround, s.ground]), [
      ['Etaj', 3, false, false], ['Parter', 0, false, true], ['Subsol', -2.8, true, false],
    ]);
    assert.equal(r.ac, 99);
    // A typed ±0.00 wins; with neither, the lowest level is taken and the sheet says it was assumed.
    assert.deepEqual(urbanIndicators({ storeys, spaces: [], siteArea: null, buildingRefElevation: 244.8, settings: { zeroElevation: 242 } }).zero, { elevation: 242, source: 'user' });
    assert.deepEqual(zeroElevation([242, 244.8, 247.8], null, undefined), { elevation: 242, source: 'assumed' });
    // Storeys that reach ±0.00 are read as they are, whatever the building says.
    assert.deepEqual(zeroElevation([-3, 0, 3], 244.8, undefined), { elevation: 0, source: 'model' });
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
