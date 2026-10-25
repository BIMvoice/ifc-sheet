/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheet, its print and PDF (the same SVG) and the view's DXF carry what a view says about single elements (#32, #33): the hidden
 * wall is not on the paper, the wall with its own graphics is grey and dashed on the paper and in the DXF's colour and line type, and
 * the other wall is not. The sheet draws from `viewportPens`, which reads the marks `styledDrawing` put on the items.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resolveViewGraphics } from '@bimvoice/ifcsheet';
import { resetProject } from '@/project/project-store';
import { styledDrawing } from '@/project/view-graphics';
import { withoutHiddenElements } from '@/project/view-element-filter';
import type { ProjectSheet, ProjectView, SheetViewport, ViewGraphics } from '@/project/types';
import { ViewSvg } from '../drafting/view-dxf';
import { SheetPaper } from './SheetPaper';

const WALL_A = '2O2Fr$t4X7Zf8NOew3FLOH';
const WALL_B = '3cUkl32yn9qRSPvBJVyWYp';
const ids: Record<number, string> = { 1: WALL_A, 2: WALL_B };
const lookup = (id: number) => ids[id];
const square = (x: number) => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }];
const raw = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: { plane: { axis: 'y' } },
  cutPolygons: [1, 2].map((entityId) => ({ entityId, ifcType: 'IfcWall', modelIndex: 0, isCut: true, polygon: { outer: square(entityId * 2), holes: [] } })),
  lines: [1, 2].map((entityId) => ({ entityId, ifcType: 'IfcWall', modelIndex: 0, category: 'projection', visibility: 'visible', line: { start: { x: entityId * 2, y: 3 }, end: { x: entityId * 2 + 1, y: 3 } } })),
} as unknown as Drawing2D;

const view = { id: 'v1', name: 'Plan', kind: 'plan', createdAt: 0, level: { name: 'L', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, scale: 100 } as ProjectView;
const vp: SheetViewport = { id: 'a', viewId: 'v1', x: 150, y: 100, scale: 100, width: 200, height: 150, center: { x: 5, y: 5 } };
const sheet = { id: 's1', number: 'A-101', name: 'Plans', createdAt: 1, paper: 'A3', orientation: 'landscape', titleBlock: {}, viewports: [vp] } as ProjectSheet;

const shown = (graphics: ViewGraphics | undefined) => {
  const g = resolveViewGraphics({ graphics, templateId: undefined }, []);
  return styledDrawing(withoutHiddenElements(raw, g, lookup), g, undefined, undefined, null, null, null, lookup);
};
function paper(graphics: ViewGraphics | undefined): HTMLElement {
  const v = { ...view, graphics } as ProjectView;
  return render(<SheetPaper sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: v, drawing: shown(graphics), drafts: [] })} />);
}
/** The line pens of the viewport: stroke, dash and the marks the DXF reads. */
const linePens = (ui: ParentNode) => [...ui.querySelectorAll('[data-viewport-id="a"] path')]
  .filter((p) => p.getAttribute('data-dxf-layer') === 'CUT' || p.getAttribute('data-dxf-layer') === 'SEEN')
  .map((p) => ({ stroke: p.getAttribute('stroke'), dash: p.getAttribute('stroke-dasharray'), ltype: p.getAttribute('data-dxf-ltype'), color: p.getAttribute('data-dxf-color'), d: p.getAttribute('d') ?? '' }));

afterEach(() => cleanup());
resetProject();

describe('the sheet and its PDF draw what the view says about single elements', () => {
  it('draws both walls with no word about elements', () => {
    const pens = linePens(paper(undefined));
    assert.equal(pens.reduce((n, p) => n + (p.d.match(/M/g)?.length ?? 0), 0), 2, 'one seen line each');
  });

  it('a hidden wall is not on the paper; the other is', () => {
    cleanup();
    const hidden = linePens(paper({ hiddenElements: [WALL_A] }));
    cleanup();
    const plain = linePens(paper(undefined));
    const lineCount = (pens: { d: string }[]) => pens.reduce((n, p) => n + (p.d.match(/M/g)?.length ?? 0), 0);
    assert.equal(lineCount(plain), 2);
    assert.equal(lineCount(hidden), 1);
  });

  it('a wall with its own graphics is grey and dashed on the paper, with that colour and line type for the DXF; the other wall is not', () => {
    const pens = linePens(paper({ categories: { walls: { lineColor: '#cc0000' } }, elements: { [WALL_A]: { lineColor: '#808080', lineStyle: 'dashed' } } }));
    const grey = pens.filter((p) => p.stroke === '#808080');
    const red = pens.filter((p) => p.stroke === '#cc0000');
    assert.equal(grey.length, 1, JSON.stringify(pens));
    assert.ok(grey[0].dash, 'dashed on paper');
    assert.equal(grey[0].ltype, 'dashed');
    assert.equal(grey[0].color, '#808080');
    assert.equal(red.length, 1, 'the other wall keeps the category\'s colour');
    assert.equal(red[0].dash, null);
    assert.equal(red[0].ltype, 'continuous');
  });
});

describe('the view\'s DXF carries what the view says about single elements', () => {
  // The DXF walker reads the marks the pens put on the SVG (layer, colour, line type, weight); a DOM without path geometry cannot
  // run the walker itself (`view-dxf.test.tsx`), so the marks it would read are what is checked here.
  const marks = (graphics: ViewGraphics | undefined) => {
    const ui = render(<ViewSvg view={{ ...view, graphics } as ProjectView} drawing={shown(graphics)} axis="down" drafts={[]} layers={[]} extraPatterns={[]} overlays={[]} />);
    return [...ui.querySelectorAll('path')].map((p) => ({ layer: p.getAttribute('data-dxf-layer'), color: p.getAttribute('data-dxf-color'), ltype: p.getAttribute('data-dxf-ltype'), lw: p.getAttribute('data-dxf-lw') }));
  };

  it('a hidden wall has no path in it', () => {
    assert.equal(marks(undefined).filter((m) => m.layer === 'SEEN').length, 1, 'both walls\' seen lines share a pen');
    cleanup();
    const hidden = marks({ hiddenElements: [WALL_A, WALL_B] });
    assert.equal(hidden.filter((m) => m.layer === 'SEEN' || m.layer === 'FILL').length, 0);
  });

  it('a wall with its own graphics has its own colour, line type and weight, and the other wall has the category\'s', () => {
    const own = marks({ categories: { walls: { lineColor: '#cc0000' } }, elements: { [WALL_A]: { lineColor: '#808080', lineStyle: 'dashed', projectionWeight: 'heavy' } } }).filter((m) => m.layer === 'SEEN');
    assert.equal(own.length, 2);
    const grey = own.find((m) => m.color === '#808080');
    const red = own.find((m) => m.color === '#cc0000');
    assert.ok(grey && red, JSON.stringify(own));
    assert.equal(grey.ltype, 'dashed');
    assert.equal(grey.lw, '0.35');
    assert.equal(red.ltype, 'continuous');
  });
});
