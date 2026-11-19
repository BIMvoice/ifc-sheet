/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: the sheet's DXF in model units. A viewport (`data-dxf-frame`: where its drawing's origin is on the paper, paper millimetres per metre,
 * the signs of the cut) is written at its model coordinates in metres, and what stands outside a viewport (the frame, the title block) is left out.
 * The element layer standard names a wall's layer from its class and IsExternal.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dxfCadRules } from '@bimvoice/ifcsheet/dxf';
import { cleanup } from '@/test/render.js';
import { svgToDxf } from './sheet-dxf';

const NS = 'http://www.w3.org/2000/svg';
const text = (svg: SVGSVGElement, model: boolean, cad: Parameters<typeof svgToDxf>[4] = []) => new TextDecoder('latin1').decode(svgToDxf(svg, 297, 'm', 1, cad, model));

/** A 1:50 viewport whose origin is at paper (100, 100): a 200 mm line, a 10 m wall; and a frame line outside it. */
function sheet(wall: Record<string, string>): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 420 297');
  const outside = document.createElementNS(NS, 'line');
  for (const [k, v] of Object.entries({ x1: '0', y1: '0', x2: '420', y2: '0', style: 'stroke:#000000', 'data-dxf-layer': 'FRAME' })) outside.setAttribute(k, v);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('data-dxf-frame', '100 100 20 1 -1');
  const line = document.createElementNS(NS, 'line');
  for (const [k, v] of Object.entries({ x1: '100', y1: '100', x2: '300', y2: '100', style: 'stroke:#000000', 'data-dxf-layer': 'CUT', ...wall })) line.setAttribute(k, v);
  g.appendChild(line);
  svg.append(outside, g);
  document.body.appendChild(svg);
  return svg;
}

/** The x values of group code 10 and 11 in a DXF text. */
const entities = (dxf: string) => { const a = dxf.indexOf('\nENTITIES\n'); return dxf.slice(a, dxf.indexOf('ENDSEC', a)); };
const xs = (dxf: string) => { const l = entities(dxf).split(/\r?\n/); return l.flatMap((v, i) => (['10', '11'].includes(v.trim()) && i % 2 === 0 ? [Number(l[i + 1])] : [])); };
const layers = (dxf: string) => { const l = dxf.split(/\r?\n/); return l.flatMap((v, i) => (v.trim() === '8' && i % 2 === 0 ? [l[i + 1]] : [])); };

describe('a sheet exported as DXF in model units (#831)', () => {
  // happy-dom has no layout, so `getScreenCTM` is missing and the DXF walker writes nothing: give every element the identity.
  const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
  const own = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
  beforeEach(() => { proto.getScreenCTM = () => new DOMMatrix(); });
  afterEach(() => {
    cleanup();
    if (own) Object.defineProperty(proto, 'getScreenCTM', own);
    else delete proto.getScreenCTM;
  });

  it('writes a viewport at its true size in metres and leaves the frame out', () => {
    const file = text(sheet({}), true);
    const x = xs(file);
    assert.deepEqual([Math.min(...x), Math.max(...x)], [0, 10]);
    assert.ok(!layers(file).includes('FRAME'));
    assert.match(file, /\$INSUNITS\s+70\s+6\b/);
  });

  it('writes the same sheet in paper millimetres by default', () => {
    const file = text(sheet({}), false);
    const x = xs(file);
    assert.deepEqual([Math.min(...x), Math.max(...x)], [0, 420]);
    assert.match(file, /\$INSUNITS\s+70\s+4\b/);
  });

  it('by element, an external wall goes on A-WALL-EXTR and an internal one on A-WALL-INTR', () => {
    const rules = dxfCadRules(undefined, 'element');
    assert.ok(layers(text(sheet({ 'data-dxf-class': 'IfcWallStandardCase', 'data-dxf-external': '1' }), true, rules)).includes('A-WALL-EXTR'));
    assert.ok(layers(text(sheet({ 'data-dxf-class': 'IfcWallStandardCase', 'data-dxf-external': '0' }), true, rules)).includes('A-WALL-INTR'));
  });
});
