/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readBCF, writeBCF } from '@ifc-lite/bcf';
import { commentsToBcf } from './bcf';
import { cropAround, pinSnapshots } from './snapshot';
import { drawingOf, onElement, onPaper, sheet } from '@/test/review-bcf-fixture';

/**
 * The BCF viewpoint's thumbnail: the sheet around the pin (PR #127 review,
 * item 5). The drawing of the SVG to pixels is the browser's canvas, which
 * happy-dom does not have, so it is handed in here and the crop it is given
 * is what is checked.
 */

// A 1 x 1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NS = 'http://www.w3.org/2000/svg';

function paperOnPage(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('data-sheet-id', sheet.id);
  svg.setAttribute('viewBox', '0 0 594 420');
  svg.setAttribute('class', 'block bg-white');
  const wall = document.createElementNS(NS, 'rect');
  wall.setAttribute('data-wall', '');
  const selection = document.createElementNS(NS, 'rect');
  selection.setAttribute('data-export-ignore', 'true');
  svg.append(wall, selection);
  document.body.appendChild(svg);
  return svg;
}
afterEach(() => { document.body.innerHTML = ''; });

describe('the thumbnail of a pin (PR #127, item 5)', () => {
  it('is the sheet around the pin, 4:3, kept on the paper, with the pin ringed', async () => {
    paperOnPage();
    const drawn: { text: string; w: number; h: number }[] = [];
    const shots = await pinSnapshots([onElement], [sheet], async (text, w, h) => {
      drawn.push({ text, w, h });
      return PNG;
    });
    assert.deepEqual([...shots], [['c1', PNG]]);
    assert.equal(drawn.length, 1);
    const doc = new DOMParser().parseFromString(drawn[0].text.replace(/^<\?xml[^>]*>\s*/, ''), 'image/svg+xml');
    const root = doc.documentElement;
    assert.equal(root.getAttribute('viewBox'), '90 105 120 90', 'centred on the pin at (150, 150)');
    assert.equal(root.getAttribute('width'), '120mm');
    assert.equal(drawn[0].w / drawn[0].h, 4 / 3);
    assert.ok(root.querySelector('[data-wall]'), 'the drawing is in it');
    assert.equal(root.querySelector('[data-export-ignore="true"]'), null, 'the selection marks are not');
    const ring = root.querySelector('circle');
    assert.deepEqual([ring?.getAttribute('cx'), ring?.getAttribute('cy')], ['150', '150']);
    // Near a corner the window stays on the paper.
    assert.deepEqual(cropAround(sheet, { x: 5, y: 415 }), { x: 0, y: 330, w: 120, h: 90 });
  });

  it('is left out for a sheet whose paper is not on the page, or that could not be drawn', async () => {
    assert.equal((await pinSnapshots([onElement], [sheet], async () => PNG)).size, 0, 'no paper on the page');
    paperOnPage();
    assert.equal((await pinSnapshots([onElement], [sheet], async () => null)).size, 0, 'the drawing failed');
  });

  it('goes into the topic\'s viewpoint as its snapshot', async () => {
    const project = commentsToBcf([onElement, onPaper], { sheets: [sheet], drawingOf, snapshots: new Map([['c1', PNG]]) });
    const read = await readBCF(await writeBCF(project));
    const viewpoint = [...read.topics.values()][0].viewpoints[0];
    assert.equal(viewpoint.snapshot, PNG);
  });
});
