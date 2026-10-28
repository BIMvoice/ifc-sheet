/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Detail level per view (#444), in the app: the drafting view and the app's sheets draw a layered wall exactly as the engine's sheet
 * (the PDF and DXF) does, at the scale's default level, at a level the view sets and at one its template sets; a project file keeps
 * the level (view and template); coarse and medium simplify an opening's symbol, fine does not.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, readGraphics, readViewTemplates, resolveDetailLevel, resolveViewGraphics, type ProjectDocument, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { sheetGraphic } from '@bimvoice/ifcsheet/headless';
import type { OpeningSymbol } from '@/drafting/opening-symbols';
import type { DraftShape } from '@/drafting/types';
import { styledDrawing } from './view-graphics';
import { withoutHiddenElements } from './view-element-filter';
import { simplifyOpeningSymbol } from './view-symbols';
import type { ProjectView } from './types';

const rect = (x: number, w: number) => [{ x, y: 0 }, { x: x + w, y: 0 }, { x: x + w, y: 1 }, { x, y: 1 }];
const band = (x: number, materialId: number) => ({ entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId, color: [0.5, 0.5, 0.5, 1], polygon: { outer: rect(x, 1), holes: [] } });
/** One wall of three layers, and a door beside it. */
const drawing = {
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  config: { plane: { axis: 'y' } },
  cutPolygons: [band(0, 7), band(1, 8), band(2, 9), { entityId: 2, ifcType: 'IfcDoor', modelIndex: 0, isCut: true, polygon: { outer: rect(5, 1), holes: [] } }],
  lines: [
    { entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: 0, y: 0 }, end: { x: 3, y: 0 } } },
    { entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: 1, y: 0 }, end: { x: 1, y: 1 } } },
  ],
} as unknown as Drawing2D;

const view = (scale: number | undefined, graphics?: ProjectView['graphics'], templateId?: string): ProjectView =>
  ({ id: 'v', kind: 'plan', name: 'Plan', createdAt: 0, level: { name: 'L', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, ...(scale ? { scale } : {}), ...(graphics ? { graphics } : {}), ...(templateId ? { templateId } : {}) }) as ProjectView;

/** What the drafting view shows of `v` at `scale`: the app's own order of calls (`DraftingView`, `useSheetContent`). */
function app(v: ProjectView, templates: ProjectViewTemplate[], scale: number): Drawing2D {
  const graphics = resolveViewGraphics(v, templates);
  return styledDrawing(atDetailLevel(withoutHiddenElements(drawing, graphics, () => undefined), resolveDetailLevel(graphics, scale)), graphics);
}

/** What the engine's sheet (the PDF and DXF) draws of `v` hung at `scale`. */
function engine(v: ProjectView, templates: ProjectViewTemplate[], scale: number) {
  const sheet = { id: 's', number: 'A-1', name: 'P', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp', viewId: v.id, x: 200, y: 150, scale, width: 0, height: 0, center: null }] };
  const doc = { name: 'T', models: [], sheets: [sheet], views: [v], viewTemplates: templates } as unknown as ProjectDocument;
  return sheetGraphic(sheet as never, doc, new Map([[v.id, drawing]]), null);
}

describe('the app and the engine draw a layered wall alike (#444)', () => {
  const none: ProjectViewTemplate[] = [];
  const fine: ProjectViewTemplate[] = [{ id: 't', name: 'Plans', kind: 'plan', graphics: { detailLevel: 'fine' } }];
  const cases: [string, ProjectView, ProjectViewTemplate[], number, number][] = [
    ['1:100 by default: one outline', view(100), none, 100, 2],
    ['1:200 by default: one outline', view(200), none, 200, 2],
    ['1:50 by default: the layers', view(50), none, 50, 4],
    ['1:100 set to fine: the layers', view(100, { detailLevel: 'fine' }), none, 100, 4],
    ['1:50 set to coarse: one outline', view(50, { detailLevel: 'coarse' }), none, 50, 2],
    ['1:100 whose template says fine: the layers', view(100, undefined, 't'), fine, 100, 4],
    ['1:100 whose template says fine and which says coarse: one outline', view(100, { detailLevel: 'coarse' }, 't'), fine, 100, 2],
  ];
  for (const [name, v, templates, scale, faces] of cases) {
    it(name, () => {
      const shown = app(v, templates, scale);
      const sheet = engine(v, templates, scale);
      assert.equal(shown.cutPolygons.length, faces, 'faces in the drafting view (the wall, and the door)');
      assert.equal(sheet.cut.length, faces, 'cut outlines on the sheet');
      assert.equal(sheet.lines.length, shown.lines.length, 'lines');
    });
  }

  it('coarse leaves no layer line: the cut line across the wall between two layers is gone, the outline stays', () => {
    assert.equal(app(view(100), none, 100).lines.length, 1);
    assert.equal(app(view(50), none, 50).lines.length, 2);
  });
});

describe('a project keeps the level (#444)', () => {
  it('on a view, and on a template, and drops anything else', () => {
    assert.equal(readGraphics({ detailLevel: 'coarse' }).detailLevel, 'coarse');
    assert.equal(readGraphics({ detailLevel: 'rough' }).detailLevel, undefined);
    const [t] = readViewTemplates([{ id: 't', name: 'Plans', kind: 'plan', graphics: { detailLevel: 'fine' } }]);
    assert.equal(t.graphics.detailLevel, 'fine');
  });
});

describe('an opening at a coarse or medium level (#444)', () => {
  const frame: DraftShape = { type: 'polyline', closed: true, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.2 }, { x: 0, y: 0.2 }] };
  const glazing: DraftShape = { type: 'line', a: { x: 0, y: 0.1 }, b: { x: 1, y: 0.1 } };
  const window: OpeningSymbol = { id: 1, kind: 'window', shapes: [frame, glazing, glazing], dashed: [glazing] };
  const door: OpeningSymbol = { id: 2, kind: 'door', shapes: [{ type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: 1 }], heavy: [frame], dashed: [glazing] };

  it('a window keeps its frame and loses the glazing lines and the dashed parts; a door keeps its leaf and its swing', () => {
    for (const level of ['coarse', 'medium'] as const) {
      assert.deepEqual(simplifyOpeningSymbol(window, level).shapes, [frame]);
      assert.equal(simplifyOpeningSymbol(window, level).dashed, undefined);
      assert.equal(simplifyOpeningSymbol(door, level).shapes.length, 1);
      assert.deepEqual(simplifyOpeningSymbol(door, level).heavy, [frame]);
      assert.equal(simplifyOpeningSymbol(door, level).dashed, undefined);
    }
  });

  it('fine is the symbol as it is, and a window with no closed frame keeps its lines', () => {
    assert.equal(simplifyOpeningSymbol(window, 'fine'), window);
    const bare: OpeningSymbol = { id: 3, kind: 'window', shapes: [glazing, glazing] };
    assert.deepEqual(simplifyOpeningSymbol(bare, 'coarse').shapes, [glazing, glazing]);
  });
});
