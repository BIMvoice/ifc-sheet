/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #135 review: a view's DXF drew a coordinate point as a bare cross, because
 * the export gave its annotations no live-symbol context. The DXF now carries
 * the point's coordinate label, as the drawing tab and the sheet show it.
 */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectView } from '@/project/types';
import { COORDINATE_POINT_ID } from '@/siteplan/live-symbols';
import { liveSymbolContext } from '@/siteplan/site-frame';
import { registerLocale, setLocale } from '@/i18n';
import ro from '@/i18n/locales/ro';
import { checkCatalogue } from '@/i18n/catalogue-problems';
import { viewDxf } from './view-dxf';

const PLAN: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const view = { id: 'v', name: 'Site', kind: 'plan', level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, auto: false, createdAt: 0, scale: 200 } as ProjectView;
const layer: DraftLayer = { id: 'L', name: 'Site', color: '#000000', visible: true, locked: false };
/** IFC project (3, 4) → viewer (x, z = −y) → the plan's drawing point, as the generator places it. */
const at = worldToDrawing(PLAN, { x: 3, y: 1.2, z: -4 });
const point: DraftEntity = { id: 'p', viewId: 'v', layerId: 'L', params: {}, shape: { type: 'symbol', symbolId: COORDINATE_POINT_ID, p: at, scale: 1, rotation: 0 } };

describe('a view\'s DXF (#135 review)', () => {
  // happy-dom has no layout, so `getScreenCTM` is missing and the DXF walker writes nothing: give every element the identity.
  const proto = SVGElement.prototype as unknown as { getScreenCTM?: () => DOMMatrix };
  const own = Object.getOwnPropertyDescriptor(proto, 'getScreenCTM');
  before(() => { proto.getScreenCTM = () => new DOMMatrix(); });
  after(() => {
    if (own) Object.defineProperty(proto, 'getScreenCTM', own);
    else delete proto.getScreenCTM;
  });

  it('prints a coordinate point\'s label, not a bare cross', () => {
    const symbols = liveSymbolContext({ trueNorth: null, north: null, northSource: null, anchor: null, frameOffset: { x: 0, y: 0, z: 0 } }, PLAN, 'down', 200, 'en',
      (kind, a, b) => (kind === 'map' ? [`E ${a}`, `N ${b}`] : [`X ${a}`, `Y ${b}`]));
    const dxf = new TextDecoder('latin1').decode(viewDxf({ view, drawing: null, axis: 'down', drafts: [point], layers: [layer], extraPatterns: [], overlays: [], symbols }));
    // Group code / value pairs; a TEXT entity's string is its group 1.
    const lines = dxf.split(/\r?\n/);
    const texts: string[] = [];
    let entity = '';
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = lines[i].trim();
      if (code === '0') entity = lines[i + 1];
      else if (code === '1' && entity === 'TEXT') texts.push(lines[i + 1]);
    }
    // No georeference and no frame shift: the label is the point's project x / y.
    assert.ok(texts.includes('X 3.00') && texts.includes('Y 4.00'), `texts in the DXF: ${texts.join(' | ')}`);
  });
  it('writes the dimension and level texts in the language and every coordinate the same (#269)', () => {
    registerLocale('ro', checkCatalogue(ro).catalogue);
    const dimension: DraftEntity = { id: 'd', viewId: 'v', layerId: 'L', params: {}, shape: { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 3.25, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 } };
    const level: DraftEntity = { id: 'l', viewId: 'v', layerId: 'L', params: {}, shape: { type: 'level', p: { x: 5, y: 2 }, value: 3.06, height: 0.25 } as DraftEntity['shape'] };
    const dxfIn = (locale: string) => {
      setLocale(locale);
      try {
        const bytes = viewDxf({ view, drawing: null, axis: 'down', drafts: [dimension, level], layers: [layer], extraPatterns: [], overlays: [], symbols: null });
        const lines = new TextDecoder('latin1').decode(bytes).split(/\r?\n/);
        const pairs: [string, string][] = [];
        for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1]]);
        return pairs;
      } finally {
        setLocale('en');
      }
    };
    const romanian = dxfIn('ro');
    const english = dxfIn('en');
    const textsOf = (pairs: [string, string][]) => pairs.filter(([c]) => c === '1').map(([, v]) => v);
    assert.ok(textsOf(romanian).includes('3,25') && textsOf(romanian).includes('+3,06'), textsOf(romanian).join(' | '));
    assert.ok(textsOf(english).includes('3.25') && textsOf(english).includes('+3.06'), textsOf(english).join(' | '));
    // Group codes, coordinates and every other value are the same numbers in both: only the TEXT strings differ.
    const strip = (pairs: [string, string][]) => pairs.map(([c, v]) => (c === '1' ? [c, ''] : [c, v]));
    assert.deepEqual(strip(romanian), strip(english));
    assert.ok(romanian.some(([c, v]) => c === '10' && /^-?\d+\.\d+$/.test(v)), 'coordinates keep the decimal point');
    assert.ok(!romanian.some(([c, v]) => c !== '1' && /\d,\d/.test(v)), 'no comma outside a TEXT string');
  });
});
