/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { modelLevels } from '@/project/model-levels';
import { planOverlays } from '@/project/plan-overlays';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { fitExtent } from '@/project/sheets';
import { annotationFactor } from '@/project/viewport-annotation';
import type { SheetViewport } from '@/project/types';
import type { Pt } from './types';
import { textBox } from './annotation';
import { elevationMarkPlan } from './cross-ref-marks';
import { fitWithCrossReferences, withCrossReferences, type PlanCrossRefInput } from './cross-ref-plan';
import { draftsOfView } from './draft-store';

/**
 * Audit #243: the west elevation mark of the ground plan of AC20-FZK-Haus was
 * clipped on screen. The viewport frames `fitExtent` of the view's own drafts,
 * and the marks are added to them afterwards, so a mark lifted past the
 * drawing's edge to clear a door swing stood outside what the viewport shows.
 */

type Extent = { min: Pt; max: Pt };

describe('the viewport of the ground plan of AC20-FZK-Haus holds its marks (#243)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let input: PlanCrossRefInput;
  let vp: SheetViewport;
  let bounds: Extent;
  let factor: number;

  before(async () => {
    const m = await loadPlanModel(FZK_HAUS);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((x) => x.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent && startDrawingSet(meshes, extent), 'the Wall lays out a set');
    const { views, sheets, drafts } = useProjectStore.getState();
    const ground = elevationMarkPlan(views);
    assert.ok(ground, 'a ground plan');
    const found = sheets.flatMap((s) => s.viewports ?? []).find((v) => v.viewId === ground.id);
    assert.ok(found, 'the ground plan is on a sheet');
    vp = found;
    const drawing = await m.planOf(ground);
    bounds = drawing.bounds;
    factor = annotationFactor(vp.scale, ground.scale);
    const overlays = planOverlays(ground, drawing.config.plane, meshes, undefined, new Set(), drawing, vp.scale);
    input = { drafts: draftsOfView(ground.id, drafts), view: ground, views, sheets, groundPlanId: ground.id, bounds, viewportScale: vp.scale, overlays };
  });

  /** Whether `inner` lies within `outer`, to a millimetre of drawing. */
  const holds = (outer: Extent, inner: Extent): boolean => outer.min.x <= inner.min.x + 1e-3 && outer.min.y <= inner.min.y + 1e-3 && outer.max.x >= inner.max.x - 1e-3 && outer.max.y >= inner.max.y - 1e-3;

  /** The text boxes of the marks the sheet adds, each as its extent. */
  const labelExtents = (): Extent[] => withCrossReferences(input).filter((d) => d.id.includes('~xref') && d.shape.type === 'text').map((d) => {
    const sh = d.shape;
    if (sh.type !== 'text') throw new Error('unreachable');
    const box = textBox(sh.p, sh.text, sh.height * factor, sh.rotation);
    return { min: { x: Math.min(...box.map((q) => q.x)), y: Math.min(...box.map((q) => q.y)) }, max: { x: Math.max(...box.map((q) => q.x)), y: Math.max(...box.map((q) => q.y)) } };
  });

  it('has mark labels, two for elevations', () => {
    assert.ok(labelExtents().length >= 3);
  });

  it('measured on the view\'s own drafts, the extent leaves a label outside (the cause)', () => {
    const own = fitExtent(vp, bounds, input.drafts, input.view?.scale);
    const outside = labelExtents().filter((l) => !holds(own, l));
    assert.ok(outside.length > 0, 'a label lies outside the extent of the view\'s own drafts');
  });

  it('measured on the drafts the sheet draws, the extent holds every label', () => {
    const fitted = fitWithCrossReferences(vp, bounds, input);
    for (const l of labelExtents()) assert.ok(holds(fitted, l), `a label at ${JSON.stringify(l)} lies outside ${JSON.stringify(fitted)}`);
  });

  it('a viewport with a manual size keeps the drawing bounds: it crops on purpose', () => {
    const manual = { ...vp, width: 100, height: 100 };
    assert.deepEqual(fitWithCrossReferences(manual, bounds, input), bounds);
  });
});
