/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view template's class and material mapping (#31) through the real pipeline: AC20-FZK-Haus's ground-floor plan, following a
 * template that says "IfcWall: heavy cut, grey 40% fill". Every wall changes, in the drafting view, on the sheet, in the view's DXF
 * and in the command line's sheet alike, and nothing else does. The mapping's order against the template's categories and the view's
 * own is the engine's test (`view-style.test.ts`); here it is checked on a model.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { resolveViewGraphics, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { headlessMaterialOf, headlessPropertiesOf, sheetGraphic } from '@bimvoice/ifcsheet/headless';
import { viewportPens } from '@/components/viewer/sheets/viewport-pens';
import { useViewCanvasStyler } from '@/components/viewer/drafting/useViewCanvasStyler';
import type { CanvasStyler } from '@/components/viewer/drawing/canvas-item-style';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { renderIdGlobalId } from './element-guid';
import { appViewStyler, materialOf } from './view-styler';
import { cutHatches, type StyledDrawing } from './view-graphics';
import { planViewFor } from './view-defaults';
import type { ProjectView, ResolvedViewGraphics } from './types';

const MM = { scale: 1000, x: 0, y: 0 };
const GREY_40 = '#999999';

const template = (rules: ProjectViewTemplate['graphics']['styleRules']): ProjectViewTemplate => ({ id: 't1', name: 'Plans', kind: 'plan', graphics: { styleRules: rules } });

function canvasStylerOf(graphics: ResolvedViewGraphics, drawing: Drawing2D): CanvasStyler {
  let styler: CanvasStyler | null = null;
  function Probe() {
    styler = useViewCanvasStyler(graphics, drawing);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  assert.ok(styler);
  return styler;
}

const sheetPens = (drawing: StyledDrawing, graphics: ResolvedViewGraphics, explicit: boolean) =>
  explicit ? viewportPens(drawing, graphics, MM, 'down', [], undefined, undefined, DEFAULT_GRAPHIC_STANDARD, appViewStyler(graphics, drawing, DEFAULT_GRAPHIC_STANDARD)) : viewportPens(drawing, graphics, MM, 'down', []);

describe('a template\'s class mapping on AC20-FZK-Haus\'s ground floor (#31)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let m: LoadedPlanModel;
  let ground: ProjectView;
  let raw: Drawing2D;
  let shown: StyledDrawing;
  let styled: ResolvedViewGraphics;
  let bare: ResolvedViewGraphics | undefined;
  const templates = [template([{ id: 'r1', by: 'class', match: ['IfcWall'], style: { lineWeight: 'heavy', fillColor: GREY_40 } }])];
  const isWall = (type: string | undefined) => type === 'IfcWallStandardCase' || type === 'IfcWall';

  before(async () => {
    m = await loadPlanModel(FZK_HAUS);
    const level = m.levels.find((l) => l.name === 'Erdgeschoss')!;
    ground = { ...planViewFor(level, []), createdAt: 0, id: 'v-ground' } as ProjectView;
    raw = await m.planOf(ground, { omits: 'none' });
    shown = raw as StyledDrawing;
    styled = resolveViewGraphics({ ...ground, templateId: 't1' }, templates)!;
    bare = resolveViewGraphics(ground, templates);
  });

  it('every wall face and line changes, and nothing else does', () => {
    const before = appViewStyler(bare, shown, DEFAULT_GRAPHIC_STANDARD);
    const after = appViewStyler(styled, shown, DEFAULT_GRAPHIC_STANDARD);
    let walls = 0;
    let others = 0;
    for (const p of shown.cutPolygons) {
      if (isWall(p.ifcType)) {
        walls++;
        assert.equal(after.face(p).fill, GREY_40, `fill of wall #${p.entityId}`);
        assert.equal(after.face(p).weight, 0.7, `cut pen of wall #${p.entityId}`);
        assert.notDeepEqual(after.face(p), before.face(p));
      } else {
        others++;
        assert.deepEqual(after.face(p), before.face(p), `${p.ifcType} #${p.entityId} is unchanged`);
      }
    }
    for (const l of shown.lines) {
      if (isWall(l.ifcType)) {
        if (l.category === 'cut') assert.equal(after.line(l).weight, 0.7);
        if (l.category === 'projection' && after.line(l).kind === 'projection') assert.equal(after.line(l).weight, 0.35);
      } else {
        assert.deepEqual(after.line(l), before.line(l), `${l.category} line of ${l.ifcType} #${l.entityId} is unchanged`);
      }
    }
    assert.ok(walls >= 3 && others >= 3, `${walls} walls, ${others} other faces`);
  });

  it('the drafting view, the sheet and the view\'s DXF agree on the mapped walls', () => {
    const canvas = canvasStylerOf(styled, shown);
    let compared = 0;
    for (const p of shown.cutPolygons as DrawingPolygon[]) {
      const screen = canvas.face(p);
      for (const explicit of [true, false]) {
        const alone = { ...shown, schemeFills: [], cutPolygons: [p], lines: [] } as unknown as StyledDrawing;
        const pens = sheetPens(alone, styled, explicit).filter((x) => x.layer !== 'HATCH');
        assert.equal(pens.length, 1);
        assert.equal(pens[0].fill, screen.fill, `fill of ${p.ifcType} #${p.entityId}`);
      }
      if (isWall(p.ifcType)) assert.equal(screen.fill, GREY_40);
      compared++;
    }
    for (const l of shown.lines as DrawingLine[]) {
      const screen = canvas.line(l);
      if (l.category === 'cut' || !screen) continue;
      for (const explicit of [true, false]) {
        const alone = { ...shown, schemeFills: [], cutPolygons: [], lines: [l] } as unknown as StyledDrawing;
        const pens = sheetPens(alone, styled, explicit);
        assert.equal(pens.length, 1);
        assert.deepEqual([pens[0].stroke, pens[0].width], [screen.stroke, screen.weight], `${l.category} line of ${l.ifcType}`);
      }
      compared++;
    }
    assert.ok(compared > 100, `compared ${compared} items`);
  });

  it('the command line\'s sheet carries the same pens, from the template in the document', () => {
    const ds = [...useViewerStore.getState().models.values()][0].ifcDataStore!;
    const view = { ...ground, templateId: 't1' };
    const sheet = { id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A0', orientation: 'landscape', viewports: [{ id: 'vp', viewId: view.id, x: 600, y: 400, scale: 100, width: 0, height: 0, center: null }] };
    const doc = { name: 'FZK', models: [], sheets: [sheet], views: [view], viewTemplates: templates };
    const headless = sheetGraphic(sheet as never, doc as never, new Map([[view.id, raw]]), null, new Map(), (id) => renderIdGlobalId(id) ?? undefined, headlessPropertiesOf(ds), undefined, headlessMaterialOf(ds));
    const app = viewportPens(shown, styled, MM, 'down', []);
    const key = (p: { layer: string; stroke: string | null; width: number; fill: string | null; dash?: string | readonly number[] }) =>
      `${p.layer}|${p.stroke}|${p.width}|${p.fill}|${Array.isArray(p.dash) ? p.dash.join(' ') : p.dash ?? ''}`;
    const appKeys = new Set(app.filter((p) => p.layer !== 'HATCH').map(key));
    assert.deepEqual([...new Set(headless.pens.map(key))].sort(), [...appKeys].sort());
    assert.ok([...appKeys].includes('CUT|#000000|0.7|null|'), 'the mapped walls\' heavy cut pen is among them');
    assert.ok([...appKeys].includes(`FILL|null|0|${GREY_40}|`), 'and their grey fill');
    assert.ok(headless.pens.some((p) => p.fill === GREY_40), 'on the command line too');
  });

  it('a project from before the mapping, and a template with no rules, draw byte for byte as they did', () => {
    const plain = template(undefined);
    const withEmpty = template([]);
    const none = resolveViewGraphics(ground, []);
    for (const t of [plain, withEmpty]) {
      const resolved = resolveViewGraphics({ ...ground, templateId: 't1' }, [t]);
      assert.equal(JSON.stringify(viewportPens(shown, resolved, MM, 'down', [])), JSON.stringify(viewportPens(shown, none, MM, 'down', [])));
      assert.equal(JSON.stringify(cutHatches(shown, resolved, undefined, materialOf)), JSON.stringify(cutHatches(shown, none, undefined, materialOf)));
    }
  });

  it('a material rule reaches the cut bands of the model\'s own materials, in the app and on the command line', (ctx) => {
    const names = new Set<string>();
    for (const p of shown.cutPolygons) {
      const name = p.materialId === undefined ? null : materialOf(p.entityId, p.materialId);
      if (name) names.add(name);
    }
    // This fixture's plan cuts no named material band; the engine's test (`view-style.test.ts`) covers the rule itself.
    if (names.size === 0) return ctx.skip('no named material band is cut in this fixture');
    const [name] = [...names];
    const mapped = resolveViewGraphics({ ...ground, templateId: 't1' }, [template([{ id: 'r2', by: 'material', match: [name], style: { fillColor: '#123456', cutHatch: 'ANSI31' } }])])!;
    const styler = appViewStyler(mapped, shown, DEFAULT_GRAPHIC_STANDARD);
    const hit = shown.cutPolygons.filter((p) => p.materialId !== undefined && materialOf(p.entityId, p.materialId) === name);
    assert.ok(hit.length > 0);
    for (const p of hit) assert.equal(styler.face(p).fill, '#123456');
    assert.ok(cutHatches(shown, mapped, undefined, materialOf).some((h) => h.pattern === 'ANSI31'), 'and its hatch');
    const ds = [...useViewerStore.getState().models.values()][0].ifcDataStore!;
    const headless = headlessMaterialOf(ds);
    assert.equal(headless(hit[0].entityId, hit[0].materialId!), name, 'the command line reads the same name');
  });
});
