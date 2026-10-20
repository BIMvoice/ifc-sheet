/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Cutting a sheet into layer runs keeps what is drawn, in the order it is drawn, under the ancestors that place and clip it. */
import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layerOf, layerRuns } from './pdf-layers.js';

const sheet = (body: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`, 'image/svg+xml').documentElement as unknown as SVGSVGElement;

describe('layerOf', () => {
  it('names the sheet furniture and the drawing pens, and takes any other tag for a drafting layer', () => {
    assert.deepEqual(layerOf(null), { group: 'sheet', key: 'SHEET' });
    assert.deepEqual(layerOf('TITLEBLOCK'), { group: 'sheet', key: 'TITLEBLOCK' });
    assert.deepEqual(layerOf('CUT'), { group: 'drawing', key: 'CUT' });
    assert.deepEqual(layerOf('SYMBOLS'), { group: 'drawing', key: 'SYMBOLS' });
    assert.deepEqual(layerOf('C-ROAD-GRID'), { group: 'schedules', key: 'C-ROAD-GRID' });
    assert.deepEqual(layerOf('Walls'), { group: 'drafting', key: 'Walls' });
  });
});

describe('layerRuns', () => {
  const svg = sheet(
    '<rect data-dxf-layer="FRAME" id="f"/>'
    + '<g id="vp" transform="translate(5 5)"><clipPath id="c"><rect width="9" height="9"/></clipPath>'
    + '<g clip-path="url(#c)"><path data-dxf-layer="CUT" id="a"/><path data-dxf-layer="CUT" id="b"/><g data-dxf-layer="Walls" id="w"><line id="inner"/></g><path data-dxf-layer="CUT" id="a2"/></g>'
    + '<text id="t">no tag</text></g>',
  );
  const runs = layerRuns(svg);
  const ids = (r: SVGSVGElement) => Array.from(r.querySelectorAll('[id]')).map((e) => e.id).filter((i) => !['c', 'vp'].includes(i));

  it('cuts at every change of layer and keeps the document order, so stacking is unchanged', () => {
    assert.deepEqual(runs.map((r) => r.layer.key), ['FRAME', 'CUT', 'Walls', 'CUT', 'SHEET']);
    assert.deepEqual(runs.flatMap((r) => ids(r.svg)), ['f', 'a', 'b', 'w', 'inner', 'a2', 't']);
  });

  it('keeps each element under the transform and clip that place it, and hands every run the definitions', () => {
    for (const run of runs.slice(1)) {
      assert.ok(run.svg.querySelector('clipPath#c'), 'definitions are in every run');
      const placed = run.svg.querySelector('g#vp[transform="translate(5 5)"]');
      assert.ok(placed, 'the viewport group is kept');
    }
    assert.ok(runs[1].svg.querySelector('g[clip-path="url(#c)"] > path#a'));
    assert.equal(runs[1].svg.querySelector('#w'), null, 'a run holds only its own layer');
  });

  it('draws nothing twice and loses nothing', () => {
    const all = runs.flatMap((r) => ids(r.svg));
    assert.equal(new Set(all).size, all.length);
    assert.equal(all.length, svg.querySelectorAll('[id]').length - 2);
  });
});
