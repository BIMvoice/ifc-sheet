/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_JOINERY_MAPPING, crossReferenceMarks, elevationMarkPlan, openingObstacles, planOpeningSymbols, resolveViewGraphics, tableMeasure, withoutSectionLink,
} from '@bimvoice/ifcsheet';
import { openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { planOverlays } from '@/project/plan-overlays';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import type { DraftEntity, Pt } from './types';
import { withCrossReferences, type PlanCrossRefInput } from './cross-ref-plan';
import { draftsOfView } from './draft-store';
import { sectionSymbolShapes } from './section-symbol';

/**
 * #619: the reference marks the app draws on the ground plan of AC20-FZK-Haus (the section references "1 / A-301" under the letters of
 * the section symbols, and the elevation marks) are the ones the engine draws for the same plan: its sheet prints them from
 * `crossReferenceMarks`, the door and window boxes they keep clear of read from the model with no browser (`planOpeningSymbols`)
 * where the app reads them from its overlays. Same lines, same texts, to 1e-6.
 */

const EPS = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;
const nearPt = (a: Pt, b: Pt): boolean => near(a.x, b.x) && near(a.y, b.y);

/** Whether two derived drafts are the same mark: same kind, same place and size, same words. */
function same(a: DraftEntity, b: DraftEntity): boolean {
  const [s, t] = [a.shape, b.shape];
  if (s.type === 'line' && t.type === 'line') return nearPt(s.a, t.a) && nearPt(s.b, t.b);
  if (s.type === 'text' && t.type === 'text') return nearPt(s.p, t.p) && s.text === t.text && near(s.height, t.height) && near(s.rotation, t.rotation);
  if (s.type === 'hatch' && t.type === 'hatch') return s.loops.length === t.loops.length && s.loops.every((l, i) => l.length === t.loops[i]!.length && l.every((p, j) => nearPt(p, t.loops[i]![j]!)));
  if (s.type === 'circle' && t.type === 'circle') return nearPt(s.c, t.c) && near(s.r, t.r);
  if (s.type === 'polyline' && t.type === 'polyline') return s.closed === t.closed && s.pts.length === t.pts.length && s.pts.every((p, i) => nearPt(p, t.pts[i]!));
  return false;
}

describe('the reference marks of the ground plan of AC20-FZK-Haus: the app and the engine (#619)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let app: DraftEntity[];
  let headless: DraftEntity[];

  before(async () => {
    const m = await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((x) => x.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    const { views, sheets, drafts } = useProjectStore.getState();
    const ground = elevationMarkPlan(views);
    assert.ok(ground && ground.kind === 'plan', 'a ground plan');
    const vp = sheets.flatMap((s) => s.viewports ?? []).find((v) => v.viewId === ground.id);
    assert.ok(vp, 'the ground plan is on a sheet');
    const drawing = await m.planOf(ground);
    // The plan carries a section symbol, as a project's plan does once its sections are cut: the references stand under its letters.
    const sections = views.filter((v) => v.kind === 'section');
    assert.ok(sections.length > 0, 'the set has sections');
    const symbols: DraftEntity[] = sections.flatMap((s, i) => {
      const y = drawing.bounds.min.y + (i + 1) * 2, x0 = drawing.bounds.min.x + 1;
      return sectionSymbolShapes({ x: x0, y }, { x: x0 + 6, y }, { x: x0 + 3, y: y + 1 }, String.fromCharCode(65 + i), 0.25).map((shape, k) => ({
        id: `sym-${s.id}-${k}`, viewId: ground.id, layerId: '0', shape, params: { sectionOf: s.id },
      }));
    });
    const own = [...draftsOfView(ground.id, drafts), ...symbols];
    const overlays = planOverlays(ground, drawing.config.plane, meshes, undefined, new Set(), drawing, vp.scale);
    const input: PlanCrossRefInput = { drafts: own, view: ground, views, sheets, groundPlanId: ground.id, bounds: drawing.bounds, viewportScale: vp.scale, overlays, screenUp: -1 };
    app = withCrossReferences(input).filter((d) => d.id.includes('~xref'));
    // The engine's side: the same plan and sheets, the boxes of the door and window symbols read from the model with no browser.
    const sources = { live: { dataStore: engine.dataStore!, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    const symbolBoxes = openingObstacles(planOpeningSymbols(engine.buildingMeshes, drawing.config.plane, sources, resolveViewGraphics(ground, undefined), ground.level));
    headless = crossReferenceMarks({ drafts: own, view: ground, views, sheets, groundPlanId: ground.id, bounds: drawing.bounds, viewportScale: vp.scale, symbols: symbolBoxes, measure: tableMeasure });
  });

  it('has references under the section letters and an elevation mark on each side', () => {
    const texts = app.flatMap((d) => (d.shape.type === 'text' ? [d.shape.text] : []));
    assert.ok(texts.filter((t) => /^\d+ \/ A-\d+$/.test(t)).length >= 8, texts.join(', '));
    assert.ok(app.filter((d) => d.shape.type === 'line').length >= 12, 'the elevation marks carry their arrowheads');
  });

  it('are the same marks in the engine: the same lines and texts to 1e-6', () => {
    assert.equal(headless.length, app.length, `${headless.length} marks in the engine, ${app.length} in the app`);
    app.forEach((d, i) => assert.ok(same(d, headless[i]!), `mark ${i} (${d.id}) differs: ${JSON.stringify(d.shape)} vs ${JSON.stringify(headless[i]!.shape)}`));
  });

  it('are made fresh: the parameters of a section letter are not copied onto its reference', () => {
    for (const d of headless) assert.deepEqual(d.params, withoutSectionLink(d.params));
  });
});
