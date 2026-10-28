/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The swatch of a material (#90) is drawn by the code a sheet is drawn by, not by a preview of its own: its hatch is the
 * catalogue's pattern at the sheet's unit, its pen the graphic standard's, its fill the pen the sheet gives a filled cut face,
 * its membrane the sheet's dashed pen. Each expectation below is computed from the catalogue and the standard directly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HATCH_UNIT_M } from '@/drafting/annotation';
import { hatchSegments } from '@/drafting/hatch/fill';
import { findPattern } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { MEMBRANE_PEN_MM } from './membrane-overlays';
import { materialGraphics } from './materials';
import { materialSwatch, SWATCH_MM, SWATCH_SCALE } from './material-swatch';

const graphics = (name: string, patch: object = {}) => ({ ...materialGraphics(name, []), ...patch });
const layer = (name: string, patch: object = {}, patterns: Parameters<typeof materialSwatch>[1] = []) => materialSwatch(graphics(name, patch), patterns).pens.filter((p) => p.layer === 'HATCH');
const segmentsIn = (d: string): number => (d.match(/M/g) ?? []).length;

/** The segments the catalogue's pattern lays in the swatch's band: the sheet's hatch at the swatch's scale, worked out here from the catalogue. */
function expectedSegments(pattern: string, scale: number, extra: Parameters<typeof materialSwatch>[1] = []): number {
  const w = (SWATCH_MM.width * SWATCH_SCALE) / 1000, h = (SWATCH_MM.height * SWATCH_SCALE) / 1000;
  const loop = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  return hatchSegments([loop], findPattern(pattern, extra)!, { scale: scale * HATCH_UNIT_M, angleDeg: 0, maxSegments: 20000 }).segments.length;
}

describe('a material\'s swatch is the sheet\'s drawing of it', () => {
  it('hatches with the catalogue pattern the material names, in as many lines as the pattern lays in that band', () => {
    for (const pattern of ['BRICK', 'CONCRETE', 'INSULATION', 'STEEL']) {
      const pens = layer('Anything', { hatch: pattern });
      assert.equal(pens.length, 1, pattern);
      assert.equal(segmentsIn(pens[0].d), expectedSegments(pattern, 1), pattern);
    }
  });

  it('follows the scale: a larger scale lays fewer lines, as many as the pattern lays at that scale', () => {
    const one = segmentsIn(layer('Anything', { hatch: 'BRICK', hatchScale: 1 })[0].d);
    const two = segmentsIn(layer('Anything', { hatch: 'BRICK', hatchScale: 2 })[0].d);
    assert.ok(two < one);
    assert.equal(two, expectedSegments('BRICK', 2));
  });

  it('pens the hatch with the graphic standard\'s pen for the material\'s hatch pen', () => {
    for (const pen of ['hairline', 'light', 'medium', 'heavy'] as const) {
      assert.equal(layer('Anything', { hatch: 'BRICK', hatchPen: pen })[0].width, DEFAULT_GRAPHIC_STANDARD.materialHatch[pen], pen);
    }
  });

  it('uses a pattern the project imported, and none when the pattern is unknown', () => {
    const extra = parsePat('*MYPAT, mine\n0, 0,0, 0,2').patterns;
    assert.equal(segmentsIn(layer('Anything', { hatch: 'MYPAT' }, extra)[0].d), expectedSegments('MYPAT', 1, extra));
    assert.deepEqual(layer('Anything', { hatch: 'NO-SUCH-PATTERN' }), []);
  });

  it('with no hatch draws no hatch, and takes a hatch from the name when the project has no row', () => {
    assert.deepEqual(layer('Anything', { hatch: null }), []);
    assert.equal(segmentsIn(layer('Concrete C25/30')[0].d), expectedSegments('CONCRETE', 1), 'the guess for concrete');
  });

  it('fills the band with the material\'s colour, white for "none", as the sheet fills a cut face', () => {
    const fills = (patch: object) => materialSwatch(graphics('Anything', patch), []).pens.filter((p) => p.layer === 'FILL').map((p) => p.fill);
    assert.deepEqual(fills({ fill: '#ff0000' }), ['#ff0000']);
    assert.deepEqual(fills({ fill: null }), ['#ffffff']);
    assert.deepEqual(fills({}), ['#d4d4d8'], 'the IFC colour: the sheet\'s cut face colour');
  });

  it('draws a membrane as the sheet\'s heavy dashed line instead of a band', () => {
    const swatch = materialSwatch(graphics('Anything', { membrane: true }), []);
    assert.equal(swatch.pens.some((p) => p.layer === 'FILL'), false, 'no band');
    assert.equal(swatch.overlays.length, 1);
    assert.deepEqual([swatch.overlays[0].layer, swatch.overlays[0].dashed, swatch.overlays[0].width], ['MEMBRANE', true, MEMBRANE_PEN_MM]);
    assert.equal(materialSwatch(graphics('Anything'), []).overlays.length, 0);
  });
});
