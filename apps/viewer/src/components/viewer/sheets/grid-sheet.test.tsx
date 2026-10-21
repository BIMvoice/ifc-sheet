/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The structural grid on paper: the overlay a viewport draws (`OverlayPaths`)
 * is in the sheet SVG with its tags and on its own GRID layer with a dash-dot
 * pen, and the DXF writes it on layer GRID with the DASHDOT line type.
 */

import '../../../test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '../../../test/render.js';
import { gridOverlaysOf, type ViewGridAxis } from '@/project/grid-overlay';
import type { ProjectSheet } from '@/project/types';
import { OverlayPaths } from './OverlayPaths';
import { sheetSvgText } from './sheet-export';
import { sheetDxf } from './sheet-dxf';

afterEach(cleanup);

const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A1', orientation: 'landscape' };
const PLANE: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const AXES: ViewGridAxis[] = [
  { key: 'g:A', tag: 'A', a: [0, 0, 0], b: [0, 0, -5] },
  { key: 'g:1', tag: '1', a: [-1, 0, -1], b: [7, 0, -1] },
];

function mountSheet() {
  const overlays = gridOverlaysOf(AXES, 'plan', PLANE, 'both', 0.1);
  // A viewport at 1:100 puts a drawing metre at 10 mm of paper.
  const container = render(
    <svg viewBox="0 0 841 594" width="841" height="594">
      <OverlayPaths overlays={overlays} transform={{ x: 100, y: 100, scale: 10 }} axis="down" />
    </svg>,
  );
  return container.querySelector('svg') as unknown as SVGSVGElement;
}

/** The entities of a DXF: type, layer (group 8), line type (6) and text (1) of each. */
function dxfEntities(dxf: string): { type: string; layer?: string; lineType?: string; text?: string }[] {
  const lines = dxf.split(/\r?\n/);
  const out: { type: string; layer?: string; lineType?: string; text?: string }[] = [];
  let inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = lines[i + 1].trim();
    if (code === '2' && value === 'ENTITIES') inEntities = true;
    else if (code === '0' && value === 'ENDSEC') inEntities = false;
    else if (!inEntities) continue;
    else if (code === '0') out.push({ type: value });
    else if (code === '8') out[out.length - 1].layer = value;
    else if (code === '6') out[out.length - 1].lineType = value;
    else if (code === '1' && out.length) out[out.length - 1].text = value;
  }
  return out;
}

describe('the grid on a sheet', () => {
  it('is in the sheet SVG on the GRID layer, dash-dot, with its tags', () => {
    const text = sheetSvgText(mountSheet(), sheet);
    assert.match(text, /data-dxf-layer="GRID"/);
    assert.match(text, /data-dxf-ltype="dashdot"/);
    for (const tag of ['A', '1']) assert.equal((text.match(new RegExp(`>${tag}</text>`, 'g')) ?? []).length, 2, `bubble ${tag} at both ends`);
    assert.match(text, /stroke-dasharray="4 1 0.3 1"/);
  });

  it('is in the DXF on layer GRID with the DASHDOT line type', () => {
    const svg = mountSheet();
    // happy-dom has no layout: give the walker the identity mapping an SVG in millimetres has, and the strokes the attributes carry.
    Object.defineProperty(svg, 'getScreenCTM', { value: () => new DOMMatrix() });
    for (const el of Array.from(svg.querySelectorAll('*'))) Object.defineProperty(el, 'getScreenCTM', { value: () => new DOMMatrix() });
    const realStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({ stroke: el.getAttribute('stroke') ?? 'none', fill: el.getAttribute('fill') ?? '#000', fontSize: el.getAttribute('font-size') ?? '2.5', textAnchor: el.getAttribute('text-anchor') ?? 'start' })) as never;
    let dxf: string;
    try { dxf = new TextDecoder().decode(sheetDxf(svg, sheet)); } finally { globalThis.getComputedStyle = realStyle; }
    const entities = dxfEntities(dxf);
    const onGrid = entities.filter((e) => e.layer === 'GRID');
    // The layer carries the dash-dot type; the two axes are plain lines that take it, the four bubbles override it with a continuous one.
    assert.match(dxf, /\n\s*2\nGRID\n(?:[^\n]*\n){0,12}?\s*6\nDASHDOT\n/, 'layer GRID is DASHDOT');
    assert.deepEqual(onGrid.filter((e) => e.type === 'LINE').map((e) => e.lineType), [undefined, undefined], 'two axes, by layer');
    assert.deepEqual(onGrid.filter((e) => e.type === 'LWPOLYLINE').map((e) => e.lineType), Array(4).fill('Continuous'), 'four bubbles');
    assert.deepEqual(onGrid.filter((e) => e.type === 'TEXT' || e.type === 'MTEXT').map((e) => e.text).sort(), ['1', '1', 'A', 'A']);
  });
});
