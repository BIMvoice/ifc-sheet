/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #496: a drafted line on a user's layer prints with the layer's colour,
 * weight and line type (the sheet SVG, which the PDF prints), follows the
 * layer when it changes, yields to the element's own override, is left out
 * of the print when its layer does not print, and goes to the DXF on that
 * layer with the same pen. The DXF walker needs a browser's path geometry, so
 * the DXF half takes the tags the sheet really wrote through the real layer
 * step (`layerAndPens`) into the real writer.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addLineType, setElementOverride } from '@/project/drafting-standards';
import { parseDashPattern } from '@/drafting/line-types';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';
import { layerAndPens } from './dxf-cad-layers';
import { DxfR2000 } from './dxf-r2000';

const sheet: ProjectSheet = { id: 's', number: 'A-1', name: 'Plan', createdAt: 0, viewports: [] };
const layer = (patch: Partial<DraftLayer> = {}): DraftLayer => ({ id: 'red', name: 'RED-DASHED', color: '#ff0000', visible: true, locked: false, lineWeight: 0.5, lineType: 'dashed', ...patch });
const line = (params: DraftEntity['params'] = {}): DraftEntity => ({ id: 'l1', viewId: 'v', layerId: 'red', shape: { type: 'line', a: { x: 10, y: 10 }, b: { x: 90, y: 10 } }, params });

function paper(layers: DraftLayer[], drafts: DraftEntity[]): SVGSVGElement {
  const ui = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [] })} layers={layers} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} sheetDrafts={drafts} />);
  const svg = ui.querySelector('svg');
  assert.ok(svg);
  return svg as unknown as SVGSVGElement;
}

/** The exported SVG's path for the drafted line (the PDF prints this document). */
function printed(svg: SVGSVGElement): Element | null {
  const doc = new DOMParser().parseFromString(sheetSvgText(svg, sheet).replace(/^<\?xml[^>]*>\s*/, ''), 'image/svg+xml');
  return doc.querySelector('path[data-dxf-layer="RED-DASHED"]');
}

/** The DXF text for one element's tags, read as the walker reads them. */
function dxfOf(el: Element): string {
  const w = new DxfR2000();
  for (const l of useProjectStore.getState().lineTypes ?? []) w.defineLineType(l.id, l.name, l.dash);
  const tag = (n: string) => el.getAttribute(`data-dxf-${n}`) ?? undefined;
  const pens = layerAndPens([], tag, tag('layer') ?? '0', el.getAttribute('stroke') ?? '#000000');
  w.line({ x: 0, y: 0 }, { x: 1, y: 0 }, w.layer(pens.name, pens.layer), pens.own);
  return new TextDecoder('windows-1252').decode(w.bytes('test'));
}

/** DXF records of `kind` ('LAYER' or 'LINE') as group-code → value maps. */
function records(dxf: string, kind: 'LAYER' | 'LINE'): Map<string, string>[] {
  const lines = dxf.split('\n').map((l) => l.replace(/\r$/, ''));
  const out: { type: string; pairs: Map<string, string> }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (c === '0') out.push({ type: lines[i + 1], pairs: new Map() });
    else if (!out.at(-1)?.pairs.has(c)) out.at(-1)?.pairs.set(c, lines[i + 1]);
  }
  return out.filter((r) => r.type === kind).map((r) => r.pairs);
}

/** The element the sheet drew for the drafted line, live (the DXF walker reads this one, not the print). */
const drawn = (svg: SVGSVGElement): Element => {
  const el = svg.querySelector('path[data-dxf-layer="RED-DASHED"]');
  assert.ok(el, 'the line is drawn');
  return el;
};

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a drafted line on a user layer', () => {
  it('prints in the layer colour, weight and dash, in the SVG the PDF prints', () => {
    const el = printed(paper([layer()], [line()]));
    assert.ok(el, 'the line is in the print');
    assert.equal(el.getAttribute('stroke'), '#ff0000');
    assert.equal(el.getAttribute('stroke-width'), '0.5');
    assert.equal(el.getAttribute('stroke-dasharray'), '3 1.5');
    assert.ok(/stroke="#ff0000"[^>]*stroke-dasharray="3 1.5"/.test(sheetPrintHtml(paper([layer()], [line()]), sheet)), 'and in the print document');
  });

  it('changes when the layer changes', () => {
    const el = printed(paper([layer({ color: '#0000ff', lineWeight: 0.7, lineType: 'dotted' })], [line()]));
    assert.ok(el);
    assert.deepEqual([el.getAttribute('stroke'), el.getAttribute('stroke-width'), el.getAttribute('stroke-dasharray')], ['#0000ff', '0.7', '0.3 1']);
  });

  it('takes a line type of the project as the layer\'s', () => {
    const dash = parseDashPattern('6 2 0 2');
    assert.ok(dash);
    const id = addLineType('Centre', dash);
    const el = printed(paper([layer({ lineType: id })], [line()]));
    assert.equal(el?.getAttribute('stroke-dasharray'), '6 2 0 2');
  });

  it('lets the element override colour, weight and type over the layer', () => {
    const el = printed(paper([layer()], [line({ 'o.color': '#00aa00', 'o.lineWeight': 1, 'o.lineType': 'dotted' })]));
    assert.ok(el);
    assert.deepEqual([el.getAttribute('stroke'), el.getAttribute('stroke-width'), el.getAttribute('stroke-dasharray')], ['#00aa00', '1', '0.3 1']);
  });

  it('is left out of the print, SVG and PDF, when its layer does not print, and stays on the screen', () => {
    const live = paper([layer({ print: false })], [line()]);
    assert.ok(live.querySelector('path[data-dxf-layer="RED-DASHED"]'), 'still drawn on screen');
    assert.ok(printed(live) === null, 'absent from the exported SVG');
    assert.ok(!/RED-DASHED/.test(sheetPrintHtml(live, sheet)), 'absent from the print document');
  });

  it('goes to the DXF on its layer with the layer colour and line type, and the layer plots', () => {
    const dxf = dxfOf(drawn(paper([layer()], [line()])));
    const red = records(dxf, 'LAYER').find((r) => r.get('2') === 'RED-DASHED');
    assert.ok(red, 'the LAYER table has the layer');
    assert.equal(red.get('420'), String(0xff0000));
    assert.equal(red.get('6'), 'DASHED');
    assert.equal(red.get('370'), '50');
    assert.equal(red.has('290'), false, 'it plots');
    assert.equal(records(dxf, 'LINE')[0].get('8'), 'RED-DASHED', 'the entity is on it');
  });

  it('goes to the DXF on a layer that does not plot when its layer does not print', () => {
    const red = records(dxfOf(drawn(paper([layer({ print: false })], [line()]))), 'LAYER').find((r) => r.get('2') === 'RED-DASHED');
    assert.equal(red?.get('290'), '0');
  });

  it('writes a line type of the project into the DXF, on the layer and on an element that overrides to it', () => {
    const dash = parseDashPattern('6 2 0 2');
    assert.ok(dash);
    const id = addLineType('Centre line', dash);
    const dxf = dxfOf(drawn(paper([layer({ lineType: id })], [line()])));
    assert.equal(records(dxf, 'LAYER').find((r) => r.get('2') === 'RED-DASHED')?.get('6'), 'Centre_line');
    assert.match(dxf, /\nCentre_line\n/);
    const over = dxfOf(drawn(paper([layer()], [line({ 'o.lineType': id, 'o.lineWeight': 1, 'o.color': '#00ff00' })])));
    const entity = records(over, 'LINE')[0];
    assert.deepEqual([entity.get('6'), entity.get('370'), entity.get('420')], ['Centre_line', '100', String(0x00ff00)], 'the element carries its own pen, not the layer\'s');
  });
});

describe('an element override set from the properties panel', () => {
  it('is stored as the element\'s own o.<field> and wins over the layer', () => {
    useProjectStore.setState({ drafts: [line()], draftLayers: [layer()] });
    setElementOverride(new Set(['l1']), 'color', '#00aa00');
    const stored = useProjectStore.getState().drafts[0];
    assert.equal(stored.params['o.color'], '#00aa00');
    assert.equal(printed(paper([layer()], [stored]))?.getAttribute('stroke'), '#00aa00');
  });
});
